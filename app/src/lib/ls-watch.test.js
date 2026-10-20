// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { nextSet } from './ls-watch.js'

describe('Watch set logging', () => {
  it('finds the next open set of the current exercise', () => {
    const A = { cur: 1, entries: [{ sets: [{ done: false }] }, { sets: [{ w: 60, r: 8, done: true }, { w: 62.5, r: 8 }] }] }
    expect(nextSet(A)).toEqual({ idx: 1, i: 1, w: 62.5, r: 8 })
    expect(nextSet({ cur: 0, entries: [{ sets: [{ done: true }] }] })).toBeNull()
    expect(nextSet(null)).toBeNull()
  })
})
