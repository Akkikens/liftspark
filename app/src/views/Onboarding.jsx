// Liftspark's first-run onboarding: one question per screen, saved as it goes, ending in a
// personalized starter plan. Answers live in S.lsOnboarding.a while it runs and are written through
// to the stores the rest of the app reads (lsProfile, unit, bodyweight, equipProfiles, reminder,
// routines/week) as each screen is answered, so quitting halfway loses nothing.
//
// Shown on a genuine first launch (App.jsx) and again from Settings → "Redo onboarding".
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { localTZ, todayISO, DAYS } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { health } from '../lib/ls-native.js'
import { enableHealth } from '../lib/health-sync.js'
import { syncReminder } from '../lib/mobile.js'
import { newProfile } from '../lib/equipment.js'
import { bmr, dailyGoal, macroGoals, ACTIVITY, OBJECTIVE } from '../lib/fuel.js'
import { generatePlan, applyPlan, CUSTOM_CHOICES, GOAL_OBJECTIVE } from '../lib/ls-plan.js'
import { WearablePicker } from '../components/Wearables.jsx'
import Icon from '../components/Icon.jsx'

const LB = 2.2046226218
const STEPS = ['welcome', 'goal', 'level', 'schedule', 'place', 'sex', 'body', 'activity', 'calories', 'health', 'wearable', 'notify', 'plan', 'done']
const LAST_Q = STEPS.indexOf('plan')

const GOAL_OPTS = [
  ['muscle', 'Build muscle', 'More size, with progressive volume', 'arm'],
  ['strength', 'Get stronger', 'Heavier lifts on the big movements', 'barbell'],
  ['fat', 'Lose fat', 'Keep your muscle while the scale goes down', 'flame'],
  ['fit', 'Stay fit', 'Feel good, move well, stay consistent', 'heart'],
  ['sport', 'Sport performance', 'Power and conditioning for your sport', 'bolt'],
]
const LEVEL_OPTS = [
  ['new', 'New to lifting', 'Under 6 months, or coming back after a long break'],
  ['some', 'Some experience', 'You know the main lifts and train on and off'],
  ['experienced', 'Experienced', 'Years of steady training'],
]
const PLACE_OPTS = [
  ['gym', 'Full gym', 'Barbells, racks, cables and machines', 'barbell'],
  ['home', 'Home with dumbbells', 'Dumbbells, a bench, maybe bands', 'kettlebell'],
  ['bodyweight', 'Bodyweight only', 'No equipment, anywhere', 'figureStrength'],
  ['custom', 'Let me choose', 'Tick exactly what you have', 'list'],
]
const SEX_OPTS = [['male', 'Male'], ['female', 'Female'], ['other', 'Prefer not to say']]
const ACTIVITY_OPTS = [
  ['sedentary', 'Mostly sitting', 'Desk job, little walking'],
  ['light', 'Lightly active', 'On your feet some of the day'],
  ['moderate', 'Active', 'Walk a lot or a physical job'],
  ['active', 'Very active', 'Physical job plus daily exercise'],
  ['athlete', 'Athlete', 'Training hard most days'],
]

const nowYear = () => new Date().getFullYear()

