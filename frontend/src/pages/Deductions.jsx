// frontend/src/pages/Deductions.jsx
// Blueprint MJU 3.2.10 (MKT10): "Check Pengajuan Klaim", yaitu klaim yang sudah disetujui dengan metode Potong Nota dan masih punya saldo.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDeductionClaims } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'
import { canDeduct } from '../lib/marketingClaim'
import { fmtIdr } from '../lib/money'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

export default function Deductions() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const allowed = canDeduct(user)

  // pencarian dengan jeda singkat supaya tidak memanggil server di tiap ketikan
  useEffect(() => {
    if (!allowed) return undefined
    const t = setTimeout(() => {
      getDeductionClaims(q.trim() ? { q: q.trim() } : {})
        .then((d) => setItems(listOf(d)))
        .catch((e) => showToast(e.message || 'Gagal memuat klaim Potong Nota', { warn: true }))
        .finally(() => setLoading(false))
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [allowed, q, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Potong Nota" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk sales, supervisor, dan admin.
        </div>
      </Screen>
    )
  }

  const total = items.reduce((t, c) => t + (Number(c.balance) || 0), 0)

  return (
    <Screen>
      <TopBar title="Potong Nota" backTo="/home" />

      <div className="mb-hero">
        <div className="mb-hero-cap">Saldo Klaim yang Bisa Dipotong</div>
        <div className="mb-hero-total" data-testid="deduction-total">{fmtIdr(total)}</div>
        <div className="mb-hero-sub">{items.length} klaim dengan metode pencairan Potong Nota</div>
      </div>

      <div className="field">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari distributor atau kode klaim" aria-label="Cari klaim" />
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : items.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic" style={{ fontSize: 24 }}>₋</span>
          <p>Tidak ada klaim Potong Nota yang masih punya saldo.</p>
          <small>Klaim muncul di sini setelah disetujui dengan metode pencairan Potong Nota.</small>
        </div>
      ) : (
        items.map((c) => (
          <div key={c.id} className="mb-card" onClick={() => nav(`/marketing/deductions/${c.id}`)} role="button" tabIndex={0}>
            <div className="mb-top">
              <div className="mb-main">
                <div className="mb-name">{c.customer?.name}</div>
                <div className="mb-meta">{c.claim_no} · {c.program?.event_code}</div>
              </div>
            </div>
            <div className="mb-amount">
              <b>{fmtIdr(c.balance)}</b>
              <span>saldo klaim</span>
            </div>
            <div className="mb-foot">
              <span>Disetujui {fmtIdr(c.approved_amount)}</span>
              <span>Terpakai <b>{fmtIdr(c.used_total)}</b></span>
            </div>
          </div>
        ))
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
