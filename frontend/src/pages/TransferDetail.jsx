// frontend/src/pages/TransferDetail.jsx
// Blueprint MJU 3.2.12 (MKT12): Finance mengisi rekening tujuan dan status PKP distributor (Misc. Payment Entry). Rekening perorangan
// memakai PPh 21 (dasar NPWP atau KTP penerima); selain itu PPh 23 (tarif PKP lebih rendah dari Non-PKP). Setelah dana ditransfer,
// nomor referensi diisi dan klaim menjadi Dicairkan. Transfer dananya sendiri dilakukan di luar aplikasi; di sini dicatat.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTransferClaim, markTransferred, saveTransferEntry } from '../api'
import { Field } from '../components/Field'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { canTransfer, claimStatusMeta, transferStatusMeta } from '../lib/marketingClaim'
import { fmtIdr } from '../lib/money'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)

export default function TransferDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [claim, setClaim] = useState(null)
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [isIndividual, setIsIndividual] = useState(false)
  const [isPkp, setIsPkp] = useState(false)
  const [taxIdType, setTaxIdType] = useState('')
  const [taxIdNumber, setTaxIdNumber] = useState('')
  const [reference, setReference] = useState('')
  const [transferredOn, setTransferredOn] = useState(todayLocal())
  const [busy, setBusy] = useState(false)
  const allowed = canTransfer(user)

  const load = (c) => {
    setClaim(c)
    const t = c.transfer
    if (t) {
      setBankName(t.bank_name || '')
      setAccountNumber(t.account_number || '')
      setAccountName(t.account_name || '')
      setIsIndividual(Boolean(t.is_individual))
      setIsPkp(Boolean(t.is_pkp))
      setTaxIdType(t.tax_id_type || '')
      setTaxIdNumber(t.tax_id_number || '')
    }
  }

  useEffect(() => {
    if (!allowed) return
    getTransferClaim(id)
      .then(load)
      .catch((e) => showToast(e.message || 'Gagal memuat klaim', { warn: true }))
  }, [allowed, id, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Pencairan Transfer" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk finance dan admin.
        </div>
      </Screen>
    )
  }

  if (!claim) {
    return (
      <Screen>
        <TopBar title="Pencairan Transfer" backTo="/marketing/transfers" />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const transfer = claim.transfer
  const flags = claim.flags || {}
  const rates = flags.rates || {}
  const st = claimStatusMeta(claim.status)

  // pratinjau pajak mengikuti aturan server: perorangan PPh 21; selain itu PPh 23 (PKP atau Non-PKP)
  const gross = Number(claim.approved_amount) || 0
  const rate = isIndividual ? rates.pph21 : isPkp ? rates.pph23_pkp : rates.pph23_non_pkp
  const taxAmount = Math.round(gross * (rate || 0)) / 100
  const taxLabel = isIndividual ? 'PPh 21' : 'PPh 23'

  const run = async (fn, okMessage) => {
    setBusy(true)
    try {
      load(await fn())
      showToast(okMessage)
    } catch (e) {
      showToast(e.message || 'Gagal memproses', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const saveEntry = (e) => {
    e.preventDefault()
    const warn = (m) => showToast(m, { warn: true })
    if (!bankName.trim()) return warn('Isi bank tujuan')
    if (!accountNumber.trim()) return warn('Isi nomor rekening')
    if (!/^[0-9][0-9 -]*$/.test(accountNumber.trim())) return warn('Nomor rekening hanya boleh berisi angka, spasi, dan tanda hubung')
    if (!accountName.trim()) return warn('Isi nama pemilik rekening')
    if (isIndividual && !taxIdType) return warn('Pilih dasar PPh 21: NPWP atau KTP penerima')
    if (isIndividual && !taxIdNumber.trim()) return warn(`Isi nomor ${taxIdType} penerima`)

    const payload = {
      bank_name: bankName.trim(), account_number: accountNumber.trim(), account_name: accountName.trim(), is_individual: isIndividual, is_pkp: isPkp,
    }
    if (isIndividual) {
      payload.tax_id_type = taxIdType
      payload.tax_id_number = taxIdNumber.trim()
    }

    return run(() => saveTransferEntry(claim.id, payload), 'Misc. payment entry tersimpan')
  }

  const markDone = (e) => {
    e.preventDefault()
    if (!reference.trim()) return showToast('Isi nomor referensi transfer', { warn: true })
    if (!transferredOn) return showToast('Isi tanggal transfer', { warn: true })

    return run(() => markTransferred(claim.id, { transfer_reference: reference.trim(), transferred_on: transferredOn }), 'Klaim dicairkan')
  }

  return (
    <Screen>
      <TopBar title="Pencairan Transfer" backTo="/marketing/transfers" />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{claim.customer?.name}</div>
            <div className="mb-meta">{claim.claim_no} · {claim.program?.event_code}</div>
          </div>
          <span className={`mb-badge ${st.tone}`}>{st.label}</span>
        </div>
        <div className="mb-amount"><b data-testid="approved">{fmtIdr(claim.approved_amount)}</b><span>nilai klaim disetujui</span></div>
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">Misc. Payment Entry</div>
        {flags.can_entry ? (
          <form onSubmit={saveEntry}>
            <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
              Isi rekening tujuan dan status PKP distributor. Pajak dihitung otomatis dari nilai klaim yang disetujui.
            </div>
            <Field label="Bank Tujuan">
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={60} />
            </Field>
            <Field label="Nomor Rekening">
              <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={40} inputMode="numeric" />
            </Field>
            <Field label="Nama Pemilik Rekening">
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} maxLength={100} />
            </Field>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
              <input type="checkbox" checked={isIndividual} onChange={(e) => setIsIndividual(e.target.checked)} />
              Rekening perorangan
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
              <input type="checkbox" checked={isPkp} onChange={(e) => setIsPkp(e.target.checked)} />
              Distributor berstatus PKP
            </label>
            {isIndividual ? (
              <>
                <Field label="Dasar PPh 21" hint={<div className="me-hint">NPWP atau KTP penerima.</div>}>
                  <select value={taxIdType} onChange={(e) => setTaxIdType(e.target.value)}>
                    <option value="">— pilih NPWP atau KTP —</option>
                    {(flags.tax_id_types || []).map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Nomor NPWP / KTP Penerima">
                  <input value={taxIdNumber} onChange={(e) => setTaxIdNumber(e.target.value)} maxLength={30} />
                </Field>
              </>
            ) : null}

            <div className="cl-res">
              <div className="cl-res-row"><span>Nilai Klaim</span><b>{fmtIdr(gross)}</b></div>
              <div className="cl-res-row"><span>Tax Type</span><b>{taxLabel}</b></div>
              <div className="cl-res-row"><span>Tarif</span><b>{rate}%</b></div>
              <div className="cl-res-row"><span>Potongan Pajak</span><b>-{fmtIdr(taxAmount)}</b></div>
              <div className="cl-res-row big"><span>Nilai Transfer Bersih</span><b>{fmtIdr(gross - taxAmount)}</b></div>
            </div>
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 12 }}>
              {transfer ? 'Ubah Misc. Payment Entry' : 'Simpan Misc. Payment Entry'}
            </button>
          </form>
        ) : transfer ? (
          <>
            <div className="mb-kv">Rekening tujuan <b>{transfer.bank_name} · {transfer.account_number}</b></div>
            <div className="mb-kv">Atas nama <b>{transfer.account_name}</b></div>
            <div className="mb-kv">Jenis rekening <b>{transfer.is_individual ? 'Perorangan' : 'Bukan perorangan'}</b></div>
            <div className="mb-kv">Status PKP <b>{transfer.is_pkp ? 'PKP' : 'Non-PKP'}</b></div>
            {transfer.is_individual ? <div className="mb-kv">Dasar PPh 21 <b>{transfer.tax_id_type} {transfer.tax_id_number}</b></div> : null}
            <div className="cl-res">
              <div className="cl-res-row"><span>Nilai Klaim</span><b>{fmtIdr(transfer.gross_amount)}</b></div>
              <div className="cl-res-row"><span>Tax Type</span><b>{transfer.tax_type_label}</b></div>
              <div className="cl-res-row"><span>Tarif</span><b>{Number(transfer.tax_rate)}%</b></div>
              <div className="cl-res-row"><span>Potongan Pajak</span><b>-{fmtIdr(transfer.tax_amount)}</b></div>
              <div className="cl-res-row big"><span>Nilai Transfer Bersih</span><b>{fmtIdr(transfer.net_amount)}</b></div>
            </div>
            <div className="me-hint">Dientri oleh {transfer.enterer?.name || '—'} · {fmtDate(transfer.entered_at)}</div>
          </>
        ) : null}
      </div>

      {transfer ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Konfirmasi Transfer</div>
          {flags.can_transfer ? (
            <form onSubmit={markDone}>
              <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
                Isi setelah dana ditransfer (Bukti Transfer). Status klaim menjadi Dicairkan.
              </div>
              <Field label="Nomor Referensi Transfer">
                <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
              </Field>
              <Field label="Tanggal Transfer">
                <input type="date" value={transferredOn} onChange={(e) => setTransferredOn(e.target.value)} />
              </Field>
              <button className="btn" type="submit" disabled={busy}>Tandai Dicairkan</button>
            </form>
          ) : (
            <>
              <div className="mb-kv">Nomor referensi <b>{transfer.transfer_reference}</b></div>
              <div className="mb-kv">Tanggal transfer <b>{fmtDate(transfer.transferred_on)}</b></div>
              <div className="me-hint">
                Klaim sudah {transferStatusMeta(transfer.status).label.toLowerCase()} oleh {transfer.transferer?.name || '—'} · {fmtDate(transfer.transferred_at)}.
              </div>
            </>
          )}
        </div>
      ) : null}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