export default function Onboarding() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const needsMobile = useStore(s => s.needsMobileOnboarding)
  const nav = useNavigate()
  const ob = S.lsOnboarding || {}
  const a = ob.a || {}
  const step = Math.min(STEPS.length - 1, Math.max(0, ob.step ?? 0))
  const name = STEPS[step]
  const [dir, setDir] = useState('fwd')
  const headRef = useRef(null)

  // Every answer goes straight into the state: the step and the answers, plus wherever it belongs.
  const save = (patch, write) => update(s => {
    s.lsOnboarding = { ...(s.lsOnboarding || {}), a: { ...((s.lsOnboarding || {}).a || {}), ...patch } }
    if (write) write(s)
  })
  const go = n => {
    setDir(n < step ? 'back' : 'fwd')
    update(s => { s.lsOnboarding = { ...(s.lsOnboarding || {}), step: n } })
  }
  const next = () => go(step + 1)
  const back = () => go(Math.max(1, step - 1))
  useEffect(() => { headRef.current?.focus({ preventScroll: true }); window.scrollTo?.(0, 0) }, [step])

  const finish = () => {
    update(s => { s.lsOnboarded = true; s.lsOnboarding = null })
    if (needsMobile) useStore.getState().chooseLocalMode()
    nav('/home', { replace: true })
  }

  const props = { a, save, next, S, update }
  const progress = step === 0 || name === 'done' ? null : step / LAST_Q

  return <div className="lob" data-step={name}>
    {progress != null && <div className="lob-top">
      <button className="lob-back" onClick={back} aria-label={t('Back')} disabled={step <= 1}><Icon name="chevronLeft" /></button>
      <div className="lob-progress" role="progressbar" aria-label={t('Setup progress')} aria-valuemin={0} aria-valuemax={LAST_Q} aria-valuenow={step}
        aria-valuetext={t('Step {0} of {1}', step, LAST_Q)}><i style={{ width: Math.round(progress * 100) + '%' }} /></div>
      <span className="lob-count" aria-hidden="true">{step}/{LAST_Q}</span>
    </div>}
    <div className={'lob-body lob-dir-' + dir} key={name}>
      <div ref={headRef} tabIndex={-1} className="lob-focus">
        {name === 'welcome' && <Welcome onStart={() => {
          update(s => { s.lsOnboarding = { ...(s.lsOnboarding || {}), step: 1, a: (s.lsOnboarding || {}).a || {} } })
          setDir('fwd')
        }} />}
        {name === 'goal' && <Goal {...props} />}
        {name === 'level' && <Level {...props} />}
        {name === 'schedule' && <Schedule {...props} />}
        {name === 'place' && <Place {...props} />}
        {name === 'sex' && <Sex {...props} />}
        {name === 'body' && <Body {...props} />}
        {name === 'activity' && <Activity {...props} />}
        {name === 'calories' && <Calories {...props} />}
        {name === 'health' && <HealthStep {...props} />}
        {name === 'wearable' && <WearableStep {...props} />}
        {name === 'notify' && <Notify {...props} />}
        {name === 'plan' && <PlanStep {...props} />}
        {name === 'done' && <Done a={a} onGo={finish} />}
      </div>
    </div>
  </div>
}

// ── Building blocks ────────────────────────────────────────────────────────────────────────

function Q({ kicker, title, sub, children, footer }) {
  return <>
    {kicker && <div className="lob-kicker">{kicker}</div>}
    <h1 className="lob-title">{title}</h1>
    {sub && <p className="lob-sub">{sub}</p>}
    <div className="lob-content">{children}</div>
    {footer && <div className="lob-foot">{footer}</div>}
  </>
}

function Choices({ label, options, value, onPick, columns }) {
  return <div className={'lob-choices' + (columns ? ' cols' : '')} role="radiogroup" aria-label={label}>
    {options.map(([id, title, sub, icon]) => <button key={id} role="radio" aria-checked={value === id}
      className={'lob-choice' + (value === id ? ' on' : '')} onClick={() => onPick(id)}>
      {icon && <span className="lob-choice-ic" aria-hidden="true"><Icon name={icon} /></span>}
      <span className="lob-choice-t"><b>{t(title)}</b>{sub && <small>{t(sub)}</small>}</span>
      <span className="lob-tick" aria-hidden="true"><Icon name="check" /></span>
    </button>)}
  </div>
}

const Primary = ({ children, ...rest }) => <button className="btn primary pill lob-cta" {...rest}>{children}</button>
const Skip = ({ children, ...rest }) => <button className="lob-skip" {...rest}>{children || t('Skip for now')}</button>

