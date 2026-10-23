// "Import your data": one hub for everything Liftspark can bring in — Apple Health history, WHOOP
// and Oura (when configured and signed in), workout files from Garmin and others, and openGym's own
// importers (Strong/Hevy/FitNotes CSV, Hevy API, backups). Shows what each source has brought in and
// takes it back out on request.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { isIOSApp } from '../lib/ls-native.js'
import { backendConfig, isConnected, connect } from '../lib/integrations.js'
import { RANGES, SOURCES, readHealth, applyHealth, readWhoop, readOura, applyWearable, readFiles, mergeActivities, removeImported, importedCounts } from '../lib/ls-import.js'
import { importFromApp, importFromHevy, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'

const KINDS = [
  ['workouts', 'Workouts', 'Strength sessions join your history; runs, rides and the rest become activities'],
  ['weight', 'Body weight', 'One weigh-in per day, on days you haven’t logged'],
  ['recovery', 'Resting heart rate & HRV', 'Daily values for your recovery trend'],
  ['sleep', 'Sleep', 'Time asleep per night'],
  ['energy', 'Active energy & steps', 'Daily totals'],
]
const STEP_LABEL = { workouts: 'Reading workouts…', weight: 'Reading weight…', recovery: 'Reading resting heart rate and HRV…', energy: 'Reading active energy and steps…', sleep: 'Reading sleep…' }

const summary = r => [r.workouts && t('{0} workouts', r.workouts), r.weights && t('{0} weigh-ins', r.weights), r.days && t('{0} daily values', r.days)].filter(Boolean).join(' · ') || t('Nothing new: you already had all of it.')

export default function Import() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const counts = importedCounts(S)
  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Import your data')}</h1><div className="sub">{t('Bring your history in. Everything is optional and stays on this phone.')}</div></div>
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="xmark" /></button>
    </div>
    <HealthImport />
    <WearableImport id="whoop" name="WHOOP" what={t('Day strain, recovery (HRV, resting heart rate), sleep, and workouts with heart-rate zones.')} read={readWhoop} />
    <WearableImport id="oura" name="Oura" what={t('Readiness, sleep with HRV and resting heart rate, daily activity and workouts.')} read={readOura} />
    <FileImport />
    <OtherApps />
    <Imported counts={counts} />
    <div style={{ height: 40 }} />
  </div>
}

function useRun() {
  const [busy, setBusy] = useState(null)
  const [done, setDone] = useState(null)
  const toast = useUI(s => s.toast)
  const run = async (label, fn) => {
    setBusy(label); setDone(null)
    try { const r = await fn(l => setBusy(l)); setDone(r) }
    catch (e) { toast(e?.message || t('Import failed')) }
    finally { setBusy(null) }
  }
  return { busy, done, run }
}

function Progress({ label }) {
  return <div className="ls-progress" role="status" aria-live="polite"><span className="ls-radar" aria-hidden="true" />{label}</div>
}

function RangePicker({ value, onChange }) {
  return <div className="ls-seg" role="radiogroup" aria-label={t('How far back')}>
    {RANGES.map(([d, l]) => <button key={d} role="radio" aria-checked={value === d} className={value === d ? 'on' : ''} onClick={() => onChange(d)}>{t(l)}</button>)}
  </div>
}

function HealthImport() {
  const update = useStore(s => s.update)
  const profile = useStore(s => s.S.lsProfile) || {}
  const [days, setDays] = useState(90)
  const [kinds, setKinds] = useState(KINDS.map(k => k[0]))
  const [native, setNative] = useState(true)
  const { busy, done, run } = useRun()
  useEffect(() => { isIOSApp().then(setNative) }, [])
  const go = () => run(t('Starting…'), async step => {
    const r = await readHealth({ days, kinds, profile, progress: k => step(t(STEP_LABEL[k])) })
    let counts = null
    update(s => { counts = applyHealth(s, r) })
    return counts
  })
  return <>
    <div className="ls-h">{t('Apple Health')}</div>
    <div className="ls-card" style={{ display: 'grid', gap: 12 }}>
      <div className="ls-note">{t('Past workouts from any app or device (Apple Watch, Garmin, Oura, Strava…), weight, resting heart rate, HRV, sleep and activity. Garmin: turn on Garmin Connect → Settings → Connected Apps → Apple Health first.')}</div>
      <RangePicker value={days} onChange={setDays} />
      <div className="ls-checks">
        {KINDS.map(([id, title, sub]) => <label key={id} className="ls-check">
          <input type="checkbox" checked={kinds.includes(id)} onChange={e => setKinds(k => e.target.checked ? [...k, id] : k.filter(x => x !== id))} />
          <span><b>{t(title)}</b><small>{t(sub)}</small></span>
        </label>)}
      </div>
      {busy ? <Progress label={busy} /> : <button className="btn primary pill" disabled={!native || !kinds.length} onClick={go}>{native ? t('Import from Apple Health') : t('Available in the iPhone app')}</button>}
      {done && <div className="ls-done"><Icon name="checkCircle" />{summary(done)}</div>}
    </div>
  </>
}

