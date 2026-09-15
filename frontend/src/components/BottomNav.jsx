import { NavLink, useLocation, useNavigate } from 'react-router-dom'

const ICONS = {
  home: <path d="M4 12l8-7 8 7v8H4z" />,
  leads: <path d="M6 4h12v16l-6-3-6 3z" />,
  promo: <path d="M4 11h16v9H4z M4 7h16v4H4z M12 7v13" />,
  order: <path d="M5 6h14M5 12h14M5 18h9" />,
  track: <path d="M4 12h4l3 7 4-16 3 9h4" />,
  cust: <path d="M12 8a3 3 0 100-6 3 3 0 000 6zM5 20a7 7 0 0114 0" />,
}

function Svg({ children }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const TABS = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/leads', label: 'Leads', icon: 'leads' },
  { to: '/promo', label: 'Promo', icon: 'promo' },
  { to: '/orders', label: 'Order', icon: 'order' },
  { to: '/track', label: 'Track', icon: 'track' },
  { to: '/customers', label: 'Cust', icon: 'cust' },
]

const HIDDEN = ['/login', '/checkin', '/visit-mode']

export function BottomNav() {
  const loc = useLocation()
  if (HIDDEN.some((p) => loc.pathname.startsWith(p)) || loc.pathname === '/') return null

  return (
    <nav className="nav" id="nav">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `t${isActive ? ' on' : ''}`}
        >
          <Svg>{ICONS[t.icon]}</Svg>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Fab() {
  const loc = useLocation()
  const nav = useNavigate()
  let action = null
  if (loc.pathname.startsWith('/leads')) action = () => nav('/leads/new')
  if (loc.pathname.startsWith('/orders') && !loc.pathname.includes('/new'))
    action = () => nav('/orders/new')

  if (!action) return null

  return (
    <button className="fab" type="button" onClick={action} aria-label="Tambah">
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0a1730"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  )
}
