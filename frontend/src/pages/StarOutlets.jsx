// frontend/src/pages/StarOutlets.jsx
// Blueprint MJU 3.2.3 (MKT03): daftar Star Outlet dan penanda "Star Outlet Aktif".
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStarOutlets, updateStarOutlet } from '../api'
import { Chips, Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate, listOf } from '../lib/format'
import { isManager } from '../lib/roles'
import '../styles/marketingbudget.css'
import '../styles/marketingevent.css'
import '../styles/marketingstar.css'

const FILTERS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'INACTIVE', label: 'Nonaktif' },
]

export default function StarOutlets() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState(null)
  const allowed = isManager(user)

  useEffect(() => {
    if (!allowed) return
    getStarOutlets()
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message || 'Gagal memuat Star Outlet', { warn: true }))
      .finally(() => setLoading(false))
  }, [allowed, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Star Outlet" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const toggle = async (s) => {
    if (s.active && !window.confirm(`Nonaktifkan Star Outlet ${s.customer?.name}?`)) return
    setBusyId(s.id)
    try {
      const updated = await updateStarOutlet(s.id, { active: !s.active })
      setItems((cur) => cur.map((x) => (x.id === s.id ? { ...x, ...updated } : x)))
      showToast(s.active ? 'Star Outlet dinonaktifkan' : 'Star Outlet diaktifkan')
    } catch (e) {
      showToast(e.message || 'Gagal mengubah status', { error: true })
    } finally {
      setBusyId(null)
    }
  }

  const needle = q.trim().toLowerCase()
  const shown = items.filter((s) => {
    if (filter === 'ACTIVE' && !s.active) return false
    if (filter === 'INACTIVE' && s.active) return false
    if (!needle) return true
    return `${s.customer?.name || ''} ${s.customer?.customer_code || ''}`.toLowerCase().includes(needle)
  })
  const activeCount = items.filter((s) => s.active).length

  return (
    <Screen>
      <TopBar title="Star Outlet" backTo="/home" />

      <div className="mb-hero">
        <div className="mb-hero-cap">Star Outlet Aktif</div>
        <div className="mb-hero-total" data-testid="star-active-count">{activeCount}</div>
        <div className="mb-hero-sub">dari {items.length} outlet yang pernah diajukan</div>
      </div>

      <button type="button" className="btn mb-add" onClick={() => nav('/marketing/star-outlets/new')}>
        Tambah Star Outlet
      </button>
      <div className="field">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau kode outlet" aria-label="Cari outlet" />
      </div>
      <Chips options={FILTERS} value={filter} onChange={setFilter} />

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic" style={{ fontSize: 24 }}>★</span>
          <p>Belum ada Star Outlet.</p>
          <small>Ketuk "Tambah Star Outlet" untuk menandai outlet yang diajukan distributor.</small>
        </div>
      ) : (
        shown.map((s) => (
          <div key={s.id} className={`mb-card${s.active ? '' : ' off'}`} style={{ cursor: 'default' }}>
            <div className="mb-top">
              <div className="mb-av so-av">★</div>
              <div className="mb-main">
                <div className="mb-name">{s.customer?.name}</div>
                <div className="mb-meta">{s.customer?.customer_code}{s.customer?.city ? ` · ${s.customer.city}` : ''}</div>
              </div>
              <span className={`mb-badge ${s.active ? 'on' : 'off'}`}>{s.active ? 'Aktif' : 'Nonaktif'}</span>
            </div>
            {s.requested_by || s.request_reference ? (
              <div className="so-info">
                {s.requested_by ? `Diajukan oleh ${s.requested_by}` : ''}
                {s.requested_by && s.request_reference ? ' · ' : ''}
                {s.request_reference ? `Ref. ${s.request_reference}` : ''}
              </div>
            ) : null}
            <div className="so-info">
              {s.active ? `Aktif sejak ${fmtDate(s.activated_at)}` : `Dinonaktifkan ${fmtDate(s.deactivated_at)}`}
            </div>
            <div className="so-row">
              <span>Star Outlet Aktif</span>
              <button
                type="button"
                role="switch"
                aria-checked={s.active}
                aria-label={`Star Outlet aktif ${s.customer?.name}`}
                className={`so-switch${s.active ? ' on' : ''}`}
                disabled={busyId === s.id}
                onClick={() => toggle(s)}
              >
                <i />
              </button>
            </div>
          </div>
        ))
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
