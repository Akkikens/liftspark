// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { recordsOf, diff, applyPulled, hashOf, cloudWorkout } from './ls-icloud.js'

const base = () => ({ workouts: [{ id: 'w1', d: '2026-10-01', name: 'Push' }], routines: [], bodyweight: [{ d: '2026-10-01', w: 80 }], food: { '2026-10-01': [{ id: 'f', kcal: 300 }] }, week: { 1: ['r'] }, unit: 'kg' })

describe('iCloud sync', () => {
  it('makes one record per item plus prefs, and pushes only what changed', () => {
    const S = base()
    expect(Object.keys(recordsOf(S)).sort()).toEqual(['bw:2026-10-01', 'food:2026-10-01', 'prefs', 'workout:w1'])
    const first = diff(S, {}, 100)
    expect(first.push).toHaveLength(4)
    expect(diff(S, first.meta, 200).push).toHaveLength(0)
    S.workouts[0].name = 'Push A'
    const second = diff(S, first.meta, 300)
    expect(second.push.map(r => r.id)).toEqual(['workout:w1'])
    expect(second.push[0].updatedAt).toBe(300)
    S.bodyweight = []
    expect(diff(S, second.meta, 400).deletes).toEqual(['bw:2026-10-01'])
  })
  it('takes a newer remote record and keeps a newer local edit', () => {
    const S = base()
    const meta = diff(S, {}, 500).meta
    const remote = w => ({ id: 'workout:w1', kind: 'workout', updatedAt: w, json: JSON.stringify({ id: 'w1', d: '2026-10-01', name: 'Remote' }) })
    let m = applyPulled(S, meta, [remote(400)], [])
    expect(S.workouts[0].name).toBe('Push')
    m = applyPulled(S, m, [remote(900), { id: 'workout:w2', kind: 'workout', updatedAt: 900, json: JSON.stringify({ id: 'w2', d: '2026-09-30' }) }], ['food:2026-10-01'])
    expect(S.workouts.map(w => w.name || w.id)).toEqual(['w2', 'Remote'])
    expect(S.food['2026-10-01']).toBeUndefined()
    expect(m['workout:w1'].h).toBe(hashOf(remote(900).json))
  })
})

describe('iCloud sync keeps Apple Health data on the phone', () => {
  it('skips Health weigh-ins, Health imports and Health-sourced daily values', () => {
    const S = {
      workouts: [{ id: 'w1', d: '2026-10-01', name: 'Push' }, { id: 'imp-health-abc', d: '2026-10-02', imported: { src: 'health', extId: 'abc' }, ls: { avgHr: 140 } }],
      bodyweight: [{ d: '2026-10-01', w: 80 }, { d: '2026-10-02', w: 81, src: 'health' }],
      daily: { '2026-10-01': { rhr: 50, hrv: 60, steps: 8000, src: { rhr: 'health', hrv: 'whoop', steps: 'health' } }, '2026-10-02': { rhr: 52, src: { rhr: 'health' } } },
      unit: 'kg',
    }
    const recs = recordsOf(S)
    expect(Object.keys(recs).sort()).toEqual(['bw:2026-10-01', 'daily:2026-10-01', 'prefs', 'workout:w1'])
    expect(recs['daily:2026-10-01'].value).toEqual({ hrv: 60, src: { hrv: 'whoop' } })
  })

  it('strips the heart-rate and energy figures Health gave a workout, keeps a strap trace', () => {
    const health = { id: 'w1', d: '2026-10-01', entries: [], ls: { minutes: 40, strain: 9, avgHr: 130, maxHr: 170, kcal: 400, kcalSource: 'health', zones: [1, 2, 3, 4, 5], hr: [], n: 300, source: 'health', muscles: ['chest'] } }
    expect(cloudWorkout(health).ls).toEqual({ minutes: 40, muscles: ['chest'], source: 'health' })
    const strap = { id: 'w2', d: '2026-10-01', ls: { minutes: 40, strain: 9, avgHr: 130, kcal: 400, kcalSource: 'hr', hr: [[1, 120]], source: 'ble' } }
    expect(cloudWorkout(strap)).toBe(strap)
    const mixed = { id: 'w3', d: '2026-10-01', ls: { minutes: 40, strain: 9, avgHr: 130, kcal: 400, kcalSource: 'health', hr: [[1, 120]], source: 'ble' } }
    expect(cloudWorkout(mixed).ls).toEqual({ minutes: 40, strain: 9, avgHr: 130, hr: [[1, 120]], source: 'ble' })
    expect(cloudWorkout({ id: 'w4', d: '2026-10-01' })).toEqual({ id: 'w4', d: '2026-10-01' })
    // Apple Watch heart rate is read through HealthKit, so it is stripped the same way.
    const watch = { id: 'w5', d: '2026-10-01', ls: { minutes: 40, strain: 9, avgHr: 130, maxHr: 170, kcal: 400, zones: [1, 2, 3, 4, 5], hr: [[1, 120]], n: 300, source: 'watch', muscles: ['chest'] } }
    expect(cloudWorkout(watch).ls).toEqual({ minutes: 40, muscles: ['chest'], source: 'watch' })
  })

  it('does not replace a local workout with its own stripped iCloud copy', () => {
    const S = { workouts: [{ id: 'w1', d: '2026-10-01', ls: { minutes: 40, avgHr: 130, kcal: 400, kcalSource: 'health', source: 'health' } }] }
    const first = diff(S, {}, 100)
    expect(JSON.parse(first.push[0].json).ls).toEqual({ minutes: 40, source: 'health' })
    const m = applyPulled(S, first.meta, first.push.map(r => ({ ...r, updatedAt: 100 })), [])
    expect(S.workouts[0].ls.avgHr).toBe(130)
    expect(m['workout:w1'].h).toBe(first.meta['workout:w1'].h)
    expect(diff(S, m, 200).push).toHaveLength(0)
  })
})
