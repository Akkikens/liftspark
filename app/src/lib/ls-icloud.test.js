// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { recordsOf, diff, applyPulled, hashOf } from './ls-icloud.js'

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
