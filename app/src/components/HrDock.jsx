import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useHeart, isFresh, initHeart } from '../store/useHeart.js'
import { zoneOf, maxHrOf, ZONE_COLORS, ZONE_NAMES, timeInZones } from '../lib/strain.js'
import { t } from '../lib/i18n.js'

// Live heart rate on the workout screen: the number, its zone, and the session's time in each zone
// so far. Starts recording when the workout screen opens with a live session; doFinishWorkout takes
// the samples. With nothing connected it offers the pairing screen instead of an empty number.
export default function HrDock() {
  const nav = useNavigate()
  const profile = useStore(s => s.S.lsProfile) || {}
  const bpm = useHeart(s => s.bpm)
  const at = useHeart(s => s.t)
  const source = useHeart(s => s.source)
  const samples = useHeart(s => s.samples)
  const bleState = useHeart(s => s.bleState)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    initHeart()
    useHeart.getState().startRecording({ watch: profile.watchLive !== false })
    const tm = setInterval(() => setNow(Date.now()), 2000)
    return () => clearInterval(tm)
  }, [])

  const fresh = isFresh(at, now)
  const max = maxHrOf(profile)
  if (!fresh && !samples.length) {
    const connecting = bleState === 'connecting' || bleState === 'scanning'
    return <button className="hr-dock" style={{ width: '100%', textAlign: 'start' }} onClick={() => nav('/devices')}>
      <svg className="heart" viewBox="0 0 24 24" style={{ animation: 'none', opacity: .5 }} aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.9 3.7 4.3 7.3C19.5 16.4 12 21 12 21z" /></svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{connecting ? t('Looking for your heart-rate sensor…') : t('Add live heart rate')}</div>
        <div className="ls-sub">{t('Apple Watch, WHOOP, Garmin, Polar or any Bluetooth strap')}</div>
      </div>
    </button>
  }

  const z = zoneOf(bpm, max, profile.restHr)
  const zs = timeInZones(samples, max, profile.restHr)
  const total = zs.reduce((a, b) => a + b, 0) || 1
  return <div className="hr-dock" role="status" aria-live="off" aria-label={t('{0} beats per minute', bpm || 0)}>
    <svg className="heart" viewBox="0 0 24 24" style={fresh ? undefined : { animation: 'none', opacity: .45 }} aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.9 3.7 4.3 7.3C19.5 16.4 12 21 12 21z" /></svg>
    <div>
      <div className="bpm" style={fresh ? undefined : { color: 'var(--label-3)' }}>{bpm || '–'}</div>
      <div className="ls-sub">{source === 'ble' ? t('Sensor') : t('Watch')} · {t('bpm')}</div>
    </div>
    <div style={{ flex: 1, display: 'grid', gap: 8 }}>
      {z >= 0 && <span className="zone" style={{ background: ZONE_COLORS[z], justifySelf: 'start' }}>Z{z + 1} {t(ZONE_NAMES[z])}</span>}
      <div className="hr-zbar" aria-hidden="true">
        {zs.map((sec, i) => <span key={i} style={{ width: Math.max(2, (sec / total) * 100) + '%', background: ZONE_COLORS[i], opacity: sec ? 1 : .18 }} />)}
      </div>
    </div>
  </div>
}
