import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useHeart, initHeart, isFresh } from '../store/useHeart.js'
import { t } from '../lib/i18n.js'
import { ble, listen, health, isIOSApp } from '../lib/ls-native.js'
import { loadHealth, enableHealth, disableHealth } from '../lib/health-sync.js'
import { backendConfig, isConnected, connect, disconnect } from '../lib/integrations.js'
import { maxHrOf } from '../lib/strain.js'
import { Switch } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { HRScanner } from '../components/Wearables.jsx'

// Settings → Devices & Health: live heart rate sensors, Apple Health, Strava, WHOOP, Oura, and the
// body details the calorie and strain maths use.
export default function Devices() {
  const nav = useNavigate()
  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Devices & Health')}</h1><div className="sub">{t('Heart rate, Apple Health, Strava and wearables')}</div></div>
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="xmark" /></button>
    </div>
    <HeartRateSensor />
    <AppleHealth />
    <StravaCard />
    <Wearables />
    <BodyProfile />
    <div style={{ height: 40 }} />
  </div>
}

function HeartRateSensor() {
  const nav = useNavigate()
  return <>
    <div className="ls-h">{t('Live heart rate')}</div>
    <div className="ls-card" style={{ display: 'grid', gap: 10 }}>
      <button className="ls-btn full" onClick={() => nav('/connect')}>{t('Connect your wearable')}</button>
      <div className="ls-note">{t('Any Bluetooth heart-rate sensor: chest straps (Polar, Wahoo, Garmin HRM), WHOOP or Garmin with “Broadcast Heart Rate” on, and more.')}</div>
      <HRScanner />
    </div>
  </>
}

