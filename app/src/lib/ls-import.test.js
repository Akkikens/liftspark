// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mergeActivities, mergeStrength, mergeDaily, mergeWeights, removeImported, importedCounts, readWhoop, readOura, parseXmlActivity, applyHealth, strainFromAvg } from './ls-import.js'

const act = (src, extId, extra = {}) => ({ id: 'a' + extId, src, extId, type: 'running', name: 'Run', d: '2026-10-01', start: 1, end: 2, ...extra })

describe('merging imports', () => {
  it('never adds the same source record twice', () => {
    const S = {}
    expect(mergeActivities(S, [act('health', 'x'), act('health', 'y')])).toBe(2)
    expect(mergeActivities(S, [act('health', 'x'), act('whoop', 'x')])).toBe(1)
    expect(S.activities).toHaveLength(3)
  })
  it('puts strength sessions in history without sets, once', () => {
    const S = { workouts: [{ id: 'own', d: '2026-10-02', entries: [{ id: 'e', sets: [] }] }] }
    const s = act('health', 'abc123', { type: 'traditionalStrengthTraining', name: 'Strength training', d: '2026-10-01', start: 0, end: 3600000, avgHr: 120 })
    expect(mergeStrength(S, [s])).toBe(1)
    expect(mergeStrength(S, [s])).toBe(0)
    expect(mergeActivities(S, [s])).toBe(0)
    expect(S.workouts[0]).toMatchObject({ d: '2026-10-01', entries: [], vol: 0, imported: { src: 'health', extId: 'abc123' } })
    expect(S.workouts[0].ls.minutes).toBe(60)
  })
  it('keeps a wearable’s daily value over Health’s copy', () => {
    const S = {}
    mergeDaily(S, 'whoop', { '2026-10-01': { hrv: 80, recovery: 70 } })
    mergeDaily(S, 'health', { '2026-10-01': { hrv: 55, sleepMin: 400 } })
    expect(S.daily['2026-10-01']).toMatchObject({ hrv: 80, recovery: 70, sleepMin: 400 })
  })
  it('adds weigh-ins only on empty days, in the state’s unit', () => {
    const S = { unit: 'lb', bodyweight: [{ d: '2026-10-01', w: 180 }] }
    expect(mergeWeights(S, [{ d: '2026-10-01', v: 80 }, { d: '2026-10-02', v: 80 }])).toBe(1)
    expect(S.bodyweight[1]).toMatchObject({ d: '2026-10-02', w: 176.4, src: 'health' })
  })
  it('deletes one source and leaves everything else', () => {
    const S = { unit: 'kg', bodyweight: [{ d: '2026-09-30', w: 81 }], workouts: [] }
    applyHealth(S, { strength: [act('health', 's1', { type: 'traditionalStrengthTraining' })], activities: [act('health', 'r1')], daily: { '2026-10-01': { rhr: 55 } }, weights: [{ d: '2026-10-01', v: 80 }] })
    mergeActivities(S, [act('whoop', 'w1')])
    mergeDaily(S, 'whoop', { '2026-10-01': { recovery: 66 } })
    expect(importedCounts(S).health).toEqual({ workouts: 2, days: 1, weights: 1 })
    removeImported(S, 'health')
    expect(S.workouts).toEqual([])
    expect(S.activities.map(a => a.src)).toEqual(['whoop'])
    expect(S.bodyweight).toEqual([{ d: '2026-09-30', w: 81 }])
    expect(S.daily['2026-10-01']).toEqual({ recovery: 66, src: { recovery: 'whoop' } })
  })
})

describe('WHOOP and Oura', () => {
  it('reads WHOOP v2 pages into days and workouts', async () => {
    const calls = []
    const fake = async url => {
      calls.push(url)
      if (url.includes('/cycle')) return url.includes('nextToken') ? { records: [{ id: 2, start: '2026-10-02T06:00:00Z', score: { strain: 9.1 } }] } : { records: [{ id: 1, start: '2026-10-01T06:00:00Z', score: { strain: 12.34 } }], next_token: 'abc' }
      if (url.includes('/recovery')) return { records: [{ cycle_id: 1, score: { recovery_score: 71, hrv_rmssd_milli: 82.4, resting_heart_rate: 52 } }] }
      if (url.includes('/sleep')) return { records: [{ end: '2026-10-01T07:00:00Z', nap: false, score: { stage_summary: { total_light_sleep_time_milli: 3 * 36e5, total_slow_wave_sleep_time_milli: 36e5, total_rem_sleep_time_milli: 36e5 } } }] }
      return { records: [{ id: 'wk1', sport_name: 'weightlifting', start: '2026-10-01T17:00:00Z', end: '2026-10-01T18:00:00Z', score: { strain: 11.26, average_heart_rate: 120, max_heart_rate: 160, kilojoule: 2092, zone_durations: { zone_two_milli: 600000 } } }] }
    }
    const r = await readWhoop({ token: 't', fetchJson: fake })
    expect(calls.some(u => u.includes('nextToken=abc'))).toBe(true)
    const d1 = Object.values(r.daily).find(d => d.recovery)
    expect(d1).toMatchObject({ recovery: 71, rhr: 52, sleepMin: 300 })
    expect(r.activities[0]).toMatchObject({ src: 'whoop', extId: 'wk1', strain: 11.3, kcal: 500, avgHr: 120 })
    expect(r.activities[0].zones[1]).toBe(600)
  })
  it('reads Oura readiness, sleep and workouts', async () => {
    const fake = async url => {
      if (url.includes('daily_readiness')) return { data: [{ day: '2026-10-01', score: 84 }] }
      if (url.includes('/sleep')) return { data: [{ day: '2026-10-01', type: 'long_sleep', total_sleep_duration: 27000, average_hrv: 61, lowest_heart_rate: 48 }] }
      if (url.includes('daily_activity')) return { data: [{ day: '2026-10-01', active_calories: 420, steps: 9000 }] }
      return { data: [{ id: 'o1', activity: 'strength_training', start_datetime: '2026-10-01T17:00:00Z', end_datetime: '2026-10-01T17:45:00Z', calories: 300 }] }
    }
    const r = await readOura({ token: 't', fetchJson: fake })
    expect(r.daily['2026-10-01']).toMatchObject({ readiness: 84, sleepMin: 450, hrv: 61, rhr: 48, activeKcal: 420, steps: 9000 })
    expect(r.activities[0]).toMatchObject({ src: 'oura', extId: 'o1', name: 'Strength training', kcal: 300 })
  })
})

describe('workout files', () => {
  it('reads a TCX with heart rate', () => {
    const tcx = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Lap><Calories>250</Calories><DistanceMeters>5000</DistanceMeters><Track>
      <Trackpoint><Time>2026-10-01T07:00:00Z</Time><HeartRateBpm><Value>130</Value></HeartRateBpm></Trackpoint>
      <Trackpoint><Time>2026-10-01T07:30:00Z</Time><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`
    const a = parseXmlActivity(tcx, { birthYear: 1990 })
    expect(a).toMatchObject({ type: 'running', name: 'Run', kcal: 250, distanceM: 5000, avgHr: 140, maxHr: 150 })
    expect(a.end - a.start).toBe(30 * 60000)
    expect(a.strain).toBeGreaterThan(0)
  })
  it('scores an average heart rate as strain', () => {
    expect(strainFromAvg(150, 60, { birthYear: 1990 })).toBeGreaterThan(strainFromAvg(110, 60, { birthYear: 1990 }))
  })
})
