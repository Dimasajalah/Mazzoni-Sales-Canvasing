// frontend/src/pages/CustomerActivity.jsx
// Halaman "semua log" aktivitas customer. Halaman Detail Customer hanya memuat 10 log terbaru.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getCustomerActivity } from '../api'
import ActivityTimeline from '../components/ActivityTimeline'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'

export default function CustomerActivity() {
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getCustomerActivity(id, { limit: 1000 })
      .then((r) => {
        if (alive) setData({ items: r?.items || [], total: r?.total ?? 0 })
      })
      .catch((e) => {
        if (alive) showToast(e.message || 'Gagal memuat aktivitas', { warn: true })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id, showToast])

  const name = loc.state?.name

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ flex: 1, minWidth: 0 }}>
          <div>Activity History</div>
          <div className="tt-sub">{[name, loading ? null : `${data.total} entries`].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <ActivityTimeline items={data.items} loading={loading} />
    </Screen>
  )
}
