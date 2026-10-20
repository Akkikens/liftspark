import { describe, expect, it } from 'vitest'
import { readinessOf, baselineOf, adjustEntries } from './ls-readiness.js'
import { isoDay } from './ls-import.js'

const day = '2026-10-19'
const base = (extra = {}) => {
  const d = {}
  for (let i = 1; i <= 28; i++) d[isoDay(Date.parse(day + 'T12:00:00') - i * 864e5)] = { hrv: 70, rhr: 55, sleepMin: 450 }
  return { ...d, [day]: extra }
}

describe('readiness', () => {
  it('uses a wearable score when there is one', () => {
    expect(readinessOf({ [day]: { recovery: 22 } }, day)).toMatchObject({ score: 22, level: 'lighter', source: 'WHOOP recovery' })
    expect(readinessOf({ [day]: { readiness: 88 } }, day).level).toBe('harder')
  })
  it('compares HRV and resting HR with your own baseline', () => {
    expect(baselineOf(base(), day)).toMatchObject({ hrv: 70, rhr: 55, n: 28 })
    expect(readinessOf(base({ hrv: 70, rhr: 55 }), day).level).toBe('standard')
    expect(readinessOf(base({ hrv: 50, rhr: 62 }), day).level).toBe('lighter')
    expect(readinessOf(base({ hrv: 90, rhr: 51 }), day).level).toBe('harder')
  })
  it('takes short sleep into account and needs a baseline otherwise', () => {
    expect(readinessOf(base({ hrv: 70, rhr: 55, sleepMin: 300 }), day).score).toBe(40)
    expect(readinessOf({ [day]: { hrv: 70 } }, day)).toBeNull()
  })
  it('adjusts target sets but never drops sets already done', () => {
    const e = [{ id: 'a', target: { sets: 3 }, sets: [{ r: 8 }, { r: 8 }, { r: 8 }] }, { id: 'b', sets: [{ r: 8, done: true }, { r: 8 }, { r: 8 }] }, { id: 'c', sets: [{ r: 8 }, { r: 8 }] }]
    const light = adjustEntries(e, 'lighter')
    expect(light.map(x => x.sets.length)).toEqual([2, 3, 2])
    expect(light[0].target.sets).toBe(2)
    expect(adjustEntries(e, 'harder').map(x => x.sets.length)).toEqual([4, 4, 2])
    expect(adjustEntries(e, 'standard')).toBe(e)
  })
})