function Stepper({ label, value, min, max, step = 1, format = v => v, onChange }) {
  return <div className="lob-stepper" role="group" aria-label={label}>
    <button onClick={() => onChange(Math.max(min, value - step))} aria-label={t('Less')} disabled={value <= min}><Icon name="minus" /></button>
    <output aria-live="polite">{format(value)}</output>
    <button onClick={() => onChange(Math.min(max, value + step))} aria-label={t('More')} disabled={value >= max}><Icon name="plus" /></button>
  </div>
}

// ── Steps ─────────────────────────────────────────────────────────────────────────────────

function Welcome({ onStart }) {
  return <div className="lob-hero">
    <div className="lob-hero-art" aria-hidden="true">
      <svg viewBox="0 0 64 64" width="92" height="92"><defs><linearGradient id="obg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff6a2b" /><stop offset="1" stopColor="#ff2f7d" /></linearGradient></defs>
        <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#obg)" /><path d="M35 12 L22 36 h9 l-3 16 l14-25 h-9 z" fill="#fff" /></svg>
      <svg className="lob-pulse" viewBox="0 0 320 60" preserveAspectRatio="none"><path d="M0 30 H110 l10 -18 l12 40 l12 -50 l12 46 l8 -18 H320" /></svg>
    </div>
    <h1 className="lob-hero-t">{t('Train smarter.')}<br /><span>{t('Feel every rep.')}</span></h1>
    <ul className="lob-hero-list">
      <li style={{ '--i': 0 }}><Icon name="clipboard" /><span><b>{t('A plan built for you')}</b>{t('Sets, rest timers and progression that adapt.')}</span></li>
      <li style={{ '--i': 1 }}><Icon name="heart" /><span><b>{t('Live heart rate & strain')}</b>{t('From your watch, WHOOP, Garmin or a strap.')}</span></li>
      <li style={{ '--i': 2 }}><Icon name="flame" /><span><b>{t('Calories in and out')}</b>{t('Burned from training, eaten from food search and barcodes.')}</span></li>
      <li style={{ '--i': 3 }}><Icon name="share" /><span><b>{t('Strava-ready')}</b>{t('Workouts flow to Strava through Apple Health.')}</span></li>
    </ul>
    <Primary onClick={onStart}>{t('Get started')}</Primary>
    <div className="lob-fine">{t('About two minutes. Your data stays on this phone.')}</div>
  </div>
}

function Goal({ a, save, next }) {
  return <Q kicker={t('Your goal')} title={t('What are you training for?')} sub={t('This shapes your plan and your daily calorie target.')}>
    <Choices label={t('Goal')} options={GOAL_OPTS} value={a.goal}
      onPick={goal => { save({ goal }, s => { s.lsProfile = { ...(s.lsProfile || {}), objective: GOAL_OBJECTIVE[goal], goal } }); setTimeout(next, 180) }} />
  </Q>
}

function Level({ a, save, next }) {
  return <Q kicker={t('Experience')} title={t('How much have you lifted?')} sub={t('Beginners get fewer sets and simpler moves to start.')}>
    <Choices label={t('Experience')} options={LEVEL_OPTS} value={a.level} onPick={level => { save({ level }); setTimeout(next, 180) }} />
  </Q>
}

function Schedule({ a, save, next }) {
  const days = a.days ?? 3, minutes = a.minutes ?? 60
  useEffect(() => { if (a.days == null) save({ days, minutes }) }, [])
  return <Q kicker={t('Schedule')} title={t('How often can you train?')} sub={t('Be realistic: a plan you keep beats a perfect one you skip.')}
    footer={<Primary onClick={next}>{t('Continue')}</Primary>}>
    <div className="lob-label">{t('Days per week')}</div>
    <div className="lob-pills" role="radiogroup" aria-label={t('Days per week')}>
      {[2, 3, 4, 5, 6].map(n => <button key={n} role="radio" aria-checked={days === n} className={'lob-pill' + (days === n ? ' on' : '')} onClick={() => save({ days: n })}>{n}</button>)}
    </div>
    <div className="lob-label">{t('Session length')}</div>
    <div className="lob-pills" role="radiogroup" aria-label={t('Session length')}>
      {[30, 45, 60, 75, 90].map(n => <button key={n} role="radio" aria-checked={minutes === n} className={'lob-pill wide' + (minutes === n ? ' on' : '')} onClick={() => save({ minutes: n })}>{t('{0} min', n)}</button>)}
    </div>
  </Q>
}

