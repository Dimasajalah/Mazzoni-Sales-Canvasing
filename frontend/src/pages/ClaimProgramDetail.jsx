// frontend/src/pages/ClaimProgramDetail.jsx
// Blueprint MJU 3.2.4 (MKT04) detail program klaim + 3.2.5 (MKT05) persetujuan dua tahap dengan reason code.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { approveClaimProgram, getClaimProgram, rejectClaimProgram } from '../api'
import { ApprovalPanel } from '../components/ApprovalPanel'
import { SellOutPanel } from '../components/SellOutPanel'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { claimRateLabel, eventStatusMeta, targetSummary } from '../lib/marketingEvent'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingbudget.css'
import '../styles/marketingevent.css'

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function ClaimProgramDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [pg, setPg] = useState(null)
  const allowed = isManager(user)

  useEffect(() => {
    if (!allowed) return
    getClaimProgram(id)
      .then(setPg)
      .catch((e) => showToast(e.message || 'Gagal memuat program klaim', { warn: true }))
  }, [allowed, id, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Program Klaim" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  if (!pg) {
    return (
      <Screen>
        <TopBar title="Detail Program Klaim" backTo="/marketing/claim-programs" />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const st = eventStatusMeta(pg.status)
  const people = pg.participants || []
  const pending = pg.status === 'PENDING_APPROVAL'

  return (
    <Screen>
      <TopBar title="Detail Program Klaim" backTo="/marketing/claim-programs" />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{pg.description}</div>
            <div className="mb-meta">{pg.event_code} · {pg.claim_type_label}</div>
          </div>
          <span className={`mb-badge ${st.tone}`}>{st.label}</span>
        </div>
        <div className="mb-amount"><b>{fmtIdr(pg.budget_amount)}</b><span>budget program</span></div>
        <div className="mb-kv">Campaign <b>{pg.budget?.name}</b></div>
        <div className="mb-kv">Nomor Surat Komunikasi Program <b>{pg.reference_letter_no}</b></div>
        <div className="mb-kv">Target <b>{targetSummary(pg)}</b></div>
        {pending ? (
          <div className="me-hint">Program ini menunggu persetujuan. Budget sudah dicadangkan dari Campaign.</div>
        ) : null}
        {pg.status === 'REJECTED' ? <div className="me-hint">Program ditolak, budget sudah dikembalikan ke Campaign.</div> : null}
        {pg.status === 'APPROVED' ? (
          <>
            <div className="me-hint">Program disetujui dan siap dipakai sebagai dasar klaim.</div>
            <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => nav(`/marketing/claims/new?program=${pg.id}`)}>
              Ajukan Klaim dari Program ini
            </button>
          </>
        ) : null}
      </div>

      <ApprovalPanel pg={pg} onChange={setPg} approve={(id, payload) => approveClaimProgram(id, payload)} reject={(id, payload) => rejectClaimProgram(id, payload)} />

      <div className="mb-sec">
        <div className="mb-sec-t">Parameter Program</div>
        <div className="mb-kv">Sumber data klaim <b>{pg.claim_source_label}</b></div>
        <div className="mb-kv">Basis perhitungan <b>{pg.claim_basis_label}</b></div>
        <div className="mb-kv">Ambang <b>{pg.claim_threshold != null ? Number(pg.claim_threshold).toLocaleString('id-ID') : '—'}</b></div>
        <div className="mb-kv">Besaran <b>{claimRateLabel(pg)}</b></div>
        <div className="mb-kv">Periode program <b>{fmtDate(pg.start_date)} – {fmtDate(pg.end_date)}</b></div>
        <div className="mb-kv">Batas pengajuan klaim <b>{fmtDate(pg.claim_deadline)}</b></div>
      </div>

      <SellOutPanel program={pg} />

      <div className="mb-sec">
        <div className="mb-sec-t">Daftar Peserta Klaim ({pg.participants_count})</div>
        {people.map((c) => (
          <div key={c.id} className="mb-kv">
            <span>{c.name}<br /><small>{c.customer_code}{c.city ? ` · ${c.city}` : ''}</small></span>
          </div>
        ))}
        {pg.participants_count > people.length ? (
          <div className="me-hint">Menampilkan {people.length} dari {pg.participants_count} peserta.</div>
        ) : null}
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">Lampiran Surat Komunikasi</div>
        {(pg.attachments || []).length === 0 ? (
          <div className="me-hint" style={{ marginTop: 0 }}>Tidak ada lampiran.</div>
        ) : (
          pg.attachments.map((a) => (
            <div key={a.id} className="me-file">
              <span className="me-file-n">{a.filename}</span>
              <span className="me-file-s">{fmtSize(a.size)}</span>
            </div>
          ))
        )}
      </div>
      <div style={{ height: 12 }} />
    </Screen>
  )
}
