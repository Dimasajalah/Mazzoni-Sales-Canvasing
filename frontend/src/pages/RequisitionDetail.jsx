// frontend/src/pages/RequisitionDetail.jsx
// Blueprint MJU 3.2.14 (PR01): detail requisition dengan aksi sesuai peran dan tahap: IT mendaftarkan part baru (03), PIC Dept memperbarui harga
// purchasing (04), Manager Dept dan Direktur menyetujui (05-06), PIC Dept merevisi dan mengajukan ulang (07), Purchasing meneruskan ke PO (08-11).
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  approveRequisition, dispatchRequisition, getRequisition, registerRequisitionPart, rejectRequisition, resubmitRequisition, saveRequisitionPrices,
  submitRequisition, uploadRequisitionFiles,
} from '../api'
import { ApprovalPanel } from '../components/ApprovalPanel'
import { AttachmentPicker } from '../components/AttachmentPicker'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { fmtIdr } from '../lib/money'
import { canRequisition, prStatusMeta } from '../lib/requisition'
import '../styles/marketingapproval.css'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const fmtQty = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })

// Panel persetujuan bersama membaca status ini: menunggu keputusan, ditolak (revisi), atau sudah disetujui.
const PANEL_STATUS = { MANAGER: 'PENDING_APPROVAL', DIRECTOR: 'PENDING_APPROVAL', REVISION: 'REJECTED', PURCHASING: 'APPROVED', DISPATCHED: 'APPROVED' }

