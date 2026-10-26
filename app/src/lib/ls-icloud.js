// iCloud sync (Settings → Data & backup → iCloud sync): Liftspark's own data in the user's private
// CloudKit database, one record per item so two phones editing different workouts never clash.
//
// Records: workout:<id>, routine:<id>, bw:<day>, food:<day>, activity:<id>, daily:<day>, and one
// prefs record (week plan, profile, settings). Not synced: HealthKit samples (only aggregates live
// in the state anyway), the running workout, tokens, and device-only things.
//
// Conflicts: last writer wins per record, by updatedAt. Local edit times are tracked in a small meta
// file (id → { h: hash, at }), so a record is pushed only when its content changed, and a pulled
// record replaces the local one only when it is newer than the local edit.
import { useStore } from '../store/useStore.js'
import { readJsonFile, writeJsonFile } from './mobile.js'

const META_FILE = 'liftspark-icloud.json'
const PREF_KEYS = ['week', 'lsProfile', 'unit', 'reminder', 'accent', 'theme', 'equipProfiles', 'activeEquipId', 'equipFilterOn', 'foodFavs', 'savedMeals', 'restSec', 'lsOnboarded']

let pluginP = null
const plugin = () => pluginP || (pluginP = (async () => {
  const core = await import('@capacitor/core')
  return core.Capacitor.getPlatform() === 'ios' ? { p: core.registerPlugin('CloudSync') } : null
})().catch(() => null))

/** Small, stable hash of a record's JSON (FNV-1a). */
export function hashOf(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

// What never goes to iCloud: anything that came from Apple Health. App Review 5.1.3 forbids storing
// HealthKit data in iCloud, so weigh-ins and sessions imported from Health, Health-sourced daily
// values and the heart-rate and energy figures Health gave a workout stay on this phone. A workout's
// own sets, and the trace and numbers from a Bluetooth strap, sync as before.
const HEALTH_LS = ['avgHr', 'maxHr', 'kcal', 'kcalSource', 'strain', 'trimp', 'zones', 'estimated', 'hr', 'n', 'source']

/** The workout as it may be stored in iCloud, or null when it is a Health import. */
export function cloudWorkout(w) {
  if (w?.imported?.src === 'health') return null
  const ls = w?.ls
  if (!ls || typeof ls !== 'object') return w
  // Watch heart rate arrives through HealthKit, so it counts as Health data (guideline 5.1.3).
  if (ls.source === 'health' || ls.source === 'watch') {
    const kept = Object.fromEntries(Object.entries(ls).filter(([k]) => !HEALTH_LS.includes(k)))
    return { ...w, ls: { ...kept, source: ls.source } }
  }
  if (ls.kcalSource === 'health') {
    const { kcal, kcalSource, ...rest } = ls
    return { ...w, ls: rest }
  }
  return w
}

/** The day's values without the ones Health supplied, or null when nothing else is left. */
export function cloudDaily(rec) {
  if (!rec || typeof rec !== 'object') return rec
  const src = rec.src && typeof rec.src === 'object' ? rec.src : {}
  const out = {}
  let any = false
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'src' || src[k] === 'health') continue
    out[k] = v
    any = true
  }
  if (!any) return null
  out.src = Object.fromEntries(Object.entries(src).filter(([, s]) => s !== 'health'))
  return out
}

/** The state as records: { id: { kind, value } }. */
export function recordsOf(S) {
  const out = {}
  for (const w of S.workouts || []) if (w?.id) { const v = cloudWorkout(w); if (v) out['workout:' + w.id] = { kind: 'workout', value: v } }
  for (const r of S.routines || []) if (r?.id) out['routine:' + r.id] = { kind: 'routine', value: r }
  for (const b of S.bodyweight || []) if (b?.d && b.src !== 'health') out['bw:' + b.d] = { kind: 'bw', value: b }
  for (const [d, list] of Object.entries(S.food || {})) out['food:' + d] = { kind: 'food', value: list }
  for (const a of S.activities || []) if (a?.id) out['activity:' + a.id] = { kind: 'activity', value: a }
  for (const [d, rec] of Object.entries(S.daily || {})) { const v = cloudDaily(rec); if (v) out['daily:' + d] = { kind: 'daily', value: v } }
  out.prefs = { kind: 'prefs', value: Object.fromEntries(PREF_KEYS.filter(k => S[k] !== undefined).map(k => [k, S[k]])) }
  return out
}

