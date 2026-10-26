// "Connect your wearable": the device picker (Apple Watch, WHOOP, Garmin, Oura, any heart-rate
// strap), the Bluetooth scanner each strap-like device leads to, and the Home card that asks until
// something is connected and then shrinks to a status chip with live heart rate.
//
// What "connected" means: a Bluetooth sensor is remembered (useHeart.bleName), or the user finished
// a Health-based flow (S.lsWearable.kind), since HealthKit never says whether read access was given.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useHeart, initHeart, isFresh } from '../store/useHeart.js'
import { t } from '../lib/i18n.js'
import { ble, listen, health, isIOSApp } from '../lib/ls-native.js'
import { enableHealth } from '../lib/health-sync.js'
import { backendConfig, isConnected, connect, disconnect } from '../lib/integrations.js'
import Icon from './Icon.jsx'

export const KINDS = [
  { id: 'watch', name: 'Apple Watch', sub: 'Heart rate, workouts and calories through Apple Health', glyph: 'watch' },
  { id: 'whoop', name: 'WHOOP', sub: 'Live heart rate by Broadcast; recovery and sleep through Apple Health', glyph: 'band' },
  { id: 'garmin', name: 'Garmin', sub: 'Live heart rate by Broadcast; history through Apple Health', glyph: 'watch' },
  { id: 'oura', name: 'Oura', sub: 'Sleep and resting heart rate through Apple Health', glyph: 'ring' },
  { id: 'strap', name: 'Heart-rate strap', sub: 'Polar, Wahoo, Coros, Garmin HRM and any Bluetooth sensor', glyph: 'strap' },
]
const KIND = Object.fromEntries(KINDS.map(k => [k.id, k]))

// Small line drawings, so each tile reads at a glance without brand logos.
export function DeviceGlyph({ glyph, size = 30 }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
    {glyph === 'watch' && <><rect x="9" y="8" width="14" height="16" rx="4" {...p} /><path d="M12 8 13 3h6l1 5M12 24l1 5h6l1-5" {...p} /><path d="M13 16h2l1-3 2 6 1-3h1" {...p} /></>}
    {glyph === 'band' && <><path d="M5 12c0-3 3-5 11-5s11 2 11 5v8c0 3-3 5-11 5S5 23 5 20z" {...p} /><rect x="11" y="11" width="10" height="10" rx="2" {...p} /></>}
    {glyph === 'ring' && <><ellipse cx="16" cy="17" rx="10" ry="9" {...p} /><ellipse cx="16" cy="17" rx="6.5" ry="5.5" {...p} /><path d="M12 7.5 16 5l4 2.5" {...p} /></>}
    {glyph === 'strap' && <><path d="M3 16c4-4 8-5 13-5s9 1 13 5" {...p} /><rect x="11" y="12" width="10" height="8" rx="3" {...p} /><path d="M13 16h1.5l1-2 1.5 4 1-2H19" {...p} /></>}
  </svg>
}

/** True once any wearable is set up. */
export function useWearableConnected() {
  const bleName = useHeart(s => s.bleName)
  const kind = useStore(s => s.S.lsWearable?.kind)
  return !!(bleName || kind)
}

const markConnected = kind => useStore.getState().update(s => { s.lsWearable = { ...(s.lsWearable || {}), kind, at: Date.now() } })

// Signal strength from RSSI, as four bars.
const bars = rssi => !rssi ? 0 : rssi >= -60 ? 4 : rssi >= -70 ? 3 : rssi >= -80 ? 2 : 1
function Signal({ rssi }) {
  const n = bars(rssi)
  return <span className="ls-signal" role="img" aria-label={n ? t('Signal {0} of 4', n) : t('Signal unknown')}>
    {[1, 2, 3, 4].map(i => <i key={i} className={i <= n ? 'on' : ''} style={{ height: 4 + i * 3 }} />)}
  </span>
}