function AppleHealth() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [h, setH] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useUI(s => s.toast)
  useEffect(() => { loadHealth().then(setH).catch(() => {}) }, [])
  const toggle = async on => {
    setBusy(true)
    try {
      if (on) {
        const r = await enableHealth(S)
        await health.request()
        if (!r?.ok) toast(r?.reason === 'unsupported' ? t('Apple Health isn’t available on this device.') : t('Allow Liftspark in the Health app to turn this on.'))
      } else await disableHealth()
      setH(await loadHealth())
    } finally { setBusy(false) }
  }
  const lp = S.lsProfile || {}
  return <>
    <div className="ls-h">{t('Apple Health')}</div>
    <div className="ls-card">
      <div className="ls-row" style={{ justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{t('Sync with Apple Health')}</div>
          <div className="ls-sub">{t('Saves workouts (with heart rate, calories and strain), weigh-ins and food. Reads Apple Watch, Garmin and Oura data.')}</div>
        </div>
        <Switch checked={!!h?.on} disabled={busy} onChange={toggle} aria-label={t('Sync with Apple Health')} />
      </div>
      {h?.error && <div className="ls-note" style={{ color: 'var(--red)', marginTop: 8 }}>{t('Health stopped accepting Liftspark. Allow it again in the Health app.')}</div>}
      <div style={{ height: 12 }} />
      <div className="ls-row" style={{ justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{t('iPhone workout session')}</div>
          <div className="ls-sub">{t('iOS 26: run a Health workout session on the phone while you lift. Apple Watch heart rate arrives whenever a workout runs on the Watch, with or without this.')}</div>
        </div>
        <Switch checked={lp.watchLive === true} onChange={v => update(s => { s.lsProfile = { ...(s.lsProfile || {}), watchLive: v } })} aria-label={t('iPhone workout session')} />
      </div>
      <button className="ls-btn full" style={{ marginTop: 12 }} onClick={() => health.open()}>{t('Open the Health app')}</button>
    </div>
  </>
}

function StravaCard() {
  const [cfg, setCfg] = useState({ strava: false })
  const [connected, setConnected] = useState(false)
  const toast = useUI(s => s.toast)
  useEffect(() => { backendConfig().then(c => { setCfg(c); if (c.strava) isConnected('strava').then(setConnected) }) }, [])
  return <>
    <div className="ls-h">{t('Strava')}</div>
    <div className="ls-card">
      <div style={{ fontWeight: 700 }}>{t('Sync to Strava via Apple Health')}</div>
      <ol className="ls-note" style={{ paddingInlineStart: 18, margin: '8px 0' }}>
        <li>{t('Turn on “Sync with Apple Health” above.')}</li>
        <li>{t('In the Strava app: You → Settings → Applications, Services, and Devices → Health → Connect.')}</li>
        <li>{t('Allow Workouts. Every workout you finish in Liftspark shows up on Strava.')}</li>
      </ol>
      <div className="ls-note">{t('After a workout, “Share to Strava” also makes an image of your muscle map and stats, and copies a caption with your strain, heart rate, zones and sets, ready to paste into the post.')}</div>
      {cfg.strava && <button className="ls-btn full" style={{ marginTop: 12 }}
        onClick={async () => {
          if (connected) { await disconnect('strava'); setConnected(false); return }
          try { await connect('strava'); setConnected(true); toast(t('Strava connected')) } catch (e) { if (e?.code !== 'cancelled') toast(e?.message || t('Couldn’t connect')) }
        }}>{connected ? t('Disconnect direct Strava posting') : t('Connect Strava for direct posting')}</button>}
      <button className="ls-btn full" style={{ marginTop: 10 }} onClick={() => window.open('strava://', '_system')}>{t('Open Strava')}</button>
    </div>
  </>
}

function Wearables() {
  const [cfg, setCfg] = useState({ whoop: false, oura: false })
  const [state, setState] = useState({ whoop: false, oura: false })
  const toast = useUI(s => s.toast)
  useEffect(() => {
    backendConfig().then(async c => {
      setCfg(c)
      setState({ whoop: c.whoop && await isConnected('whoop'), oura: c.oura && await isConnected('oura') })
    })
  }, [])
  const rows = [['whoop', 'WHOOP', t('Recovery, day strain, HRV and sleep')], ['oura', 'Oura', t('Readiness, sleep and resting heart rate')]].filter(([id]) => cfg[id])
  return <>
    <div className="ls-h">{t('Wearables')}</div>
    <div className="ls-card">
      <div className="ls-note" style={{ marginBottom: rows.length ? 10 : 0 }}>
        {t('Garmin, Oura and most watches sync into Apple Health, which Liftspark reads. For live heart rate from WHOOP or Garmin during a workout, turn on heart-rate broadcast on the device and pair it above.')}
      </div>
      {rows.map(([id, name, sub]) => <div key={id} className="ls-li">
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{name}</div><div className="ls-sub">{sub}</div></div>
        <button className="ls-btn" onClick={async () => {
          if (state[id]) { await disconnect(id); setState(s => ({ ...s, [id]: false })); return }
          try { await connect(id); setState(s => ({ ...s, [id]: true })); toast(t('{0} connected', name)) } catch (e) { if (e?.code !== 'cancelled') toast(e?.message || t('Couldn’t connect')) }
        }}>{state[id] ? t('Disconnect') : t('Connect')}</button>
      </div>)}
    </div>
  </>
}

function BodyProfile() {
  const p = useStore(s => s.S.lsProfile) || {}
  const update = useStore(s => s.update)
  const set = (k, v) => update(s => { s.lsProfile = { ...(s.lsProfile || {}), [k]: v } })
  const num = (k, lo, hi) => e => { const v = Number(e.target.value); set(k, e.target.value === '' ? null : v >= lo && v <= hi ? v : p[k]) }
  return <>
    <div className="ls-h">{t('You')}</div>
    <div className="ls-card" style={{ display: 'grid', gap: 12 }}>
      <div className="ls-note">{t('Used for heart-rate zones, strain and calories. Stays on this phone.')}</div>
      <label className="ls-k">{t('Sex (for calorie formulas)')}
        <select className="ls-input" value={p.sex || ''} onChange={e => set('sex', e.target.value || null)}>
          <option value="">{t('Prefer not to say')}</option><option value="male">{t('Male')}</option><option value="female">{t('Female')}</option>
        </select>
      </label>
      <div className="ls-grid2">
        <label className="ls-k">{t('Birth year')}<input className="ls-input" inputMode="numeric" defaultValue={p.birthYear || ''} onBlur={num('birthYear', 1920, new Date().getFullYear() - 10)} /></label>
        <label className="ls-k">{t('Height (cm)')}<input className="ls-input" inputMode="numeric" defaultValue={p.heightCm || ''} onBlur={num('heightCm', 100, 250)} /></label>
        <label className="ls-k">{t('Max heart rate')}<input className="ls-input" inputMode="numeric" placeholder={String(maxHrOf(p))} defaultValue={p.maxHr || ''} onBlur={num('maxHr', 120, 230)} /></label>
        <label className="ls-k">{t('Resting heart rate')}<input className="ls-input" inputMode="numeric" defaultValue={p.restHr || ''} onBlur={num('restHr', 30, 110)} /></label>
      </div>
    </div>
  </>
}
