// The personalized starter plan the onboarding builds: a split chosen from training days, goal and
// level, fitted to the user's equipment (openGym's buildStarterPlan does the swapping), trimmed to
// the session length, and with reps nudged for the goal. Pure: answers in, { routines, week } out.
import { buildStarterPlan } from './starter.js'

export const GOALS = ['muscle', 'strength', 'fat', 'fit', 'sport']
export const LEVELS = ['new', 'some', 'experienced']
export const PLACES = ['gym', 'home', 'bodyweight', 'custom']

// What each place means as an equipment list (body weight is always available).
export const PLACE_EQUIPMENT = {
  gym: null, // everything
  home: ['dumbbell', 'band', 'resistance band', 'bench', 'pull-up bar', 'stability ball'],
  bodyweight: ['pull-up bar'],
}
export const CUSTOM_CHOICES = ['barbell', 'dumbbell', 'kettlebell', 'cable', 'leverage machine', 'smith machine', 'ez barbell', 'band', 'bench', 'pull-up bar', 'stability ball', 'suspension trainer']

// Splits by days per week. Each option: a starter-plan id and its weekdays as [day, routine name].
// Days are DAYN indexes (1 = Monday). The first option is the default; "regenerate" steps through.
const SPLITS = {
  2: [
    { id: 'full-body', label: 'Full Body', days: [[1, 'Full Body A'], [4, 'Full Body B']] },
    { id: 'upper-lower', label: 'Upper / Lower', days: [[1, 'Upper A'], [4, 'Lower A']] },
  ],
  3: [
    { id: 'full-body', label: 'Full Body', days: [[1, 'Full Body A'], [3, 'Full Body B'], [5, 'Full Body C']] },
    { id: 'ppl', label: 'Push / Pull / Legs', days: [[1, 'Push Day'], [3, 'Pull Day'], [5, 'Leg Day']] },
    { id: '5x5', label: '5×5 Strength', days: [[1, '5×5 A'], [3, '5×5 B'], [5, '5×5 C']] },
  ],
  4: [
    { id: 'upper-lower', label: 'Upper / Lower', days: [[1, 'Upper A'], [2, 'Lower A'], [4, 'Upper B'], [5, 'Lower B']] },
    { id: 'full-body', label: 'Full Body', days: [[1, 'Full Body A'], [2, 'Full Body B'], [4, 'Full Body C'], [5, 'Full Body A']] },
  ],
  5: [
    { id: 'ppl+ul', label: 'Push / Pull / Legs + Upper / Lower', days: [[1, 'Push Day'], [2, 'Pull Day'], [3, 'Leg Day'], [5, 'Upper A'], [6, 'Lower A']] },
    { id: 'upper-lower', label: 'Upper / Lower', days: [[1, 'Upper A'], [2, 'Lower A'], [3, 'Upper B'], [5, 'Lower B'], [6, 'Upper A']] },
  ],
  6: [
    { id: 'ppl', label: 'Push / Pull / Legs ×2', days: [[1, 'Push Day'], [2, 'Pull Day'], [3, 'Leg Day'], [4, 'Push Day'], [5, 'Pull Day'], [6, 'Leg Day']] },
    { id: 'upper-lower', label: 'Upper / Lower ×3', days: [[1, 'Upper A'], [2, 'Lower A'], [3, 'Upper B'], [4, 'Lower B'], [5, 'Upper A'], [6, 'Lower A']] },
  ],
}

/** The options for a day count, the goal-preferred one first. */
export function splitOptions(days, goal, level) {
  const d = Math.min(6, Math.max(2, Math.round(Number(days) || 3)))
  const opts = [...SPLITS[d]]
  // A strength goal on three days leads with 5×5; a beginner on three days with Full Body.
  if (d === 3 && goal === 'strength' && level !== 'new') opts.sort((a, b) => (b.id === '5x5') - (a.id === '5x5'))
  if (d === 3 && level === 'experienced' && goal === 'muscle') opts.sort((a, b) => (b.id === 'ppl') - (a.id === 'ppl'))
  return opts
}

export function equipmentFor(place, custom) {
  if (place === 'custom') return [...new Set([...(custom || [])])]
  return PLACE_EQUIPMENT[place] ?? null
}

function routinesFor(id, equipment) {
  if (id === 'ppl+ul') {
    const a = buildStarterPlan('ppl', equipment || undefined), b = buildStarterPlan('upper-lower', equipment || undefined)
    return [...(a?.routines || []), ...(b?.routines || [])]
  }
  return buildStarterPlan(id, equipment || undefined)?.routines || []
}

function tune(routine, { minutes, goal, level }) {
  const keep = minutes <= 30 ? 4 : minutes <= 45 ? 5 : minutes <= 60 ? 6 : 7
  const ex = routine.ex.slice(0, keep).map((e, i) => {
    let sets = e.sets, reps = e.reps
    if (level === 'new') sets = Math.min(sets, 3)
    if (minutes <= 30) sets = Math.max(2, sets - 1)
    if (minutes >= 75 && i < 2) sets += 1
    if (goal === 'fat' || goal === 'fit') reps = Math.max(reps, 10) + (goal === 'fat' ? 2 : 0)
    if (goal === 'strength' && i < 2) reps = Math.min(reps, 5)
    return { ...e, sets, reps }
  })
  return { ...routine, ex }
}

/**
 * { label, splitId, routines, week, missing } — `week` maps weekday → [routineId]. `variant` picks
 * the n-th split option (wraps), for "regenerate".
 */
export function generatePlan(answers, variant = 0) {
  const { days = 3, goal = 'muscle', level = 'some', minutes = 60, place = 'gym', equipment: custom } = answers || {}
  const opts = splitOptions(days, goal, level)
  const split = opts[((variant % opts.length) + opts.length) % opts.length]
  const equipment = equipmentFor(place, custom)
  const byName = new Map()
  for (const r of routinesFor(split.id, equipment)) if (!byName.has(r.name)) byName.set(r.name, tune(r, { minutes, goal, level }))
  const week = {}, used = new Map(), missing = []
  for (const [day, name] of split.days) {
    const r = byName.get(name)
    if (!r || !r.ex.length) { missing.push(name); continue }
    used.set(r.id, r)
    week[day] = [r.id]
  }
  return { label: split.label, splitId: split.id, options: opts.length, routines: [...used.values()], week, missing }
}

/** Puts a generated plan into the state (a draft): routines added, those weekdays assigned. */
export function applyPlan(S, plan) {
  S.routines = [...(S.routines || []), ...plan.routines]
  S.week = { ...(S.week || {}) }
  for (const [day, ids] of Object.entries(plan.week)) S.week[day] = ids
}

/** The calorie objective each goal implies (lib/fuel.js OBJECTIVE). */
export const GOAL_OBJECTIVE = { muscle: 'gain', strength: 'maintain', fat: 'lose', fit: 'maintain', sport: 'maintain' }
