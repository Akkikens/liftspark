// Live heart rate during a workout: one stream, whichever device feeds it.
//
// Sources: a Bluetooth LE sensor (strap, WHOOP/Garmin broadcast) through HeartRateBLE, or the
// Apple Watch through HealthKit (an iPhone workout session on iOS 26+, else new samples as they land
// in Health). BLE wins when both report, it is the lower-latency one. Samples are kept for the
// running workout only; doFinishWorkout takes them (takeSamples) and stores a downsampled copy on
// the workout. Nothing here persists across launches: a crash mid-workout loses the live trace,
// and the finish screen then reads the span back from Health instead.
import { create } from 'zustand'
import { listen, health, ble } from '../lib/ls-native.js'

const MAX_SAMPLES = 4 * 60 * 60   // a 4-hour session at 1 Hz

export const useHeart = create((set, get) => ({
  bpm: null,
  t: 0,
  source: null,          // 'ble' | 'watch'
  bleState: 'idle',      // the sensor's connection state
  bleName: null,
  battery: null,
  recording: false,
  samples: [],           // [[ms, bpm]]

  push(bpm, t, source) {
    if (!(bpm > 25 && bpm < 240)) return
    const s = get()
    // A watch sample arriving while a strap is live (within 5 s) is ignored.
    if (source === 'watch' && s.source === 'ble' && Date.now() - s.t < 5000) return
    const next = { bpm: Math.round(bpm), t: t || Date.now(), source }
    if (s.recording) {
      const samples = s.samples.length >= MAX_SAMPLES ? s.samples.slice(-MAX_SAMPLES + 1) : s.samples.slice()
      samples.push([next.t, next.bpm])
      next.samples = samples
    }
    set(next)
  },

  async startRecording({ watch = true } = {}) {
    if (get().recording) return
    set({ recording: true, samples: [] })
    if (watch) health.startLive().catch(() => {})
  },

  /** Ends the recording and hands back what was recorded. */
  takeSamples() {
    const { samples } = get()
    set({ recording: false, samples: [] })
    health.stopLive().catch(() => {})
    return samples
  },
}))

let wired = false
export function initHeart() {
  if (wired) return
  wired = true
  listen('ble', 'heartRate', e => useHeart.getState().push(e?.bpm, e?.t, 'ble'))
  listen('health', 'heartRate', e => useHeart.getState().push(e?.bpm, e?.t, 'watch'))
  listen('ble', 'state', e => useHeart.setState({ bleState: e?.state || 'idle', bleName: e?.name || null, battery: e?.battery ?? null }))
  ble.status().then(s => s && useHeart.setState({ bleState: s.state || 'idle', bleName: s.name || null })).catch(() => {})
}

/** "Fresh" means a reading in the last 10 seconds; older values are shown greyed out. */
export const isFresh = (t, now = Date.now()) => t > 0 && now - t < 10000
