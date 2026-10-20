import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { icloudAvailable, syncNow } from '../lib/ls-icloud.js'
import { Switch } from './ui.jsx'

// Settings → Data & backup: iCloud sync on/off, when it last ran, and any error.
export default function ICloudRow() {
  const ic = useStore(s => s.S.icloud) || {}
  const update = useStore(s => s.update)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { icloudAvailable().then(setOk) }, [])
  if (!ok) return null
  const toggle = async on => {
    update(s => { s.icloud = { ...(s.icloud || {}), on } })
    if (on) { setBusy(true); await syncNow(); setBusy(false) }
  }
  return <div className="ls-card" style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
    <div className="ls-row" style={{ justifyContent: 'space-between', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{t('iCloud sync')}</div>
        <div className="ls-sub">{t('Workouts, plans, weigh-ins and food on all your iPhones, in your private iCloud. Apple Health data is never uploaded.')}</div>
      </div>
      <Switch checked={!!ic.on} disabled={busy} onChange={toggle} aria-label={t('iCloud sync')} />
    </div>
    {ic.on && <div className="ls-sub">{busy ? t('Syncing…') : ic.error ? t('Last sync failed: {0}', ic.error) : ic.at ? t('Synced {0}', new Date(ic.at).toLocaleString()) : t('Waiting for the first sync')}</div>}
    {ic.on && !busy && <button className="ls-btn" onClick={async () => { setBusy(true); await syncNow(); setBusy(false) }}>{t('Sync now')}</button>}
  </div>
}