function Place({ a, save, next, update }) {
  const place = a.place
  const custom = a.equipment || []
  const writeEquip = (pl, eq) => update(s => {
    s.equipProfiles = (s.equipProfiles || []).filter(p => !p.ls)
    if (pl === 'gym') { s.equipFilterOn = false; s.activeEquipId = null; return }
    const p = { ...newProfile(pl === 'home' ? t('Home') : pl === 'bodyweight' ? t('Bodyweight') : t('My equipment')), ls: true,
      equipment: pl === 'home' ? ['dumbbell', 'band', 'resistance band', 'bench', 'pull-up bar', 'stability ball'] : pl === 'bodyweight' ? ['pull-up bar'] : eq }
    s.equipProfiles.push(p); s.activeEquipId = p.id; s.equipFilterOn = true
  })
  return <Q kicker={t('Equipment')} title={t('Where do you train?')} sub={t('We only pick exercises you can actually do.')}
    footer={place === 'custom' && <Primary onClick={() => { writeEquip('custom', custom); next() }}>{t('Continue')}</Primary>}>
    <Choices label={t('Where you train')} options={PLACE_OPTS} value={place}
      onPick={pl => { save({ place: pl }); if (pl !== 'custom') { writeEquip(pl); setTimeout(next, 180) } }} />
    {place === 'custom' && <div className="lob-chips" role="group" aria-label={t('Your equipment')}>
      {CUSTOM_CHOICES.map(e => { const on = custom.includes(e); return <button key={e} aria-pressed={on} className={'lob-chip' + (on ? ' on' : '')}
        onClick={() => save({ equipment: on ? custom.filter(x => x !== e) : [...custom, e] })}>{t(e)}</button> })}
    </div>}
  </Q>
}

function Sex({ a, save, next }) {
  return <Q kicker={t('About you')} title={t('Which formula should we use?')}
    sub={t('Resting calorie burn is estimated with the Mifflin–St Jeor equation, which has a version for male and female bodies. Prefer not to say and we use the average of both, which is within a few percent.')}>
    <Choices label={t('Sex for calorie formulas')} options={SEX_OPTS.map(([id, l]) => [id, l])} value={a.sex}
      onPick={sex => { save({ sex }, s => { s.lsProfile = { ...(s.lsProfile || {}), sex: sex === 'other' ? null : sex } }); setTimeout(next, 180) }} />
  </Q>
}

