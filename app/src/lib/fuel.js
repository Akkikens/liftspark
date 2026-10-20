// Calories in: food logged by day (S.food), the daily goal, and the day's balance against what Apple
// Health says was burned. Food data comes from Open Food Facts (world.openfoodfacts.org, ODbL;
// credited in Settings → About), looked up by name or by the barcode on the pack.
import { todayISO } from './format.js'

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks']
export const MEAL_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' }
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 }
export const OBJECTIVE = { lose: -500, maintain: 0, gain: 300 }

const OFF = 'https://world.openfoodfacts.org'
const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity'
const r1 = v => Math.round((Number(v) || 0) * 10) / 10

/** An Open Food Facts product → { code, name, brand, per100: { kcal, p, c, f }, serving } or null. */
export function fromOFF(p) {
  if (!p) return null
  const n = p.nutriments || {}
  const kcal = Number(n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : NaN))
  const name = String(p.product_name || '').trim()
  if (!name || !(kcal >= 0)) return null
  return {
    code: p.code || null,
    name,
    brand: String(p.brands || '').split(',')[0].trim() || null,
    per100: { kcal: Math.round(kcal), p: r1(n.proteins_100g), c: r1(n.carbohydrates_100g), f: r1(n.fat_100g) },
    serving: Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : null,
    servingLabel: p.serving_size || null,
  }
}

export async function searchFoods(query, fetchImpl = globalThis.fetch) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const u = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=${FIELDS}`
  const r = await fetchImpl(u)
  if (!r.ok) throw new Error(String(r.status))
  const j = await r.json()
  return (j.products || []).map(fromOFF).filter(Boolean)
}

export async function foodByBarcode(code, fetchImpl = globalThis.fetch) {
  const c = String(code || '').replace(/\D/g, '')
  if (!c) return null
  const r = await fetchImpl(`${OFF}/api/v2/product/${c}.json?fields=${FIELDS}`)
  if (!r.ok) return null
  const j = await r.json()
  return j.status === 1 ? fromOFF(j.product) : null
}

/** A food at `grams` → the entry stored in S.food. */
export function entryFor(food, grams, meal, now = Date.now()) {
  const k = grams / 100
  return {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    meal: MEALS.includes(meal) ? meal : 'snacks',
    name: food.name, ...(food.brand ? { brand: food.brand } : {}), ...(food.code ? { code: food.code } : {}),
    g: Math.round(grams),
    kcal: Math.round(food.per100.kcal * k), p: r1(food.per100.p * k), c: r1(food.per100.c * k), f: r1(food.per100.f * k),
    t: now,
  }
}

export function quickEntry({ name, kcal, p = 0, c = 0, f = 0 }, meal, now = Date.now()) {
  return { id: `${now.toString(36)}q`, meal: MEALS.includes(meal) ? meal : 'snacks', name: String(name || 'Quick add').slice(0, 60), kcal: Math.round(Number(kcal) || 0), p: r1(p), c: r1(c), f: r1(f), t: now }
}

export const dayFood = (S, day = todayISO()) => (S?.food?.[day] || [])

export function totals(entries) {
  return (entries || []).reduce((a, e) => ({ kcal: a.kcal + (e.kcal || 0), p: r1(a.p + (e.p || 0)), c: r1(a.c + (e.c || 0)), f: r1(a.f + (e.f || 0)) }), { kcal: 0, p: 0, c: 0, f: 0 })
}

/**
 * Mifflin–St Jeor resting energy, kcal/day. The formula has a male (+5) and a female (−161)
 * constant; without a sex given ("prefer not to say", intersex, non-binary) the average of the two
 * (−78) is used, which sits within about 4 % of either.
 */
export const SEX_CONSTANT = { male: 5, female: -161, other: -78 }
export function bmr({ kg, cm, age, sex }) {
  if (!(kg > 0 && cm > 0 && age > 0)) return 0
  return Math.round(10 * kg + 6.25 * cm - 5 * age + (SEX_CONSTANT[sex] ?? SEX_CONSTANT.other))
}

/** The daily calorie goal: the user's own number, else Mifflin × activity ± objective. */
export function dailyGoal(profile, kg, age) {
  const own = Number(profile?.goalKcal)
  if (own >= 800 && own <= 8000) return Math.round(own)
  const base = bmr({ kg, cm: Number(profile?.heightCm) || 175, age, sex: profile?.sex })
  if (!base) return 2200
  const tdee = base * (ACTIVITY[profile?.activity] || ACTIVITY.moderate)
  return Math.round((tdee + (OBJECTIVE[profile?.objective] ?? 0)) / 10) * 10
}

/** Macro targets in grams: protein 1.8 g/kg, fat 27 % of energy, carbs the rest. */
export function macroGoals(goal, kg) {
  const p = Math.round((kg || 75) * 1.8)
  const f = Math.round(goal * 0.27 / 9)
  const c = Math.max(0, Math.round((goal - p * 4 - f * 9) / 4))
  return { p, c, f }
}

/** Adds an entry to a day, in place on a state draft. */
export function addFood(S, day, entry) {
  S.food = S.food && typeof S.food === 'object' ? S.food : {}
  S.food[day] = [...(S.food[day] || []), entry]
}

export function removeFood(S, day, id) {
  if (!S.food?.[day]) return
  S.food[day] = S.food[day].filter(e => e.id !== id)
  if (!S.food[day].length) delete S.food[day]
}

/** Recently logged foods, newest first, one per name, for one-tap re-logging. */
export function recentFoods(S, limit = 12) {
  const seen = new Set(), out = []
  const days = Object.keys(S?.food || {}).sort().reverse()
  for (const d of days) for (const e of [...S.food[d]].reverse()) {
    const k = e.name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); out.push(e)
    if (out.length >= limit) return out
  }
  return out
}
