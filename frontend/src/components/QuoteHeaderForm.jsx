// frontend/src/components/QuoteHeaderForm.jsx
// Isi halaman 10 Quotation — Header (dokumen hal. 32): kartu Quotation Header (data baca-saja, PO, TOP, Task Tracking,
// Quoted otomatis), tombol Lines, total, Task Completion (Next Task SENDQ), Comment — Quotation, Save, dan Download PDF.
import { useState } from 'react'
import { concludeLeadTask, getQuotePdf, saveQuoteHeader, updateLeadTask } from '../api'
import { fmtIdr } from '../lib/money'
import { quoteCode } from '../lib/leadCode'
import { REASON_CODES } from './ConclusionFields'
import { Field } from './Field'
import { TaskCompletion, useTaskCompletion } from './TaskCompletion'
import '../styles/taskpage.css'

// Master Terms Epicor belum tersambung: daftar sementara dari dokumen (nilai tersimpan tetap kode 15D/30D/45D/COD).
export const TOP_OPTIONS = [
  { value: '15D', label: '15 Days' },
  { value: '30D', label: '30 Days' },
  { value: '45D', label: '45 Days' },
  { value: 'COD', label: 'COD' },
]

// Dokumen menamai task CREATEQ "Buat Penawaran". Hanya untuk tampilan; nama di data tidak diubah.
export const QUOTE_TASK_NAME = 'Buat Penawaran'

function BubbleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  )
}

function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </svg>
  )
}

const asOptions = (list = []) => list.map((s) => ({ value: s, label: s }))

