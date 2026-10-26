import { useState } from 'react'
import { t } from '../lib/i18n.js'

const DAY = 864e5
const iso = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Daily strain over the last `days` days: the day's highest workout strain (0–21), oldest first. */
export function strainByDay(workouts, days, now = Date.now()) {
  const by = {}
  for (const w of workouts || []) if (w?.ls?.strain != null) by[w.d] = Math.max(by[w.d] || 0, w.ls.strain)
  return Array.from({ length: days }, (_, i) => { const d = iso(now - (days - 1 - i) * DAY); return { d, v: by[d] || 0 } })
}

// Stats: strain for the last 7 or 30 days, with the period's average.
export default function StrainTrend({ workouts }) {
  const [days, setDays] = useState(7)
  const rows = strainByDay(workouts, days)
  const trained = rows.filter(r => r.v > 0)
  const avg = trained.length ? trained.reduce((a, r) => a + r.v, 0) / trained.length : 0
  return <div className="card ls-trend">
    <div className="row between" style={{ marginBottom: 10 }}>
      <h2 style={{ margin: 0 }}>{t('Strain')}</h2>
      <div className="ls-seg" role="radiogroup" aria-label={t('Period')}>
        {[7, 30].map(n => <button key={n} role="radio" aria-checked={days === n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{t('{0} days', n)}</button>)}
      </div>
    </div>
    {trained.length ? <>
      <div className="ls-bars" role="img" aria-label={t('Average strain {0} over {1} training days', avg.toFixed(1), trained.length)}>
        {rows.map(r => <span key={r.d} title={`${r.d}: ${r.v}`} style={{ height: Math.max(3, r.v / 21 * 100) + '%', opacity: r.v ? 1 : .25 }} />)}
      </div>
      <div className="ls-sub" style={{ marginTop: 8 }}>{t('Average {0} on {1} training days · scale 0-21', avg.toFixed(1), trained.length)}</div>
    </> : <div className="ls-sub">{t('Finish a workout to see your strain here.')}</div>}
  </div>
}
