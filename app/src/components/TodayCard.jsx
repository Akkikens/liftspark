import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { health } from '../lib/ls-native.js'
import { dayFood, totals, dailyGoal } from '../lib/fuel.js'
import { bodyweightKg } from '../lib/ls-workout.js'
import { ageOf } from '../lib/strain.js'
import { backendConfig, isConnected, whoopToday, ouraToday } from '../lib/integrations.js'
import Ring from './Ring.jsx'

// Home's "Today": calories in against the goal, what Health says was burned and walked, the last
// workout's strain, and WHOOP/Oura readiness when connected.
export default function TodayCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [h, setH] = useState({})
  const [ready, setReady] = useState(null)
  useEffect(() => {
    let gone = false
    health.today().then(v => !gone && setH(v || {})).catch(() => {})
    backendConfig().then(async c => {
      if (c.whoop && await isConnected('whoop')) { const w = await whoopToday().catch(() => null); if (!gone && w) setReady({ src: 'WHOOP', score: w.recovery, label: t('Recovery'), extra: w.hrv ? `HRV ${w.hrv}` : null }) }
      else if (c.oura && await isConnected('oura')) { const o = await ouraToday().catch(() => null); if (!gone && o) setReady({ src: 'Oura', score: o.readiness, label: t('Readiness'), extra: o.sleep ? t('Sleep {0}', o.sleep) : null }) }
    })
    return () => { gone = true }
  }, [])
  const profile = S.lsProfile || {}
  const goal = dailyGoal(profile, bodyweightKg(S) || 75, ageOf(profile))
  const eaten = totals(dayFood(S, todayISO())).kcal
  // The last strain only while it is recent: a number from weeks ago reads as today's.
  const last = [...(S.workouts || [])].reverse().find(w => w.ls && (w.end || w.start || 0) > Date.now() - 7 * 864e5)
  const lastDay = last ? new Date(last.end || last.start).toLocaleDateString(undefined, { weekday: 'short' }) : null
  return <div className="ls-card" style={{ marginBottom: 12 }}>
    <div className="ls-row" style={{ gap: 16, alignItems: 'center' }}>
      <button onClick={() => nav('/fuel')} aria-label={t('Fuel')} style={{ flex: 'none' }}>
        <Ring value={eaten / goal} size={104} stroke={10}>
          <div className="ls-v" style={{ fontSize: 26 }}>{eaten}</div>
          <div className="ls-sub">/ {goal} kcal</div>
        </Ring>
      </button>
      <div className="ls-grid2" style={{ flex: 1 }}>
        <div><div className="ls-v" style={{ fontSize: 26 }}>{h.activeKcal != null ? Math.round(h.activeKcal) : '-'}</div><div className="ls-k">{t('Active kcal')}</div></div>
        <div><div className="ls-v" style={{ fontSize: 26 }}>{h.steps != null ? Math.round(h.steps).toLocaleString() : '-'}</div><div className="ls-k">{t('Steps')}</div></div>
        <div><div className="ls-v ls-spark-text" style={{ fontSize: 26 }}>{last?.ls?.strain ?? '-'}</div><div className="ls-k">{lastDay ? t('Strain · {0}', lastDay) : t('Last strain')}</div></div>
        <div>{ready
          ? <><div className="ls-v" style={{ fontSize: 26 }}>{ready.score ?? '-'}%</div><div className="ls-k">{ready.src} {ready.label}</div></>
          : <><div className="ls-v" style={{ fontSize: 26 }}>{h.restingHr ? Math.round(h.restingHr) : '-'}</div><div className="ls-k">{t('Resting HR')}</div></>}</div>
      </div>
    </div>
    {h.activeKcal == null && <button className="ls-btn full" style={{ marginTop: 12 }} onClick={() => nav('/devices')}>{t('Connect Apple Health & heart rate')}</button>}
  </div>
}
