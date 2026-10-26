// frontend/src/pages/CreditMemoDetail.jsx
// Blueprint MJU 3.2.11 (MKT11): Finance membuat credit memo atas invoice lama yang masih terbuka, senilai klaim yang disetujui,
// dengan kode klaim di Reference (01-02, plus jenis PPh bila dikenakan), lalu Check & Post (03) dan Apply (04). Saldo klaim
// baru berkurang saat Apply. Pembuatan credit memo-nya sendiri dikerjakan di Epicor; di sini langkah-langkahnya dicatat.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { applyCreditMemo, getCreditMemoClaim, postCreditMemo, saveCreditMemoEntry } from '../api'
import { Field } from '../components/Field'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { canCreditMemo, creditMemoStatusMeta } from '../lib/marketingClaim'
import { fmtIdr } from '../lib/money'
import '../styles/marketingapproval.css'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

export default function CreditMemoDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [claim, setClaim] = useState(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [taxApplies, setTaxApplies] = useState(false)
  const [taxType, setTaxType] = useState('')
  const [memoNumber, setMemoNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const allowed = canCreditMemo(user)

  const load = (c) => {
    setClaim(c)
    const m = c.credit_memo
    if (m) {
      setInvoiceNumber(m.invoice_number || '')
      setTaxApplies(Boolean(m.tax_applies))
      setTaxType(m.tax_type || '')
    }
  }

  useEffect(() => {
    if (!allowed) return
    getCreditMemoClaim(id)
      .then(load)
      .catch((e) => showToast(e.message || 'Gagal memuat klaim', { warn: true }))
  }, [allowed, id, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Potong Tagihan" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk finance dan admin.
        </div>
      </Screen>
    )
  }

  if (!claim) {
    return (
      <Screen>
        <TopBar title="Potong Tagihan" backTo="/marketing/credit-memos" />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const memo = claim.credit_memo
  const flags = claim.flags || {}
  const st = creditMemoStatusMeta(claim.credit_memo_status)

  const run = async (fn, okMessage, after) => {
    setBusy(true)
    try {
      const updated = await fn()
      load(updated)
      if (after) after()
      showToast(okMessage)
    } catch (e) {
      showToast(e.message || 'Gagal memproses', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const saveEntry = (e) => {
    e.preventDefault()
    if (!invoiceNumber.trim()) return showToast('Isi nomor invoice lama', { warn: true })
    if (taxApplies && !taxType) return showToast('Pilih Tax Type (PPh Badan atau PPh Pribadi)', { warn: true })

    const payload = { invoice_number: invoiceNumber.trim(), tax_applies: taxApplies }
    if (taxApplies) payload.tax_type = taxType

    return run(() => saveCreditMemoEntry(claim.id, payload), 'Credit memo entry tersimpan')
  }

  const post = () => {
    if (!memoNumber.trim()) return showToast('Isi nomor credit memo', { warn: true })

    return run(() => postCreditMemo(claim.id, { credit_memo_number: memoNumber.trim() }), 'Credit memo diposting', () => setMemoNumber(''))
  }

  return (
    <Screen>
      <TopBar title="Potong Tagihan" backTo="/marketing/credit-memos" />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{claim.customer?.name}</div>
            <div className="mb-meta">{claim.claim_no} · {claim.program?.event_code}</div>
          </div>
          <span className={`mb-badge ${st.tone}`}>{st.label}</span>
        </div>
        <div className="mb-amount"><b data-testid="approved">{fmtIdr(claim.approved_amount)}</b><span>nilai klaim disetujui</span></div>
        <div className="mb-kv">Saldo klaim <b data-testid="balance">{fmtIdr(claim.balance)}</b></div>
        <div className="me-hint">Saldo klaim baru berkurang setelah credit memo di-Apply.</div>
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t"><span className="me-step">1</span>Credit Memo Entry</div>
        {flags.can_entry ? (
          <form onSubmit={saveEntry}>
            <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
              Di AR Invoice Entry, pilih New Credit Memo atas invoice lama distributor yang masih terbuka, lalu catat di sini.
            </div>
            <Field label="Nomor Invoice Lama (masih terbuka)">
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={50} />
            </Field>
            <Field label="Nilai Credit (Rp)" hint={<div className="me-hint">Sebesar klaim yang disetujui; tidak diketik.</div>}>
              <input value={fmtIdr(claim.approved_amount)} readOnly />
            </Field>
            <Field label="Reference" hint={<div className="me-hint">Kode klaim, diisi pada Reference credit memo.</div>}>
              <input value={claim.claim_no} readOnly />
            </Field>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
              <input type="checkbox" checked={taxApplies} onChange={(e) => { setTaxApplies(e.target.checked); if (!e.target.checked) setTaxType('') }} />
              Dikenakan PPh
            </label>
            {taxApplies ? (
              <Field label="Tax Type" hint={<div className="me-hint">Pilih sesuai status distributor.</div>}>
                <select value={taxType} onChange={(e) => setTaxType(e.target.value)}>
                  <option value="">— pilih Tax Type —</option>
                  {(flags.tax_types || []).map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            <button className="btn" type="submit" disabled={busy}>{memo ? 'Ubah Credit Memo Entry' : 'Simpan Credit Memo Entry'}</button>
          </form>
        ) : memo ? (
          <>
            <div className="mb-kv">Invoice lama <b>{memo.invoice_number}</b></div>
            <div className="mb-kv">Nilai credit <b>{fmtIdr(memo.credit_value)}</b></div>
            <div className="mb-kv">Reference <b>{memo.reference}</b></div>
            <div className="mb-kv">PPh <b>{memo.tax_applies ? memo.tax_type_label : 'Tidak dikenakan'}</b></div>
            <div className="me-hint">Dientri oleh {memo.enterer?.name || '—'} · {fmtDate(memo.entered_at)}</div>
          </>
        ) : null}
      </div>

      {memo ? (
        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">2</span>Check &amp; Post Credit Memo</div>
          {flags.can_post ? (
            <>
              <Field label="Nomor Credit Memo (AR Credit Memo)">
                <input value={memoNumber} onChange={(e) => setMemoNumber(e.target.value)} maxLength={50} />
              </Field>
              <button type="button" className="btn" disabled={busy} onClick={post}>Check &amp; Post Credit Memo</button>
            </>
          ) : (
            <>
              <div className="mb-kv">Nomor credit memo <b>{memo.credit_memo_number}</b></div>
              <div className="me-hint">Diposting oleh {memo.poster?.name || '—'} · {fmtDate(memo.posted_at)}</div>
            </>
          )}
        </div>
      ) : null}

      {memo && memo.status !== 'ENTERED' ? (
        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">3</span>Apply Credit Memo</div>
          {flags.can_apply ? (
            <>
              <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>Saldo piutang distributor dan sisa saldo klaim berkurang setelah credit memo di-Apply.</div>
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => applyCreditMemo(claim.id), 'Credit memo di-apply, saldo klaim berkurang')}>
                Apply Credit Memo
              </button>
            </>
          ) : (
            <>
              <div className="cl-res">
                <div className="cl-res-row big"><span>Saldo klaim sekarang</span><b>{fmtIdr(claim.balance)}</b></div>
              </div>
              <div className="me-hint">Credit memo sudah di-Apply oleh {memo.applier?.name || '—'} · {fmtDate(memo.applied_at)}.</div>
            </>
          )}
        </div>
      ) : null}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
