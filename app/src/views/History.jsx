import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { WorkoutRow, DayNoteRow, workoutDetailSheet, logPastWorkoutSheet } from '../sheets.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { dayNoteOf } from '../lib/day-notes.js'
import { fmtDate } from '../lib/format.js'

// Newest first: every workout, and in between them the days off you left a note on (#261). A
// note on a day that has a workout too stays in the day sheet; the workout speaks for that day.
export function historyRows(S) {
  const trained = new Set((S.workouts || []).map(w => w?.d))
  const notes = Object.keys(S.dayNotes || {}).filter(d => !trained.has(d)).map(d => ({ d, note: dayNoteOf(S, d) })).filter(x => x.note)
  // Liftspark: imported runs, rides and wearable workouts (lib/ls-import.js) sit in the same list.
  const acts = (S.activities || []).map(a => ({ d: a.d, a }))
  const rows = [...(S.workouts || []).map(w => ({ d: w.d, w })), ...acts, ...notes]
  // Stable, so workouts keep the order they are stored in (by day, then start) within a day.
  return rows.map((r, i) => [r, i]).sort((a, b) => (a[0].d < b[0].d ? 1 : a[0].d > b[0].d ? -1 : b[1] - a[1])).map(([r]) => r)
}

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const rows = historyRows(S)
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('History')}</h1><div className="sub">{tn('{0} workout', '{0} workouts', S.workouts.length)}</div></div></div>
    <Button icon="plus" onClick={logPastWorkoutSheet} style={{ marginBottom: 12 }}>{t('Log a past workout')}</Button>
    {rows.length ? <div className="list">{rows.map(r => r.w
      ? <WorkoutRow key={r.w.id} w={r.w} onClick={() => workoutDetailSheet(r.w)} />
      : r.a ? <ActivityRow key={r.a.id} a={r.a} />
      : <DayNoteRow key={'note-' + r.d} iso={r.d} note={r.note} />)}</div>
      : <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No workouts yet. Your first one will land here.')}</div>}
  </>
}

const SRC = { health: 'Apple Health', whoop: 'WHOOP', oura: 'Oura', file: 'File' }
function ActivityRow({ a }) {
  const min = Math.round((a.end - a.start) / 60000)
  const bits = [fmtDate(a.d, true), min > 0 && `${min} min`, a.distanceM > 0 && `${(a.distanceM / 1000).toFixed(1)} km`, a.kcal > 0 && `${Math.round(a.kcal)} kcal`, a.avgHr && `${a.avgHr} bpm`, a.source || SRC[a.src]].filter(Boolean)
  return <div className="item">
    <span className="lrow-i" style={{ width: 34, height: 34, borderRadius: 8, fontSize: 19, background: 'var(--surface-3)' }}><Icon name="figureRun" /></span>
    <div className="grow"><div className="tt">{a.name}</div><div className="ss">{bits.join(' · ')}</div></div>
    {a.strain != null && <span className="ls-strain-chip" aria-label={t('Strain {0}', a.strain)}>{a.strain}</span>}
  </div>
}
