// Live heart rate during a workout: one stream, whichever device feeds it.
//
// Sources: a Bluetooth LE sensor (strap, WHOOP/Garmin broadcast) through HeartRateBLE, or the
// Apple Watch through HealthKit (an iPhone workout session on iOS 26+, else new samples as they land
// in Health). BLE wins when both report, it is the lower-latency one. Samples are kept for the
// running workout only; doFinishWorkout takes them (takeSamples) and stores a downsampled copy on
// the workout. The native side also buffers every sample (HeartRateBLE.drain) while the web view is
// suspended — phone locked, app in the background — and keeps a rolling trace file, so the recording
// is topped up on resume, every 15 s, and after a crash (startRecording({ since })).
// Samples from Apple Health carry a third element 'w': they stay out of the saved workout's trace
// (lib/ls-workout.js keeps only aggregates for them).
import { create } from 'zustand'
import { listen, health, ble } from '../lib/ls-native.js'
import { onAppActive } from '../lib/mobile.js'

let drainTimer = null
let drainedTo = 0

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
      samples.push(source === 'watch' ? [next.t, next.bpm, 'w'] : [next.t, next.bpm])
      next.samples = samples
    }
    set(next)
  },

  /**
   * `since`: when the workout began, so a recording restarted after a crash or relaunch picks up
   * what the native trace kept. `session`: also start an iPhone workout session (iOS 26), opt-in.
   */
  async startRecording({ since = Date.now(), session = false } = {}) {
    if (get().recording) return
    set({ recording: true, samples: [] })
    drainedTo = since - 60000
    ble.setAutoReconnect(true).catch(() => {})
    health.startLive({ session }).catch(() => {})
    await get().drain()
    clearInterval(drainTimer)
    drainTimer = setInterval(() => get().drain(), 15000)
  },

  /** Merges what the native buffer heard since the last drain into the recording. */
  async drain() {
    if (!get().recording) return
    const r = await ble.drain(drainedTo).catch(() => null)
    const rows = (r?.samples || []).filter(x => x[1] > 25 && x[1] < 240)
    if (!rows.length) return
    drainedTo = Math.max(drainedTo, ...rows.map(x => x[0]))
    const have = get().samples
    const seen = new Set(have.map(p => Math.round(p[0] / 1000)))
    const add = rows.filter(x => !seen.has(Math.round(x[0] / 1000))).map(x => x[2] === 'watch' ? [x[0], Math.round(x[1]), 'w'] : [x[0], Math.round(x[1])])
    if (!add.length) return
    const samples = [...have, ...add].sort((a, b) => a[0] - b[0]).slice(-MAX_SAMPLES)
    set({ samples })
  },

  /** Ends the recording and hands back what was recorded. */
  takeSamples() {
    const { samples } = get()
    set({ recording: false, samples: [] })
    clearInterval(drainTimer); drainTimer = null
    health.stopLive().catch(() => {})
    ble.setAutoReconnect(false).catch(() => {})
    ble.clearTrace().catch(() => {})
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
  // Back from the lock screen or the background: take what the native side heard meanwhile.
  onAppActive(() => useHeart.getState().drain())
}

/** "Fresh" means a reading in the last 10 seconds; older values are shown greyed out. */
export const isFresh = (t, now = Date.now()) => t > 0 && now - t < 10000
