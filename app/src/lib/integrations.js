// Connections to Strava (optional direct posting), WHOOP and Oura.
//
// Each needs an API app registered with the provider; its client secret lives on Liftspark's small
// backend (../../backend, Vercel functions), never in the app. The backend says which providers it
// has keys for (GET /api/config); a provider without keys is hidden everywhere in the app.
//
// Sign-in: the app opens /api/oauth/<provider>/start in the system's sign-in sheet (WebAuth), the
// provider sends the user back to /api/oauth/<provider>/callback, which hands the code to the app as
// liftspark://oauth/<provider>?code=…; the app then trades the code for tokens via
// /api/oauth/<provider>/token. Tokens stay in the iOS Keychain (secureGet/secureSet), not in the
// synced state or backups. Refreshing goes through /api/oauth/<provider>/refresh.
import { secureGet, secureSet, secureRemove } from './coach-secrets.js'
import { webAuth } from './ls-native.js'

export const BACKEND = (import.meta.env?.VITE_LS_BACKEND || 'https://liftspark-api.vercel.app').replace(/\/$/, '')
export const PROVIDERS = ['strava', 'whoop', 'oura']
const KEY = p => `liftspark.oauth.${p}`

let configP = null
/** { strava: bool, whoop: bool, oura: bool } — false for anything the backend can't confirm. */
export function backendConfig(fetchImpl = globalThis.fetch) {
  return configP || (configP = (async () => {
    try {
      const r = await fetchImpl(BACKEND + '/api/config', { headers: { Accept: 'application/json' } })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json()
      return Object.fromEntries(PROVIDERS.map(p => [p, j?.[p] === true]))
    } catch {
      configP = null   // try again next time
      return Object.fromEntries(PROVIDERS.map(p => [p, false]))
    }
  })())
}

export async function tokens(provider) {
  try { const v = await secureGet(KEY(provider)); return v ? JSON.parse(v) : null } catch { return null }
}
export const isConnected = async provider => !!(await tokens(provider))?.access_token
export const disconnect = provider => secureRemove(KEY(provider))

async function save(provider, t) {
  const out = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Number(t.expires_at) || (t.expires_in ? Math.floor(Date.now() / 1000) + Number(t.expires_in) : 0), athlete: t.athlete?.firstname || t.user_name || null }
  await secureSet(KEY(provider), JSON.stringify(out))
  return out
}

/** The whole sign-in. Throws { code: 'cancelled' } when the user closes the sheet. */
export async function connect(provider) {
  const back = await webAuth(`${BACKEND}/api/oauth/${provider}/start`)
  const code = new URL(back).searchParams.get('code')
  const err = new URL(back).searchParams.get('error')
  if (!code) throw Object.assign(new Error(err || 'No authorization code'), { code: err || 'denied' })
  const r = await fetch(`${BACKEND}/api/oauth/${provider}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  })
  if (!r.ok) throw new Error(`Sign-in failed (${r.status})`)
  return save(provider, await r.json())
}

/** A valid access token, refreshed when it is about to expire; null when not connected. */
export async function accessToken(provider) {
  const t = await tokens(provider)
  if (!t?.access_token) return null
  if (!t.expires_at || t.expires_at - 120 > Date.now() / 1000 || !t.refresh_token) return t.access_token
  const r = await fetch(`${BACKEND}/api/oauth/${provider}/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh_token }),
  })
  if (!r.ok) return null
  return (await save(provider, { ...t, ...(await r.json()) })).access_token
}

// ---- Strava (direct posting, only when the backend has a Strava app) ----

export async function postToStrava(w, caption) {
  const token = await accessToken('strava')
  if (!token) throw Object.assign(new Error('Connect Strava first'), { code: 'auth' })
  const body = new URLSearchParams({
    name: w.name || 'Strength training',
    sport_type: 'WeightTraining',
    start_date_local: new Date(w.start).toISOString(),
    elapsed_time: String(Math.max(60, Math.round((w.end - w.start) / 1000))),
    description: caption,
    trainer: '1',
  })
  const r = await fetch('https://www.strava.com/api/v3/activities', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
  if (!r.ok) throw new Error(`Strava said ${r.status}`)
  const j = await r.json()
  return { id: j.id, url: `https://www.strava.com/activities/${j.id}` }
}

// ---- WHOOP v2 and Oura v2: today's readiness ----

async function getJson(url, token) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

/** { recovery, hrv, restingHr, strain, sleepPerf } from WHOOP's latest cycle, recovery and sleep. */
export async function whoopToday() {
  const token = await accessToken('whoop')
  if (!token) return null
  const base = 'https://api.prod.whoop.com/developer/v2'
  const [rec, cyc, slp] = await Promise.all([
    getJson(`${base}/recovery?limit=1`, token).catch(() => null),
    getJson(`${base}/cycle?limit=1`, token).catch(() => null),
    getJson(`${base}/activity/sleep?limit=1`, token).catch(() => null),
  ])
  const r = rec?.records?.[0]?.score, c = cyc?.records?.[0]?.score, s = slp?.records?.[0]?.score
  return {
    recovery: r?.recovery_score ?? null, hrv: r?.hrv_rmssd_milli ? Math.round(r.hrv_rmssd_milli) : null,
    restingHr: r?.resting_heart_rate ?? null, strain: c?.strain != null ? Math.round(c.strain * 10) / 10 : null,
    sleepPerf: s?.sleep_performance_percentage ?? null,
  }
}

/** { readiness, sleep, restingHr } from Oura's daily summaries for today. */
export async function ouraToday() {
  const token = await accessToken('oura')
  if (!token) return null
  const day = new Date().toISOString().slice(0, 10)
  const base = 'https://api.ouraring.com/v2/usercollection'
  const [rd, sl] = await Promise.all([
    getJson(`${base}/daily_readiness?start_date=${day}&end_date=${day}`, token).catch(() => null),
    getJson(`${base}/daily_sleep?start_date=${day}&end_date=${day}`, token).catch(() => null),
  ])
  const r = rd?.data?.[0], s = sl?.data?.[0]
  return { readiness: r?.score ?? null, sleep: s?.score ?? null, restingHr: r?.contributors?.resting_heart_rate ?? null }
}
