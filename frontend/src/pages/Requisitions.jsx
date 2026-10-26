// frontend/src/pages/Requisitions.jsx
// Blueprint MJU 3.2.14 (PR01 Requisition User, Reward dan Design): daftar requisition dan apa yang menunggu tindakan saya.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRequisitions } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate, listOf } from '../lib/format'
import { fmtIdr } from '../lib/money'
import { canRequisition, prStatusMeta } from '../lib/requisition'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const FILTERS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'TODO', label: 'Perlu Tindakan Saya' },
  { value: 'MINE', label: 'PR Saya' },
]

export default function Requisitions() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('ALL')
  const allowed = canRequisition(user)

  // pencarian dengan jeda singkat supaya tidak memanggil server di tiap ketikan
  useEffect(() => {
    if (!allowed) return undefined
    const t = setTimeout(() => {
      getRequisitions(q.trim() ? { q: q.trim() } : {})
        .then((d) => setItems(listOf(d)))
        .catch((e) => showToast(e.message || 'Gagal memuat requisition', { warn: true }))
        .finally(() => setLoading(false))
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [allowed, q, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Requisition" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const todoCount = items.filter((p) => p.can_act).length
  const shown = items.filter((p) => (filter === 'TODO' ? p.can_act : filter === 'MINE' ? p.requested_by === user.id : true))

  return (
    <Screen>
      <TopBar title="Requisition" backTo="/home" />

      <div className="mb-hero">
        <div className="mb-hero-cap">Menunggu Tindakan Saya</div>
        <div className="mb-hero-total" data-testid="todo-count">{todoCount}</div>
        <div className="mb-hero-sub">dari {items.length} requisition (Reward dan Design)</div>
      </div>

      <button type="button" className="btn" onClick={() => nav('/purchasing/requisitions/new')} style={{ marginBottom: 12 }}>Buat Requisition</button>

      <div className="field">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor PR, catatan, atau pembuat" aria-label="Cari requisition" />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.value} type="button" className={`btn sm${filter === f.value ? '' : ' ghost'}`} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.value === 'TODO' ? `${f.label} (${todoCount})` : f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic" style={{ fontSize: 24 }}>₋</span>
          <p>Tidak ada requisition.</p>
          <small>Ketuk Buat Requisition untuk mengajukan barang Reward atau Design.</small>
        </div>
      ) : (
        shown.map((p) => {
          const st = prStatusMeta(p.status)
          return (
            <div key={p.id} className="mb-card" onClick={() => nav(`/purchasing/requisitions/${p.id}`)} role="button" tabIndex={0}>
              <div className="mb-top">
                <div className="mb-main">
                  <div className="mb-name">{p.pr_no}</div>
                  <div className="mb-meta">{p.category_label} · {p.requester?.name} · dibutuhkan {fmtDate(p.needed_date)}</div>
                </div>
                <span className={`mb-badge ${st.tone}`}>{st.label}</span>
              </div>
              <div className="mb-amount">
                <b>{p.lines_count} baris barang</b>
                <span>{Number(p.total_amount) > 0 ? fmtIdr(p.total_amount) : 'harga belum diisi'}</span>
              </div>
              {p.awaiting_label && p.status !== 'DISPATCHED' ? <div className="me-hint">Menunggu {p.awaiting_label}</div> : null}
              {p.unregistered_count > 0 ? <div className="me-hint">{p.unregistered_count} part menunggu didaftarkan IT</div> : null}
              {p.can_act ? <span className="ap-flag">Perlu tindakan Anda</span> : null}
            </div>
          )
        })
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
