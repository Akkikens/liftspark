import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { healthMetrics } from '../lib/ls-workout.js'
import { stravaCaption } from '../lib/ls-workout.js'
import { shareToStrava } from '../lib/share-card.js'
import { backendConfig, isConnected, postToStrava } from '../lib/integrations.js'
import { loadHealth } from '../lib/health-sync.js'
import { musclesWorked, muscleDots, ZONE_COLORS, ZONE_NAMES } from '../lib/strain.js'
import MuscleMap from './MuscleMap.jsx'
import Ring from './Ring.jsx'

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

// The finish screen's Liftspark part: strain, heart rate, zones, calories, the muscles worked, and
// the ways to Strava (Apple Health import, the share card, and direct posting when configured).
export default function SparkSummary({ w }) {
  // Rendered inside the finish sheet, outside the router's context: navigate by hash.
  const nav = p => { window.location.hash = '#' + p }
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const [ls, setLs] = useState(w.ls || null)
  const [healthOn, setHealthOn] = useState(null)
  const [strava, setStrava] = useState({ configured: false, connected: false, posted: null, busy: false })

  useEffect(() => {
    let gone = false
    // An Apple Watch or Garmin workout may have recorded heart rate and energy that the phone did not.
    healthMetrics(w, S).then(better => {
      if (gone || !better) return
      setLs(better)
      update(s => { const x = (s.workouts || []).find(x => x.id === w.id); if (x) x.ls = better })
    }).catch(() => {})
    loadHealth().then(h => !gone && setHealthOn(!!h?.on)).catch(() => {})
    backendConfig().then(async c => {
      if (gone || !c.strava) return
      setStrava(s => ({ ...s, configured: true }))
      const connected = await isConnected('strava')
      if (!gone) setStrava(s => ({ ...s, connected }))
    })
    return () => { gone = true }
  }, [w.id])

  if (!ls) return null
  const dots = muscleDots(musclesWorked(w)).slice(0, 5)
  const zones = ls.zones || []
  const zTotal = zones.reduce((a, b) => a + b, 0)
  const withLs = { ...w, ls }

  const share = async () => {
    try {
      const how = await shareToStrava(withLs, S)
      toast(how === 'shared' ? t('Caption copied. Paste it into your Strava post.') : t('Image saved and caption copied.'))
    } catch { toast(t('Couldn’t make the image. Try again.')) }
  }
  const post = async () => {
    setStrava(s => ({ ...s, busy: true }))
    try {
      const r = await postToStrava(withLs, stravaCaption(withLs, S))
      setStrava(s => ({ ...s, busy: false, posted: r.url }))
      toast(t('Posted to Strava'))
    } catch (e) {
      setStrava(s => ({ ...s, busy: false }))
      toast(e?.code === 'auth' ? t('Connect Strava in Devices & Health first.') : t('Strava didn’t take it. Try again later.'))
    }
  }

  return <div className="ls-card" style={{ textAlign: 'start', margin: '4px 0 14px' }}>
    <div className="ls-row" style={{ gap: 16 }}>
      <Ring value={ls.strain / 21} size={116} stroke={11}>
        <div className="ls-v ls-spark-text" style={{ fontSize: 40 }}>{ls.strain}</div>
        <div className="ls-sub">{t('strain')}</div>
      </Ring>
      <div className="ls-grid2" style={{ flex: 1 }}>
        <div><div className="ls-v">{ls.minutes}<small>{t('min')}</small></div><div className="ls-k">{t('Time')}</div></div>
        <div><div className="ls-v">{ls.kcal}<small>kcal</small></div><div className="ls-k">{ls.kcalSource === 'health' ? t('From Health') : ls.kcalSource === 'hr' ? t('From heart rate') : t('Estimated')}</div></div>
        <div><div className="ls-v">{ls.avgHr || '–'}</div><div className="ls-k">{t('Avg bpm')}</div></div>
        <div><div className="ls-v">{ls.maxHr || '–'}</div><div className="ls-k">{t('Max bpm')}</div></div>
      </div>
    </div>

    {zTotal > 0 && <div style={{ marginTop: 16 }}>
      <div className="hr-zbar" style={{ height: 10 }}>
        {zones.map((s, i) => <span key={i} title={ZONE_NAMES[i]} style={{ width: (s / zTotal) * 100 + '%', background: ZONE_COLORS[i] }} />)}
      </div>
      <div className="ls-row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {zones.map((s, i) => s > 0 && <span key={i} className="ls-sub"><b style={{ color: ZONE_COLORS[i] }}>Z{i + 1}</b> {Math.round(s / 60)}m</span>)}
      </div>
    </div>}
    {ls.estimated && <div className="ls-note" style={{ marginTop: 10 }}>{t('No heart rate this time, so strain and calories are estimated from your time and weight. Connect a watch or strap for the real thing.')}</div>}

    {dots.length > 0 && <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><MuscleMap load={musclesWorked(w)} width={220} /></div>
      <div className="ls-grid2" style={{ gap: '6px 16px', marginTop: 8 }}>
        {dots.map(m => <div key={m.region} className="ls-row" style={{ justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t(cap(m.region))}</span>
          <span aria-label={t('{0} of 3', m.level)} style={{ letterSpacing: 2, color: 'var(--spark)' }}>{'●'.repeat(m.level)}<span style={{ opacity: .2 }}>{'●'.repeat(3 - m.level)}</span></span>
        </div>)}
      </div>
    </div>}

    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      <button className="ls-btn pri full" onClick={share}>{t('Share to Strava')}</button>
      {strava.configured && (strava.connected
        ? <button className="ls-btn full" onClick={strava.posted ? () => window.open(strava.posted, '_blank') : post} disabled={strava.busy}>
            {strava.posted ? t('Open on Strava') : strava.busy ? t('Posting…') : t('Post to Strava directly')}</button>
        : <button className="ls-btn full" onClick={() => nav('/devices')}>{t('Connect Strava for one-tap posting')}</button>)}
      {healthOn === false && <button className="ls-btn full" onClick={() => nav('/devices')}>{t('Send workouts to Strava automatically (via Apple Health)')}</button>}
      {healthOn && <div className="ls-sub" style={{ textAlign: 'center' }}>{t('Saved to Apple Health. Strava imports it if Health is connected there.')}</div>}
    </div>
  </div>
}
