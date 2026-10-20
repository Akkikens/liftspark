// Liftspark's native plugins (ios/App/App/*Plugin.swift), loaded lazily and only inside the iOS app.
// In a browser, a test or the simulator without hardware, every call resolves to a harmless default
// instead of throwing, so the screens can always render.
//
// Wrapped in objects, as elsewhere in the app: a Capacitor plugin proxy answers `then`, so a promise
// resolved with the bare proxy never settles.
let loaded = null
export function plugins() {
  return loaded || (loaded = (async () => {
    const core = await import('@capacitor/core')
    if (core.Capacitor.getPlatform() !== 'ios') return null
    return {
      health: core.registerPlugin('HealthConnect'),
      ble: core.registerPlugin('HeartRateBLE'),
      web: core.registerPlugin('WebAuth'),
    }
  })().catch(() => null))
}

export async function isIOSApp() {
  try { return (await import('@capacitor/core')).Capacitor.getPlatform() === 'ios' } catch { return false }
}

async function call(name, method, args, fallback) {
  const p = await plugins()
  if (!p?.[name]?.[method]) return fallback
  try { return await p[name][method](args) } catch (e) { if (fallback === undefined) throw e; return fallback }
}

export const health = {
  status: () => call('health', 'status', undefined, { status: 'unsupported', granted: false }),
  request: () => call('health', 'requestPermissions', undefined, { granted: false }),
  today: () => call('health', 'today', undefined, {}),
  heartRate: (start, end) => call('health', 'heartRate', { start, end }, { samples: [] }),
  activeEnergy: (start, end) => call('health', 'activeEnergy', { start, end }, { kcal: 0 }),
  saveDietaryEnergy: (rec) => call('health', 'saveDietaryEnergy', rec, null),
  startLive: (opts = {}) => call('health', 'startLiveHeartRate', opts, { mode: 'none' }),
  stopLive: () => call('health', 'stopLiveHeartRate', undefined, null),
  open: () => call('health', 'openSettings', undefined, null),
}

export const ble = {
  scan: () => call('ble', 'scan', undefined, null),
  stopScan: () => call('ble', 'stopScan', undefined, null),
  connect: id => call('ble', 'connect', { id }),
  disconnect: () => call('ble', 'disconnect', undefined, null),
  forget: () => call('ble', 'forget', undefined, null),
  status: () => call('ble', 'status', undefined, { state: 'unsupported' }),
}

export async function webAuth(url, scheme = 'liftspark') {
  const p = await plugins()
  if (!p) { window.open(url, '_blank', 'noopener'); throw Object.assign(new Error('Sign-in needs the Liftspark app'), { code: 'web' }) }
  return (await p.web.authenticate({ url, scheme })).url
}

/** Subscribe to a plugin event; returns an unsubscribe function (safe to call before it resolves). */
export function listen(name, event, cb) {
  let handle = null, gone = false
  plugins().then(p => p?.[name]?.addListener?.(event, cb)).then(h => { handle = h; if (gone) h?.remove?.() }).catch(() => {})
  return () => { gone = true; handle?.remove?.() }
}
