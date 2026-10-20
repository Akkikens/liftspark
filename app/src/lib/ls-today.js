// Keeps today's recovery numbers fresh for the readiness card: the last two days of resting heart
// rate, HRV and sleep from Apple Health (when sync is on) and from WHOOP / Oura (when signed in).
// At most once every 30 minutes; failures are silent, the card just uses what it has.
import { useStore } from '../store/useStore.js'
import { health } from './ls-native.js'
import { loadHealth } from './health-sync.js'
import { backendConfig, isConnected } from './integrations.js'
import { mergeDaily, readWhoop, readOura } from './ls-import.js'

let last = 0
export async function refreshToday(now = Date.now()) {
  if (now - last < 30 * 60000) return
  last = now
  const start = now - 2 * 864e5
  const merge = (src, daily) => useStore.getState().update(s => { mergeDaily(s, src, daily) })
  try {
    if ((await loadHealth())?.on) {
      const daily = {}
      const day = d => (daily[d] = daily[d] || {})
      for (const { d, v } of (await health.importQuantity('restingHeartRate', start, now)).days || []) day(d).rhr = v
      for (const { d, v } of (await health.importQuantity('heartRateVariabilitySDNN', start, now)).days || []) day(d).hrv = v
      for (const n of (await health.importSleep(start, now)).nights || []) if (n.asleepMin > 0) day(n.d).sleepMin = n.asleepMin
      if (Object.keys(daily).length) merge('health', daily)
    }
  } catch { /* nothing new */ }
  try {
    const c = await backendConfig()
    if (c.whoop && await isConnected('whoop')) merge('whoop', (await readWhoop({ days: 2 })).daily)
    else if (c.oura && await isConnected('oura')) merge('oura', (await readOura({ days: 2 })).daily)
  } catch { /* nothing new */ }
}
