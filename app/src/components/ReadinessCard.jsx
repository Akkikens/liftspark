import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { readinessOf, ADVICE } from '../lib/ls-readiness.js'
import { refreshToday } from '../lib/ls-today.js'
import Icon from './Icon.jsx'

const COLOR = { lighter: 'var(--z4)', standard: 'var(--z2)', harder: 'var(--spark)' }

// Home: today's readiness and what it suggests for the session. Ignore hides it for the day; Apply
// adjusts the target sets when today's workout starts (sheets.jsx beginWorkout).
export default function ReadinessCard() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const day = todayISO()
  useEffect(() => { refreshToday() }, [])
  const r = readinessOf(S.daily, day)
  if (!r || S.lsReadinessPlan?.d === day && S.lsReadinessPlan.level === 'ignored') return null
  const applied = S.lsReadinessPlan?.d === day ? S.lsReadinessPlan.level : null
  const a = ADVICE[r.level]
  return <div className="ls-card ls-ready" style={{ '--c': COLOR[r.level] }}>
    <div className="ls-row" style={{ gap: 14, alignItems: 'center' }}>
      <div className="ls-ready-score" aria-label={t('Readiness {0} of 100', r.score)}>{r.score}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ls-k">{t('Readiness · {0}', t(r.source))}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1.1 }}>{t(a.title)}</div>
      </div>
    </div>
    <div className="ls-note" style={{ marginTop: 8 }}>{t(a.body)}</div>
    {r.reasons.length > 0 && <ul className="ls-ready-why">{r.reasons.map(x => <li key={x}>{x}</li>)}</ul>}
    {r.level !== 'standard' && <div className="ls-row" style={{ gap: 8, marginTop: 10 }}>
      {applied === r.level
        ? <div className="ls-done" style={{ flex: 1 }}><Icon name="checkCircle" />{t('Applied to today’s workout')}</div>
        : <button className="ls-btn pri" style={{ flex: 1 }} onClick={() => update(s => { s.lsReadinessPlan = { d: day, level: r.level } })}>{r.level === 'lighter' ? t('Make today lighter') : t('Add the extra sets')}</button>}
      <button className="ls-btn" onClick={() => update(s => { s.lsReadinessPlan = { d: day, level: 'ignored' } })}>{t('Ignore')}</button>
    </div>}
    <div className="ls-sub" style={{ marginTop: 8 }}>{t('An estimate from your recovery data, not medical advice.')}</div>
  </div>
}
