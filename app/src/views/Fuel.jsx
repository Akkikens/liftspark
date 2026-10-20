import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { MEALS, MEAL_NAMES, searchFoods, foodByBarcode, entryFor, quickEntry, dayFood, totals, dailyGoal, macroGoals, addFood, removeFood, recentFoods } from '../lib/fuel.js'
import { bodyweightKg } from '../lib/ls-workout.js'
import { ageOf } from '../lib/strain.js'
import { health } from '../lib/ls-native.js'
import { loadHealth } from '../lib/health-sync.js'
import { scanCode } from '../lib/scan.js'
import { MOBILE } from '../lib/mobile.js'
import Ring from '../components/Ring.jsx'
import Icon from '../components/Icon.jsx'

const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

// Calories in and out for a day: what was eaten (by meal), the goal, and what Health says was burned.
export default function Fuel() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [day, setDay] = useState(todayISO())
  const [burn, setBurn] = useState(null)
  const kg = bodyweightKg(S)
  const profile = S.lsProfile || {}
  const goal = dailyGoal(profile, kg || 75, ageOf(profile))
  const macro = macroGoals(goal, kg)
  const entries = dayFood(S, day)
  const tot = totals(entries)
  const isToday = day === todayISO()

  useEffect(() => { if (isToday) health.today().then(setBurn).catch(() => {}) }, [day])
  const workoutKcal = (S.workouts || []).filter(w => w.d === day).reduce((a, w) => a + (w.ls?.kcal || 0), 0)
  const active = Math.round(burn?.activeKcal || workoutKcal || 0)
  const left = goal + (profile.addExercise !== false ? active : 0) - tot.kcal

  const openAdd = meal => useUI.getState().openSheet(close => <AddFood meal={meal} day={day} close={close} />)
  const del = id => { update(s => removeFood(s, day, id)); foodToHealth(id, null) }

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Fuel')}</h1><div className="sub">{isToday ? t('Today') : new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</div></div>
      <div className="hdr-actions">
        <button className="iconbtn" onClick={() => setDay(d => shift(d, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
        <button className="iconbtn" onClick={() => setDay(d => shift(d, 1))} disabled={isToday} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
      </div>
    </div>

    <div className="ls-card ls-row" style={{ gap: 18 }}>
      <Ring value={tot.kcal / Math.max(1, goal + active)} size={132}>
        <div className="ls-v" style={{ fontSize: 34 }}>{Math.abs(left)}</div>
        <div className="ls-sub">{left >= 0 ? t('kcal left') : t('kcal over')}</div>
      </Ring>
      <div style={{ flex: 1, display: 'grid', gap: 10 }}>
        <Stat k={t('Goal')} v={goal} />
        <Stat k={t('Eaten')} v={tot.kcal} />
        <Stat k={t('Burned (active)')} v={active} hint={burn?.activeKcal ? t('Apple Health') : workoutKcal ? t('Workouts') : null} />
      </div>
    </div>

    <div className="ls-grid3" style={{ marginTop: 10 }}>
      <Macro k={t('Protein')} v={tot.p} goal={macro.p} color="var(--z2)" />
      <Macro k={t('Carbs')} v={tot.c} goal={macro.c} color="var(--z3)" />
      <Macro k={t('Fat')} v={tot.f} goal={macro.f} color="var(--z1)" />
    </div>

    {MEALS.map(meal => {
      const list = entries.filter(e => e.meal === meal)
      const kcal = list.reduce((a, e) => a + e.kcal, 0)
      return <div key={meal}>
        <div className="ls-h ls-row" style={{ justifyContent: 'space-between' }}>
          <span>{t(MEAL_NAMES[meal])}{kcal ? <span className="ls-sub" style={{ marginInlineStart: 8 }}>{kcal} kcal</span> : null}</span>
          <button className="ls-btn" style={{ minHeight: 36 }} onClick={() => openAdd(meal)}><Icon name="plus" /> {t('Add')}</button>
        </div>
        {list.length > 0 && <div className="ls-card ls-list" style={{ padding: '4px 16px' }}>
          {list.map(e => <div key={e.id} className="ls-li">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
              <div className="ls-sub">{[e.brand, e.g ? e.g + ' g' : null, `P ${e.p} · C ${e.c} · F ${e.f}`].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="ls-v" style={{ fontSize: 22 }}>{e.kcal}</div>
            <button className="iconbtn" onClick={() => del(e.id)} aria-label={t('Remove {0}', e.name)}><Icon name="trash" /></button>
          </div>)}
        </div>}
      </div>
    })}
    <div className="ls-sub" style={{ margin: '24px 4px 120px' }}>{t('Food data from Open Food Facts (ODbL). Goal from your profile in Devices & Health.')}</div>
  </div>
}

const Stat = ({ k, v, hint }) => <div className="ls-row" style={{ justifyContent: 'space-between' }}>
  <span className="ls-k">{k}{hint ? <span className="ls-sub"> · {hint}</span> : null}</span><span className="ls-v" style={{ fontSize: 24 }}>{v}</span>
</div>

const Macro = ({ k, v, goal, color }) => <div className="ls-card" style={{ padding: 12 }}>
  <div className="ls-k">{k}</div>
  <div className="ls-v" style={{ fontSize: 24 }}>{Math.round(v)}<small>/{goal} g</small></div>
  <div style={{ height: 6, borderRadius: 9, background: 'var(--surface-2)', marginTop: 8, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: Math.min(100, (v / Math.max(1, goal)) * 100) + '%', background: color }} />
  </div>
</div>

function AddFood({ meal, day, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState(null)
  const [grams, setGrams] = useState(100)
  const [quick, setQuick] = useState(false)
  const [qk, setQk] = useState({ name: '', kcal: '', p: '', c: '', f: '' })
  const recent = useMemo(() => recentFoods(S), [S.food])
  const tm = useRef(null)

  useEffect(() => {
    clearTimeout(tm.current)
    if (q.trim().length < 2) { setResults([]); return }
    tm.current = setTimeout(async () => {
      setBusy(true)
      try { setResults(await searchFoods(q)) } catch { toast(t('Search needs a connection.')) } finally { setBusy(false) }
    }, 350)
    return () => clearTimeout(tm.current)
  }, [q])

  const log = entry => {
    update(s => addFood(s, day, entry))
    foodToHealth(entry.id, entry)
    toast(t('Added {0}', entry.name))
    close()
  }
  const scan = async () => {
    try {
      const code = await scanCode()
      if (!code) return
      setBusy(true)
      const f = await foodByBarcode(code.value)
      setBusy(false)
      if (f) { setPicked(f); setGrams(f.serving || 100) } else toast(t('Not in Open Food Facts yet. Try a search or quick add.'))
    } catch { setBusy(false); toast(t('Couldn’t open the camera.')) }
  }

  if (picked) return <div>
    <h3>{picked.name}</h3>
    <div className="ls-sub" style={{ marginBottom: 12 }}>{[picked.brand, `${picked.per100.kcal} kcal / 100 g`].filter(Boolean).join(' · ')}</div>
    <label className="ls-k">{t('Amount (g)')}
      <input className="ls-input" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} />
    </label>
    {picked.serving && <button className="ls-btn" style={{ marginTop: 8 }} onClick={() => setGrams(picked.serving)}>{t('1 serving')} ({picked.servingLabel || picked.serving + ' g'})</button>}
    <div className="ls-v" style={{ margin: '14px 0' }}>{Math.round(picked.per100.kcal * (Number(grams) || 0) / 100)}<small>kcal</small></div>
    <button className="ls-btn pri full" disabled={!(Number(grams) > 0)} onClick={() => log(entryFor(picked, Number(grams), meal))}>{t('Add to {0}', t(MEAL_NAMES[meal]))}</button>
    <button className="ls-btn full" style={{ marginTop: 8 }} onClick={() => setPicked(null)}>{t('Back')}</button>
  </div>

  if (quick) return <div style={{ display: 'grid', gap: 10 }}>
    <h3>{t('Quick add')}</h3>
    <input className="ls-input" placeholder={t('Name (optional)')} value={qk.name} onChange={e => setQk({ ...qk, name: e.target.value })} />
    <input className="ls-input" inputMode="numeric" placeholder={t('Calories')} value={qk.kcal} onChange={e => setQk({ ...qk, kcal: e.target.value })} />
    <div className="ls-grid3">
      {['p', 'c', 'f'].map(k => <input key={k} className="ls-input" inputMode="decimal" placeholder={{ p: t('Protein g'), c: t('Carbs g'), f: t('Fat g') }[k]} value={qk[k]} onChange={e => setQk({ ...qk, [k]: e.target.value })} />)}
    </div>
    <button className="ls-btn pri full" disabled={!(Number(qk.kcal) > 0)} onClick={() => log(quickEntry({ ...qk, name: qk.name || t('Quick add') }, meal))}>{t('Add')}</button>
    <button className="ls-btn full" onClick={() => setQuick(false)}>{t('Back')}</button>
  </div>

  return <div>
    <h3>{t('Add to {0}', t(MEAL_NAMES[meal]))}</h3>
    <div className="ls-row" style={{ gap: 8, margin: '10px 0' }}>
      <input className="ls-input" autoFocus placeholder={t('Search foods')} value={q} onChange={e => setQ(e.target.value)} />
      {MOBILE && <button className="ls-btn" onClick={scan} aria-label={t('Scan barcode')}><Icon name="qr" /></button>}
    </div>
    <button className="ls-btn full" onClick={() => setQuick(true)}>{t('Quick add calories')}</button>
    {busy && <div className="ls-sub" style={{ marginTop: 10 }}>{t('Searching…')}</div>}
    <div className="ls-list" style={{ marginTop: 6, maxHeight: '52vh', overflowY: 'auto' }}>
      {(q.trim().length >= 2 ? results : []).map((f, i) => <button key={(f.code || '') + i} className="ls-li" style={{ textAlign: 'start', width: '100%' }} onClick={() => { setPicked(f); setGrams(f.serving || 100) }}>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{f.name}</div><div className="ls-sub">{[f.brand, `${f.per100.kcal} kcal / 100 g`].filter(Boolean).join(' · ')}</div></div>
        <Icon name="plus" />
      </button>)}
      {q.trim().length < 2 && recent.length > 0 && <>
        <div className="ls-k" style={{ margin: '12px 0 4px' }}>{t('Recent')}</div>
        {recent.map(e => <button key={e.id} className="ls-li" style={{ textAlign: 'start', width: '100%' }} onClick={() => log({ ...e, id: Date.now().toString(36), meal, t: Date.now() })}>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{e.name}</div><div className="ls-sub">{e.g ? e.g + ' g · ' : ''}{e.kcal} kcal</div></div>
          <Icon name="plus" />
        </button>)}
      </>}
    </div>
  </div>
}

// Food energy goes to Apple Health only while "Sync with Apple Health" is on; a deleted entry is
// written as zero, which removes its sample (HealthKitPlugin.saveDietaryEnergy).
async function foodToHealth(id, entry) {
  const h = await loadHealth().catch(() => null)
  if (!h?.on) return
  health.saveDietaryEnergy({ id: 'liftspark-food-' + id, time: entry?.t || Date.now(), kcal: entry ? entry.kcal : 0 }).catch(() => {})
}
