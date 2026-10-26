// App Store screenshot build only (VITE_SHOTS=1, never in a release bundle): the demo history plus
// what Liftspark adds, so the store shots show real screens with something on them. Heart rate is
// a chest-strap trace shaped like a lifting session (rise during each set, recover in the rest),
// and every number on screen (zones, strain, calories) comes from the app's own strain.js.
import { buildDemoState } from './demoSeed.js'
import { workoutMetrics, downsample } from './strain.js'
import { entryFor } from './fuel.js'

function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

const PROFILE = { sex: 'male', birthYear: 1997, restHr: 56, weightKg: 80, heightCm: 180, objective: 'recomp', goal: 'recomp' }

/** One session's heart rate every 5 s: warm-up, a rise in each set, recovery between. */
function trace(w, rnd) {
  const out = []
  const sets = w.entries.reduce((n, e) => n + e.sets.length, 0) || 12
  const span = w.end - w.start
  const per = span / sets
  for (let t = w.start; t <= w.end; t += 5000) {
    const into = (t - w.start) % per
    const inSet = into < per * 0.28
    const warm = Math.min(1, (t - w.start) / (span * 0.12))
    const base = 96 + 30 * warm
    const peak = inSet ? 52 * Math.sin((into / (per * 0.28)) * Math.PI) : 22 * Math.exp(-(into - per * 0.28) / (per * 0.25))
    out.push([t, Math.round(base + peak + (rnd() - 0.5) * 6)])
  }
  return out
}

export function buildShotsState() {
  const S = buildDemoState()
  const rnd = rng(20261025)
  S.lsProfile = { ...(S.lsProfile || {}), ...PROFILE }
  S.lsOnboarded = true
  S.lsWearable = { kind: 'strap' }
  for (const w of S.workouts.slice(-24)) {
    const samples = trace(w, rnd)
    const m = workoutMetrics(w, { samples, kg: 80, profile: PROFILE })
    w.ls = { ...m, hr: downsample(samples), n: samples.length, source: 'ble' }
  }
  // Today's food, so Fuel has a day to show.
  const now = new Date()
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`   // local date, like the app
  const at = h => { const d = new Date(); d.setHours(h, 10, 0, 0); return +d }
  const food = (name, kcal, p, c, f) => ({ name, per100: { kcal, p, c, f } })
  S.food = {
    [day]: [
      entryFor(food('Greek yogurt', 97, 9, 3.9, 5), 200, 'breakfast', at(8)),
      entryFor(food('Oats', 379, 13, 68, 6.5), 60, 'breakfast', at(8)),
      entryFor(food('Blueberries', 57, 0.7, 14, 0.3), 80, 'breakfast', at(8)),
      entryFor(food('Chicken breast, grilled', 165, 31, 0, 3.6), 180, 'lunch', at(13)),
      entryFor(food('White rice, cooked', 130, 2.7, 28, 0.3), 200, 'lunch', at(13)),
      entryFor(food('Banana', 89, 1.1, 23, 0.3), 120, 'snacks', at(16)),
    ],
  }
  return S
}
