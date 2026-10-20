// Mobile build only, first launch: the choice useStore.boot() couldn't make on its own — keep
// everything on this device, or connect to a self-hosted Liftspark server instead. See
// lib/remote.js for the pairing flow this hands off to.
import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { askAddDeviceData } from '../sheets.jsx'
import { normalizeServerUrl } from '../lib/remote.js'
import { loadCfAccess, saveCfAccess } from '../lib/cf-access.js'

// A plain http:// server works (#428), but whatever the app sends, the pairing code and then its
// token, crosses the network readable. Said once under the field, not in the way: on a home
// network that is often a fine trade. localhost is the phone itself and needs no warning.
export function plainHttp(raw) {
  const base = /^\s*http:\/\//i.test(String(raw || '')) ? normalizeServerUrl(raw) : null
  if (!base) return false
  const host = new URL(base).hostname
  return !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(host)
}


// `server`: the address the token is most likely for (the one being typed into ConnectSheet).
const openCfAccess = server => useUI.getState().openSheet(close => <CfAccessSheet close={close} server={server} />)

// A server behind Cloudflare Access (lib/cf-access.js): the service token that lets this phone
// through, entered before pairing because the pairing request has to get through as well. It is
// saved with the address of its server and only ever sent there, so the sheet asks for that
// address too and says it: a stored token shows the server it belongs to, not `server`.
export function CfAccessSheet({ close, server = '' }) {
  const [addr, setAddr] = useState(typeof server === 'string' ? server : '')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [had, setHad] = useState(false)
  const [busy, setBusy] = useState(false)
  const origin = normalizeServerUrl(addr)
  useEffect(() => {
    loadCfAccess().then(c => { if (c) { setClientId(c.clientId); setClientSecret(c.clientSecret); setHad(true); if (c.origin) setAddr(c.origin) } })
  }, [])
  const save = async (id, secret) => {
    if (!!id.trim() !== !!secret.trim()) { useUI.getState().toast(t('Enter both the Client ID and the Client Secret')); return }
    if (id.trim() && !origin) { useUI.getState().toast(t('Enter the address of the server this token is for')); return }
    setBusy(true)
    try {
      const saved = await saveCfAccess({ clientId: id, clientSecret: secret, server: origin })
      close()
      useUI.getState().toast(saved ? t('Saved') : t('Removed'))
    } catch (e) { useUI.getState().toast(e.message || t('Could not save')) }
    finally { setBusy(false) }
  }
  return <>
    <h3>{t('Cloudflare Access')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t('Only if your server is behind Cloudflare Access: the service token this phone sends with every request to it. Kept in this phone’s secure storage.')}
    </div>
    <input className="input" placeholder={t('Server address (e.g. gym.example.com)')} value={addr} aria-label={t('Server address (e.g. gym.example.com)')}
      onChange={e => setAddr(e.target.value)} autoCapitalize="none" autoCorrect="off" inputMode="url" />
    {origin && <div className="dim small" role="note" style={{ marginTop: 8, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
      {t('Sent only to {0}, never to another server.', new URL(origin).host)}
    </div>}
    <div style={{ height: 10 }} />
    <input className="input" placeholder="CF-Access-Client-Id" value={clientId}
      onChange={e => setClientId(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    <div style={{ height: 10 }} />
    <input className="input" type="password" placeholder="CF-Access-Client-Secret" value={clientSecret}
      onChange={e => setClientSecret(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={() => save(clientId, clientSecret)} disabled={busy}>{t('Save')}</Button>
    {had && <>
      <div style={{ height: 10 }} />
      <Button icon="trash" onClick={() => save('', '')} disabled={busy}>{t('Remove')}</Button>
    </>}
  </>
}

// `again`: a phone whose server stopped accepting it (components/ServerSync.jsx pairAgain) — the
// address it had is filled in when it still has one, so only the new code is left to type, and
// the sheet says that what the phone kept is merged, not replaced.
export function ConnectSheet({ close, initialUrl = '', again = false }) {
  const { connectToServer } = useStore()
  const [url, setUrl] = useState(initialUrl)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // Why the last try failed, under the fields: a toast is gone in two seconds, too soon to read
  // "the server was reached but refused the app's request" and act on it (#329).
  const [error, setError] = useState('')
  const ref = useRef(null)
  const codeRef = useRef(null)
  useEffect(() => { setTimeout(() => (initialUrl ? codeRef : ref).current?.focus(), 250) }, [])
  const go = async () => {
    if (!url.trim() || !code.trim()) { useUI.getState().toast(t('Enter your server address and the code')); return }
    setBusy(true)
    setError('')
    try { await connectToServer(url.trim(), code.trim(), askAddDeviceData); close(); useUI.getState().toast(t('Connected')) }
    catch (e) { setError(e.message || t('Could not connect')) }
    finally { setBusy(false) }
  }
  return <>
    <h3>{again ? t('Pair again') : t('Connect to my server')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {again
        ? t('Open Settings → Account → “Pair the mobile app” on your Liftspark site in a browser and enter the new code shown there. What this phone kept is merged into your account.')
        : t('Open Settings → Account → “Pair the mobile app” on the Liftspark site you’re already signed into, then enter its address and the code shown there.')}
    </div>
    <input ref={ref} className="input" placeholder={t('Server address (e.g. gym.example.com)')} value={url}
      onChange={e => setUrl(e.target.value)} autoCapitalize="none" autoCorrect="off" inputMode="url" />
    {plainHttp(url) && <div className="dim small" role="note" style={{ marginTop: 8, lineHeight: 1.45 }}>
      {t('Plain http:// isn’t encrypted. Fine on your home network, but use https:// if your server is reachable from the internet.')}
    </div>}
    <div style={{ height: 10 }} />
    <input ref={codeRef} className="input" placeholder={t('Pairing code')} maxLength={8} value={code}
      onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
    {error && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{error}</div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go} disabled={busy}>{busy ? t('Connecting…') : t('Connect')}</Button>
    <div style={{ height: 10 }} />
    <Button icon="key" onClick={() => openCfAccess(normalizeServerUrl(url) || '')} disabled={busy}>{t('Cloudflare Access')}</Button>
  </>
}

export default function MobileOnboarding() {
  const { chooseLocalMode } = useStore()
  return (
    <div className="narrow ls-onboard">
      <div className="ls-onboard-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="76" height="76"><defs><linearGradient id="lsg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff6a2b" /><stop offset="1" stopColor="#ff2f7d" /></linearGradient></defs>
          <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#lsg)" />
          <path d="M35 12 L22 36 h9 l-3 16 l14-25 h-9 z" fill="#fff" />
        </svg>
      </div>
      <h1 className="ls-onboard-title">Liftspark</h1>
      <p className="ls-onboard-sub">{t('Plan it. Lift it. Feel every rep, with live heart rate from your watch or strap.')}</p>
      <ul className="ls-onboard-list">
        <li><b>{t('Guided workouts')}</b><span>{t('Plans, sets, rest timers and automatic progression.')}</span></li>
        <li><b>{t('Live heart rate & strain')}</b><span>{t('Apple Watch, WHOOP, Garmin, Polar and any Bluetooth strap.')}</span></li>
        <li><b>{t('Calories in and out')}</b><span>{t('Burned from your workouts and Health, eaten from food search and barcodes.')}</span></li>
        <li><b>{t('Share to Strava')}</b><span>{t('Through Apple Health, with a muscle-map card for your post.')}</span></li>
      </ul>
      <Button variant="primary" onClick={() => chooseLocalMode()}>{t('Get started')}</Button>
      <div className="dim small" style={{ marginTop: 16, lineHeight: 1.5 }}>
        {t('Your data stays on this phone. No account needed.')}
      </div>
    </div>
  )
}
