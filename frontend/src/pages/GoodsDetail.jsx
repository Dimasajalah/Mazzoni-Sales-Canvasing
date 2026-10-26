// frontend/src/pages/GoodsDetail.jsx
// Blueprint MJU 3.2.13 (MKT13), langkah 01-06: Marketing mengatur jenis dan jumlah barang (Reward), Check Stock di warehouse Marketing,
// Requisition (PR01) bila stok tidak tersedia, Misc. Shipment dengan Reason Code, Issue Misc. Material, lalu Code Klaim dan nama penerima
// pada Reference dengan bukti serah terima terlampir; klaim menjadi Dicairkan. Langkah di Epicor dikerjakan di luar aplikasi; di sini dicatat.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  checkGoodsStock, confirmGoodsReceipt, getGoodsClaim, handOverGoods, saveGoodsIssue, saveGoodsItems, saveGoodsRequisition, saveGoodsShipment,
} from '../api'
import { AttachmentPicker } from '../components/AttachmentPicker'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { canGoods, claimStatusMeta, goodsStatusMeta } from '../lib/marketingClaim'
import { fmtIdr } from '../lib/money'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const blankRow = () => ({ part_num: '', qty: null, description: '' })
const fmtQty = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })

export default function GoodsDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [claim, setClaim] = useState(null)
  const [rows, setRows] = useState([blankRow()])
  const [stockNotes, setStockNotes] = useState('')
  const [requisition, setRequisition] = useState('')
  const [reason, setReason] = useState('')
  const [issueRef, setIssueRef] = useState('')
  const [recipient, setRecipient] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const allowed = canGoods(user)

  const load = (c) => {
    setClaim(c)
    const items = c.goods?.items || []
    if (items.length) setRows(items.map((i) => ({ part_num: i.part_num, qty: Number(i.qty), description: i.description || '' })))
    if (c.goods?.requisition_number) setRequisition(c.goods.requisition_number)
  }

  useEffect(() => {
    if (!allowed) return
    getGoodsClaim(id)
      .then(load)
      .catch((e) => showToast(e.message || 'Gagal memuat klaim', { warn: true }))
  }, [allowed, id, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Pencairan Barang" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  if (!claim) {
    return (
      <Screen>
        <TopBar title="Pencairan Barang" backTo="/marketing/goods" />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const goods = claim.goods
  const flags = claim.flags || {}
  const actors = goods?.actors || {}
  const st = claimStatusMeta(claim.status)
  const gst = goodsStatusMeta(goods?.status)
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

  const setRow = (i, patch) => setRows((rs) => rs.map((r, x) => (x === i ? { ...r, ...patch } : r)))

  const saveItems = (e) => {
    e.preventDefault()
    const seen = new Set()
    for (let i = 0; i < rows.length; i += 1) {
      const code = rows[i].part_num.trim()
      if (!code) return warn(`Isi kode part barang ${i + 1}`)
      if (!rows[i].qty || rows[i].qty <= 0) return warn(`Isi jumlah barang ${i + 1} lebih dari 0`)
      if (seen.has(code.toLowerCase())) return warn(`Kode part ${code} diisi lebih dari sekali`)
      seen.add(code.toLowerCase())
    }

    const items = rows.map((r) => {
      const item = { part_num: r.part_num.trim(), qty: r.qty }
      if (r.description.trim()) item.description = r.description.trim()
      return item
    })

    return run(() => saveGoodsItems(claim.id, items), 'Reward tersimpan')
  }

  const stock = (available) => run(() => checkGoodsStock(claim.id, { available, ...(stockNotes.trim() ? { notes: stockNotes.trim() } : {}) }), 'Check Stock tersimpan')

  const saveRequisition = () => {
    if (!requisition.trim()) return warn('Isi nomor Requisition')

    return run(() => saveGoodsRequisition(claim.id, { requisition_number: requisition.trim() }), 'Requisition tersimpan')
  }

  const saveShipment = () => {
    if (!reason.trim()) return warn('Isi Reason Code')

    return run(() => saveGoodsShipment(claim.id, { reason_code: reason.trim() }), 'Misc. Shipment tersimpan')
  }

  const saveIssue = () => {
    if (!issueRef.trim()) return warn('Isi nomor dokumen Issue Misc. Material')

    return run(() => saveGoodsIssue(claim.id, { issue_reference: issueRef.trim() }), 'Issue Misc. Material tersimpan')
  }

  const handOver = (e) => {
    e.preventDefault()
    if (!recipient.trim()) return warn('Isi nama penerima')
    if (files.length === 0) return warn('Lampirkan bukti serah terima barang')

    const fd = new FormData()
    fd.append('recipient_name', recipient.trim())
    files.forEach((f) => fd.append('files[]', f, f.name))

    return run(() => handOverGoods(claim.id, fd), 'Klaim dicairkan', () => setFiles([]))
  }

  const who = (field, at) => `${actors[field] || '—'} · ${fmtDate(at)}`
  const status = goods?.status

  return (
    <Screen>
      <TopBar title="Pencairan Barang" backTo="/marketing/goods" />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{claim.customer?.name}</div>
            <div className="mb-meta">{claim.claim_no} · {claim.program?.event_code}</div>
          </div>
          <span className={`mb-badge ${claim.status === 'DISBURSED' ? st.tone : gst.tone}`}>{claim.status === 'DISBURSED' ? st.label : gst.label}</span>
        </div>
        <div className="mb-amount"><b data-testid="approved">{fmtIdr(claim.approved_amount)}</b><span>nilai klaim disetujui</span></div>
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">Reward: Jenis dan Jumlah Barang</div>
        {flags.can_items ? (
          <form onSubmit={saveItems}>
            <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
              Jenis barang dan jumlahnya sesuai Reward pada rincian klaim. Kode part harus ada di Part Master.
            </div>
            {rows.map((r, i) => (
              <div key={i} className="mb-kv" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <input aria-label={`Kode part ${i + 1}`} placeholder="Kode part" value={r.part_num} maxLength={50} onChange={(e) => setRow(i, { part_num: e.target.value })} />
                <NumInput aria-label={`Jumlah ${i + 1}`} className="mb-money" value={r.qty} onChange={(v) => setRow(i, { qty: v })} placeholder="Jumlah" />
                <input aria-label={`Keterangan ${i + 1}`} placeholder="Keterangan (opsional)" value={r.description} maxLength={120} onChange={(e) => setRow(i, { description: e.target.value })} />
                {rows.length > 1 ? (
                  <button type="button" className="btn ghost sm" aria-label={`Hapus barang ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, x) => x !== i))}>Hapus barang</button>
                ) : null}
              </div>
            ))}
            {rows.length < (flags.max_items || 20) ? (
              <button type="button" className="btn ghost sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>+ Tambah Barang</button>
            ) : null}
            <div style={{ height: 10 }} />
            <button className="btn" type="submit" disabled={busy}>{goods ? 'Ubah Reward' : 'Simpan Reward'}</button>
          </form>
        ) : goods ? (
          <>
            {goods.items.map((i) => (
              <div key={i.id} className="mb-kv"><span>{i.part_num}{i.description ? ` · ${i.description}` : ''}</span><b>{fmtQty(i.qty)}</b></div>
            ))}
            <div className="me-hint">Diatur oleh {who('set_by', goods.set_at)}</div>
          </>
        ) : null}
      </div>

      {goods ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Check Stock (warehouse Marketing)</div>
          {flags.can_stock ? (
            <>
              <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>Periksa ketersediaan stok di warehouse Marketing, lalu catat hasilnya.</div>
              <Field label="Catatan (opsional)">
                <textarea rows={2} value={stockNotes} onChange={(e) => setStockNotes(e.target.value)} maxLength={500} />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" disabled={busy} onClick={() => stock(true)}>Stok Tersedia</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => stock(false)}>Stok Tidak Tersedia</button>
              </div>
            </>
          ) : goods.stock_checked_at ? (
            <>
              <div className="mb-kv">Hasil <b>{goods.stock_available ? 'Stok tersedia' : 'Stok tidak tersedia'}</b></div>
              {goods.stock_notes ? <div className="me-hint" style={{ marginTop: 0 }}>Catatan: {goods.stock_notes}</div> : null}
              <div className="me-hint">Diperiksa oleh {who('stock_checked_by', goods.stock_checked_at)}</div>
            </>
          ) : null}
        </div>
      ) : null}

      {goods && goods.stock_available === false ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Requisition (PR01)</div>
          {flags.can_requisition ? (
            <>
              <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>Pengadaan barang diajukan lewat Requisition. Barang dianggap siap setelah di-receipt.</div>
              <Field label="Nomor Requisition (PR01)">
                <input value={requisition} onChange={(e) => setRequisition(e.target.value)} maxLength={40} />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" disabled={busy} onClick={saveRequisition}>Simpan Requisition</button>
                {flags.can_receive ? <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => confirmGoodsReceipt(claim.id), 'Barang siap')}>Barang Sudah Di-receipt</button> : null}
              </div>
            </>
          ) : (
            <>
              <div className="mb-kv">Nomor Requisition <b>{goods.requisition_number || '—'}</b></div>
              {goods.received_at ? <div className="me-hint">Barang di-receipt: {who('received_by', goods.received_at)}</div> : null}
            </>
          )}
        </div>
      ) : null}

      {goods && ['READY', 'SHIPPED', 'ISSUED', 'HANDED_OVER'].includes(status) ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Misc. Shipment</div>
          {flags.can_shipment ? (
            <>
              <Field label="Reason Code">
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={30} />
              </Field>
              <button type="button" className="btn" disabled={busy} onClick={saveShipment}>Catat Misc. Shipment</button>
            </>
          ) : (
            <>
              <div className="mb-kv">Reason Code <b>{goods.shipment_reason_code}</b></div>
              <div className="me-hint">Dicatat oleh {who('shipped_by', goods.shipped_at)}</div>
            </>
          )}
        </div>
      ) : null}

      {goods && ['SHIPPED', 'ISSUED', 'HANDED_OVER'].includes(status) ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Issue Misc. Material</div>
          {flags.can_issue ? (
            <>
              <Field label="Nomor Dokumen Issue">
                <input value={issueRef} onChange={(e) => setIssueRef(e.target.value)} maxLength={60} />
              </Field>
              <button type="button" className="btn" disabled={busy} onClick={saveIssue}>Catat Issue Misc. Material</button>
            </>
          ) : (
            <>
              <div className="mb-kv">Nomor dokumen <b>{goods.issue_reference}</b></div>
              <div className="me-hint">Dicatat oleh {who('issued_by', goods.issued_at)}</div>
            </>
          )}
        </div>
      ) : null}

      {goods && ['ISSUED', 'HANDED_OVER'].includes(status) ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Code Klaim &amp; Penerima</div>
          {flags.can_handover ? (
            <form onSubmit={handOver}>
              <Field label="Nama Penerima">
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={100} />
              </Field>
              <div className="cl-res">
                <div className="cl-res-row"><span>Reference</span><b>{claim.claim_no} / {recipient.trim() || '…'}</b></div>
              </div>
              <Field label="Bukti Serah Terima Barang" hint={<div className="me-hint">Cetak bukti serah terima, lalu lampirkan fotonya (foto atau PDF).</div>}>
                <AttachmentPicker files={files} onChange={setFiles} />
              </Field>
              <button className="btn" type="submit" disabled={busy}>Selesaikan Pencairan</button>
            </form>
          ) : (
            <>
              <div className="mb-kv">Reference <b>{goods.reference}</b></div>
              <div className="mb-kv">Penerima <b>{goods.recipient_name}</b></div>
              <div className="me-hint">Klaim dicairkan oleh {who('handed_over_by', goods.handed_over_at)}. Bukti serah terima terlampir pada klaim.</div>
            </>
          )}
        </div>
      ) : null}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
