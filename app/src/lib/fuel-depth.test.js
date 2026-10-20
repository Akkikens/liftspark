import { describe, expect, it } from 'vitest'
import { fromFDC, searchGeneric, foodByBarcodeCached, cacheBarcode, toggleFavourite, isFavourite, saveMeal, logSavedMeal, copyDay, mealTotals, adaptiveTdee, goalSuggestion } from './fuel.js'

const day = (i, now = Date.parse('2026-10-19T12:00:00Z')) => new Date(now - i * 864e5).toISOString().slice(0, 10)

describe('food depth', () => {
  it('reads a USDA food', () => {
    const f = fromFDC({ fdcId: 1, description: 'CHICKEN, BROILERS OR FRYERS, BREAST, RAW', foodNutrients: [{ nutrientNumber: '208', value: 120 }, { nutrientNumber: '203', value: 22.5 }, { nutrientNumber: '205', value: 0 }, { nutrientNumber: '204', value: 2.6 }] })
    expect(f).toMatchObject({ brand: 'USDA', per100: { kcal: 120, p: 22.5, c: 0, f: 2.6 } })
    expect(f.name).toBe('Chicken, Broilers or fryers, Breast, Raw')
  })
  it('skips generic search when the backend has no key', async () => {
    expect(await searchGeneric('rice', 'https://x', async () => ({ ok: false }))).toEqual([])
  })
  it('answers a known barcode from the cache', async () => {
    const S = {}
    cacheBarcode(S, { code: '123', name: 'Bar', per100: { kcal: 400 } })
    const r = await foodByBarcodeCached(S, '123', () => { throw new Error('no network') })
    expect(r).toMatchObject({ cached: true, food: { name: 'Bar' } })
  })
  it('toggles favourites, saves and logs meals, copies days', () => {
    const S = { food: { [day(1)]: [{ id: 'a', meal: 'breakfast', name: 'Oats', kcal: 300, p: 10, c: 50, f: 6, t: 1 }, { id: 'b', meal: 'lunch', name: 'Rice', kcal: 400, p: 8, c: 80, f: 2, t: 2 }] } }
    toggleFavourite(S, S.food[day(1)][0]); expect(isFavourite(S, { name: 'oats' })).toBe(true)
    toggleFavourite(S, { name: 'Oats' }); expect(isFavourite(S, { name: 'Oats' })).toBe(false)
    expect(copyDay(S, day(1), day(0), 'breakfast')).toHaveLength(1)
    expect(S.food[day(0)][0]).toMatchObject({ name: 'Oats', meal: 'breakfast' })
    saveMeal(S, 'Usual lunch', S.food[day(1)].filter(e => e.meal === 'lunch'))
    logSavedMeal(S, day(0), 'dinner', S.savedMeals[0])
    expect(mealTotals(S.food[day(0)], 'dinner')).toMatchObject({ kcal: 400 })
  })
  it('works out the burn from intake and weight trend', () => {
    const now = Date.parse('2026-10-19T12:00:00Z')
    const S = { unit: 'kg', lsProfile: { objective: 'lose' }, food: {}, bodyweight: [] }
    for (let i = 1; i <= 21; i++) S.food[day(i, now)] = [{ kcal: 2200, p: 0, c: 0, f: 0 }]
    for (let i = 21; i >= 1; i -= 2) S.bodyweight.push({ d: day(i, now), w: 80 - (21 - i) * (0.5 / 7) })
    const a = adaptiveTdee(S, { now })
    expect(a.loggedDays).toBe(21)
    expect(a.kgPerWeek).toBeCloseTo(-0.5, 1)
    expect(a.tdee).toBeGreaterThan(2600); expect(a.tdee).toBeLessThan(2900)
    expect(goalSuggestion(S, 1700, { now }).goal).toBe(Math.round((a.tdee - 500) / 10) * 10)
    expect(adaptiveTdee({ food: {}, bodyweight: [] }, { now })).toBeNull()
  })
})
