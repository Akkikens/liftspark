import { useNavigate, useSearchParams } from 'react-router-dom'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { WearablePicker } from '../components/Wearables.jsx'

// "Connect your wearable": the device picker on its own screen (Home card, Settings, Devices).
export default function Connect() {
  const nav = useNavigate()
  const [q] = useSearchParams()
  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Connect your wearable')}</h1><div className="sub">{t('Pick what you wear. Each one takes about a minute.')}</div></div>
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="xmark" /></button>
    </div>
    <WearablePicker initial={q.get('kind')} onDone={() => {}} />
    <button className="ls-btn full" style={{ marginTop: 18 }} onClick={() => nav('/devices')}>{t('All devices & Health settings')}</button>
    <div style={{ height: 40 }} />
  </div>
}