export default function RequisitionDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [pr, setPr] = useState(null)
  const [codes, setCodes] = useState({})
  const [prices, setPrices] = useState({})
  const [files, setFiles] = useState([])
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const allowed = canRequisition(user)

  const load = (c) => {
    setPr(c)
    setPrices(Object.fromEntries((c.lines || []).map((l) => [l.id, l.unit_price === null || l.unit_price === undefined ? null : Number(l.unit_price)])))
  }

  useEffect(() => {
    if (!allowed) return
    getRequisition(id)
      .then(load)
      .catch((e) => showToast(e.message || 'Gagal memuat requisition', { warn: true }))
  }, [allowed, id, showToast])

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

  if (!pr) {
    return (
      <Screen>
        <TopBar title="Requisition" backTo="/purchasing/requisitions" />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const flags = pr.flags || {}
  const st = prStatusMeta(pr.status)
  const warn = (m) => showToast(m, { warn: true })

  const run = async (fn, okMessage, after) => {
    setBusy(true)
    try {
      load(await fn())
      if (after) after()
      showToast(okMessage)
    } catch (e) {
      showToast(e.message || 'Gagal memproses', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const registerPart = (line) => {
    const code = (codes[line.id] || '').trim()
    if (!code) return warn(`Isi kode part terdaftar untuk baris ${line.line_no}`)

    return run(() => registerRequisitionPart(pr.id, line.id, { part_num: code }), 'Part terdaftar', () => setCodes((c) => ({ ...c, [line.id]: '' })))
  }

  const savePrices = (e) => {
    e.preventDefault()
    for (const l of pr.lines) {
      if (!prices[l.id] || prices[l.id] <= 0) return warn(`Isi harga satuan baris ${l.line_no} lebih dari 0`)
    }

    return run(() => saveRequisitionPrices(pr.id, pr.lines.map((l) => ({ line_id: l.id, unit_price: prices[l.id] }))), 'Harga purchasing tersimpan')
  }

  const upload = () => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files[]', f, f.name))

    return run(() => uploadRequisitionFiles(pr.id, fd), 'Lampiran tersimpan', () => setFiles([]))
  }

  const forward = () => {
    if (!target) return warn('Pilih tujuan PO')

    return run(() => dispatchRequisition(pr.id, { target }), 'Requisition diteruskan ke Purchasing')
  }

  return (
    <Screen>
      <TopBar title="Requisition" backTo="/purchasing/requisitions" />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{pr.pr_no}</div>
            <div className="mb-meta">{pr.category_label} · diajukan oleh {pr.requester?.name || '—'}</div>
          </div>
          <span className={`mb-badge ${st.tone}`}>{st.label}</span>
        </div>
        <div className="mb-kv">Dibutuhkan <b>{fmtDate(pr.needed_date)}</b></div>
        <div className="mb-kv">Jenis pengajuan <b>{pr.is_rab ? 'RAB / Bulanan' : 'Biasa'}</b></div>
        <div className="mb-kv">Total nilai <b data-testid="total">{Number(pr.total_amount) > 0 ? fmtIdr(pr.total_amount) : 'Harga belum diisi'}</b></div>
        {pr.requires_director ? <div className="me-hint">Barang asset atau lebih dari {fmtIdr(pr.options?.asset_threshold)}: Direktur ikut menyetujui.</div> : null}
        {pr.notes ? <div className="me-hint">Catatan: {pr.notes}</div> : null}
        {pr.awaiting_label && pr.status !== 'DISPATCHED' ? <div className="me-hint">Menunggu {pr.awaiting_label}</div> : null}
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">Baris Barang ({pr.lines.length})</div>
        {pr.lines.map((l) => (
          <div key={l.id} className="mb-kv" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <span>
              <b>{l.line_no}. {l.part_num}</b>{l.description ? ` · ${l.description}` : ''}
              {l.is_asset ? ' · Barang asset' : ''}
              {!l.part_registered ? <span className="mb-badge wait" style={{ marginLeft: 6 }}>Menunggu IT</span> : null}
            </span>
            <span>Jumlah {fmtQty(l.qty)}{l.unit_price !== null && l.unit_price !== undefined ? ` · harga ${fmtIdr(l.unit_price)}` : ''}</span>
            {!l.part_registered && flags.can_register ? (
              <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 6 }}>
                <input aria-label={`Kode part terdaftar baris ${l.line_no}`} placeholder="Kode part di Part Master" value={codes[l.id] || ''} maxLength={50} onChange={(e) => setCodes((c) => ({ ...c, [l.id]: e.target.value }))} />
                <button type="button" className="btn sm" disabled={busy} aria-label={`Register Part baris ${l.line_no}`} onClick={() => registerPart(l)}>Register Part</button>
              </div>
            ) : null}
          </div>
        ))}
        {pr.unregistered_count > 0 && flags.can_submit ? (
          <div className="me-hint">Menunggu IT mendaftarkan part baru ke Part Master sebelum PR bisa diajukan.</div>
        ) : null}
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">RAB / Gambar Barang</div>
        {pr.attachments.length === 0 ? <div className="me-hint" style={{ marginTop: 0 }}>Tidak ada lampiran.</div> : pr.attachments.map((a) => (
          <div key={a.id} className="me-file"><span className="me-file-n">{a.filename}</span></div>
        ))}
        {flags.can_edit ? (
          <div style={{ marginTop: 8 }}>
            <AttachmentPicker files={files} onChange={setFiles} />
            {files.length > 0 ? <button type="button" className="btn sm" disabled={busy} onClick={upload} style={{ marginTop: 8 }}>Unggah Lampiran</button> : null}
          </div>
        ) : null}
      </div>

      {flags.can_edit || flags.can_submit || flags.can_resubmit ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Tindakan</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {flags.can_edit ? <button type="button" className="btn ghost" onClick={() => nav(`/purchasing/requisitions/${pr.id}/edit`)}>{pr.status === 'REVISION' ? 'Revisi Requisition' : 'Ubah Requisition'}</button> : null}
            {flags.can_submit ? <button type="button" className="btn" disabled={busy} onClick={() => run(() => submitRequisition(pr.id), 'Requisition diajukan')}>Ajukan Requisition</button> : null}
            {flags.can_resubmit ? <button type="button" className="btn" disabled={busy} onClick={() => run(() => resubmitRequisition(pr.id), 'Requisition diajukan ulang')}>Ajukan Ulang ke Manager Dept</button> : null}
          </div>
        </div>
      ) : null}

      {flags.can_price ? (
        <form className="mb-sec" onSubmit={savePrices}>
          <div className="mb-sec-t">Update Harga Purchasing</div>
          <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>Pengajuan RAB/Bulanan: perbarui harga purchasing semua baris, lalu PR dilanjutkan ke Manager Dept.</div>
          {pr.lines.map((l) => (
            <Field key={l.id} label={`Harga satuan baris ${l.line_no} (${l.part_num})`}>
              <NumInput className="mb-money" value={prices[l.id] ?? null} onChange={(v) => setPrices((p) => ({ ...p, [l.id]: v }))} placeholder="0" />
            </Field>
          ))}
          <button className="btn" type="submit" disabled={busy}>Simpan Harga Purchasing</button>
        </form>
      ) : null}

      {PANEL_STATUS[pr.status] ? (
        <ApprovalPanel
          pg={{ ...pr, status: PANEL_STATUS[pr.status], approval: pr.approval, approvals: pr.approvals }}
          onChange={load}
          approve={(rid, payload) => approveRequisition(rid, payload)}
          reject={(rid, payload) => rejectRequisition(rid, payload)}
        />
      ) : null}

      {flags.can_dispatch ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Dispatch Approval Purchasing</div>
          <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>Teruskan PR menjadi PO sesuai siapa yang mengerjakan pembelian.</div>
          <Field label="Tujuan PO">
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— pilih tujuan PO —</option>
              {(pr.options?.dispatch_targets || []).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <button type="button" className="btn" disabled={busy} onClick={forward}>Dispatch Approval Purchasing</button>
        </div>
      ) : null}

      {pr.status === 'DISPATCHED' ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Diteruskan ke Purchasing</div>
          <div className="mb-kv">Tujuan PO <b>{pr.dispatch_target_label}</b></div>
          <div className="me-hint">Diteruskan pada {fmtDate(pr.dispatched_at)}.</div>
        </div>
      ) : null}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
