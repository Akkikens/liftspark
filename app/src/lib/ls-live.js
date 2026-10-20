// The workout's Live Activity (lock screen + Dynamic Island) and the home-screen widget's numbers,
// kept in step with the app by subscribing to the stores: a running workout starts the activity,
// the current exercise and set, the rest countdown and live heart rate update it (at most every 5 s
// unless the rest or exercise changes), and finishing or discarding ends it. iOS only; elsewhere
// every call is a no-op.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useHeart, isFresh } from '../store/useHeart.js'
import { EXIDX } from './exercises.js'
import { zoneOf, maxHrOf, ageOf } from './strain.js'
import { streakWeeks } from './history.js'
import { dayFood, totals, dailyGoal } from './fuel.js'
import { bodyweightKg } from './ls-workout.js'
import { todayISO } from './format.js'

let pluginP = null
const plugin = () => pluginP || (pluginP = (async () => {
  const core = await import('@capacitor/core')
  return core.Capacitor.getPlatform() === 'ios' ? { p: core.registerPlugin('LiveActivity') } : null
})().catch(() => null))
const call = async (m, args) => { const w = await plugin(); if (!w) return null; try { return await w.p[m](args) } catch { return null } }

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** What the activity shows for a running session (pure; exported for tests). */
export function liveState(A, timer, heart, profile = {}, now = Date.now()) {
  const e = A?.entries?.[A.cur ?? 0] || A?.entries?.[0]
  const sets = (e?.sets || []).filter(s => !s.warmup && s.kind !== 'warmup')
  const done = sets.filter(s => s.done).length
  const resting = timer && !timer.paused && !timer.ready && timer.endsAt > now
  const bpm = heart && isFresh(heart.t, now) ? heart.bpm : null
  const z = bpm ? zoneOf(bpm, maxHrOf(profile), profile.restHr) : -1
  return {
    name: A?.name || 'Workout',
    exercise: cap(EXIDX[e?.id]?.n) || 'Workout',
    setLabel: sets.length ? `Set ${Math.min(done + 1, sets.length)} of ${sets.length}` : '',
    restEnd: resting ? timer.endsAt : null,
    bpm, zone: z >= 0 ? z + 1 : null,
    startedAt: A?.start || now,
  }
}

/** The widget's snapshot (pure). */
export function widgetSnapshot(S, now = Date.now()) {
  const day = todayISO()
  const profile = S.lsProfile || {}
  const goal = dailyGoal(profile, bodyweightKg(S) || 75, ageOf(profile))
  const last = [...(S.workouts || [])].reverse().find(w => w.ls?.strain != null && (w.end || w.start || 0) > now - 7 * 864e5)
  const dow = new Date(now).getDay()
  const next = [0, 1, 2, 3, 4, 5, 6].map(i => (dow + i) % 7).map(d => (S.week?.[d] || [])[0]).find(Boolean)
  return {
    streakWeeks: streakWeeks(S) || 0,
    ...(last ? { lastStrain: last.ls.strain } : {}),
    kcalLeft: Math.round(goal - totals(dayFood(S, day)).kcal),
    ...(next ? { nextWorkout: (S.routines || []).find(r => r.id === next)?.name } : {}),
  }
}

let started = false, lastKey = '', lastSent = 0, widgetTm = null, lastWidget = ''
function sync() {
  const st = useStore.getState().S
  const A = st.active
  if (!A || A.editingWorkoutId) {
    if (started) { started = false; lastKey = ''; call('end') }
    return
  }
  const s = liveState(A, useUI.getState().timer, useHeart.getState(), st.lsProfile || {})
  if (!started) { started = true; lastSent = Date.now(); lastKey = s.exercise + s.setLabel + s.restEnd; call('start', s); return }
  const key = s.exercise + s.setLabel + s.restEnd
  if (key === lastKey && Date.now() - lastSent < 5000) return
  lastKey = key; lastSent = Date.now()
  call('update', s)
}

function syncWidget() {
  clearTimeout(widgetTm)
  widgetTm = setTimeout(() => {
    const snap = widgetSnapshot(useStore.getState().S)
    const k = JSON.stringify(snap)
    if (k !== lastWidget) { lastWidget = k; call('widget', snap) }
  }, 3000)
}

let wired = false
export function initLive() {
  if (wired) return
  wired = true
  plugin().then(w => {
    if (!w) return
    useStore.subscribe(() => { sync(); syncWidget() })
    useUI.subscribe((s, prev) => { if (s.timer !== prev.timer) sync() })
    useHeart.subscribe((s, prev) => { if (s.bpm !== prev.bpm) sync() })
    sync(); syncWidget()
  })
}