function Body({ a, save, next, S }) {
  const metric = (a.units || (S.unit === 'lb' ? 'imperial' : 'metric')) === 'metric'
  const age = a.age ?? 30
  const cm = a.heightCm ?? 175
  const kg = a.weightKg ?? 75
  const setUnits = u => {
    save({ units: u })
    useStore.getState().setUnit(u === 'metric' ? 'kg' : 'lb', { convert: true })
  }
  const commit = () => {
    save({ age, heightCm: cm, weightKg: kg }, s => {
      s.lsProfile = { ...(s.lsProfile || {}), birthYear: nowYear() - age, heightCm: Math.round(cm), weightKg: Math.round(kg * 10) / 10, heightUnit: metric ? 'cm' : 'ft' }
      const d = todayISO(), w = s.unit === 'lb' ? Math.round(kg * LB * 10) / 10 : Math.round(kg * 10) / 10
      s.bodyweight = [...(s.bodyweight || []).filter(b => b.d !== d), { d, w, t: Date.now() }]
    })
    next()
  }
  const ft = Math.floor(cm / 2.54 / 12), inch = Math.round(cm / 2.54 - ft * 12)
  return <Q kicker={t('About you')} title={t('Your body, for the maths')} sub={t('Age, height and weight set your calorie target and heart-rate zones. Only stored on this phone.')}
    footer={<Primary onClick={commit}>{t('Continue')}</Primary>}>
    <div className="lob-seg" role="radiogroup" aria-label={t('Units')}>
      <button role="radio" aria-checked={metric} className={metric ? 'on' : ''} onClick={() => setUnits('metric')}>{t('kg · cm')}</button>
      <button role="radio" aria-checked={!metric} className={!metric ? 'on' : ''} onClick={() => setUnits('imperial')}>{t('lb · ft')}</button>
    </div>
    <div className="lob-field"><span>{t('Age')}</span><Stepper label={t('Age')} value={age} min={14} max={90} onChange={v => save({ age: v })} format={v => t('{0} yrs', v)} /></div>
    <div className="lob-field"><span>{t('Height')}</span>{metric
      ? <Stepper label={t('Height')} value={Math.round(cm)} min={120} max={230} onChange={v => save({ heightCm: v })} format={v => v + ' cm'} />
      : <Stepper label={t('Height')} value={Math.round(cm / 2.54)} min={48} max={90} onChange={v => save({ heightCm: v * 2.54 })} format={() => `${ft}′ ${inch}″`} />}</div>
    <div className="lob-field"><span>{t('Weight')}</span>{metric
      ? <Stepper label={t('Weight')} value={Math.round(kg)} min={35} max={250} onChange={v => save({ weightKg: v })} format={v => v + ' kg'} />
      : <Stepper label={t('Weight')} value={Math.round(kg * LB)} min={77} max={550} onChange={v => save({ weightKg: v / LB })} format={v => v + ' lb'} />}</div>
  </Q>
}

function Activity({ a, save, next }) {
  return <Q kicker={t('About you')} title={t('Outside the gym, how active are you?')} sub={t('Your everyday movement, not your workouts: those are counted separately.')}>
    <Choices label={t('Daily activity')} options={ACTIVITY_OPTS} value={a.activity}
      onPick={activity => { save({ activity }, s => { s.lsProfile = { ...(s.lsProfile || {}), activity } }); setTimeout(next, 180) }} />
  </Q>
}

function Calories({ a, save, next, S }) {
  const lp = S.lsProfile || {}
  const age = a.age ?? 30, kg = a.weightKg ?? 75
  const base = bmr({ kg, cm: a.heightCm ?? 175, age, sex: lp.sex })
  const tdee = Math.round(base * (ACTIVITY[lp.activity] || ACTIVITY.moderate))
  const adj = OBJECTIVE[lp.objective] ?? 0
  const suggested = dailyGoal({ ...lp, goalKcal: null }, kg, age)
  const [kcal, setKcal] = useState(Number(lp.goalKcal) || suggested)
  const macros = macroGoals(kcal, kg)
  const keep = () => {
    save({ kcal }, s => {
      const p = { ...(s.lsProfile || {}) }
      if (kcal === suggested) delete p.goalKcal; else p.goalKcal = kcal
      s.lsProfile = p
    })
    next()
  }
  return <Q kicker={t('Fuel')} title={t('Your daily target')} sub={t('Edit it any time in Fuel.')} footer={<Primary onClick={keep}>{t('Looks good')}</Primary>}>
    <div className="lob-kcal">
      <Stepper label={t('Daily calories')} value={kcal} min={1200} max={5000} step={50} onChange={setKcal} format={v => v.toLocaleString()} />
      <div className="lob-kcal-u">{t('kcal per day')}</div>
    </div>
    <div className="lob-maths">
      <div><span>{t('Resting burn')}</span><b>{base.toLocaleString()}</b></div>
      <div><span>{t('With daily activity')}</span><b>{tdee.toLocaleString()}</b></div>
      <div><span>{adj < 0 ? t('Deficit to lose fat') : adj > 0 ? t('Surplus to build muscle') : t('Maintenance')}</span><b>{adj > 0 ? '+' : ''}{adj}</b></div>
    </div>
    <div className="lob-macros">
      <div style={{ '--c': 'var(--z2)' }}><b>{macros.p} g</b><span>{t('Protein')}</span></div>
      <div style={{ '--c': 'var(--z3)' }}><b>{macros.c} g</b><span>{t('Carbs')}</span></div>
      <div style={{ '--c': 'var(--z1)' }}><b>{macros.f} g</b><span>{t('Fat')}</span></div>
    </div>
    {kcal !== suggested && <button className="lob-skip" onClick={() => setKcal(suggested)}>{t('Reset to {0}', suggested.toLocaleString())}</button>}
    <div className="lob-fine">{t('Estimates, not medical advice.')}</div>
  </Q>
}

