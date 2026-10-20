// The exercise list's default order in Liftspark: the lifts people actually do at the gym first, then
// every exercise with a picture, then the rest (drills, stretches and variations) in catalogue order.
// openGym listed its 5,600-odd exercises A–Z, which put "1 2 stick drill" at the top.
import { EXIDX } from './exercises.js'

export const STAPLES = [
  'barbell bench press', 'barbell full squat', 'barbell deadlift', 'barbell standing military press',
  'barbell bent over row', 'pull-up', 'chin-up', 'cable pulldown', 'cable seated row',
  'barbell incline bench press', 'dumbbell bench press', 'dumbbell incline bench press',
  'dumbbell seated shoulder press', 'dumbbell lateral raise', 'barbell curl', 'dumbbell biceps curl',
  'dumbbell hammer curl', 'cable pushdown', 'triceps dip', 'chest dip', 'push-up',
  'barbell romanian deadlift', 'barbell hip thrust', 'sled 45° leg press', 'lever leg extension',
  'lever seated leg curl', 'lever lying leg curl', 'barbell front squat', 'dumbbell lunge',
  'cable standing face pull (with rope)', 'front plank', 'cable kneeling crunch',
]

let rankCache = null
function ranks() {
  if (rankCache) return rankCache
  rankCache = new Map()
  const byName = new Map(Object.values(EXIDX).map(e => [e.n, e.id]))
  STAPLES.forEach((n, i) => { const id = byName.get(n); if (id) rankCache.set(id, i) })
  return rankCache
}

export const hasPicture = e => !!e?.img

/** Staples first (in STAPLES order), then exercises with a picture, then the rest; stable. */
export function popularFirst(list) {
  const r = ranks()
  const tier = e => (r.has(e.id) ? 0 : hasPicture(e) ? 1 : 2)
  return list
    .map((e, i) => [e, i])
    .sort((a, b) => tier(a[0]) - tier(b[0]) || (r.get(a[0].id) ?? 0) - (r.get(b[0].id) ?? 0) || a[1] - b[1])
    .map(([e]) => e)
}
