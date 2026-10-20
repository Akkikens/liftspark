// Importing history: Apple Health, WHOOP, Oura, and workout files (.fit/.tcx/.gpx from Garmin and
// others). Everything lands in three places of the state:
//
//   S.workouts    strength sessions from Health become history entries (no sets; tagged `imported`)
//   S.activities  everything else: runs, rides, WHOOP/Oura workouts, files { id, src, extId, type,
//                 name, d, start, end, kcal, distanceM, avgHr, maxHr, strain, zones }
//   S.daily       one record per day: { rhr, hrv, sleepMin, activeKcal, steps, recovery, readiness,
//                 dayStrain, src }
//   S.bodyweight  weigh-ins, one per day, only on days that have none
//
// Only aggregates are stored: no raw heart-rate series from Health or the APIs. Each record carries
// its source id (HK UUID, WHOOP/Oura id, file hash) so importing again never duplicates anything,
// and removeImported(src) takes a source's data back out.
import { health } from './ls-native.js'
import { accessToken, getJson } from './integrations.js'
import { zoneOf, maxHrOf, strainOf, trimpOf } from './strain.js'

export const SOURCES = { health: 'Apple Health', whoop: 'WHOOP', oura: 'Oura', file: 'Workout files' }
export const RANGES = [[30, '30 days'], [90, '90 days'], [365, '1 year'], [0, 'All']]
const DAY = 864e5
const LB = 2.2046226218
const STRENGTH = new Set(['traditionalStrengthTraining', 'functionalStrengthTraining', 'coreTraining', 'crossTraining'])

export const isoDay = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const startOf = days => (days > 0 ? Date.now() - days * DAY : Date.UTC(2014, 0, 1))
const nice = type => ({ traditionalStrengthTraining: 'Strength training', functionalStrengthTraining: 'Functional strength', coreTraining: 'Core training', crossTraining: 'Cross training',
  hiit: 'HIIT', running: 'Run', walking: 'Walk', hiking: 'Hike', cycling: 'Ride', swimming: 'Swim', rowing: 'Row', elliptical: 'Elliptical', stairs: 'Stairs', yoga: 'Yoga',
  pilates: 'Pilates', mixedCardio: 'Cardio', soccer: 'Football', basketball: 'Basketball', tennis: 'Tennis', combat: 'Martial arts', dance: 'Dance', mobility: 'Mobility' }[type] || 'Workout')

/** Strain (0–21) from an average heart rate held for a duration: Edwards' TRIMP on one zone. */
export function strainFromAvg(avgHr, minutes, profile = {}) {
  const z = zoneOf(avgHr, maxHrOf(profile), profile.restHr)
  if (z < 0 || !(minutes > 0)) return null
  const zones = [0, 0, 0, 0, 0]; zones[z] = minutes * 60
  return strainOf(trimpOf(zones))
}

// ── merging into the state (pure, on a draft) ─────────────────────────────────────────────────

/** Adds activities not seen before (by src + extId); returns how many were new. */
export function mergeActivities(S, list) {
  S.activities = Array.isArray(S.activities) ? S.activities : []
  const seen = new Set(S.activities.map(a => a.src + ':' + a.extId))
  for (const w of S.workouts || []) if (w.imported) seen.add(w.imported.src + ':' + w.imported.extId)
  let n = 0
  for (const a of list) {
    if (!a?.extId || seen.has(a.src + ':' + a.extId)) continue
    seen.add(a.src + ':' + a.extId); S.activities.push(a); n++
  }
  S.activities.sort((a, b) => a.start - b.start)
  return n
}

