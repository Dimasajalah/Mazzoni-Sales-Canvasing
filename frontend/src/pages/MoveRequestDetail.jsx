// frontend/src/pages/MoveRequestDetail.jsx
// Blueprint MJU 3.2.15 (MKT14), langkah 01-05: Check On-Hand Part di Inventory Marketing, Move Inventory Request dari WH FG ke WH Marketing,
// Inventory Transfer oleh Warehouse (Pra-SJ), Issue Misc. Material, lalu penerima dan nama event pada Remarks. Langkah di Epicor dicatat di sini.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { canMoveRequest, MOVE_KINDS, moveStatusMeta } from '../lib/moveRequest'
import { moveApi } from '../lib/moveRequestApi'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const fmtQty = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })

export default function MoveRequestDetail({ kind = 'display' }) {
  const K = MOVE_KINDS[kind]
  const sample = !K.withEvent
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [req, setReq] = useState(null)
  const [onhand, setOnhand] = useState({})
  const [onhandNotes, setOnhandNotes] = useState('')
  const [requestNo, setRequestNo] = useState('')
  const [praSj, setPraSj] = useState('')
  const [issueRef, setIssueRef] = useState('')
  const [recipient, setRecipient] = useState('')
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const allowed = canMoveRequest(user)

  useEffect(() => {
    if (!allowed) return
    moveApi(kind).get(id)
      .then(setReq)
      .catch((e) => showToast(e.message || 'Gagal memuat permintaan', { warn: true }))
  }, [allowed, id, kind, showToast])

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

  if (!req) {
    return (
      <Screen>
        <TopBar title={K.title} backTo={K.path} />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const flags = req.flags || {}
  const st = moveStatusMeta(req.status)
  const status = req.status
  const warn = (m) => showToast(m, { warn: true })

  const run = async (fn, okMessage) => {
    setBusy(true)
    try {
      setReq(await fn())
      showToast(okMessage)
    } catch (e) {
      showToast(e.message || 'Gagal memproses', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const saveOnHand = (e) => {
    e.preventDefault()
    for (let i = 0; i < req.items.length; i += 1) {
      const v = onhand[req.items[i].id]
      if (v === null || v === undefined) return warn(`Isi On-Hand barang ${i + 1} (boleh 0)`)
    }
    const payload = { onhand: req.items.map((i) => ({ item_id: i.id, onhand_qty: onhand[i.id] })) }
    if (onhandNotes.trim()) payload.notes = onhandNotes.trim()

    return run(() => moveApi(kind).onhand(req.id, payload), 'Check On-Hand tersimpan')
  }

  const saveMove = () => {
    if (!requestNo.trim()) return warn('Isi nomor Move Inventory Request')

    return run(() => moveApi(kind).move(req.id, { epicor_request_no: requestNo.trim() }), 'Move Inventory Request tersimpan')
  }

  const saveTransfer = () => {
    if (!praSj.trim()) return warn('Isi nomor Pra-SJ')

    return run(() => moveApi(kind).transfer(req.id, { pra_sj_number: praSj.trim() }), 'Inventory Transfer tersimpan')
  }

  const saveIssue = () => {
    if (!issueRef.trim()) return warn('Isi nomor dokumen Issue Misc. Material')

    return run(() => moveApi(kind).issue(req.id, { issue_reference: issueRef.trim() }), 'Issue Misc. Material tersimpan')
  }

  const finish = (e) => {
    e.preventDefault()
    if (!recipient.trim()) return warn(sample ? 'Isi nama sales' : 'Isi nama penerima')
    if (sample && !purpose.trim()) return warn('Isi peruntukan sample')
    const payload = { recipient_name: recipient.trim() }
    if (sample) payload.purpose = purpose.trim()

    return run(() => moveApi(kind).complete(req.id, payload), 'Permintaan selesai')
  }

  return (
    <Screen>
      <TopBar title={K.title} backTo={K.path} />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{req.req_no}</div>
            <div className="mb-meta">{sample ? 'Sample internal' : `${req.event?.event_code} · ${req.event?.description}`}</div>
          </div>
          <span className={`mb-badge ${st.tone}`}>{st.label}</span>
        </div>
        <div className="mb-kv">Dari <b>WH FG</b> ke <b>WH Marketing</b></div>
        <div className="mb-kv">Dibuat oleh <b>{req.creator?.name || '—'}</b></div>
        {req.notes ? <div className="me-hint">Catatan: {req.notes}</div> : null}
        {req.awaiting_label ? <div className="me-hint">Menunggu {req.awaiting_label}</div> : null}
        {flags.can_edit ? <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => nav(`${K.path}/${req.id}/edit`)}>Ubah Permintaan</button> : null}
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">{K.itemsTitle} ({req.items.length})</div>
        {req.items.map((i, n) => (
          <div key={i.id} className="mb-kv" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <span><b>{n + 1}. {i.part_num}</b>{i.description ? ` · ${i.description}` : ''}</span>
            <span>Jumlah diminta {fmtQty(i.qty)}{i.onhand_qty !== null && i.onhand_qty !== undefined ? ` · On-Hand Marketing ${fmtQty(i.onhand_qty)}` : ''}</span>
          </div>
        ))}
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">Check On-Hand di Inventory Marketing</div>
        {flags.can_check ? (
          <form onSubmit={saveOnHand}>
            <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>{K.onhandHint}</div>
            {req.items.map((i, n) => (
              <Field key={i.id} label={`On-Hand barang ${n + 1} (${i.part_num})`}>
                <NumInput className="mb-money" value={onhand[i.id] ?? null} onChange={(v) => setOnhand((o) => ({ ...o, [i.id]: v }))} placeholder="0" />
              </Field>
            ))}
            <Field label="Catatan (opsional)">
              <textarea rows={2} value={onhandNotes} onChange={(e) => setOnhandNotes(e.target.value)} maxLength={500} />
            </Field>
            <button className="btn" type="submit" disabled={busy}>Simpan Check On-Hand</button>
          </form>
        ) : req.onhand_checked_at ? (
          <>
            <div className="me-hint" style={{ marginTop: 0 }}>On-Hand diperiksa {fmtDate(req.onhand_checked_at)}.</div>
            {req.onhand_notes ? <div className="me-hint">Catatan: {req.onhand_notes}</div> : null}
          </>
        ) : (
          <div className="me-hint" style={{ marginTop: 0 }}>Belum diperiksa.</div>
        )}
      </div>

      {['CHECKED', 'REQUESTED', 'TRANSFERRED', 'ISSUED', 'DONE'].includes(status) ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Move Inventory Request (WH FG ke WH Marketing)</div>
          {flags.can_request ? (
            <>
              <Field label="Nomor Move Inventory Request">
                <input value={requestNo} onChange={(e) => setRequestNo(e.target.value)} maxLength={40} />
              </Field>
              <button type="button" className="btn" disabled={busy} onClick={saveMove}>Simpan Move Inventory Request</button>
            </>
          ) : (
            <div className="mb-kv">Nomor request <b>{req.epicor_request_no || '—'}</b></div>
          )}
        </div>
      ) : null}

      {['REQUESTED', 'TRANSFERRED', 'ISSUED', 'DONE'].includes(status) ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Inventory Transfer (Warehouse)</div>
          {flags.can_transfer ? (
            <>
              <Field label="Nomor Pra-SJ">
                <input value={praSj} onChange={(e) => setPraSj(e.target.value)} maxLength={40} />
              </Field>
              <button type="button" className="btn" disabled={busy} onClick={saveTransfer}>Simpan Inventory Transfer</button>
            </>
          ) : req.pra_sj_number ? (
            <>
              <div className="mb-kv">Pra-SJ <b>{req.pra_sj_number}</b></div>
              <div className="me-hint">Ditransfer {fmtDate(req.transferred_at)}.</div>
            </>
          ) : (
            <div className="me-hint" style={{ marginTop: 0 }}>Menunggu Warehouse menjalankan Inventory Transfer.</div>
          )}
        </div>
      ) : null}

      {['TRANSFERRED', 'ISSUED', 'DONE'].includes(status) ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Issue Misc. Material</div>
          {flags.can_issue ? (
            <>
              <Field label="Nomor Dokumen Issue">
                <input value={issueRef} onChange={(e) => setIssueRef(e.target.value)} maxLength={60} />
              </Field>
              <button type="button" className="btn" disabled={busy} onClick={saveIssue}>Simpan Issue Misc. Material</button>
            </>
          ) : req.issue_reference ? (
            <>
              <div className="mb-kv">Nomor dokumen <b>{req.issue_reference}</b></div>
              <div className="me-hint">Dikeluarkan {fmtDate(req.issued_at)}.</div>
            </>
          ) : (
            <div className="me-hint" style={{ marginTop: 0 }}>Menunggu Marketing menjalankan Issue Misc. Material.</div>
          )}
        </div>
      ) : null}

      {['ISSUED', 'DONE'].includes(status) ? (
        <div className="mb-sec">
          <div className="mb-sec-t">{K.lastTitle}</div>
          {flags.can_complete ? (
            <form onSubmit={finish}>
              <Field label={sample ? 'Nama Sales' : 'Nama Penerima'}>
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={100} />
              </Field>
              {sample ? (
                <Field label="Peruntukan">
                  <input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={150} />
                </Field>
              ) : null}
              <div className="cl-res">
                <div className="cl-res-row"><span>Remarks</span><b>{recipient.trim() || '…'} / {sample ? purpose.trim() || '…' : req.event?.description}</b></div>
              </div>
              <button className="btn" type="submit" disabled={busy} style={{ marginTop: 12 }}>Selesaikan Permintaan</button>
            </form>
          ) : (
            <>
              <div className="mb-kv">Remarks <b>{req.remarks}</b></div>
              <div className="me-hint">Dicatat {fmtDate(req.completed_at)} sebagai keterangan peruntukan barang.</div>
            </>
          )}
        </div>
      ) : null}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
