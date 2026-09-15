import { useNavigate } from 'react-router-dom'

export function TopBar({ title, backTo, onBack }) {
  const nav = useNavigate()
  return (
    <div className="topbar">
      <button
        type="button"
        className="back"
        aria-label="Kembali"
        onClick={() => {
          if (onBack) onBack()
          else if (backTo) nav(backTo)
          else nav(-1)
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div className="tt">{title}</div>
    </div>
  )
}

export function Chip({ label, on, onClick }) {
  return (
    <button type="button" className={`chip${on ? ' on' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          on={value === o.value}
          onClick={() => onChange(o.value)}
        />
      ))}
    </div>
  )
}

export function Card({ children, className = '', style, onClick }) {
  return (
    <div className={`card ${className}`.trim()} style={style} onClick={onClick} role={onClick ? 'button' : undefined}>
      {children}
    </div>
  )
}

export function ListItem({ barColor, avatar, title, subtitle, right, onClick }) {
  return (
    <div className="card li" style={{ padding: 12 }} onClick={onClick} role={onClick ? 'button' : undefined}>
      {barColor ? <div className="barL" style={{ background: barColor }} /> : null}
      {avatar ? (
        <div className="av" style={{ background: 'rgba(238,106,10,.12)', color: 'var(--orange)' }}>
          {avatar}
        </div>
      ) : null}
      <div className="main">
        <div className="n">{title}</div>
        {subtitle ? <div className="d">{subtitle}</div> : null}
      </div>
      {right != null ? <div className="r">{right}</div> : null}
    </div>
  )
}

export function AgingBuckets({ buckets = [0, 0, 0, 0] }) {
  const cells = [
    { l: 'Lancar', v: buckets[0], c: 'var(--green)' },
    { l: '1-30', v: buckets[1], c: 'var(--amber)' },
    { l: '31-60', v: buckets[2], c: '#FF8A3D' },
    { l: '60+', v: buckets[3], c: 'var(--pink)' },
  ]
  return (
    <div className="aging">
      {cells.map((b) => (
        <div key={b.l} className="b" style={{ borderColor: b.c }}>
          <div className="l">{b.l}</div>
          <div className="v" style={{ color: b.c }}>
            {typeof b.v === 'string' ? b.v : formatShort(b.v)}
          </div>
        </div>
      ))}
    </div>
  )
}

function formatShort(n) {
  const v = Number(n) || 0
  if (!v) return '0'
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'M'
  if (v >= 1e6) return Math.round(v / 1e6) + 'jt'
  if (v >= 1e3) return Math.round(v / 1e3) + 'rb'
  return String(Math.round(v))
}

export function Screen({ children, noNav = false }) {
  return <div className={`screen active-react${noNav ? ' no-nav' : ''}`}>{children}</div>
}
