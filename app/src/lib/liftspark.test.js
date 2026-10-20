import { describe, it, expect } from 'vitest'
import { zoneOf, timeInZones, trimpOf, strainOf, keytelKcal, metKcal, workoutMetrics, downsample, maxHrOf, musclesWorked, muscleDots } from './strain.js'
import { fromOFF, entryFor, totals, bmr, dailyGoal, macroGoals, addFood, removeFood, recentFoods } from './fuel.js'
import { muscleMapSVG } from './muscle-map.js'

describe('heart-rate zones and strain', () => {
  it('puts a heart rate in the right zone of max HR', () => {
    expect(zoneOf(95, 190)).toBe(0)     // 50 %
    expect(zoneOf(133, 190)).toBe(2)    // 70 %
    expect(zoneOf(180, 190)).toBe(4)    // 95 %
    expect(zoneOf(80, 190)).toBe(-1)
  })
  it('uses heart-rate reserve when a resting HR is known', () => {
    expect(zoneOf(130, 190, 60)).toBe(0)   // (130-60)/130 = 54 % of reserve
    expect(zoneOf(165, 190, 60)).toBe(3)   // 81 % of reserve
  })
  it('counts seconds per zone, capping long gaps', () => {
    const t0 = 0
    const s = [[t0, 140], [t0 + 10000, 140], [t0 + 20000, 175], [t0 + 600000, 175]]
    const z = timeInZones(s, 190)
    expect(z[2]).toBe(20)   // 140 = 74 %: two 10 s samples
    expect(z[4]).toBe(31)   // 175 = 92 %: one capped 30 s gap + the last sample's 1 s
  })
  it('maps TRIMP onto 0–21 and never reaches 21', () => {
    expect(strainOf(0)).toBe(0)
    expect(strainOf(180)).toBe(14.2)
    expect(strainOf(10000)).toBeLessThanOrEqual(21)
    expect(trimpOf([60, 0, 600, 0, 0])).toBeCloseTo(31, 0)
  })
  it('estimates calories from heart rate (Keytel) and falls back to METs', () => {
    expect(keytelKcal({ avgHr: 130, minutes: 60, kg: 80, age: 30, female: false })).toBeGreaterThan(450)
    expect(keytelKcal({ avgHr: 0, minutes: 60, kg: 80, age: 30 })).toBe(0)
    expect(metKcal({ minutes: 60, kg: 80 })).toBe(400)
  })
  it('works out a whole workout, with and without heart rate', () => {
    const w = { start: 0, end: 45 * 60000, entries: [] }
    const samples = Array.from({ length: 45 * 6 }, (_, i) => [i * 10000, 135])
    const m = workoutMetrics(w, { samples, kg: 80, profile: { birthYear: new Date().getFullYear() - 30 } })
    expect(m.avgHr).toBe(135)
    expect(m.strain).toBeGreaterThan(5)
    expect(m.kcalSource).toBe('hr')
    const none = workoutMetrics(w, { kg: 80 })
    expect(none.estimated).toBe(true)
    expect(none.kcalSource).toBe('met')
    const health = workoutMetrics(w, { kg: 80, healthKcal: 321.4 })
    expect(health.kcal).toBe(321)
  })
  it('respects a max HR the user set', () => {
    expect(maxHrOf({ maxHr: 201 })).toBe(201)
    expect(maxHrOf({ birthYear: new Date().getFullYear() - 40 })).toBe(180)
  })
  it('downsamples to the max of each bucket', () => {
    expect(downsample([[0, 100], [1000, 120], [6000, 110]], 5000)).toEqual([[0, 120], [5000, 110]])
  })
})

describe('muscles worked', () => {
  it('weights primary muscles over secondary ones and ranks them', () => {
    const w = { entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }, { done: true, w: 60, r: 8 }] }] }
    const load = musclesWorked(w)
    expect(load.chest).toBe(2)
    const dots = muscleDots(load)
    expect(dots[0]).toMatchObject({ region: 'chest', level: 3 })
  })
  it('draws a body map with worked regions coloured', () => {
    const svg = muscleMapSVG({ chest: 3, quads: 1 })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('#ff2f7d')
  })
})

describe('food', () => {
  const food = fromOFF({ code: '123', product_name: 'Greek yogurt', brands: 'Fage,Other', nutriments: { 'energy-kcal_100g': 97, proteins_100g: 9, carbohydrates_100g: 4, fat_100g: 5 }, serving_quantity: 170 })
  it('reads an Open Food Facts product', () => {
    expect(food).toMatchObject({ name: 'Greek yogurt', brand: 'Fage', per100: { kcal: 97, p: 9 }, serving: 170 })
    expect(fromOFF({ product_name: '' })).toBeNull()
  })
  it('scales an entry to grams and totals a day', () => {
    const e = entryFor(food, 170, 'breakfast', 1)
    expect(e).toMatchObject({ kcal: 165, p: 15.3, meal: 'breakfast', g: 170 })
    expect(totals([e, e]).kcal).toBe(330)
  })
  it('sets a goal from Mifflin–St Jeor unless the user gave one', () => {
    expect(bmr({ kg: 80, cm: 180, age: 30, sex: 'male' })).toBe(1780)
    expect(dailyGoal({ heightCm: 180, sex: 'male', activity: 'moderate', objective: 'maintain' }, 80, 30)).toBe(2760)
    expect(dailyGoal({ goalKcal: 2000 }, 80, 30)).toBe(2000)
    expect(macroGoals(2000, 80).p).toBe(144)
  })
  it('adds, removes and remembers foods', () => {
    const S = {}
    addFood(S, '2026-10-19', entryFor(food, 100, 'lunch', 1))
    addFood(S, '2026-10-20', entryFor(food, 50, 'lunch', 2))
    expect(recentFoods(S)).toHaveLength(1)
    removeFood(S, '2026-10-19', S.food['2026-10-19'][0].id)
    expect(S.food['2026-10-19']).toBeUndefined()
  })
})

describe('exercise library order', async () => {
  const { popularFirst, hasPicture, STAPLES } = await import('./ls-library.js')
  const { CATALOGUE } = await import('./exercises.js')
  it('leads with the staple lifts, then pictured exercises, then the rest', () => {
    const list = popularFirst(CATALOGUE)
    expect(list[0].n).toBe('barbell bench press')
    expect(list.slice(0, 5).map(e => e.n)).toEqual(['barbell bench press', 'barbell full squat', 'barbell deadlift', 'barbell standing military press', 'barbell bent over row'])
    const rest = list.filter(e => !STAPLES.includes(e.n))
    const firstWithout = rest.findIndex(e => !hasPicture(e))
    expect(rest.slice(firstWithout).some(hasPicture)).toBe(false)
    expect(list.length).toBe(CATALOGUE.length)
  })
})