function WearableImport({ id, name, what, read }) {
  const update = useStore(s => s.update)
  const [cfg, setCfg] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [days, setDays] = useState(90)
  const { busy, done, run } = useRun()
  const toast = useUI(s => s.toast)
  useEffect(() => { backendConfig().then(async c => { setCfg(!!c[id]); if (c[id]) setSignedIn(await isConnected(id)) }) }, [id])
  if (!cfg) return null
  const go = () => run(t('Reading {0}…', name), async () => {
    const r = await read({ days })
    let counts = null
    update(s => { counts = applyWearable(s, id, r) })
    return counts
  })
  return <>
    <div className="ls-h">{name}</div>
    <div className="ls-card" style={{ display: 'grid', gap: 12 }}>
      <div className="ls-note">{what}</div>
      {signedIn ? <>
        <RangePicker value={days} onChange={setDays} />
        {busy ? <Progress label={busy} /> : <button className="btn primary pill" onClick={go}>{t('Import from {0}', name)}</button>}
        {done && <div className="ls-done"><Icon name="checkCircle" />{summary(done)}</div>}
      </> : <button className="ls-btn full" onClick={async () => {
        try { await connect(id); setSignedIn(true) } catch (e) { if (e?.code !== 'cancelled') toast(e?.message || t('Couldn’t connect')) }
      }}>{t('Sign in with {0}', name)}</button>}
    </div>
  </>
}

function FileImport() {
  const update = useStore(s => s.update)
  const profile = useStore(s => s.S.lsProfile) || {}
  const ref = useRef(null)
  const { busy, done, run } = useRun()
  const pick = files => run(t('Reading files…'), async () => {
    const { activities, failed } = await readFiles(Array.from(files || []), profile)
    let n = 0
    update(s => { n = mergeActivities(s, activities) })
    return { workouts: n, failed }
  })
  return <>
    <div className="ls-h">{t('Garmin & workout files')}</div>
    <div className="ls-card" style={{ display: 'grid', gap: 12 }}>
      <div className="ls-note">{t('Garmin history comes in through Apple Health above. For older activities or other devices, pick .FIT, .TCX or .GPX files (Garmin Connect → Activity → ⋯ → Export Original).')}</div>
      <input ref={ref} type="file" multiple accept=".fit,.tcx,.gpx,application/octet-stream,application/gpx+xml,application/vnd.garmin.tcx+xml" hidden onChange={e => { pick(e.target.files); e.target.value = '' }} />
      {busy ? <Progress label={busy} /> : <button className="ls-btn full" onClick={() => ref.current?.click()}>{t('Choose files')}</button>}
      {done && <div className="ls-done"><Icon name="checkCircle" />{summary(done)}{done.failed?.length ? ' · ' + t('Couldn’t read {0}', done.failed.join(', ')) : ''}</div>}
    </div>
  </>
}

function OtherApps() {
  const ref = useRef(null)
  const nav = useNavigate()
  return <>
    <div className="ls-h">{t('From another lifting app')}</div>
    <div className="ls-list">
      <input ref={ref} type="file" accept=".csv,.xml,text/csv,text/xml" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importFromApp(f); e.target.value = '' }} />
      <button className="ls-li" onClick={() => ref.current?.click()}><Icon name="download" /><span style={{ flex: 1, textAlign: 'start' }}><b>{t('Strong, Hevy, FitNotes or Gravl (CSV)')}</b><small className="ls-sub" style={{ display: 'block' }}>{t('Export a CSV from your old app and pick it here. Sets, weights and reps come across; days you already logged are left alone.')}</small></span><Icon name="chevronRight" /></button>
      <button className="ls-li" onClick={importFromHevy}><Icon name="key" /><span style={{ flex: 1, textAlign: 'start' }}><b>{t('Hevy, directly')}</b><small className="ls-sub" style={{ display: 'block' }}>{t('With a Hevy Pro API key: workouts, routines and weigh-ins.')}</small></span><Icon name="chevronRight" /></button>
      <button className="ls-li" onClick={() => nav('/settings/data')}><Icon name="folder" /><span style={{ flex: 1, textAlign: 'start' }}><b>{t('Restore a Liftspark backup')}</b><small className="ls-sub" style={{ display: 'block' }}>{t('Settings → Data & backup → Import backup.')}</small></span><Icon name="chevronRight" /></button>
    </div>
  </>
}

function Imported({ counts }) {
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const rows = Object.entries(counts).filter(([, c]) => c.workouts || c.days || c.weights)
  if (!rows.length) return null
  return <>
    <div className="ls-h">{t('Imported data')}</div>
    <div className="ls-list">
      {rows.map(([src, c]) => <div key={src} className="ls-li">
        <div style={{ flex: 1 }}><b>{SOURCES[src]}</b><div className="ls-sub">{[c.workouts && t('{0} workouts', c.workouts), c.weights && t('{0} weigh-ins', c.weights), c.days && t('{0} days of data', c.days)].filter(Boolean).join(' · ')}</div></div>
        <button className="ls-btn" onClick={() => confirmSheet({
          title: t('Delete data imported from {0}?', SOURCES[src]),
          message: t('Removes what this source brought in. Your own workouts and weigh-ins stay. Nothing is deleted from {0} itself.', SOURCES[src]),
          confirmText: t('Delete'), danger: true,
          onConfirm: () => { update(s => removeImported(s, src)); toast(t('Deleted')) },
        })}>{t('Delete')}</button>
      </div>)}
    </div>
  </>
}
