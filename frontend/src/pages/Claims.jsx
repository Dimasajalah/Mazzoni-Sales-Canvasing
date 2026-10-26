// frontend/src/pages/Claims.jsx
// Blueprint MJU 3.2.8 (MKT08): daftar Pengajuan Program Klaim.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getClaims } from '../api'
import { Chips, Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate, listOf } from '../lib/format'
import { claimStatusMeta } from '../lib/marketingClaim'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingapproval.css'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const FILTERS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'MINE', label: 'Perlu Keputusan Saya' },
  { value: 'PENDING_PASS', label: 'Pending' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CALCULATED', label: 'Dihitung' },
  { value: 'SUBMITTED', label: 'Diajukan' },
  { value: 'IN_APPROVAL', label: 'Approval' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'DISBURSED', label: 'Dicairkan' },
]

export default function Claims() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const allowed = isManager(user)

  useEffect(() => {
    if (!allowed) return
    getClaims()
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message || 'Gagal memuat pengajuan klaim', { warn: true }))
      .finally(() => setLoading(false))
  }, [allowed, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Pengajuan Klaim" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const needsMe = (c) => c.can_pass || c.can_act
  const mineCount = items.filter(needsMe).length
  const options = FILTERS.map((f) => (f.value === 'MINE' ? { ...f, label: `${f.label} (${mineCount})` } : f))
  const shown = items.filter((c) => {
    if (filter === 'ALL') return true
    if (filter === 'MINE') return needsMe(c)
    return c.status === filter
  })

  return (
    <Screen>
      <TopBar title="Pengajuan Klaim" backTo="/home" />
      <div className="me-top">
        <button type="button" className="btn" onClick={() => nav('/marketing/claims/new')}>Ajukan Klaim</button>
        <button type="button" className="btn ghost" onClick={() => nav('/marketing/claim-programs')}>Program Klaim</button>
      </div>
      <Chips options={options} value={filter} onChange={setFilter} />

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic" style={{ fontSize: 24 }}>₋</span>
          <p>Belum ada pengajuan klaim.</p>
          <small>Ketuk "Ajukan Klaim" untuk mencatat klaim distributor atas program klaim yang sudah disetujui.</small>
        </div>
      ) : (
        shown.map((c) => {
          const st = claimStatusMeta(c.status)
          return (
            <div key={c.id} className="mb-card" onClick={() => nav(`/marketing/claims/${c.id}`)} role="button" tabIndex={0}>
              <div className="mb-top">
                <div className="mb-main">
                  <div className="mb-name">{c.customer?.name}</div>
                  <div className="mb-meta">{c.claim_no} · {c.program?.event_code}</div>
                </div>
                <span className={`mb-badge ${st.tone}`}>{st.label}</span>
              </div>
              <div className="mb-amount">
                <b>{fmtIdr(c.claimed_amount)}</b>
                <span>nilai pengajuan</span>
              </div>
              <div className="mb-foot">
                <span>Surat diterima {fmtDate(c.letter_received_date)}</span>
                {c.eligible_amount != null ? <span>Eligible <b>{fmtIdr(c.eligible_amount)}</b></span> : null}
              </div>
              {['SUBMITTED', 'IN_APPROVAL', 'AWAITING_AMOUNT'].includes(c.status) && c.awaiting_label ? (
                <div className="me-hint">Menunggu {c.awaiting_label}</div>
              ) : null}
              {needsMe(c) ? <span className="ap-flag">Perlu keputusan Anda</span> : null}
            </div>
          )
        })
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
