// frontend/src/pages/MarketingEventDetail.jsx
// Blueprint MJU 3.2.2 (MKT02): detail event, RAB, dan Daftar Peserta Pure Event.
// 3.2.6 (MKT06): persetujuan berjenjang; event yang ditolak bisa direvisi lalu diajukan ulang.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { approveEvent, getMarketingEvent, rejectEvent } from '../api'
import { ApprovalPanel } from '../components/ApprovalPanel'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { eventStatusMeta, targetSummary } from '../lib/marketingEvent'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingbudget.css'
import '../styles/marketingevent.css'

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function MarketingEventDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [ev, setEv] = useState(null)
  const allowed = isManager(user)

  useEffect(() => {
    if (!allowed) return
    getMarketingEvent(id)
      .then(setEv)
      .catch((e) => showToast(e.message || 'Gagal memuat event', { warn: true }))
  }, [allowed, id, showToast])

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

  if (!ev) {
    return (
      <Screen>
        <TopBar title="Detail Event" backTo="/marketing/events" />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const st = eventStatusMeta(ev.status)
  const people = ev.participants || []

  return (
    <Screen>
      <TopBar title="Detail Event" backTo="/marketing/events" />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{ev.description}</div>
            <div className="mb-meta">{ev.event_code} · {ev.activity_type_label}</div>
          </div>
          <span className={`mb-badge ${st.tone}`}>{st.label}</span>
        </div>
        <div className="mb-amount"><b>{fmtIdr(ev.budget_amount)}</b><span>budget (RAB)</span></div>
        <div className="mb-kv">Campaign <b>{ev.budget?.name}</b></div>
        <div className="mb-kv">Nomor Surat Komunikasi <b>{ev.reference_letter_no}</b></div>
        <div className="mb-kv">Periode <b>{fmtDate(ev.start_date)} – {fmtDate(ev.end_date)}</b></div>
        <div className="mb-kv">Target <b>{targetSummary(ev)}</b></div>
        {ev.status === 'PENDING_APPROVAL' ? (
          <div className="me-hint">Event ini menunggu persetujuan. Budget sudah dicadangkan dari Campaign.</div>
        ) : null}
        {ev.status === 'APPROVED' ? <div className="me-hint">Event disetujui dan siap dipakai sebagai dasar klaim.</div> : null}
        {ev.status === 'REJECTED' ? (
          <>
            <div className="me-hint">Event ditolak, budget sudah dikembalikan ke Campaign. Revisi lalu ajukan ulang; persetujuan dimulai lagi dari Tahap 1.</div>
            <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => nav(`/marketing/events/${ev.id}/revise`)}>
              Revisi &amp; Ajukan Ulang
            </button>
          </>
        ) : null}
      </div>

      <ApprovalPanel pg={ev} onChange={setEv} approve={(eventId, payload) => approveEvent(eventId, payload)} reject={(eventId, payload) => rejectEvent(eventId, payload)} />

      <div className="mb-sec">
        <div className="mb-sec-t">Daftar Peserta ({ev.participants_count})</div>
        {people.map((c) => (
          <div key={c.id} className="mb-kv">
            <span>{c.name}<br /><small>{c.customer_code}{c.city ? ` · ${c.city}` : ''}</small></span>
          </div>
        ))}
        {ev.participants_count > people.length ? (
          <div className="me-hint">Menampilkan {people.length} dari {ev.participants_count} peserta.</div>
        ) : null}
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">Lampiran RAB</div>
        {(ev.attachments || []).length === 0 ? (
          <div className="me-hint" style={{ marginTop: 0 }}>Tidak ada lampiran.</div>
        ) : (
          ev.attachments.map((a) => (
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
