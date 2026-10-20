// A progress ring in the spark gradient (strain, calories). `value` 0–1; children sit in the middle.
let uid = 0
export default function Ring({ value = 0, size = 132, stroke = 12, children, color }) {
  const id = 'lsr' + (++uid)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value || 0))
  return <div className="ls-ring" style={{ width: size, height: size }}>
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff6a2b" /><stop offset="1" stopColor="#ff2f7d" /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || `url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 600ms var(--ease)' }} />
    </svg>
    <div className="c">{children}</div>
  </div>
}