/** Bluetooth heart-rate scanner: scan, the devices found with signal, connect, and forget. */
export function HRScanner({ kind = 'strap', onConnected }) {
  const bleState = useHeart(s => s.bleState), name = useHeart(s => s.bleName), battery = useHeart(s => s.battery)
  const bpm = useHeart(s => s.bpm), at = useHeart(s => s.t), source = useHeart(s => s.source)
  const [found, setFound] = useState([])
  const [scanning, setScanning] = useState(false)
  const [native, setNative] = useState(true)
  const [picked, setPicked] = useState(null)
  const toast = useUI(s => s.toast)

  useEffect(() => {
    initHeart()
    isIOSApp().then(setNative)
    const off = listen('ble', 'device', d => setFound(list => {
      const i = list.findIndex(x => x.id === d.id)
      if (i < 0) return [...list, d].sort((a, b) => (b.rssi || -999) - (a.rssi || -999))
      const next = [...list]; next[i] = { ...next[i], ...d }; return next
    }))
    // While a pairing screen is open the saved sensor may connect; afterwards only a workout does.
    ble.setAutoReconnect(true)
    return () => { off?.(); ble.stopScan(); if (!useHeart.getState().recording) ble.setAutoReconnect(false) }
  }, [])
  useEffect(() => {
    if (bleState === 'connected' && picked) { markConnected(kind); setPicked(null); onConnected?.() }
  }, [bleState, picked])

  const scan = async () => {
    setFound([]); setScanning(true)
    const st = await ble.status()
    if (st?.state === 'off') { setScanning(false); toast(t('Turn on Bluetooth to find your device.')); return }
    if (st?.state === 'unauthorized') { setScanning(false); toast(t('Allow Bluetooth for Liftspark in Settings.')); return }
    await ble.scan()
    setTimeout(() => { setScanning(false); ble.stopScan() }, 20000)
  }
  const pick = async d => {
    try { setPicked(d.id); await ble.connect(d.id); setScanning(false); ble.stopScan() }
    catch (e) { setPicked(null); toast(e?.message || t('Couldn’t connect')) }
  }
  const connected = bleState === 'connected'
  const live = isFresh(at) && source === 'ble'

  if (!native) return <div className="ls-note">{t('Bluetooth pairing works in the Liftspark iPhone app.')}</div>
  return <div className="ls-scan">
    {name && <div className="ls-paired">
      <span className={'ls-dot' + (connected ? ' on' : '')} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{name}</div>
        <div className="ls-sub">{connected ? (live ? t('{0} bpm now', bpm) : t('Connected')) : bleState === 'connecting' ? t('Reconnecting…') : t('Connects during workouts')}{battery != null ? ' · ' + t('battery {0}%', battery) : ''}</div>
      </div>
      <button className="ls-btn" onClick={() => { ble.forget(); useStore.getState().update(s => { if (s.lsWearable && s.lsWearable.kind === kind) s.lsWearable = null }) }}>{t('Forget')}</button>
    </div>}
    <button className="btn primary pill ls-scan-btn" onClick={scan} disabled={scanning} aria-live="polite">
      {scanning ? <><span className="ls-radar" aria-hidden="true" />{t('Scanning for devices…')}</> : name ? t('Scan for a different device') : t('Scan for devices')}
    </button>
    {(scanning || found.length > 0) && <div className="ls-found" role="list" aria-label={t('Devices found')}>
      {found.map(d => <div key={d.id} role="listitem" className="ls-li">
        <Icon name="heart" />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{d.name}</div><div className="ls-sub">{d.rssi ? d.rssi + ' dBm' : t('Remembered device')}</div></div>
        <Signal rssi={d.rssi} />
        <button className="ls-btn" disabled={picked === d.id} onClick={() => pick(d)}>{picked === d.id ? t('Connecting…') : t('Connect')}</button>
      </div>)}
      {scanning && !found.length && <div className="ls-sub" style={{ padding: '10px 2px' }}>{t('Looking for heart-rate sensors nearby. Keep the device close and broadcasting.')}</div>}
    </div>}
  </div>
}

function Steps({ items }) {
  return <ol className="ls-steps">{items.map((s, i) => <li key={i}>{s}</li>)}</ol>
}

function HealthButton({ kind, label }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const toast = useUI(s => s.toast)
  const go = async () => {
    setBusy(true)
    try {
      const r = await enableHealth(useStore.getState().S)
      const g = await health.request()
      if (r?.reason === 'unsupported') { toast(t('Apple Health isn’t available on this device.')); return }
      markConnected(kind); setDone(true)
      if (!g?.granted && !r?.ok) toast(t('You can allow Liftspark any time in the Health app.'))
    } finally { setBusy(false) }
  }
  return <button className="btn primary pill" onClick={go} disabled={busy}>{done ? t('Apple Health connected') : label || t('Connect Apple Health')}</button>
}

function ApiSignIn({ provider, name }) {
  const [cfg, setCfg] = useState(false)
  const [on, setOn] = useState(false)
  const toast = useUI(s => s.toast)
  useEffect(() => { backendConfig().then(async c => { setCfg(!!c[provider]); if (c[provider]) setOn(await isConnected(provider)) }) }, [provider])
  if (!cfg) return null
  return <button className="ls-btn full" style={{ marginTop: 10 }} onClick={async () => {
    if (on) { await disconnect(provider); setOn(false); return }
    try { await connect(provider); setOn(true); markConnected(provider); toast(t('{0} connected', name)) } catch (e) { if (e?.code !== 'cancelled') toast(e?.message || t('Couldn’t connect')) }
  }}>{on ? t('Sign out of {0}', name) : t('Sign in with {0}', name)}</button>
}

