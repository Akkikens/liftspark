import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'

// The privacy policy, in the app so it reads offline; the same text is PRIVACY.md in the repo.
// Not translated: it is a policy, and the English is the one that counts.
export default function Privacy() {
  const nav = useNavigate()
  return <div className="narrow ls-legal">
    <div className="hdr">
      <div><h1>{t('Privacy')}</h1><div className="sub">Last updated 19 October 2026</div></div>
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="xmark" /></button>
    </div>
    <p>Liftspark has no account and no Liftspark cloud.</p>
    <h2>What stays on your phone</h2>
    <p>Everything you log (workouts, plans, body weight, food, settings and Bluetooth heart-rate traces) is stored on your iPhone. It leaves only when you export a backup, share a workout, or turn on iCloud sync to your own private iCloud database, which the developer cannot read.</p>
    <h2>Apple Health</h2>
    <p>With your permission Liftspark reads heart rate, workouts, active energy, steps, weight, resting heart rate, HRV and sleep, and writes workouts, weigh-ins and food energy. Health data is used only to show your numbers in the app. It is never sent to the developer, never used for advertising, never sold, and not stored in Liftspark backups or exports (only summaries such as a workout’s average heart rate).</p>
    <h2>Services you choose</h2>
    <p>Food searches and barcodes go to Open Food Facts (and USDA FoodData Central for generic foods): only the search text or barcode. Strava, WHOOP and Oura are contacted only after you sign in to them; the sign-in passes through a small Liftspark backend that exchanges the one-time code and stores nothing. Tokens stay in your iPhone’s Keychain.</p>
    <h2>What the developer collects</h2>
    <p>Nothing. No analytics, no advertising SDKs, no tracking, no crash reporting.</p>
    <h2>Deleting your data</h2>
    <p>Settings → Data &amp; backup → Reset everything deletes all Liftspark data on the phone, signs out of connected services and forgets paired sensors. Data already written to Apple Health can be removed in the Health app.</p>
    <p className="dim small">Training numbers such as strain, zones and calories are estimates, not medical advice.</p>
  </div>
}
