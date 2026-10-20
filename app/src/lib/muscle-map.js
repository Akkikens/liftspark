// Liftspark's own body map: a simple front and back figure, drawn here as SVG (no third-party
// artwork), with each region coloured by how hard the workout hit it. Used on the finish screen
// (components/MuscleMap.jsx) and baked into the shareable image (lib/share-card.js).
//
// Shapes are drawn for the figure's left half in a 200×420 box and mirrored for the right.

const NEUTRAL = '#262b4d'
const OUTLINE = '#343a66'
export const LEVEL_COLORS = ['#ffb057', '#ff6a2b', '#ff2f7d']

const FRONT = [
  ['traps', 'path', { d: 'M88 62 L70 74 L92 74 Z' }],
  ['shoulders', 'ellipse', { cx: 60, cy: 88, rx: 17, ry: 15 }],
  ['chest', 'path', { d: 'M98 76 C82 74 70 81 67 95 C69 111 84 117 98 113 Z' }],
  ['biceps', 'ellipse', { cx: 51, cy: 122, rx: 10, ry: 19 }],
  ['forearms', 'path', { d: 'M43 145 L59 145 L54 194 L40 194 Z' }],
  ['abs', 'rect', { x: 86, y: 120, width: 12, height: 17, rx: 3 }],
  ['abs', 'rect', { x: 86, y: 141, width: 12, height: 17, rx: 3 }],
  ['abs', 'rect', { x: 86, y: 162, width: 12, height: 17, rx: 3 }],
  ['obliques', 'path', { d: 'M83 122 L72 119 L70 168 L83 179 Z' }],
  ['quads', 'path', { d: 'M74 208 C69 240 72 270 80 292 L95 292 C97 262 97 232 95 208 Z' }],
  ['adductors', 'path', { d: 'M96 210 L99 210 L99 262 L95 268 Z' }],
  ['calves', 'path', { d: 'M78 304 C74 330 78 358 82 382 L92 382 C95 356 95 330 93 304 Z' }],
]
const BACK = [
  ['traps', 'path', { d: 'M100 58 L76 76 L100 104 Z' }],
  ['shoulders', 'ellipse', { cx: 60, cy: 88, rx: 17, ry: 15 }],
  ['upper back', 'path', { d: 'M98 106 L77 97 L72 117 L98 127 Z' }],
  ['lats', 'path', { d: 'M74 120 C70 140 76 160 90 171 L98 165 L98 130 Z' }],
  ['triceps', 'ellipse', { cx: 51, cy: 122, rx: 10, ry: 19 }],
  ['forearms', 'path', { d: 'M43 145 L59 145 L54 194 L40 194 Z' }],
  ['lower back', 'path', { d: 'M89 170 L98 165 L98 190 L85 190 Z' }],
  ['glutes', 'path', { d: 'M76 193 C72 214 82 228 98 226 L98 193 Z' }],
  ['hamstrings', 'path', { d: 'M76 232 C72 260 76 280 82 296 L95 296 C97 270 97 248 97 232 Z' }],
  ['calves', 'path', { d: 'M78 304 C70 330 76 352 84 372 L94 372 C97 350 97 326 94 304 Z' }],
]
// The silhouette both figures share (head, neck, arms, hands, pelvis, knees, feet).
const BODY = [
  ['circle', { cx: 100, cy: 34, r: 21 }],
  ['rect', { x: 91, y: 54, width: 18, height: 14, rx: 4 }],
  ['circle', { cx: 46, cy: 205, r: 8 }],
  ['circle', { cx: 154, cy: 205, r: 8 }],
  ['path', { d: 'M72 182 L128 182 L121 207 L79 207 Z' }],
  ['ellipse', { cx: 86, cy: 297, rx: 9, ry: 6 }],
  ['ellipse', { cx: 114, cy: 297, rx: 9, ry: 6 }],
  ['ellipse', { cx: 86, cy: 392, rx: 11, ry: 7 }],
  ['ellipse', { cx: 114, cy: 392, rx: 11, ry: 7 }],
]

const attrs = o => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ')
const shape = (tag, a, fill, stroke = OUTLINE) => `<${tag} ${attrs(a)} fill="${fill}" stroke="${stroke}" stroke-width="1.2" />`

function levelFor(load, region) {
  const max = Math.max(0, ...Object.values(load || {}))
  const v = load?.[region] || 0
  if (!max || !v) return 0
  const r = v / max
  return r > 0.66 ? 3 : r > 0.33 ? 2 : 1
}

function figure(regions, load, label) {
  const half = regions.map(([region, tag, a]) => {
    const lv = levelFor(load, region)
    return shape(tag, a, lv ? LEVEL_COLORS[lv - 1] : NEUTRAL)
  }).join('')
  const body = BODY.map(([tag, a]) => shape(tag, a, NEUTRAL)).join('')
  return `<g>${body}${half}<g transform="translate(200,0) scale(-1,1)">${half}</g>`
    + (label ? `<text x="100" y="416" text-anchor="middle" font-family="Barlow, sans-serif" font-size="13" fill="#8f95b8">${label}</text>` : '')
    + '</g>'
}

/** Front and back side by side as one SVG string. */
export function muscleMapSVG(load, { width = 300, labels = true } = {}) {
  const h = Math.round(width * 420 / 400)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 420" width="${width}" height="${h}">`
    + figure(FRONT, load, labels ? 'Front' : '')
    + `<g transform="translate(200,0)">${figure(BACK, load, labels ? 'Back' : '')}</g>`
    + '</svg>'
}
