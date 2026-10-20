// What Liftspark adds to a finished workout: heart rate, zones, strain and calories (stored as
// `w.ls`), the read-back from Apple Health for a session the watch recorded on its own, and the
// caption that goes with a Strava post.
import { workoutMetrics, downsample, musclesWorked, muscleDots, ZONE_NAMES } from './strain.js'
import { useHeart } from '../store/useHeart.js'
import { health } from './ls-native.js'
import { EXIDX } from './exercises.js'
import { exerciseNameFor } from './i18n.js'
import { isWarmupRow } from './workout-model.js'

const LB = 2.2046226218

/** The latest weigh-in in kg, or 0. */
export function bodyweightKg(S) {
  const list = (S?.bodyweight || []).filter(b => b?.w > 0).sort((a, b) => String(a.d).localeCompare(String(b.d)))
  const last = list[list.length - 1]
  if (!last) return Number(S?.lsProfile?.weightKg) || 0
  return S.unit === 'lb' ? last.w / LB : last.w
}

/** Called by doFinishWorkout on the workout it is about to save. */
export function attachMetrics(w, S) {
  // Only what was recorded during this session (a discarded workout's trace may still be in the buffer).
  const samples = useHeart.getState().takeSamples().filter(p => p[0] >= (w.start || 0) - 60000 && p[0] <= (w.end || Date.now()) + 60000)
  const source = useHeart.getState().source
  const m = workoutMetrics(w, { samples, kg: bodyweightKg(S), profile: S?.lsProfile || {} })
  w.ls = { ...m, hr: downsample(samples), ...(samples.length ? { source } : {}) }
  return w
}

/**
 * After the finish: heart rate and energy Health holds for the workout's span (an Apple Watch
 * workout, a Garmin or Oura sync). Returns the improved `ls` block, or null when Health adds nothing.
 */
export async function healthMetrics(w, S) {
  if (!(w?.start > 0 && w?.end > w.start)) return null
  const [{ samples = [] } = {}, { kcal = 0 } = {}] = await Promise.all([health.heartRate(w.start, w.end), health.activeEnergy(w.start, w.end)])
  const have = w.ls?.hr?.length || 0
  const useHealthHr = samples.length > have * 1.5 && samples.length >= 3
  if (!useHealthHr && !(kcal > 0)) return null
  const hr = useHealthHr ? samples : (w.ls?.hr || [])
  const m = workoutMetrics(w, { samples: hr, kg: bodyweightKg(S), profile: S?.lsProfile || {}, healthKcal: kcal })
  return { ...w.ls, ...m, hr: downsample(hr), ...(useHealthHr ? { source: 'health' } : {}) }
}

const fmtDur = min => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`)
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
const dots = n => '●'.repeat(n)

/** The text for a Strava post (or anywhere): stats, zones, muscles, exercises. */
export function stravaCaption(w, S) {
  const ls = w.ls || {}
  const unit = S?.unit || 'kg'
  const lines = []
  lines.push(`${w.name || 'Strength training'} 💥`)
  const head = [`Strain ${ls.strain ?? 0}/21`, ls.minutes ? fmtDur(ls.minutes) : null, ls.kcal ? `${ls.kcal} kcal` : null].filter(Boolean)
  lines.push(head.join(' · '))
  if (ls.avgHr) lines.push(`❤️ Avg ${ls.avgHr} bpm · Max ${ls.maxHr} bpm`)
  if (ls.zones?.some(s => s > 0)) {
    const total = ls.zones.reduce((a, b) => a + b, 0) || 1
    lines.push('Zones: ' + ls.zones.map((s, i) => s > 0 ? `Z${i + 1} ${Math.round(s / 60)}m` : null).filter(Boolean).join(' · ')
      + ` (${Math.round(((ls.zones[3] + ls.zones[4]) / total) * 100)}% hard)`)
  }
  const md = muscleDots(musclesWorked(w)).slice(0, 6)
  if (md.length) lines.push('Muscles: ' + md.map(m => `${cap(m.region)} ${dots(m.level)}`).join(', '))
  const sets = (w.entries || []).reduce((n, e) => n + (e.sets || []).filter(s => s.done && !isWarmupRow(s)).length, 0)
  const volume = w.vol > 0 ? ` · ${Math.round(w.vol).toLocaleString()} ${unit} moved` : ''
  lines.push(`${sets} sets${volume}`)
  lines.push('')
  for (const e of (w.entries || []).slice(0, 10)) {
    const done = (e.sets || []).filter(s => s.done && !isWarmupRow(s))
    if (!done.length) continue
    const best = done.reduce((a, s) => ((s.w || 0) > (a.w || 0) ? s : a), done[0])
    const name = cap(exerciseNameFor(EXIDX[e.id] || e) || e.name || 'Exercise')
    lines.push(`• ${name}: ${done.length}×${best.r || best.reps || '–'}${best.w > 0 ? ` @ ${best.w} ${unit}` : ''}`)
  }
  lines.push('')
  lines.push('Logged with Liftspark')
  return lines.join('\n')
}

export const zoneLabel = i => `Z${i + 1} · ${ZONE_NAMES[i]}`