function HealthStep({ save, next }) {
  const [busy, setBusy] = useState(false)
  const allow = async () => {
    setBusy(true)
    try {
      const r = await enableHealth(useStore.getState().S)
      await health.request()
      save({ health: r?.reason === 'unsupported' ? 'unsupported' : 'asked' })
    } finally { setBusy(false); next() }
  }
  return <Q kicker={t('Connect')} title={t('Apple Health')} sub={t('Next, iOS asks what Liftspark may read and write. Here is what each side is for:')}
    footer={<><Primary onClick={allow} disabled={busy}>{t('Continue to Health')}</Primary><Skip onClick={() => { save({ health: 'skipped' }); next() }} /></>}>
    <div className="lob-perm">
      <div><span className="lob-perm-ic"><Icon name="download" /></span><span><b>{t('Read')}</b>{t('Heart rate, active energy, resting heart rate, HRV, sleep, steps and weight, from Apple Watch, Garmin, Oura and others.')}</span></div>
      <div><span className="lob-perm-ic"><Icon name="share" /></span><span><b>{t('Write')}</b>{t('Finished workouts with heart rate and calories, weigh-ins and food energy, so Strava and other apps can import them.')}</span></div>
    </div>
    <div className="lob-fine">{t('Health data never leaves your phone through Liftspark.')}</div>
  </Q>
}

function WearableStep({ save, next }) {
  return <Q kicker={t('Connect')} title={t('Connect your wearable')} sub={t('For live heart rate and strain while you lift. You can do this later from Home.')}
    footer={<><Primary onClick={next}>{t('Continue')}</Primary><Skip onClick={() => { save({ wearable: 'skipped' }); next() }} /></>}>
    <WearablePicker onDone={() => save({ wearable: 'connected' })} />
    <div className="lob-fine">{t('Strava: in the Strava app, You → Settings → Applications, Services, and Devices → Health. Your Liftspark workouts then sync automatically.')}</div>
  </Q>
}

function Notify({ a, save, next, S, update }) {
  const [time, setTime] = useState(S.reminder?.time || '18:00')
  const [busy, setBusy] = useState(false)
  const on = async () => {
    setBusy(true)
    update(s => { s.reminder = { ...(s.reminder || {}), on: true, time, tz: localTZ() } })
    const ok = await syncReminder(useStore.getState().S, true)
    if (!ok) update(s => { s.reminder = { ...(s.reminder || {}), on: false } })
    save({ notify: ok ? 'on' : 'denied' })
    setBusy(false); next()
  }
  return <Q kicker={t('Stay on track')} title={t('Workout reminders')} sub={t('A nudge on your training days, at the time you pick. Nothing else, no marketing.')}
    footer={<><Primary onClick={on} disabled={busy}>{t('Turn on reminders')}</Primary><Skip onClick={() => { save({ notify: 'skipped' }); next() }}>{t('Not now')}</Skip></>}>
    <div className="lob-notif" aria-hidden="true">
      <div className="lob-notif-card"><span className="lob-notif-ic" /><div><b>Liftspark</b><span>{t('Push Day today. Ready when you are.')}</span></div><small>{time}</small></div>
    </div>
    <label className="lob-field"><span>{t('Remind me at')}</span><input type="time" className="lob-time" value={time} onChange={e => setTime(e.target.value)} /></label>
  </Q>
}

