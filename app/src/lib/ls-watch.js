// The Apple Watch app, from the phone: heart rate from the Watch's workout session feeds the live
// stream (useHeart, source 'watch'); a set logged on the wrist is ticked on the workout screen (an
// 'ls-watch-set' event, so the rest timer and progression run as for a tap); starting or ending a
// workout on either device starts or ends it on the other; and the Watch sees the current
// exercise, set, weight, reps and rest. The Watch saves the HKWorkout; the phone's own Health write
// then skips it as an overlap (HealthKitPlugin.overlapsOtherWorkout).
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useHeart } from '../store/useHeart.js'
import { liveState } from './ls-live.js'

let pluginP = null
const plugin = () => pluginP || (pluginP = (async () => {
  const core = await import('@capacitor/core')
  return core.Capacitor.getPlatform() === 'ios' ? { p: core.registerPlugin('LiftsparkWatch') } : null
})().catch(() => null))

/** The next set to log in the current exercise: { idx, i, w, r } or null (pure; tested). */
export function nextSet(A) {
  if (!A?.entries?.length) return null
  const idx = Math.min(A.cur ?? 0, A.entries.length - 1)
  const sets = A.entries[idx]?.sets || []
  const i = sets.findIndex(s => !s.done)
  return i < 0 ? null : { idx, i, w: sets[i].w ?? null, r: sets[i].r ?? null }
}

let wired = false, running = false, lastKey = ''
export function initWatch() {
  if (wired) return
  wired = true
  plugin().then(async w => {
    if (!w) return
    const st = await w.p.status().catch(() => null)
    if (!st?.supported) return
    w.p.addListener('hr', e => useHeart.getState().push(e?.bpm, e?.t, 'watch'))
    w.p.addListener('set', e => window.dispatchEvent(new CustomEvent('ls-watch-set', { detail: e })))
    w.p.addListener('start', () => { if (!useStore.getState().S.active) window.dispatchEvent(new CustomEvent('ls-watch-start')) })
    w.p.addListener('saved', e => useStore.getState().update(s => { s.lsWatchSaved = { uuid: e?.uuid || null, at: Date.now() } }))
    const sync = () => {
      const S = useStore.getState().S, A = S.active
      if (!A || A.editingWorkoutId) { if (running) { running = false; lastKey = ''; w.p.stop() } return }
      if (!running) { running = true; w.p.start() }
      const s = liveState(A, useUI.getState().timer, null, S.lsProfile || {})
      const n = nextSet(A)
      const msg = { exercise: s.exercise, setLabel: s.setLabel, unit: S.unit || 'kg', ...(n?.w != null ? { weight: Number(n.w) } : {}), ...(n?.r != null ? { reps: Number(n.r) } : {}), ...(s.restEnd ? { restEnd: s.restEnd } : {}) }
      const key = JSON.stringify(msg)
      if (key !== lastKey) { lastKey = key; w.p.state(msg) }
    }
    useStore.subscribe(sync)
    useUI.subscribe((s, prev) => { if (s.timer !== prev.timer) sync() })
    sync()
  })
}
