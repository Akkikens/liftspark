// Liftspark's workout effort numbers, worked out from heart-rate samples and the session itself.
//
// Zones: five bands of heart-rate reserve (Karvonen) when a resting HR is known, else of max HR:
//   Z1 50–60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 90 %+.
// TRIMP: Edwards' summated heart-rate zones, minutes in zone × zone number (1…5).
// Strain: TRIMP mapped onto a 0–21 scale that rises fast at first and flattens out, like the scale
//   WHOOP made familiar: strain = 21 × (1 − e^(−TRIMP / 160)). An hour in zone 3 (TRIMP 180) is
//   about 14.2, a hard hour in zone 4 (240) about 16.3; 21 is never quite reached.
// Calories: Keytel et al. (2005) from average HR, weight, age and sex when there is heart rate;
//   otherwise METs × weight × hours (strength training ~5 METs moderate, 6 vigorous).
import { EXIDX } from './exercises.js'
import { isWarmupRow } from './workout-model.js'

export const ZONES = [0.5, 0.6, 0.7, 0.8, 0.9]
export const ZONE_NAMES = ['Warm-up', 'Easy', 'Aerobic', 'Threshold', 'Max']
export const ZONE_COLORS = ['var(--z1)', 'var(--z2)', 'var(--z3)', 'var(--z4)', 'var(--z5)']

export function ageOf(profile, now = new Date()) {
  const y = Number(profile?.birthYear)
  return y > 1900 && y <= now.getFullYear() ? now.getFullYear() - y : 30
}

/** Max HR: the user's own, else Tanaka (208 − 0.7 × age). */
export function maxHrOf(profile, now) {
  const own = Number(profile?.maxHr)
  return own >= 120 && own <= 230 ? own : Math.round(208 - 0.7 * ageOf(profile, now))
}

/** Zone index 0–4 for a heart rate, or -1 below zone 1. */
export function zoneOf(bpm, maxHr, restHr = 0) {
  if (!(bpm > 0) || !(maxHr > 0)) return -1
  const rest = restHr > 30 && restHr < maxHr ? restHr : 0
  const frac = rest ? (bpm - rest) / (maxHr - rest) : bpm / maxHr
  let z = -1
  ZONES.forEach((lo, i) => { if (frac >= lo) z = i })
  return z
}

/** Seconds per zone from [[ms, bpm], …], each sample counting until the next (gaps over 30 s capped). */
export function timeInZones(samples, maxHr, restHr = 0) {
  const out = [0, 0, 0, 0, 0]
  const s = (samples || []).filter(p => Array.isArray(p) && p[1] > 0).sort((a, b) => a[0] - b[0])
  for (let i = 0; i < s.length; i++) {
    const dt = i + 1 < s.length ? Math.min(30, (s[i + 1][0] - s[i][0]) / 1000) : 1
    const z = zoneOf(s[i][1], maxHr, restHr)
    if (z >= 0 && dt > 0) out[z] += dt
  }
  return out.map(v => Math.round(v))
}

export function trimpOf(zoneSeconds) {
  return (zoneSeconds || []).reduce((sum, sec, i) => sum + (sec / 60) * (i + 1), 0)
}

export function strainOf(trimp) {
  if (!(trimp > 0)) return 0
  return Math.round(21 * (1 - Math.exp(-trimp / 160)) * 10) / 10
}

export function hrStats(samples) {
  const v = (samples || []).map(p => p?.[1]).filter(b => b > 0)
  if (!v.length) return null
  return { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.max(...v), min: Math.min(...v), n: v.length }
}

/** Keytel 2005, kcal for a session from average HR. */
export function keytelKcal({ avgHr, minutes, kg, age, female }) {
  if (!(avgHr > 0 && minutes > 0 && kg > 0)) return 0
  const perMin = female
    ? (-20.4022 + 0.4472 * avgHr - 0.1263 * kg + 0.074 * age) / 4.184
    : (-55.0969 + 0.6309 * avgHr + 0.1988 * kg + 0.2017 * age) / 4.184
  return Math.max(0, Math.round(perMin * minutes))
}

export function metKcal({ minutes, kg, met = 5 }) {
  if (!(minutes > 0 && kg > 0)) return 0
  return Math.round(met * kg * (minutes / 60))
}

/** Workout duration in minutes from start/end (ms). */
export const minutesOf = w => (w?.end > w?.start ? (w.end - w.start) / 60000 : 0)

/**
 * Everything Liftspark shows and shares for one workout.
 * `samples` [[ms, bpm]] from the live session or from Health; `kg` body weight; `profile`
 * { birthYear, sex, maxHr, restHr }; `healthKcal` active energy Health recorded for the same span.
 */
