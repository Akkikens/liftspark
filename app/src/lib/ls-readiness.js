// Recovery-aware training: today's readiness from WHOOP recovery, Oura readiness, or Apple Health's
// HRV and resting heart rate against your own 28-day baseline, turned into a suggestion for today's
// session — lighter, standard or harder — with the reason. The user can ignore it; applying it
// adjusts the session's target sets when it starts (adjustEntries).
import { isoDay } from './ls-import.js'

const DAY = 864e5
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null }

/** Baselines from the 28 days before `day`: { hrv, rhr, sleepMin, n }. */
export function baselineOf(daily, day, days = 28) {
  const end = Date.parse(day + 'T12:00:00')
  const rows = Array.from({ length: days }, (_, i) => daily?.[isoDay(end - (i + 1) * DAY)]).filter(Boolean)
  const pick = k => rows.map(r => r[k]).filter(v => v > 0)
  return { hrv: median(pick('hrv')), rhr: median(pick('rhr')), sleepMin: median(pick('sleepMin')), n: rows.length }
}

/**
 * { score 0–100, level: 'lighter'|'standard'|'harder', source, reasons: [string] } or null when
 * there is nothing to go on. A wearable's own score wins; otherwise HRV and resting HR need at least
 * a week of baseline.
 */
export function readinessOf(daily, day) {
  const today = daily?.[day]
  if (!today) return null
  const reasons = []
  let score = null, source = null
  if (today.recovery != null) { score = today.recovery; source = 'WHOOP recovery' }
  else if (today.readiness != null) { score = today.readiness; source = 'Oura readiness' }
  else {
    const b = baselineOf(daily, day)
    const parts = []
    if (today.hrv > 0 && b.hrv && b.n >= 7) {
      const r = today.hrv / b.hrv
      parts.push(50 + (r - 1) * 120)
      reasons.push(r >= 1.05 ? `HRV ${Math.round(today.hrv)} ms, above your usual ${Math.round(b.hrv)}` : r <= 0.92 ? `HRV ${Math.round(today.hrv)} ms, below your usual ${Math.round(b.hrv)}` : `HRV ${Math.round(today.hrv)} ms, about your usual`)
    }
    if (today.rhr > 0 && b.rhr && b.n >= 7) {
      const d = today.rhr - b.rhr
      parts.push(50 - d * 6)
      reasons.push(d >= 3 ? `Resting HR ${Math.round(today.rhr)}, ${Math.round(d)} above your usual` : d <= -2 ? `Resting HR ${Math.round(today.rhr)}, lower than usual` : `Resting HR ${Math.round(today.rhr)}, about your usual`)
    }
    if (!parts.length) return null
    score = parts.reduce((a, b) => a + b, 0) / parts.length
    source = 'HRV and resting heart rate'
  }
  if (today.sleepMin > 0) {
    if (today.sleepMin < 360) { score -= 10; reasons.push(`${Math.floor(today.sleepMin / 60)}h ${Math.round(today.sleepMin % 60)}m of sleep`) }
    else if (today.sleepMin >= 480) reasons.push('A full night of sleep')
  }
  if (source !== 'HRV and resting heart rate') reasons.unshift(`${source} ${Math.round(score)}${source.startsWith('WHOOP') ? '%' : ''}`)
  score = Math.max(0, Math.min(100, Math.round(score)))
  const level = score < 34 ? 'lighter' : score > 66 ? 'harder' : 'standard'
  return { score, level, source, reasons }
}

export const ADVICE = {
  lighter: { title: 'Take it lighter today', body: 'One set fewer per exercise, and stop 2-3 reps short of failure. Training still counts; recovery catches up.' },
  standard: { title: 'Train as planned', body: 'Your body looks ready for the usual. Go by feel on the last sets.' },
  harder: { title: 'Good day to push', body: 'An extra set on your first two lifts, or chase a rep or weight PR.' },
}

/** The session's entries with target sets adjusted for a level. Sets already done are never removed. */
export function adjustEntries(entries, level) {
  if (level === 'standard' || !Array.isArray(entries)) return entries
  return entries.map((e, i) => {
    const sets = Array.isArray(e.sets) ? e.sets : null
    if (!sets?.length) return e
    if (level === 'lighter') {
      if (sets.length <= 2 || sets.some(s => s.done)) return e
      return { ...e, sets: sets.slice(0, -1), ...(e.target?.sets ? { target: { ...e.target, sets: e.target.sets - 1 } } : {}), lsAdjusted: 'lighter' }
    }
    if (i < 2) return { ...e, sets: [...sets, { ...sets[sets.length - 1], done: false }], ...(e.target?.sets ? { target: { ...e.target, sets: e.target.sets + 1 } } : {}), lsAdjusted: 'harder' }
    return e
  })
}