/** What to push: changed records (with their edit time) and records deleted locally. */
export function diff(S, meta, now = Date.now()) {
  const recs = recordsOf(S)
  const push = [], deletes = [], nextMeta = {}
  for (const [id, { kind, value }] of Object.entries(recs)) {
    const json = JSON.stringify(value)
    const h = hashOf(json)
    const prev = meta[id]
    const at = prev && prev.h === h ? prev.at : now
    nextMeta[id] = { h, at }
    if (!prev || prev.h !== h) push.push({ id, kind, updatedAt: at, json })
  }
  for (const id of Object.keys(meta)) if (!recs[id] && !meta[id].gone) { deletes.push(id); nextMeta[id] = { gone: true, at: now } }
  return { push, deletes, meta: nextMeta }
}

/** Applies pulled records to a state draft: newer than the local edit wins. Returns the meta. */
export function applyPulled(S, meta, records, deletes) {
  const m = { ...meta }
  const put = (id, kind, value) => {
    const key = id.slice(id.indexOf(':') + 1)
    if (kind === 'workout' || kind === 'routine' || kind === 'activity') {
      const list = kind === 'workout' ? 'workouts' : kind === 'routine' ? 'routines' : 'activities'
      S[list] = Array.isArray(S[list]) ? S[list] : []
      const i = S[list].findIndex(x => x.id === key)
      if (value == null) { if (i >= 0) S[list].splice(i, 1) } else if (i >= 0) S[list][i] = value; else S[list].push(value)
      if (kind === 'workout' && value) S.workouts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.start || 0) - (b.start || 0)))
    } else if (kind === 'bw') {
      S.bodyweight = (S.bodyweight || []).filter(b => b.d !== key)
      if (value) S.bodyweight.push(value), S.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1))
    } else if (kind === 'food' || kind === 'daily') {
      const k = kind === 'food' ? 'food' : 'daily'
      S[k] = { ...(S[k] || {}) }
      if (value) S[k][key] = value; else delete S[k][key]
    } else if (kind === 'prefs' && value) Object.assign(S, value)
  }
  for (const r of records) {
    const local = m[r.id]
    if (local && !local.gone && local.at > r.updatedAt) continue   // our edit is newer; it gets pushed
    // The copy this phone pushed comes back on the next pull: applying it would replace the local
    // record with its iCloud version, which has the Health-sourced parts stripped out.
    if (local && !local.gone && local.h === hashOf(r.json)) { m[r.id] = { h: local.h, at: Math.max(local.at, r.updatedAt) }; continue }
    let value
    try { value = JSON.parse(r.json) } catch { continue }
    put(r.id, r.kind, value)
    m[r.id] = { h: hashOf(r.json), at: r.updatedAt }
  }
  for (const id of deletes) {
    const kind = id === 'prefs' ? 'prefs' : id.slice(0, id.indexOf(':'))
    put(id, kind, null)
    m[id] = { gone: true, at: Date.now() }
  }
  return m
}

let busy = false, timer = null, self = false
const own = fn => { self = true; try { useStore.getState().update(fn) } finally { self = false } }
/** One round: pull what other devices changed, then push what this one changed. */
export async function syncNow() {
  const w = await plugin()
  if (!w || busy || !useStore.getState().S.icloud?.on) return { skipped: true }
  busy = true
  try {
    const st = await w.p.status()
    if (!st?.available) return { error: st?.status || 'unavailable' }
    let meta = (await readJsonFile(META_FILE).catch(() => null))?.meta || {}
    for (let i = 0; i < 20; i++) {
      const r = await w.p.pull()
      if (r.records.length || r.deletes.length) own(s => { meta = applyPulled(s, meta, r.records, r.deletes) })
      if (!r.more) break
    }
    const d = diff(useStore.getState().S, meta)
    if (d.push.length || d.deletes.length) await w.p.push({ records: d.push, deletes: d.deletes })
    await writeJsonFile(META_FILE, { meta: d.meta })
    own(s => { s.icloud = { ...(s.icloud || {}), on: true, at: Date.now(), error: null } })
    return { pushed: d.push.length, deleted: d.deletes.length }
  } catch (e) {
    own(s => { s.icloud = { ...(s.icloud || {}), error: e?.message || String(e) } })
    return { error: e?.message }
  } finally { busy = false }
}

/** Syncs after changes settle (20 s) and when the app comes back, while sync is on. */
export function initICloud(onAppActive) {
  plugin().then(w => {
    if (!w) return
    useStore.subscribe((s, prev) => {
      if (self || !s.S.icloud?.on || s.S === prev.S) return
      clearTimeout(timer); timer = setTimeout(syncNow, 20000)
    })
    onAppActive?.(() => syncNow())
    syncNow()
  })
}

export const icloudAvailable = async () => !!(await plugin())
