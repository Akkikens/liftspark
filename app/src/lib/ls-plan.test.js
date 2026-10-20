import { describe, expect, it } from 'vitest'
import { generatePlan, applyPlan, splitOptions } from './ls-plan.js'
import { bmr } from './fuel.js'
import { EXIDX } from './exercises.js'
import { eqAvailable } from './equipment.js'

describe('the onboarding plan', () => {
  it('puts one routine on each training day, for every day count', () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const p = generatePlan({ days, goal: 'muscle', level: 'some', minutes: 60, place: 'gym' })
      expect(Object.keys(p.week)).toHaveLength(days)
      expect(p.missing).toEqual([])
      for (const [, ids] of Object.entries(p.week)) expect(p.routines.some(r => r.id === ids[0])).toBe(true)
    }
  })
  it('leads with 5×5 for a strength goal on three days, and full body for a beginner', () => {
    expect(splitOptions(3, 'strength', 'some')[0].id).toBe('5x5')
    expect(generatePlan({ days: 3, goal: 'muscle', level: 'new' }).splitId).toBe('full-body')
  })
  it('regenerate steps through the alternatives and wraps', () => {
    const a = { days: 4, goal: 'fit', level: 'some' }
    expect(generatePlan(a, 0).splitId).not.toBe(generatePlan(a, 1).splitId)
    expect(generatePlan(a, 2).splitId).toBe(generatePlan(a, 0).splitId)
  })
  it('trims to the session length and keeps beginners at three sets', () => {
    const short = generatePlan({ days: 3, minutes: 30, level: 'new', place: 'gym' })
    for (const r of short.routines) { expect(r.ex.length).toBeLessThanOrEqual(4); for (const e of r.ex) expect(e.sets).toBeLessThanOrEqual(3) }
  })
  it('only uses equipment you have', () => {
    const p = generatePlan({ days: 3, place: 'bodyweight', level: 'some' })
    expect(p.routines.length).toBeGreaterThan(0)
    for (const r of p.routines) for (const e of r.ex) expect(eqAvailable(['pull-up bar'], EXIDX[e.id])).toBe(true)
  })
  it('adds routines and assigns weekdays without touching other days', () => {
    const S = { routines: [{ id: 'mine', name: 'Mine', ex: [] }], week: { 0: ['mine'] } }
    const p = generatePlan({ days: 3 })
    applyPlan(S, p)
    expect(S.routines[0].id).toBe('mine')
    expect(S.routines).toHaveLength(1 + p.routines.length)
    expect(S.week[0]).toEqual(['mine'])
    expect(Object.keys(S.week)).toHaveLength(4)
  })
})

describe('resting energy without a sex given', () => {
  it('uses the average of the male and female constants', () => {
    const m = bmr({ kg: 80, cm: 180, age: 30, sex: 'male' }), f = bmr({ kg: 80, cm: 180, age: 30, sex: 'female' })
    expect(bmr({ kg: 80, cm: 180, age: 30 })).toBe(Math.round((m + f) / 2))
  })
})
