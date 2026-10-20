// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { liveState, widgetSnapshot } from './ls-live.js'
import { EXIDX } from './exercises.js'

const id = Object.values(EXIDX).find(e => e.n === 'barbell bench press').id
describe('live activity state', () => {
  it('shows the exercise, the next set and the rest countdown', () => {
    const now = 1_000_000
    const A = { name: 'Push', start: now - 60000, cur: 0, entries: [{ id, sets: [{ done: true }, { done: false }, { done: false }] }] }
    const s = liveState(A, { endsAt: now + 90000 }, { bpm: 150, t: now - 1000 }, { birthYear: 1990 }, now)
    expect(s).toMatchObject({ exercise: 'Barbell bench press', setLabel: 'Set 2 of 3', restEnd: now + 90000, bpm: 150, startedAt: now - 60000 })
    expect(s.zone).toBeGreaterThan(0)
    expect(liveState(A, { endsAt: now + 1, paused: true }, { bpm: 150, t: 0 }, {}, now)).toMatchObject({ restEnd: null, bpm: null, zone: null })
  })
  it('builds the widget snapshot', () => {
    const snap = widgetSnapshot({ workouts: [], routines: [{ id: 'r', name: 'Leg Day' }], week: { 0: ['r'], 1: ['r'], 2: ['r'], 3: ['r'], 4: ['r'], 5: ['r'], 6: ['r'] }, food: {}, bodyweight: [], lsProfile: {} })
    expect(snap).toMatchObject({ streakWeeks: 0, nextWorkout: 'Leg Day' })
    expect(snap.kcalLeft).toBeGreaterThan(1000)
  })
})