function PlanStep({ a, save, next, update }) {
  const [variant, setVariant] = useState(a.planVariant || 0)
  const plan = useMemo(() => generatePlan(a, variant), [a.days, a.goal, a.level, a.minutes, a.place, (a.equipment || []).join(','), variant])
  const byId = Object.fromEntries(plan.routines.map(r => [r.id, r]))
  const order = [1, 2, 3, 4, 5, 6, 0]
  const accept = custom => {
    update(s => applyPlan(s, plan))
    save({ planVariant: variant, plan: plan.splitId })
    if (custom) { update(s => { s.lsOnboarded = true; s.lsOnboarding = null }); if (useStore.getState().needsMobileOnboarding) useStore.getState().chooseLocalMode(); window.location.hash = '#/plan'; return }
    next()
  }
  return <Q kicker={t('Your plan')} title={plan.label} sub={t('{0} days a week, about {1} minutes each, picked for your goal and equipment.', Object.keys(plan.week).length, a.minutes ?? 60)}
    footer={<><Primary onClick={() => accept(false)}>{t('Start this plan')}</Primary>
      <div className="lob-row2">
        {plan.options > 1 && <button className="lob-skip" onClick={() => setVariant(v => v + 1)}><Icon name="shuffle" /> {t('Try another split')}</button>}
        <button className="lob-skip" onClick={() => accept(true)}><Icon name="pencil" /> {t('Customize')}</button>
      </div>
      <Skip onClick={() => { save({ plan: 'skipped' }); next() }}>{t('I’ll build my own')}</Skip></>}>
    <div className="lob-week" role="list" aria-label={t('Your week')}>
      {order.map(d => { const r = byId[plan.week[d]?.[0]]; return <div key={d} role="listitem" className={'lob-day' + (r ? ' on' : '')}>
        <span className="lob-day-d">{t(DAYS[d])}</span>
        {r ? <span className="lob-day-r"><b>{r.name}</b><small>{r.ex.slice(0, 3).map(e => EXIDX[e.id]?.n).filter(Boolean).join(' · ')}{r.ex.length > 3 ? ` +${r.ex.length - 3}` : ''}</small></span>
          : <span className="lob-day-r rest">{t('Rest')}</span>}
        {r && <span className="lob-day-n">{t('{0} ex', r.ex.length)}</span>}
      </div> })}
    </div>
  </Q>
}

function Done({ a, onGo }) {
  return <div className="lob-done">
    <div className="lob-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--a': (i * 360 / 14) + 'deg', '--d': (i % 3) * 60 + 'ms' }} />)}
      <svg viewBox="0 0 64 64" width="96" height="96"><circle cx="32" cy="32" r="28" fill="url(#dg)" /><defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff6a2b" /><stop offset="1" stopColor="#ff2f7d" /></linearGradient></defs>
        <path d="M20 33 l8 8 l16 -18" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
    <h1 className="lob-hero-t">{t('You’re all set.')}</h1>
    <p className="lob-sub">{a.plan && a.plan !== 'skipped' ? t('Your plan is on your Home screen. Your first session is one tap away.') : t('Your Home screen is ready. Pick a plan whenever you like.')}</p>
    <Primary onClick={onGo}>{t('Let’s go')}</Primary>
  </div>
}
