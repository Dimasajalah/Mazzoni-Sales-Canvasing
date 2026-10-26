// frontend/src/pages/IssueMaterials.jsx
// Blueprint MJU 3.2.17 (MKT17 Issue Miscellaneous Material): daftar pengeluaran barang oleh Marketing.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMaterialIssues } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'
import { canIssueMaterial, issueStatusMeta } from '../lib/issueMaterial'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

export default function IssueMaterials() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const allowed = canIssueMaterial(user)

  // pencarian dengan jeda singkat supaya tidak memanggil server di tiap ketikan
  useEffect(() => {
    if (!allowed) return undefined
    const t = setTimeout(() => {
      getMaterialIssues(q.trim() ? { q: q.trim() } : {})
        .then((d) => setItems(listOf(d)))
        .catch((e) => showToast(e.message || 'Gagal memuat daftar issue', { warn: true }))
        .finally(() => setLoading(false))
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [allowed, q, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Issue Produk" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor (Marketing).
        </div>
      </Screen>
    )
  }

  const waiting = items.filter((i) => i.can_act).length

  return (
    <Screen>
      <TopBar title="Issue Produk" backTo="/home" />

      <div className="mb-hero">
        <div className="mb-hero-cap">Menunggu Remarks</div>
        <div className="mb-hero-total" data-testid="waiting-count">{waiting}</div>
        <div className="mb-hero-sub">dari {items.length} pengeluaran barang (Issue Misc. Material)</div>
      </div>

      <button type="button" className="btn" onClick={() => nav('/marketing/issues/new')} style={{ marginBottom: 12 }}>Catat Issue</button>

      <div className="field">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor issue, dokumen, atau penerima" aria-label="Cari issue" />
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : items.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic" style={{ fontSize: 24 }}>₋</span>
          <p>Belum ada issue.</p>
          <small>Catat pengeluaran barang setelah Issue Misc. Material dijalankan di Epicor.</small>
        </div>
      ) : (
        items.map((i) => {
          const st = issueStatusMeta(i.status)
          return (
            <div key={i.id} className="mb-card" onClick={() => nav(`/marketing/issues/${i.id}`)} role="button" tabIndex={0}>
              <div className="mb-top">
                <div className="mb-main">
                  <div className="mb-name">{i.issue_no}</div>
                  <div className="mb-meta">{i.issue_reference}{i.remarks ? ` · ${i.remarks}` : ''}</div>
                </div>
                <span className={`mb-badge ${st.tone}`}>{st.label}</span>
              </div>
              <div className="mb-amount"><b>{i.items_count} barang</b></div>
              {i.awaiting_label ? <div className="me-hint">Menunggu {i.awaiting_label}</div> : null}
              {i.can_act ? <span className="ap-flag">Perlu tindakan Anda</span> : null}
            </div>
          )
        })
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