/** Strength sessions from Health as history entries without sets. */
export function mergeStrength(S, list) {
  S.workouts = Array.isArray(S.workouts) ? S.workouts : []
  const seen = new Set(S.workouts.filter(w => w.imported).map(w => w.imported.src + ':' + w.imported.extId))
  let n = 0
  for (const a of list) {
    if (seen.has(a.src + ':' + a.extId)) continue
    seen.add(a.src + ':' + a.extId)
    S.workouts.push({
      id: 'imp-' + a.src + '-' + a.extId.slice(0, 12), d: a.d, name: a.name, start: a.start, end: a.end, entries: [], vol: 0,
      imported: { src: a.src, extId: a.extId, source: a.source || null },
      ls: { minutes: Math.round((a.end - a.start) / 60000), avgHr: a.avgHr ?? null, maxHr: a.maxHr ?? null, kcal: a.kcal != null ? Math.round(a.kcal) : null,
        strain: a.strain ?? null, kcalSource: 'health', hr: [], source: 'import' },
    })
    n++
  }
  S.workouts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.start || 0) - (b.start || 0)))
  return n
}

/** Daily values: { d: { field: value } } merged in; a field already set by `src` or a better source stays. */
export function mergeDaily(S, src, days) {
  S.daily = S.daily && typeof S.daily === 'object' ? S.daily : {}
  let n = 0
  for (const [d, vals] of Object.entries(days)) {
    const cur = S.daily[d] || { src: {} }
    for (const [k, v] of Object.entries(vals)) {
      if (v == null || Number.isNaN(v)) continue
      // A wearable's own number beats Health's copy of it.
      if (cur[k] != null && cur.src?.[k] && cur.src[k] !== 'health' && src === 'health') continue
      cur[k] = typeof v === 'number' ? Math.round(v * 10) / 10 : v
      cur.src = { ...(cur.src || {}), [k]: src }
      n++
    }
    S.daily[d] = cur
  }
  return n
}

/** Weigh-ins on days that have none, in the state's unit. */
export function mergeWeights(S, days) {
  S.bodyweight = Array.isArray(S.bodyweight) ? S.bodyweight : []
  const have = new Set(S.bodyweight.map(b => b.d))
  let n = 0
  for (const { d, v } of days) {
    if (!(v > 20) || have.has(d)) continue
    have.add(d)
    S.bodyweight.push({ d, w: Math.round((S.unit === 'lb' ? v * LB : v) * 10) / 10, t: new Date(d + 'T08:00:00').getTime(), src: 'health' })
    n++
  }
  S.bodyweight.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  return n
}

/** Takes everything one source brought in back out. */
export function removeImported(S, src) {
  S.activities = (S.activities || []).filter(a => a.src !== src)
  S.workouts = (S.workouts || []).filter(w => w.imported?.src !== src)
  if (src === 'health') S.bodyweight = (S.bodyweight || []).filter(b => b.src !== 'health')
  for (const [d, rec] of Object.entries(S.daily || {})) {
    const keep = { src: {} }
    for (const [k, v] of Object.entries(rec)) if (k !== 'src' && rec.src?.[k] !== src) { keep[k] = v; keep.src[k] = rec.src?.[k] }
    if (Object.keys(keep).length > 1) S.daily[d] = keep; else delete S.daily[d]
  }
}

/** What each source has in the state now. */
export function importedCounts(S) {
  const out = {}
  for (const src of Object.keys(SOURCES)) {
    out[src] = {
      workouts: (S.workouts || []).filter(w => w.imported?.src === src).length + (S.activities || []).filter(a => a.src === src).length,
      days: Object.values(S.daily || {}).filter(r => Object.values(r.src || {}).includes(src)).length,
      weights: src === 'health' ? (S.bodyweight || []).filter(b => b.src === 'health').length : 0,
    }
  }
  return out
}

// ── Apple Health ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the chosen kinds for the last `days` days (0 = everything) and returns the batches to merge:
 * { strength, activities, daily, weights }. `progress(label)` is called between steps.
 */