/** The flow behind one tile. */
export function WearableFlow({ kind, onDone }) {
  const k = KIND[kind]
  return <div className="ls-flow">
    <div className="ls-flow-head"><span className="ls-tile-ic"><DeviceGlyph glyph={k.glyph} /></span><div><h2>{k.name}</h2><div className="ls-sub">{t(k.sub)}</div></div></div>
    {kind === 'watch' && <>
      <Steps items={[t('Allow Liftspark to read heart rate and active energy from Apple Health.'), t('When you lift, start any workout on the Watch (Traditional Strength Training): its heart rate reaches Liftspark through Health.'), t('Your Liftspark workout is saved to Health; if the Watch recorded the same session, Liftspark doesn’t add a duplicate.')]} />
      <HealthButton kind="watch" />
    </>}
    {kind === 'whoop' && <>
      <Steps items={[t('Open the WHOOP app → More → Device settings.'), t('Turn on “Broadcast Heart Rate”.'), t('Tap Scan below and pick your WHOOP.')]} />
      <HRScanner kind="whoop" onConnected={onDone} />
      <ApiSignIn provider="whoop" name="WHOOP" />
    </>}
    {kind === 'garmin' && <>
      <Steps items={[t('On the watch: hold Menu → Sensors & Accessories (or Settings → Wrist Heart Rate) → Broadcast Heart Rate.'), t('Start broadcasting, then tap Scan below and pick the watch.'), t('For your history, turn on Garmin Connect → More → Settings → Connected Apps → Apple Health.')]} />
      <HRScanner kind="garmin" onConnected={onDone} />
      <div style={{ height: 10 }} />
      <HealthButton kind="garmin" label={t('Also read Garmin data from Apple Health')} />
    </>}
    {kind === 'oura' && <>
      <Steps items={[t('In the Oura app: Settings → Apple Health → turn it on.'), t('Connect Apple Health below so Liftspark can read sleep and resting heart rate.'), t('Oura doesn’t stream live heart rate during workouts; pair a strap or watch for that.')]} />
      <HealthButton kind="oura" />
      <ApiSignIn provider="oura" name="Oura" />
    </>}
    {kind === 'strap' && <>
      <Steps items={[t('Wet the strap’s electrodes and put it on, or wake the sensor.'), t('Tap Scan below and pick it from the list.'), t('Liftspark remembers it and reconnects on its own next time.')]} />
      <HRScanner kind="strap" onConnected={onDone} />
    </>}
  </div>
}

/** Tiles for the five device families; picking one opens its flow in place. */
export function WearablePicker({ onDone, initial = null }) {
  const [kind, setKind] = useState(initial)
  if (kind) return <>
    <button className="ls-back" onClick={() => setKind(null)}><Icon name="chevronLeft" />{t('All devices')}</button>
    <WearableFlow kind={kind} onDone={onDone} />
  </>
  return <div className="ls-tiles" role="list">
    {KINDS.map(k => <button key={k.id} role="listitem" className="ls-tile" onClick={() => setKind(k.id)} aria-label={`${k.name}. ${t(k.sub)}`}>
      <span className="ls-tile-ic"><DeviceGlyph glyph={k.glyph} /></span>
      <span className="ls-tile-n">{k.name}</span>
      <span className="ls-tile-s">{t(k.sub)}</span>
    </button>)}
  </div>
}

/** Home: a prominent card until something is connected, then a compact live chip. */
export function WearableHomeCard({ nav }) {
  const connected = useWearableConnected()
  const bleName = useHeart(s => s.bleName), bleState = useHeart(s => s.bleState)
  const bpm = useHeart(s => s.bpm), at = useHeart(s => s.t)
  const kind = useStore(s => s.S.lsWearable?.kind)
  useEffect(() => { initHeart() }, [])
  if (!connected) return <button className="ls-wear-card" onClick={() => nav('/connect')}>
    <div className="ls-wear-glyphs" aria-hidden="true">{KINDS.slice(0, 4).map(k => <DeviceGlyph key={k.id} glyph={k.glyph} size={26} />)}</div>
    <div className="ls-wear-t">{t('Connect your wearable')}</div>
    <div className="ls-wear-s">{t('Live heart rate, strain and calories from Apple Watch, WHOOP, Garmin, Oura or any strap.')}</div>
    <span className="ls-wear-cta">{t('Connect')}<Icon name="chevronRight" /></span>
  </button>
  const live = isFresh(at)
  const label = bleName || KIND[kind]?.name || t('Wearable')
  return <button className="ls-wear-chip" onClick={() => nav('/connect')} aria-label={t('{0}, {1}. Manage devices', label, live ? t('{0} bpm', bpm) : bleName && bleState !== 'connected' ? t('not connected') : t('connected'))}>
    <span className={'ls-dot' + (live || bleState === 'connected' || !bleName ? ' on' : '')} aria-hidden="true" />
    <span className="ls-wear-chip-n">{label}</span>
    {live ? <span className="ls-wear-bpm"><Icon name="heart" />{bpm}</span> : <span className="ls-sub">{bleName && bleState !== 'connected' ? t('Not connected') : t('Connected')}</span>}
    <Icon name="chevronRight" />
  </button>
}
