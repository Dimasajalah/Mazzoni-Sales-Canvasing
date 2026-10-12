//frontend/src/components/BottomNav.jsx
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canOrder } from '../lib/roles'

const ICONS = {
  home: <path d="M4 12l8-7 8 7v8H4z" />,
  cust: <path d="M5 21V5a1 1 0 011-1h8a1 1 0 011 1v16M15 10h3a1 1 0 011 1v10M9 8h2M9 12h2M9 16h2M3 21h18" />,
  tasks: <path d="M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h9" />,
  order: <path d="M3 4h2l2.4 11h10.2l2-8H6.2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z" />,
  profile: <path d="M12 8a3 3 0 100-6 3 3 0 000 6zM5 20a7 7 0 0114 0" />,
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
  { to: '/customers', label: 'Customers', icon: 'cust', also: ['/leads'] },
  { to: '/activities', label: 'Tasks', icon: 'tasks' },
  { to: '/orders', label: 'Orders', icon: 'order', also: ['/track'] },
  { to: '/profile', label: 'Profile', icon: 'profile' },
]

const HIDDEN = ['/login', '/checkin', '/visit-mode', '/leads/new', '/customers/', '/choose-activity', '/visit/']

export function BottomNav() {
  const loc = useLocation()
  if (HIDDEN.some((p) => loc.pathname.startsWith(p)) || loc.pathname === '/') return null

  const isOn = (t) => [t.to, ...(t.also || [])].some((p) => loc.pathname.startsWith(p))
  return (
    <nav className="nav" id="nav">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className={`t${isOn(t) ? ' on' : ''}`}>
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
  const { user } = useAuth()
  let action = null
  if (/^\/(leads|customers)\/?$/.test(loc.pathname)) action = () => nav('/leads/new')
  if (loc.pathname.startsWith('/orders') && !loc.pathname.includes('/new') && canOrder(user))
    action = () => nav('/orders/new')

  if (!action) return null

  return (
    <button className="fab" type="button" onClick={action} aria-label="Tambah">
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  )
}