export async function readHealth({ days = 90, kinds = ['workouts', 'weight', 'recovery', 'sleep', 'energy'], profile = {}, progress = () => {} } = {}) {
  const start = startOf(days), end = Date.now()
  const out = { strength: [], activities: [], daily: {}, weights: [] }
  const day = d => (out.daily[d] = out.daily[d] || {})
  if (kinds.includes('workouts')) {
    progress('workouts')
    const { workouts = [] } = await health.importWorkouts(start, end)
    for (const w of workouts) {
      const a = { src: 'health', extId: w.uuid, type: w.type, name: nice(w.type), d: isoDay(w.start), start: w.start, end: w.end, source: w.source,
        kcal: w.kcal ?? null, distanceM: w.distanceM ?? null, avgHr: w.avgHr ? Math.round(w.avgHr) : null, maxHr: w.maxHr ? Math.round(w.maxHr) : null }
      a.id = 'act-health-' + w.uuid.slice(0, 12)
      a.strain = a.avgHr ? strainFromAvg(a.avgHr, (a.end - a.start) / 60000, profile) : null
      ;(STRENGTH.has(w.type) ? out.strength : out.activities).push(a)
    }
  }
  if (kinds.includes('weight')) {
    progress('weight')
    out.weights = (await health.importQuantity('bodyMass', start, end)).days || []
  }
  if (kinds.includes('recovery')) {
    progress('recovery')
    for (const { d, v } of (await health.importQuantity('restingHeartRate', start, end)).days || []) day(d).rhr = v
    for (const { d, v } of (await health.importQuantity('heartRateVariabilitySDNN', start, end)).days || []) day(d).hrv = v
  }
  if (kinds.includes('energy')) {
    progress('energy')
    for (const { d, v } of (await health.importQuantity('activeEnergyBurned', start, end)).days || []) day(d).activeKcal = v
    for (const { d, v } of (await health.importQuantity('stepCount', start, end)).days || []) day(d).steps = v
  }
  if (kinds.includes('sleep')) {
    progress('sleep')
    for (const n of (await health.importSleep(start, end)).nights || []) if (n.asleepMin > 0) day(n.d).sleepMin = n.asleepMin
  }
  return out
}

/** Puts a readHealth result into the state; returns the counts of what was new. */
export function applyHealth(S, r) {
  return {
    workouts: mergeStrength(S, r.strength) + mergeActivities(S, r.activities),
    weights: mergeWeights(S, r.weights),
    days: mergeDaily(S, 'health', r.daily),
  }
}

// ── WHOOP v2 and Oura v2 ─────────────────────────────────────────────────────────────────────

async function pages(url, token, key, next, fetchJson = getJson, max = 60) {
  const all = []
  let u = url
  for (let i = 0; u && i < max; i++) {
    const j = await fetchJson(u, token)
    all.push(...(j?.[key] || []))
    const tok = j?.[next]
    u = tok ? url + (url.includes('?') ? '&' : '?') + (next === 'next_token' && url.includes('whoop') ? 'nextToken' : 'next_token') + '=' + encodeURIComponent(tok) : null
  }
  return all
}

/** WHOOP: cycles (day strain), recovery (score, HRV, RHR), sleep and workouts with zones. */
export async function readWhoop({ days = 90, fetchJson = getJson, token } = {}) {
  token = token || await accessToken('whoop')
  if (!token) throw Object.assign(new Error('Sign in to WHOOP first'), { code: 'auth' })
  const base = 'https://api.prod.whoop.com/developer/v2'
  const q = `?limit=25&start=${new Date(startOf(days)).toISOString()}`
  const [cycles, recs, sleeps, works] = await Promise.all([
    pages(`${base}/cycle${q}`, token, 'records', 'next_token', fetchJson),
    pages(`${base}/recovery${q}`, token, 'records', 'next_token', fetchJson),
    pages(`${base}/activity/sleep${q}`, token, 'records', 'next_token', fetchJson),
    pages(`${base}/activity/workout${q}`, token, 'records', 'next_token', fetchJson),
  ])
  const daily = {}
  const day = d => (daily[d] = daily[d] || {})
  const cycleDay = {}
  for (const c of cycles) { const d = isoDay(Date.parse(c.start)); cycleDay[c.id] = d; if (c.score?.strain != null) day(d).dayStrain = c.score.strain }
  for (const r of recs) {
    const d = cycleDay[r.cycle_id] || (r.created_at ? isoDay(Date.parse(r.created_at)) : null)
    if (!d || !r.score) continue
    Object.assign(day(d), { recovery: r.score.recovery_score, hrv: r.score.hrv_rmssd_milli, rhr: r.score.resting_heart_rate })
  }
  for (const s of sleeps) {
    if (s.nap || !s.score?.stage_summary) continue
    const st = s.score.stage_summary
    const asleep = (st.total_light_sleep_time_milli + st.total_slow_wave_sleep_time_milli + st.total_rem_sleep_time_milli) / 60000
    if (asleep > 0) day(isoDay(Date.parse(s.end))).sleepMin = asleep
  }
  const activities = works.map(w => {
    const start = Date.parse(w.start), end = Date.parse(w.end), z = w.score?.zone_durations || {}
    const zones = ['zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'].map(k => Math.round((z[k] || 0) / 1000))
    return { id: 'act-whoop-' + String(w.id).slice(0, 12), src: 'whoop', extId: String(w.id), type: w.sport_name || 'workout', name: w.sport_name ? w.sport_name.replace(/(^|[\s-])\w/g, s => s.toUpperCase()) : 'WHOOP workout',
      d: isoDay(start), start, end, kcal: w.score?.kilojoule != null ? Math.round(w.score.kilojoule / 4.184) : null, distanceM: w.score?.distance_meter ?? null,
      avgHr: w.score?.average_heart_rate ?? null, maxHr: w.score?.max_heart_rate ?? null, strain: w.score?.strain != null ? Math.round(w.score.strain * 10) / 10 : null, zones }
  })
  return { daily, activities }
}

