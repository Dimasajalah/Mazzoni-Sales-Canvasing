// frontend/src/pages/MarketingEvents.jsx
// Blueprint MJU 3.2.2 (MKT02): daftar event marketing.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMarketingEvents } from '../api'
import { Chips, Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate, listOf } from '../lib/format'
import { eventStatusMeta } from '../lib/marketingEvent'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingapproval.css'
import '../styles/marketingbudget.css'
import '../styles/marketingevent.css'

const FILTERS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'MINE', label: 'Perlu Persetujuan Saya' },
  { value: 'PENDING_APPROVAL', label: 'Menunggu' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
]

export default function MarketingEvents() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const allowed = isManager(user)

  useEffect(() => {
    if (!allowed) return
    getMarketingEvents({ kind: 'EVENT' })
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message || 'Gagal memuat event marketing', { warn: true }))
      .finally(() => setLoading(false))
  }, [allowed, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Event Marketing" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const mineCount = items.filter((e) => e.can_act).length
  const options = FILTERS.map((f) => (f.value === 'MINE' ? { ...f, label: `${f.label} (${mineCount})` } : f))
  const shown = items.filter((e) => {
    if (filter === 'ALL') return true
    if (filter === 'MINE') return e.can_act
    return e.status === filter
  })

  return (
    <Screen>
      <TopBar title="Event Marketing" backTo="/home" />
      <div className="me-top">
        <button type="button" className="btn" onClick={() => nav('/marketing/events/new')}>Tambah Event</button>
        <button type="button" className="btn ghost" onClick={() => nav('/marketing/budgets')}>Budget Marketing</button>
      </div>
      <Chips options={options} value={filter} onChange={setFilter} />

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
          </span>
          <p>Belum ada event marketing.</p>
          <small>Ketuk "Tambah Event" untuk mencatat event dari sebuah Campaign.</small>
        </div>
      ) : (
        shown.map((e) => {
          const st = eventStatusMeta(e.status)
          return (
            <div key={e.id} className="mb-card" onClick={() => nav(`/marketing/events/${e.id}`)} role="button" tabIndex={0}>
              <div className="mb-top">
                <div className="mb-main">
                  <div className="mb-name">{e.description}</div>
                  <div className="mb-meta">{e.event_code} · {e.activity_type_label}</div>
                </div>
                <span className={`mb-badge ${st.tone}`}>{st.label}</span>
              </div>
              <div className="mb-amount">
                <b>{fmtIdr(e.budget_amount)}</b>
                <span>budget event</span>
              </div>
              <div className="mb-foot">
                <span>{fmtDate(e.start_date)} – {fmtDate(e.end_date)}</span>
                <span><b>{e.participants_count ?? 0}</b> peserta</span>
              </div>
              {e.status === 'PENDING_APPROVAL' && e.awaiting_label ? (
                <div className="me-hint">Menunggu {e.awaiting_label}</div>
              ) : null}
              {e.can_act ? <span className="ap-flag">Perlu keputusan Anda</span> : null}
            </div>
          )
        })
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
