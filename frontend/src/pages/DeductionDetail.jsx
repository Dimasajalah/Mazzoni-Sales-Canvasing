// frontend/src/pages/DeductionDetail.jsx
// Blueprint MJU 3.2.10 (MKT10), langkah 02-04: Sales memotong klaim pada nota distributor. Nilai klaim yang dipakai tidak boleh
// melebihi total invoice maupun saldo klaim; potongan dicatat sebagai Misc Charge berkode KLAIM bernilai negatif dengan kode klaim
// di Reference; "Check & Post" mengurangi saldo klaim. Satu klaim bisa dipotong pada banyak nota.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getDeductionClaim, postClaimDeduction } from '../api'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { canDeduct } from '../lib/marketingClaim'
import { fmtIdr } from '../lib/money'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

export default function DeductionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [claim, setClaim] = useState(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [invoiceTotal, setInvoiceTotal] = useState(null)
  const [usedInput, setUsedInput] = useState(null) // null = ikut saran sistem
  const [busy, setBusy] = useState(false)
  const allowed = canDeduct(user)

  useEffect(() => {
    if (!allowed) return
    getDeductionClaim(id)
      .then(setClaim)
      .catch((e) => showToast(e.message || 'Gagal memuat klaim', { warn: true }))
  }, [allowed, id, showToast])

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

  if (!claim) {
    return (
      <Screen>
        <TopBar title="Potong Nota" backTo="/marketing/deductions" />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const balance = Number(claim.balance)
  const total = invoiceTotal || 0
  const suggested = total > 0 ? Math.min(balance, total) : 0
  const used = usedInput ?? suggested
  const capped = total > 0 && balance >= total // saldo menutup seluruh invoice: nilai yang dipakai dibatasi sebesar invoice
  const history = claim.deductions || []

  const submit = async (e) => {
    e.preventDefault()
    const warn = (m) => showToast(m, { warn: true })
    if (!invoiceNumber.trim()) return warn('Isi nomor invoice')
    if (!total || total <= 0) return warn('Isi total invoice lebih dari 0')
    if (!used || used <= 0) return warn('Nilai klaim yang digunakan harus lebih dari 0')
    if (used > total) return warn('Nilai klaim yang digunakan tidak boleh melebihi total invoice')
    if (used > balance) return warn('Nilai klaim yang digunakan melebihi saldo klaim')

    const payload = { invoice_number: invoiceNumber.trim(), invoice_total: total, used_amount: used }
    if (invoiceDate) payload.invoice_date = invoiceDate

    setBusy(true)
    try {
      setClaim(await postClaimDeduction(claim.id, payload))
      setInvoiceNumber('')
      setInvoiceDate('')
      setInvoiceTotal(null)
      setUsedInput(null)
      showToast('Potongan nota diposting')
    } catch (err) {
      showToast(err.message || 'Gagal memposting potongan', { error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Potong Nota" backTo="/marketing/deductions" />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{claim.customer?.name}</div>
            <div className="mb-meta">{claim.claim_no} · {claim.program?.event_code}</div>
          </div>
        </div>
        <div className="mb-amount"><b data-testid="balance">{fmtIdr(balance)}</b><span>saldo klaim</span></div>
        <div className="mb-kv">Nilai klaim disetujui <b>{fmtIdr(claim.approved_amount)}</b></div>
        <div className="mb-kv">Sudah dipotong <b>{fmtIdr(claim.used_total)}</b></div>
      </div>

      {balance > 0 ? (
        <form className="mb-sec" onSubmit={submit}>
          <div className="mb-sec-t">Nota Distributor</div>
          <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            Buat invoice atas pembelian baru distributor di AR Invoice Entry, lalu isi nomor dan totalnya di sini untuk memotongnya dengan klaim.
          </div>
          <Field label="Nomor Invoice">
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={50} />
          </Field>
          <Field label="Tanggal Invoice (opsional)">
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
          <Field label="Total Invoice (Rp)">
            <NumInput className="mb-money" value={invoiceTotal} onChange={setInvoiceTotal} placeholder="0" />
          </Field>

          {total > 0 ? (
            <>
              {capped ? (
                <div className="cl-late">
                  Saldo klaim sama dengan atau lebih besar dari total invoice, jadi nilai klaim yang dipakai disesuaikan agar tidak melebihi nilai invoice.
                </div>
              ) : null}
              <div style={{ height: 10 }} />
              <Field label="Nilai Klaim yang Digunakan (Rp)">
                <NumInput className="mb-money" value={used} onChange={setUsedInput} placeholder="0" />
              </Field>
              <div className="me-hint">Paling besar Rp {Math.min(balance, total).toLocaleString('id-ID')} (yang lebih kecil antara saldo klaim dan total invoice).</div>

              <div className="cl-res">
                <div className="cl-res-row"><span>Total Invoice</span><b>{fmtIdr(total)}</b></div>
                <div className="cl-res-row"><span>Misc Charge KLAIM</span><b>-{fmtIdr(used || 0)}</b></div>
                <div className="cl-res-row"><span>Reference</span><b>{claim.claim_no}</b></div>
                <div className="cl-res-row big"><span>Total Setelah Potongan</span><b>{fmtIdr(total - (used || 0))}</b></div>
                <div className="cl-res-row"><span>Saldo Klaim Sesudah</span><b>{fmtIdr(balance - (used || 0))}</b></div>
              </div>
            </>
          ) : null}

          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 12 }}>
            {busy ? 'Memposting…' : 'Check & Post'}
          </button>
        </form>
      ) : (
        <div className="mb-sec">
          <div className="me-hint" style={{ marginTop: 0 }}>Saldo klaim sudah habis.</div>
        </div>
      )}

      <div className="mb-sec">
        <div className="mb-sec-t">Riwayat Potongan ({history.length})</div>
        {history.length === 0 ? (
          <div className="me-hint" style={{ marginTop: 0 }}>Klaim ini belum dipotongkan pada nota mana pun.</div>
        ) : (
          history.map((d) => (
            <div key={d.id} className="mb-kv" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <span><b>{d.invoice_number}</b>{d.invoice_date ? ` · ${fmtDate(d.invoice_date)}` : ''}</span>
              <span>
                Klaim dipakai {fmtIdr(d.claim_amount_used)} · Misc Charge {d.misc_charge_code} -{fmtIdr(Math.abs(d.misc_charge_amount))} · Ref. {d.reference}
              </span>
              <span>Nota {fmtIdr(d.invoice_total)} menjadi {fmtIdr(d.net_invoice)} · saldo {fmtIdr(d.balance_after)}</span>
              <small>Diposting oleh {d.poster?.name || '—'} · {fmtDate(d.posted_at)}</small>
            </div>
          ))
        )}
      </div>
      <div style={{ height: 12 }} />
    </Screen>
  )
}