/** Oura: daily readiness, sleep (duration, HRV, lowest heart rate), daily activity and workouts. */
export async function readOura({ days = 90, fetchJson = getJson, token } = {}) {
  token = token || await accessToken('oura')
  if (!token) throw Object.assign(new Error('Sign in to Oura first'), { code: 'auth' })
  const base = 'https://api.ouraring.com/v2/usercollection'
  const q = `?start_date=${isoDay(startOf(days))}&end_date=${isoDay(Date.now() + DAY)}`
  const [ready, sleep, activity, works] = await Promise.all([
    pages(`${base}/daily_readiness${q}`, token, 'data', 'next_token', fetchJson),
    pages(`${base}/sleep${q}`, token, 'data', 'next_token', fetchJson),
    pages(`${base}/daily_activity${q}`, token, 'data', 'next_token', fetchJson),
    pages(`${base}/workout${q}`, token, 'data', 'next_token', fetchJson),
  ])
  const daily = {}
  const day = d => (daily[d] = daily[d] || {})
  for (const r of ready) if (r.day && r.score != null) day(r.day).readiness = r.score
  for (const s of sleep) {
    if (!s.day || s.type === 'rest' || s.type === 'sleep' && s.total_sleep_duration == null) continue
    const rec = day(s.day)
    if (s.type === 'long_sleep' || rec.sleepMin == null) {
      if (s.total_sleep_duration) rec.sleepMin = s.total_sleep_duration / 60
      if (s.average_hrv) rec.hrv = s.average_hrv
      if (s.lowest_heart_rate) rec.rhr = s.lowest_heart_rate
    }
  }
  for (const a of activity) if (a.day) Object.assign(day(a.day), { activeKcal: a.active_calories ?? undefined, steps: a.steps ?? undefined })
  const activities = works.map(w => {
    const start = Date.parse(w.start_datetime), end = Date.parse(w.end_datetime)
    return { id: 'act-oura-' + String(w.id).slice(0, 12), src: 'oura', extId: String(w.id), type: w.activity || 'workout', name: w.label || (w.activity ? w.activity.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'Oura workout'),
      d: w.day || isoDay(start), start, end, kcal: w.calories ?? null, distanceM: w.distance ?? null, avgHr: null, maxHr: null, strain: null }
  })
  return { daily, activities }
}

export function applyWearable(S, src, r) {
  return { workouts: mergeActivities(S, r.activities), days: mergeDaily(S, src, r.daily), weights: 0 }
}

// ── Workout files: .fit (Garmin, Wahoo, Coros…), .tcx, .gpx ─────────────────────────────────

async function hashOf(buf) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  return Array.from(h.slice(0, 10), b => b.toString(16).padStart(2, '0')).join('')
}

