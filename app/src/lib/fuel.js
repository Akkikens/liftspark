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

// ── Food depth: USDA generic foods, barcode cache, favourites, saved meals, copy, adaptive TDEE ──

/** A USDA FoodData Central food (Foundation / SR Legacy, values per 100 g) → our food shape. */
export function fromFDC(f) {
  if (!f?.description) return null
  const n = num => (f.foodNutrients || []).find(x => String(x.nutrientNumber) === num || x.nutrientId === Number(num))?.value
  const kcal = n('208') ?? n('1008') ?? (n('268') != null ? n('268') / 4.184 : null)
  if (!(kcal >= 0)) return null
  const name = String(f.description).toLowerCase().replace(/(^|,\s*)(\w)/g, (m, a, b) => a + b.toUpperCase())
  return { code: null, fdcId: f.fdcId, name, brand: 'USDA', per100: { kcal: Math.round(kcal), p: r1(n('203') ?? n('1003')), c: r1(n('205') ?? n('1005')), f: r1(n('204') ?? n('1004')) }, serving: null, servingLabel: null }
}

/** Generic foods through Liftspark's backend (it holds the FDC key); [] when not configured. */
export async function searchGeneric(query, backend, fetchImpl = globalThis.fetch) {
  const q = String(query || '').trim()
  if (q.length < 2 || !backend) return []
  try {
    const r = await fetchImpl(`${backend}/api/fdc/search?q=${encodeURIComponent(q)}`)
    if (!r.ok) return []
    const j = await r.json()
    return (j.foods || []).map(fromFDC).filter(Boolean).slice(0, 8)
  } catch { return [] }
}

/** A barcode answered before is answered from the state, offline and instantly. */
export async function foodByBarcodeCached(S, code, fetchImpl) {
  const c = String(code || '').replace(/\D/g, '')
  const hit = S?.foodCache?.[c]
  if (hit) return { food: hit, cached: true }
  return { food: await foodByBarcode(c, fetchImpl), cached: false }
}
export function cacheBarcode(S, food, max = 300) {
  if (!food?.code) return
  S.foodCache = { ...(S.foodCache || {}), [food.code]: food }
  const keys = Object.keys(S.foodCache)
  if (keys.length > max) for (const k of keys.slice(0, keys.length - max)) delete S.foodCache[k]
}

const favKey = e => (e.code || e.fdcId || e.name || '').toString().toLowerCase()
export const isFavourite = (S, e) => (S?.foodFavs || []).some(f => f.key === favKey(e))
/** Toggles a favourite: an entry (fixed amount) or a food (per 100 g). */
export function toggleFavourite(S, e) {
  const k = favKey(e)
  const list = S.foodFavs || []
  S.foodFavs = list.some(f => f.key === k) ? list.filter(f => f.key !== k) : [...list, { key: k, item: { ...e, id: undefined, t: undefined } }]
}

/** A meal's entries saved under a name, to log again in one tap. */
export function saveMeal(S, name, entries) {
  const items = entries.map(({ id, t, meal, ...rest }) => rest)
  S.savedMeals = [...(S.savedMeals || []), { id: Date.now().toString(36), name: String(name || 'Meal').slice(0, 40), items }]
}
export function logSavedMeal(S, day, meal, saved, now = Date.now()) {
  const made = saved.items.map((it, i) => ({ ...it, id: `${now.toString(36)}m${i}`, meal, t: now + i }))
  for (const e of made) addFood(S, day, e)
  return made
}

/** Copies a day's entries (or one meal's) onto another day; returns the new entries. */
export function copyDay(S, from, to, meal = null, now = Date.now()) {
  const made = dayFood(S, from).filter(e => !meal || e.meal === meal).map((e, i) => ({ ...e, id: `${now.toString(36)}c${i}`, t: now + i }))
  for (const e of made) addFood(S, to, e)
  return made
}

export function mealTotals(entries, meal) { return totals(entries.filter(e => e.meal === meal)) }

/**
 * Adaptive TDEE, MacroFactor-style: over the last `days` days, what you ate on logged days minus the
 * energy your weight change accounts for (7,700 kcal per kg). Needs 10+ logged days and weigh-ins
 * at least 10 days apart. Returns { tdee, intake, kgPerWeek, loggedDays } or null.
 */
export function adaptiveTdee(S, { days = 28, now = Date.now(), kgOf = w => (S.unit === 'lb' ? w / 2.2046226218 : w) } = {}) {
  const from = new Date(now - days * 864e5).toISOString().slice(0, 10)
  const logged = Object.entries(S?.food || {}).filter(([d, list]) => d >= from && list.length && totals(list).kcal >= 800)
  if (logged.length < 10) return null
  const weights = (S.bodyweight || []).filter(b => b.d >= from && b.w > 0).sort((a, b) => (a.d < b.d ? -1 : 1))
  if (weights.length < 2) return null
  const span = (Date.parse(weights.at(-1).d) - Date.parse(weights[0].d)) / 864e5
  if (span < 10) return null
  // The weight trend as a least-squares slope (kg per day), so one heavy morning doesn't swing it.
  const xs = weights.map(b => Date.parse(b.d) / 864e5), ys = weights.map(b => kgOf(b.w))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  const intake = logged.reduce((a, [, list]) => a + totals(list).kcal, 0) / logged.length
  const tdee = Math.round((intake - slope * 7700) / 10) * 10
  return { tdee, intake: Math.round(intake), kgPerWeek: Math.round(slope * 7 * 100) / 100, loggedDays: logged.length }
}

/** The weekly suggestion: a new daily goal when the adaptive TDEE moves the target by 100+ kcal. */
export function goalSuggestion(S, currentGoal, opts) {
  const a = adaptiveTdee(S, opts)
  if (!a) return null
  const target = Math.round((a.tdee + (OBJECTIVE[S.lsProfile?.objective] ?? 0)) / 10) * 10
  return Math.abs(target - currentGoal) >= 100 ? { ...a, goal: target } : null
}
