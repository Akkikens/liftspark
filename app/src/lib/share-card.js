// The image that goes with a Strava (or Instagram) post: a 1080×1350 card with the workout's
// strain, time, calories, heart rate, zones and a body map of the muscles worked. Strava's API does
// not take photos from other apps, so the card is shared through the iOS share sheet and added to
// the post by hand, with the caption already on the clipboard.
import { musclesWorked, muscleDots } from './strain.js'
import { loadOfWorkouts, levelsOf, MUSCLES, INERT } from './muscles.js'
import { stravaCaption } from './ls-workout.js'
import { copyText } from './clipboard.js'
import { MOBILE, shareExportBlob } from './mobile.js'

const W = 1080, H = 1350
const ZC = ['#5b8cff', '#3ddc97', '#ffd34d', '#ff9d3d', '#ff3d6e']

function loadImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
const LEVEL_COLORS = ['#ffb057', '#ff6a2b', '#ff2f7d']
// The finish screen's anatomical body map (components/BodyMap.jsx, MuscleMap geometry), as one
// SVG with the front and back side by side, shaded l0–l4 in the spark colours.
const SHADE = ['#2a3054', '#7a3f3a', '#c4502f', '#ff6a2b', '#ff2f7d']
async function bodyMapSVG(load, body = 'male') {
  const paths = (await import('./body-paths.js')).default
  const g = paths[body] || paths.male
  const lv = levelsOf(load)
  const view = (v, dx) => {
    const [, , vw, vh] = v.vb.split(/\s+/).map(Number)
    const parts = INERT.flatMap(m => (v.p[m] || []).map(d => `<path d="${d}" fill="#1f2443"/>`))
      .concat(MUSCLES.flatMap(m => (v.p[m] || []).map(d => `<path d="${d}" fill="${SHADE[lv[m] || 0]}"/>`)))
    return { vw, vh, svg: `<svg x="${dx}" y="0" width="300" height="600" viewBox="${v.vb}">${parts.join('')}</svg>` }
  }
  const f = view(g.front, 0), b = view(g.back, 300)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">${f.svg}${b.svg}</svg>`
}

export async function renderShareCard(w, S) {
  const ls = w.ls || {}
  const load = musclesWorked(w)
  try { await Promise.all([document.fonts.load('800 120px "Barlow Condensed"'), document.fonts.load('600 32px Barlow')]) } catch { /* system font */ }
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')

  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0b0d1a'); bg.addColorStop(1, '#1a1440')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W - 120, 140, 10, W - 120, 140, 520)
  glow.addColorStop(0, 'rgba(255,90,60,.35)'); glow.addColorStop(1, 'rgba(255,90,60,0)')
  g.fillStyle = glow; g.fillRect(0, 0, W, H)

  const display = (size, weight = 800) => `${weight} ${size}px "Barlow Condensed", "Barlow", system-ui, sans-serif`
  const body = (size, weight = 600) => `${weight} ${size}px Barlow, system-ui, sans-serif`

  g.fillStyle = '#f3f0e8'
  g.font = display(46, 700)
  g.fillText((w.name || 'Strength training').slice(0, 34), 72, 120)
  g.fillStyle = 'rgba(243,240,232,.6)'
  g.font = body(30, 500)
  g.fillText(new Date(w.start || Date.now()).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), 72, 166)

  // Strain, the hero number.
  const sg = g.createLinearGradient(72, 220, 520, 420)
  sg.addColorStop(0, '#ff6a2b'); sg.addColorStop(1, '#ff2f7d')
  g.fillStyle = sg
  g.font = display(230)
  g.fillText(String(ls.strain ?? 0), 64, 410)
  const sw = g.measureText(String(ls.strain ?? 0)).width
  g.fillStyle = 'rgba(243,240,232,.7)'
  g.font = display(46, 700)
  g.fillText('STRAIN / 21', 84 + sw, 400)

  // Stats row.
  const stats = [
    [ls.minutes ? `${ls.minutes}` : '-', 'min'],
    [ls.kcal ? `${ls.kcal}` : '-', 'kcal'],
    [ls.avgHr ? `${ls.avgHr}` : '-', 'avg bpm'],
    [ls.maxHr ? `${ls.maxHr}` : '-', 'max bpm'],
  ]
  stats.forEach(([v, k], i) => {
    const x = 72 + i * 240
    g.fillStyle = '#f3f0e8'; g.font = display(88, 800); g.fillText(v, x, 560)
    g.fillStyle = 'rgba(243,240,232,.6)'; g.font = body(28, 600); g.fillText(k, x, 600)
  })

  // Zones bar.
  const zones = ls.zones || [0, 0, 0, 0, 0]
  const total = zones.reduce((a, b) => a + b, 0)
  if (total > 0) {
    let x = 72
    const bw = W - 144
    zones.forEach((s, i) => {
      const wdt = (s / total) * bw
      if (wdt < 1) return
      g.fillStyle = ZC[i]
      g.beginPath(); g.roundRect ? g.roundRect(x, 650, Math.max(4, wdt - 4), 26, 13) : g.rect(x, 650, wdt - 4, 26); g.fill()
      x += wdt
    })
    g.fillStyle = 'rgba(243,240,232,.6)'; g.font = body(26, 600)
    g.fillText(zones.map((s, i) => (s ? `Z${i + 1} ${Math.round(s / 60)}m` : '')).filter(Boolean).join('   '), 72, 720)
  }

  // Body map + top muscles.
  const img = await loadImage(await bodyMapSVG(loadOfWorkouts([w]), S?.body))
  g.drawImage(img, 40, 760, 600, 530)
  const dots = muscleDots(load).slice(0, 6)
  g.font = display(40, 700)
  dots.forEach((m, i) => {
    const y = 860 + i * 78
    g.fillStyle = '#f3f0e8'; g.fillText(cap(m.region), 680, y)
    for (let d = 0; d < 3; d++) {
      g.fillStyle = d < m.level ? LEVEL_COLORS[m.level - 1] : 'rgba(243,240,232,.15)'
      g.beginPath(); g.arc(692 + d * 32, y + 28, 10, 0, Math.PI * 2); g.fill()
    }
  })

  // Footer.
  g.fillStyle = 'rgba(243,240,232,.5)'; g.font = display(34, 700)
  g.fillText('LIFTSPARK', 72, H - 60)

  return await new Promise(r => c.toBlob(r, 'image/png'))
}

/** Share sheet with the card; the caption goes to the clipboard first. Returns 'shared' | 'downloaded'. */
export async function shareToStrava(w, S) {
  const caption = stravaCaption(w, S)
  await copyText(caption).catch(() => {})
  const blob = await renderShareCard(w, S)
  const name = `liftspark-${new Date(w.start || Date.now()).toISOString().slice(0, 10)}.png`
  if (MOBILE) { await shareExportBlob(blob, name); return 'shared' }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  return 'downloaded'
}
