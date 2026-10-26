// frontend/src/pages/MoveRequests.jsx
// Blueprint MJU 3.2.15 (MKT14 Move Inventory Request Display Support Event): daftar permintaan pemindahan barang display untuk event.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'
import { canCreateMoveRequest, canMoveRequest, MOVE_KINDS, moveStatusMeta } from '../lib/moveRequest'
import { moveApi } from '../lib/moveRequestApi'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

export default function MoveRequests({ kind = 'display' }) {
  const K = MOVE_KINDS[kind]
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const allowed = canMoveRequest(user)

  // pencarian dengan jeda singkat supaya tidak memanggil server di tiap ketikan
  useEffect(() => {
    if (!allowed) return undefined
    const t = setTimeout(() => {
      moveApi(kind).list(q.trim() ? { q: q.trim() } : {})
        .then((d) => setItems(listOf(d)))
        .catch((e) => showToast(e.message || 'Gagal memuat permintaan', { warn: true }))
        .finally(() => setLoading(false))
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [allowed, kind, q, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title={K.title} backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin, supervisor, dan warehouse.
        </div>
      </Screen>
    )
  }

  const todoCount = items.filter((r) => r.can_act).length
  const shown = onlyMine ? items.filter((r) => r.can_act) : items

  return (
    <Screen>
      <TopBar title={K.title} backTo="/home" />

      <div className="mb-hero">
        <div className="mb-hero-cap">Menunggu Tindakan Saya</div>
        <div className="mb-hero-total" data-testid="todo-count">{todoCount}</div>
        <div className="mb-hero-sub">dari {items.length} {K.listHero}</div>
      </div>

      {canCreateMoveRequest(user) ? (
        <button type="button" className="btn" onClick={() => nav(`${K.path}/new`)} style={{ marginBottom: 12 }}>Buat Permintaan</button>
      ) : null}

      <div className="field">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={K.searchPlaceholder} aria-label="Cari permintaan" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button type="button" className={`btn sm${onlyMine ? ' ghost' : ''}`} aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>Semua</button>
        <button type="button" className={`btn sm${onlyMine ? '' : ' ghost'}`} aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>{`Perlu Tindakan Saya (${todoCount})`}</button>
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic" style={{ fontSize: 24 }}>₋</span>
          <p>Tidak ada permintaan.</p>
          <small>{K.emptyHint}</small>
        </div>
      ) : (
        shown.map((r) => {
          const st = moveStatusMeta(r.status)
          return (
            <div key={r.id} className="mb-card" onClick={() => nav(`${K.path}/${r.id}`)} role="button" tabIndex={0}>
              <div className="mb-top">
                <div className="mb-main">
                  <div className="mb-name">{r.req_no}</div>
                  <div className="mb-meta">{K.withEvent ? `${r.event?.event_code} · ${r.event?.description}` : r.remarks || 'Sample internal'}</div>
                </div>
                <span className={`mb-badge ${st.tone}`}>{st.label}</span>
              </div>
              <div className="mb-amount"><b>{r.items_count} {K.itemsCountLabel}</b></div>
              {r.awaiting_label ? <div className="me-hint">Menunggu {r.awaiting_label}</div> : null}
              {r.can_act ? <span className="ap-flag">Perlu tindakan Anda</span> : null}
            </div>
          )
        })
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
