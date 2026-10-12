// frontend/src/pages/Profile.jsx
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useOnline } from '../hooks/useOnline'
import { initials } from '../lib/format'
import { roleLabel } from '../lib/roles'

export default function Profile() {
  const { user, logout } = useAuth()
  const online = useOnline()
  const nav = useNavigate()
  const name = user?.name || 'Sales'

  return (
    <Screen>
      <h1 className="title">Profile</h1>
      <div className="prof-head">
        <div className="prof-av">{initials(name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="prof-name">{name}</div>
          <div className="prof-role">
            {user ? roleLabel(user) : '—'} · {user?.territory || '—'}
          </div>
        </div>
        <span
          className="badge"
          style={{
            background: online ? 'var(--green-soft)' : 'var(--amber-soft)',
            color: online ? 'var(--green)' : 'var(--amber)',
          }}
        >
          ● {online ? 'Online' : 'Offline'}
        </span>
      </div>
      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: 18 }}
        onClick={async () => {
          if (confirm('Keluar dari aplikasi?')) {
            await logout()
            nav('/login', { replace: true })
          }
        }}
      >
        Keluar
      </button>
    </Screen>
  )
}