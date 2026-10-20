import { useState } from 'react'
import { t } from '../lib/i18n.js'

const DAY = 864e5
const iso = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const METRICS = [
  ['recovery', 'Recovery', '%', 'var(--z2)'],
  ['readiness', 'Readiness', '', 'var(--z2)'],
  ['hrv', 'HRV', 'ms', 'var(--z1)'],
  ['rhr', 'Resting HR', 'bpm', 'var(--z5)'],
  ['sleepMin', 'Sleep', 'h', 'var(--purple, #a78bfa)'],
  ['weight', 'Body weight', '', 'var(--spark)'],
]

/** The series for one metric over the last `days` days: [{ d, v }] for days that have a value. */
export function seriesOf(S, key, days, now = Date.now()) {
  const from = iso(now - (days - 1) * DAY)
  if (key === 'weight') return (S.bodyweight || []).filter(b => b.d >= from && b.w > 0).map(b => ({ d: b.d, v: b.w }))
  return Object.entries(S.daily || {}).filter(([d, r]) => d >= from && r[key] != null).sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, r]) => ({ d, v: key === 'sleepMin' ? r[key] / 60 : r[key] }))
}

function Spark({ pts, color }) {
  if (pts.length < 2) return null
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1)) * 100},${36 - ((p.v - lo) / span) * 32}`).join(' ')
  return <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="ls-spark" aria-hidden="true"><path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>
}

// Stats: recovery, HRV, resting heart rate, sleep and weight trends, from imports and Health.
export default function WellnessTrends({ S, onImport }) {
  const [days, setDays] = useState(30)
  const shown = METRICS.map(([k, label, unit, color]) => ({ k, label, unit: k === 'weight' ? S.unit : unit, color, pts: seriesOf(S, k, days) })).filter(m => m.pts.length)
  if (!shown.length) return <div className="card">
    <h2>{t('Recovery & body')}</h2>
    <div className="ls-sub" style={{ marginBottom: 10 }}>{t('Import from Apple Health, WHOOP or Oura to see resting heart rate, HRV, sleep and recovery trends here.')}</div>
    <button className="ls-btn full" onClick={onImport}>{t('Import your data')}</button>
  </div>
  return <div className="card">
    <div className="row between" style={{ marginBottom: 10 }}>
      <h2 style={{ margin: 0 }}>{t('Recovery & body')}</h2>
      <div className="ls-seg" role="radiogroup" aria-label={t('Period')}>
        {[30, 90].map(n => <button key={n} role="radio" aria-checked={days === n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>{t('{0} days', n)}</button>)}
      </div>
    </div>
    <div className="ls-trends">
      {shown.map(m => {
        const last = m.pts.at(-1).v, avg = m.pts.reduce((a, p) => a + p.v, 0) / m.pts.length
        const fmt = v => (m.k === 'sleepMin' ? `${Math.floor(v)}h ${Math.round((v % 1) * 60)}m` : Math.round(v * (m.k === 'weight' ? 10 : 1)) / (m.k === 'weight' ? 10 : 1))
        return <div key={m.k} className="ls-trend-tile" aria-label={t('{0}: latest {1}, average {2}', t(m.label), fmt(last), fmt(avg))}>
          <div className="ls-k">{t(m.label)}</div>
          <div className="ls-v" style={{ fontSize: 24 }}>{fmt(last)}<small> {m.k === 'sleepMin' ? '' : m.unit}</small></div>
          <Spark pts={m.pts} color={m.color} />
          <div className="ls-sub">{t('avg {0}', fmt(avg))}</div>
        </div>
      })}
    </div>
  </div>
}
