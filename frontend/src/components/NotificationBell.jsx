// frontend/src/components/NotificationBell.jsx
// Ikon lonceng dengan lencana jumlah belum dibaca; membuka halaman Pemberitahuan.
import { useNavigate } from 'react-router-dom'
import '../styles/notifications.css'

export default function NotificationBell({ unread = 0 }) {
  const nav = useNavigate()
  const label = unread > 0 ? `Pemberitahuan, ${unread} belum dibaca` : 'Pemberitahuan'

  return (
    <button type="button" className="nt-bell" aria-label={label} onClick={() => nav('/notifications')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 003.4 0" />
      </svg>
      {unread > 0 ? <span className="nt-badge">{unread > 99 ? '99+' : unread}</span> : null}
    </button>
  )
}