const hrAgg = rows => {
  const hr = rows.filter(v => v > 25 && v < 240)
  return hr.length ? { avgHr: Math.round(hr.reduce((a, b) => a + b, 0) / hr.length), maxHr: Math.max(...hr) } : { avgHr: null, maxHr: null }
}

/** One activity from a FIT file (the first session). */
export async function parseFit(buf, profile = {}) {
  const { default: FitParser } = await import('fit-file-parser')
  const data = await new FitParser({ force: true, speedUnit: 'm/s', lengthUnit: 'm', mode: 'list' }).parseAsync(buf)
  const s = data.sessions?.[0]
  const recs = data.records || []
  const start = s?.start_time ? +new Date(s.start_time) : recs[0]?.timestamp ? +new Date(recs[0].timestamp) : null
  if (!start) throw new Error('No activity in this file')
  const end = s?.timestamp ? +new Date(s.timestamp) : s?.total_elapsed_time ? start + s.total_elapsed_time * 1000 : +new Date(recs.at(-1)?.timestamp || start)
  const agg = s?.avg_heart_rate ? { avgHr: s.avg_heart_rate, maxHr: s.max_heart_rate ?? null } : hrAgg(recs.map(r => r.heart_rate))
  const sport = String(s?.sport || 'workout')
  return { type: sport, name: nice({ running: 'running', cycling: 'cycling', walking: 'walking', swimming: 'swimming', training: 'traditionalStrengthTraining', fitness_equipment: 'mixedCardio' }[sport] || sport),
    start, end, kcal: s?.total_calories ?? null, distanceM: s?.total_distance ?? null, ...agg, strain: agg.avgHr ? strainFromAvg(agg.avgHr, (end - start) / 60000, profile) : null }
}

/** One activity from a TCX or GPX file (DOMParser; heart rate from TCX or Garmin's GPX extension). */
export function parseXmlActivity(text, profile = {}) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Not a TCX or GPX file')
  const nodes = Array.from(doc.getElementsByTagName('*'))
  const all = tag => nodes.filter(n => (n.localName || n.nodeName.split(':').pop()) === tag)
  const child = (n, tag) => Array.from(n.getElementsByTagName('*')).find(c => (c.localName || c.nodeName.split(':').pop()) === tag)
  const times = all('Time').concat(all('time')).map(n => Date.parse(n.textContent)).filter(Number.isFinite).sort((a, b) => a - b)
  if (!times.length) throw new Error('No activity in this file')
  const hr = all('HeartRateBpm').map(n => Number(child(n, 'Value')?.textContent)).concat(all('hr').map(n => Number(n.textContent)))
  const kcal = all('Calories').reduce((a, n) => a + (Number(n.textContent) || 0), 0)
  const dist = all('DistanceMeters').map(n => Number(n.textContent)).filter(Number.isFinite)
  const sport = all('Activity')[0]?.getAttribute('Sport') || all('type')[0]?.textContent || 'workout'
  const start = times[0], end = times.at(-1), agg = hrAgg(hr)
  return { type: sport.toLowerCase(), name: nice({ running: 'running', biking: 'cycling', cycling: 'cycling', walking: 'walking', hiking: 'hiking' }[sport.toLowerCase()] || 'other'),
    start, end, kcal: kcal || null, distanceM: dist.length ? Math.max(...dist) : null, ...agg, strain: agg.avgHr ? strainFromAvg(agg.avgHr, (end - start) / 60000, profile) : null }
}

/** Reads picked files into activities ready for mergeActivities. Returns { activities, failed: [name] }. */
export async function readFiles(files, profile = {}) {
  const activities = [], failed = []
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer()
      const ext = (f.name.split('.').pop() || '').toLowerCase()
      const a = ext === 'fit' ? await parseFit(buf, profile) : parseXmlActivity(new TextDecoder().decode(buf), profile)
      const extId = await hashOf(buf)
      activities.push({ id: 'act-file-' + extId, src: 'file', extId, d: isoDay(a.start), source: f.name, ...a })
    } catch { failed.push(f.name) }
  }
  return { activities, failed }
}
