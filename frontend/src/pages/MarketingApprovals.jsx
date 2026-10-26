// frontend/src/pages/MarketingApprovals.jsx
// Program Approval Dashboard (Blueprint MJU 3.2.6 langkah 02): hanya program yang menunggu persetujuan pengguna yang sedang login.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPendingApprovals } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate, listOf } from '../lib/format'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingapproval.css'
import '../styles/marketingbudget.css'
import '../styles/marketingevent.css'

const KIND = {
  EVENT: { label: 'Event', path: '/marketing/events' },
  KLAIM: { label: 'Klaim', path: '/marketing/claim-programs' },
  PENGAJUAN: { label: 'Pengajuan', path: '/marketing/claims' }, // MKT09: pengajuan klaim distributor
}

export default function MarketingApprovals() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const allowed = isManager(user)

  useEffect(() => {
    if (!allowed) return
    getPendingApprovals()
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message || 'Gagal memuat daftar persetujuan', { warn: true }))
      .finally(() => setLoading(false))
  }, [allowed, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Persetujuan Marketing" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <TopBar title="Persetujuan Marketing" backTo="/home" />

      <div className="mb-hero">
        <div className="mb-hero-cap">Menunggu Keputusan Anda</div>
        <div className="mb-hero-total" data-testid="pending-count">{items.length}</div>
        <div className="mb-hero-sub">event, program klaim, dan pengajuan klaim yang tahap persetujuannya ada di Anda</div>
      </div>

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : items.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic" style={{ fontSize: 24 }}>✓</span>
          <p>Tidak ada program yang menunggu persetujuan Anda.</p>
          <small>Program yang tahap persetujuannya ada di Anda akan muncul di sini.</small>
        </div>
      ) : (
        items.map((e) => {
          const kind = KIND[e.kind] || KIND.EVENT
          return (
            <div key={`${e.kind}-${e.id}`} className="mb-card" onClick={() => nav(`${kind.path}/${e.id}`)} role="button" tabIndex={0}>
              <div className="mb-top">
                <div className="mb-main">
                  <div className="mb-name">{e.description}</div>
                  <div className="mb-meta">{e.event_code} · {kind.label}</div>
                </div>
                <span className="mb-badge wait">{kind.label}</span>
              </div>
              <div className="mb-amount">
                <b>{fmtIdr(e.budget_amount)}</b>
                <span>{e.kind === 'PENGAJUAN' ? `Surat diterima ${fmtDate(e.letter_received_date)}` : `${fmtDate(e.start_date)} – ${fmtDate(e.end_date)}`}</span>
              </div>
              <div className="me-hint">Menunggu {e.awaiting_label}{e.approval_round > 1 ? ` · diajukan ulang (putaran ${e.approval_round})` : ''}</div>
              <span className="ap-flag">Perlu keputusan Anda</span>
            </div>
          )
        })
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
