// frontend/src/pages/Transfers.jsx
// Blueprint MJU 3.2.12 (MKT12): klaim yang disetujui dengan metode Transfer dan belum dicairkan (dikerjakan Finance).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTransferClaims } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'
import { canTransfer, transferStatusMeta } from '../lib/marketingClaim'
import { fmtIdr } from '../lib/money'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

export default function Transfers() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const allowed = canTransfer(user)

  // pencarian dengan jeda singkat supaya tidak memanggil server di tiap ketikan
  useEffect(() => {
    if (!allowed) return undefined
    const t = setTimeout(() => {
      getTransferClaims(q.trim() ? { q: q.trim() } : {})
        .then((d) => setItems(listOf(d)))
        .catch((e) => showToast(e.message || 'Gagal memuat klaim Transfer', { warn: true }))
        .finally(() => setLoading(false))
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [allowed, q, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Pencairan Transfer" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk finance dan admin.
        </div>
      </Screen>
    )
  }

  const total = items.reduce((t, c) => t + (Number(c.approved_amount) || 0), 0)

  return (
    <Screen>
      <TopBar title="Pencairan Transfer" backTo="/home" />

      <div className="mb-hero">
        <div className="mb-hero-cap">Klaim Menunggu Pencairan</div>
        <div className="mb-hero-total" data-testid="transfer-total">{fmtIdr(total)}</div>
        <div className="mb-hero-sub">{items.length} klaim dengan metode pencairan Transfer</div>
      </div>

      <div className="field">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari distributor atau kode klaim" aria-label="Cari klaim" />
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : items.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic" style={{ fontSize: 24 }}>₋</span>
          <p>Tidak ada klaim Transfer yang menunggu pencairan.</p>
          <small>Klaim muncul di sini setelah disetujui dengan metode pencairan Transfer.</small>
        </div>
      ) : (
        items.map((c) => {
          const st = transferStatusMeta(c.transfer_status)
          return (
            <div key={c.id} className="mb-card" onClick={() => nav(`/marketing/transfers/${c.id}`)} role="button" tabIndex={0}>
              <div className="mb-top">
                <div className="mb-main">
                  <div className="mb-name">{c.customer?.name}</div>
                  <div className="mb-meta">{c.claim_no} · {c.program?.event_code}</div>
                </div>
                <span className={`mb-badge ${st.tone}`}>{st.label}</span>
              </div>
              <div className="mb-amount">
                <b>{fmtIdr(c.approved_amount)}</b>
                <span>nilai klaim disetujui</span>
              </div>
            </div>
          )
        })
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