// Win hanya di QRSLT; Next Task diturunkan (SENDQ) dan tidak bisa diubah. Kode alasan SUKSES dan status In Progress
// mengikuti contoh di dokumen sampai master mapping (ReasonType = T) tersedia.
const QUOTE_CONFIG = {
  conclusions: ['NEXT', 'LOSE'],
  reasons: {
    NEXT: [{ value: 'SUKSES', label: 'SUKSES' }, ...asOptions(REASON_CODES.NEXT)],
    LOSE: asOptions(REASON_CODES.LOSE),
  },
  defaultStatus: 'In Progress',
  defaultNextCode: 'SENDQ',
  nextTaskReadOnly: true,
  nextBesideStatus: true,
  plainLabels: true,
  templateLabel: (t) => t.code || String(t.seq),
  commentRows: 3,
  commentLabel: (
    <span className="qh-clabel">
      <BubbleIcon /> Comment — Task (internal)
    </span>
  ),
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const EMPTY_DATE = '—/—/—'

const ymd = (v) => /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''))
/** "Tue, 6 Oct 2026" dari tanggal murni (tanpa geser zona waktu). */
const longDay = (v) => {
  const m = ymd(v)
  if (!m) return '—'
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return `${WEEKDAYS[dow]}, ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}
/** "6/10/2026" dari tanggal murni (YYYY-MM-DD). */
const shortDay = (v) => {
  const m = ymd(v)
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : EMPTY_DATE
}
/** "6/10/2026" dari penanda waktu (tanggal lokal). */
const stampDay = (v) => {
  if (!v) return EMPTY_DATE
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? EMPTY_DATE : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

const trimPct = (n) => String(Math.round(n * 100) / 100)

/** Satu baris per Line yang diberi diskon: "Line Disc 1 (2%)". Tanpa diskon: satu baris "Line Disc". */
function discountRows(quote) {
  const rows = []
  ;(quote.lines || []).forEach((l, i) => {
    const gross = Number(l.qty_pcs) * Number(l.unit_price)
    const disc = gross - Number(l.line_total)
    if (gross > 0 && disc > 0.005) {
      rows.push({ key: l.id ?? i, label: `Line Disc ${i + 1} (${trimPct((disc / gross) * 100)}%)`, amount: disc })
    }
  })
  return rows.length ? rows : [{ key: 'none', label: 'Line Disc', amount: Number(quote.discount_total || 0) }]
}

function saveBlob(base64, filename, mime) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export default function QuoteHeaderForm({ lead, task, quote, showToast, onDone, onOpenLines }) {
  const [busy, setBusy] = useState(false)
  const [po, setPo] = useState(quote.customer_po || '')
  const [term, setTerm] = useState(quote.payment_term || '')
  const [due, setDue] = useState(quote.due_date || '')
  const [expectedClose, setExpectedClose] = useState(quote.expected_close_date || '')
  const [notes, setNotes] = useState(quote.notes || '')
  const tc = useTaskCompletion(task, lead, QUOTE_CONFIG)

  const closed = ['WON', 'LOST'].includes(quote.status)
  const daysOpen = task.created_at ? Math.max(0, Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400000)) : 0
  const lines = quote.lines || []
  const lineCount = quote.lines_count ?? lines.length
  const firstLine = lines[0]?.description || lines[0]?.product?.description
  const linesText = lineCount
    ? `Lines (${lineCount}) — ${firstLine || 'Quotation Lines'}${lineCount > 1 ? ` +${lineCount - 1}` : ''} · ${fmtIdr(quote.subtotal)}`
    : 'Lines (0) — Add the first line'

  const submit = async (e) => {
    e.preventDefault()
    if (!tc.valid()) {
      showToast('Pilih tugas berikutnya', { warn: true })
      return
    }
    setBusy(true)
    try {
      if (!closed) {
        await saveQuoteHeader(quote.id, {
          customer_po: po.trim() || null,
          payment_term: term || null,
          due_date: due || null,
          expected_close_date: expectedClose || null,
          notes: notes.trim() || null,
        })
      }
      if (!tc.complete) {
        await updateLeadTask(task.id, { remark: tc.comment.trim() || null })
        showToast('Quotation tersimpan')
        onDone?.()
        return
      }
      const res = await concludeLeadTask(task.id, tc.toPayload())
      showToast(
        tc.conclusion === 'NEXT'
          ? `Quotation selesai · berikutnya: ${res?.next_task?.name || '—'}`
          : 'Prospek ditandai KALAH',
      )
      onDone?.(res)
    } catch (err) {
      showToast(err?.message || 'Gagal menyimpan Quotation', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const downloadPdf = async () => {
    try {
      const res = await getQuotePdf(quote.id)
      saveBlob(res.base64, res.filename || `Quotation-${quoteCode(lead)}.pdf`, res.mime)
    } catch (err) {
      showToast(err?.message || 'Gagal membuat PDF', { error: true })
    }
  }

  return (
    <form onSubmit={submit} className="tp-form">
      {closed ? (
        <div className="tp-empty" style={{ marginTop: 0 }}>
          Quotation sudah ditutup ({quote.status}); header tidak bisa diubah.
        </div>
      ) : null}

      <div className="qh-card">
        <div className="qh-title">
          <span className="qh-pill">HEADER</span>
          Quotation Header
        </div>

        <div className="qh-kvbox">
          <div className="qh-kv"><span>Quote Number</span><b>{quoteCode(lead)}</b></div>
          <div className="qh-kv"><span>Customer</span><b>{quote.customer?.name || lead.business_name}</b></div>
          <div className="qh-kv"><span>Primary Salesperson</span><b>{quote.salesperson?.name || '—'}</b></div>
          <div className="qh-kv"><span>Opened</span><b>{longDay(lead.register_date)}</b></div>
        </div>

        <div className="tc-grid">
          <Field label="Customer PO Number *" style={{ margin: 0 }}>
            <input placeholder="Type manually" value={po} onChange={(e) => setPo(e.target.value)} readOnly={closed} />
          </Field>
          <Field label="TOP (Term of Payment) *" style={{ margin: 0 }}>
            <select value={term} onChange={(e) => setTerm(e.target.value)} disabled={closed}>
              <option value="">— Select —</option>
              {TOP_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="qh-sep" />

        <div className="qh-th">
          <span>Task Tracking ({task.code})</span>
          <label className="qh-auto">
            <input type="checkbox" aria-label="Quoted" checked={Boolean(quote.quoted)} disabled readOnly />
            Quoted <small>(auto)</small>
          </label>
        </div>
        <div className="qh-tiles">
          <div className="qh-tile"><span>Open</span><b>{stampDay(task.created_at)}</b></div>
          <label className="qh-tile edit">
            <span>Due</span>
            <input type="date" value={due || ''} onChange={(e) => setDue(e.target.value)} readOnly={closed} />
          </label>
          <div className="qh-tile"><span>Days Open</span><b>{daysOpen}</b></div>
          <div className="qh-tile"><span>Quoted</span><b>{quote.quoted ? stampDay(quote.quoted_at) : EMPTY_DATE}</b></div>
          <div className="qh-tile"><span>Expires</span><b>{quote.quoted ? shortDay(quote.expires_at) : EMPTY_DATE}</b></div>
          <label className="qh-tile edit">
            <span>Expected Close</span>
            <input type="date" value={expectedClose || ''} onChange={(e) => setExpectedClose(e.target.value)} readOnly={closed} />
          </label>
        </div>
        <div className="qh-note">
          Blue fields are editable. Quoted/Expires light up automatically once Quoted ticks (Task Conclusion = Win).
        </div>
      </div>

      <button type="button" className="qh-lines" onClick={onOpenLines}>
        <span>{linesText}</span>
        <span aria-hidden="true">›</span>
      </button>

      <div className="qh-totals">
        <div className="qh-trow"><span>Total Gross</span><span>{fmtIdr(quote.subtotal)}</span></div>
        {discountRows(quote).map((r) => (
          <div className="qh-trow" key={r.key}>
            <span>{r.label}</span>
            <span>− {fmtIdr(r.amount)}</span>
          </div>
        ))}
        <div className="qh-trow deal"><span>Total Deal</span><span>{fmtIdr(quote.total)}</span></div>
        <div className="qh-tfoot">
          Rolled up automatically from all Lines — tap Quotation Lines above to edit pricing or discount.
        </div>
      </div>

      <TaskCompletion
        tc={tc}
        title={`Task Completion — ${QUOTE_TASK_NAME} (${task.code})`}
        subtitle={`Saving this quotation completes the ${task.code} task directly — Conclusion/Reason/Next Task fire on Save, no separate step.`}
      />

      <div className="qh-cust">
        <div className="qh-cust-h">
          <BubbleIcon />
          Comment — Quotation (prints on PDF)
        </div>
        <textarea
          aria-label="Comment — Quotation (prints on PDF)"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          readOnly={closed}
        />
      </div>

      <button className="btn ok" type="submit" disabled={busy}>
        {busy ? 'Menyimpan…' : 'Save'}
      </button>
      <button type="button" className="qh-pdf" onClick={downloadPdf}>
        <PrinterIcon />
        Download PDF — SSRS Quotation Report
      </button>
      <p className="qh-pdfnote">
        This is how the quotation gets sent to the customer — download &amp; share the PDF. It doesn&apos;t touch the Quoted
        flag above.
      </p>
    </form>
  )
}