export function workoutMetrics(w, { samples = [], kg = 0, profile = {}, healthKcal = 0 } = {}) {
  const minutes = minutesOf(w)
  const maxHr = maxHrOf(profile)
  const restHr = Number(profile?.restHr) || 0
  const stats = hrStats(samples)
  const zones = stats ? timeInZones(samples, maxHr, restHr) : [0, 0, 0, 0, 0]
  const trimp = trimpOf(zones)
  // Without heart rate, strain is estimated from the minutes worked at a moderate effort (zone 2).
  const strain = stats ? strainOf(trimp) : strainOf(minutes * 2 * 0.8)
  const age = ageOf(profile)
  const female = profile?.sex === 'female'
  const hrKcal = stats ? keytelKcal({ avgHr: stats.avg, minutes, kg: kg || 75, age, female }) : 0
  const kcal = healthKcal > 0 ? Math.round(healthKcal) : hrKcal || metKcal({ minutes, kg: kg || 75 })
  return {
    minutes: Math.round(minutes),
    strain,
    trimp: Math.round(trimp),
    zones,
    avgHr: stats?.avg || null,
    maxHr: stats?.max || null,
    kcal,
    kcalSource: healthKcal > 0 ? 'health' : stats ? 'hr' : 'met',
    estimated: !stats,
  }
}

/** Keep a long recording small enough to store: one sample per `everyMs`, the max of each bucket. */
export function downsample(samples, everyMs = 5000) {
  const out = []
  let bucket = null
  for (const p of (samples || []).filter(p => p?.[1] > 0).sort((a, b) => a[0] - b[0])) {
    const k = Math.floor(p[0] / everyMs)
    if (!bucket || bucket.k !== k) { bucket = { k, p: [k * everyMs, p[1]] }; out.push(bucket.p) } else if (p[1] > bucket.p[1]) bucket.p[1] = p[1]
  }
  return out
}

// ---- muscles worked ----

// The body map's regions (components/MuscleCard.jsx draws them). Each catalogue muscle word falls
// into one; anything unknown is left out rather than guessed.
export const REGIONS = ['chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'traps', 'lats', 'upper back', 'lower back', 'glutes', 'quads', 'hamstrings', 'adductors', 'calves']
const WORD = {
  pectorals: 'chest', chest: 'chest', 'upper chest': 'chest', 'lower chest': 'chest', serratus: 'chest', 'serratus anterior': 'chest',
  delts: 'shoulders', shoulders: 'shoulders', 'front deltoids': 'shoulders', 'rear deltoids': 'shoulders', 'side deltoids': 'shoulders', deltoids: 'shoulders', 'rotator cuff': 'shoulders',
  biceps: 'biceps', brachialis: 'biceps', triceps: 'triceps', forearms: 'forearms', 'wrist flexors': 'forearms', 'wrist extensors': 'forearms', 'grip muscles': 'forearms', hands: 'forearms', wrists: 'forearms',
  abs: 'abs', core: 'abs', 'lower abs': 'abs', 'upper abs': 'abs', obliques: 'obliques',
  traps: 'traps', trapezius: 'traps', 'upper back': 'upper back', rhomboids: 'upper back', 'levator scapulae': 'traps', lats: 'lats', 'latissimus dorsi': 'lats',
  'lower back': 'lower back', spine: 'lower back', 'erector spinae': 'lower back',
  glutes: 'glutes', 'hip flexors': 'quads', abductors: 'glutes', quads: 'quads', quadriceps: 'quads', hamstrings: 'hamstrings', adductors: 'adductors', 'inner thighs': 'adductors',
  calves: 'calves', soleus: 'calves', shins: 'calves', ankles: 'calves', feet: 'calves',
}

/** Hard sets per body region for a workout, primary muscles counting 1 and secondaries 0.5. */
export function musclesWorked(w) {
  const load = {}
  for (const e of w?.entries || []) {
    const ex = { ...(EXIDX[e.id] || {}), ...(e.muscleSnapshot || {}) }
    const sets = (e.sets || []).filter(s => s?.done && !isWarmupRow(s)).length
    if (!sets) continue
    const prim = new Set([ex.tg, ...(ex.primaries || [])].map(m => WORD[String(m || '').toLowerCase()]).filter(Boolean))
    const sec = new Set([...(ex.sm || []), ...(ex.secondaries || [])].map(m => WORD[String(m || '').toLowerCase()]).filter(r => r && !prim.has(r)))
    prim.forEach(r => { load[r] = (load[r] || 0) + sets })
    sec.forEach(r => { load[r] = (load[r] || 0) + sets * 0.5 })
  }
  return load
}

/** Region → 1–3 dots of intensity relative to the busiest region. */
export function muscleDots(load) {
  const max = Math.max(0, ...Object.values(load || {}))
  if (!max) return []
  return Object.entries(load)
    .sort((a, b) => b[1] - a[1])
    .map(([region, v]) => ({ region, sets: v, level: v / max > 0.66 ? 3 : v / max > 0.33 ? 2 : 1 }))
}
