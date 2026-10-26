// frontend/src/pages/ClaimDetail.jsx
// Blueprint MJU 3.2.8 (MKT08) langkah 04-10: keputusan khusus Direktur Sales untuk klaim yang melewati periode, Calculate
// (nilai eligible dan selisih dari parameter program), pilihan metode pencairan, lalu diteruskan ke approval.
// 3.2.9 (MKT09): konfirmasi selisih ke distributor, approval 4 tahap (Direktur Sales boleh menyesuaikan nilai), Nilai Klaim Disetujui.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { approveClaimSubmission, calculateClaim, confirmClaimDifference, finalizeClaimAmount, getClaim, passClaim, refuseClaim, rejectClaimSubmission, submitClaim } from '../api'
import { ApprovalPanel } from '../components/ApprovalPanel'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { claimStatusMeta } from '../lib/marketingClaim'
import { claimRateLabel } from '../lib/marketingEvent'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingapproval.css'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'
import '../styles/marketingsellout.css'

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const KIND = { LETTER: 'Surat Klaim', WORKSHEET: 'Kertas Kerja', HANDOVER: 'Serah Terima Barang' }

export default function ClaimDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [claim, setClaim] = useState(null)
  const [decision, setDecision] = useState('PASS')
  const [reasonCode, setReasonCode] = useState('')
  const [notes, setNotes] = useState('')
  const [method, setMethod] = useState('')
  const [confirmNotes, setConfirmNotes] = useState('')
  const [finalAmount, setFinalAmount] = useState(null)
  const [busy, setBusy] = useState(false)
  const allowed = isManager(user)

  useEffect(() => {
    if (!allowed) return
    getClaim(id)
      .then((c) => {
        setClaim(c)
        setMethod(c.payout_method || '')
      })
      .catch((e) => showToast(e.message || 'Gagal memuat pengajuan klaim', { warn: true }))
  }, [allowed, id, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Pengajuan Klaim" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  if (!claim) {
    return (
      <Screen>
        <TopBar title="Detail Pengajuan Klaim" backTo="/marketing/claims" />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const st = claimStatusMeta(claim.status)
  const program = claim.program || {}
  const flags = claim.flags || {}
  const codes = flags.reason_codes?.[decision === 'PASS' ? 'APPROVE' : 'REJECT'] || []
  const reasonLabel = (code) =>
    [...(flags.reason_codes?.APPROVE || []), ...(flags.reason_codes?.REJECT || [])].find((c) => c.value === code)?.label || code
  const calc = claim.calc_detail
  const ap = flags.approval
  const expected = ap?.expected_amount ?? null
  const diff = Number(claim.difference_amount)

  const run = async (fn, okMessage, after) => {
    setBusy(true)
    try {
      const updated = await fn()
      setClaim(updated)
      if (after) after(updated)
      showToast(okMessage)
    } catch (e) {
      showToast(e.message || 'Gagal memproses', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const submitDecision = (e) => {
    e.preventDefault()
    if (!reasonCode) return showToast('Pilih kode alasan', { warn: true })
    const payload = { reason_code: reasonCode }
    if (notes.trim()) payload.notes = notes.trim()

    return run(
      () => (decision === 'PASS' ? passClaim(claim.id, payload) : refuseClaim(claim.id, payload)),
      decision === 'PASS' ? 'Klaim di-pass, proses dilanjutkan' : 'Klaim tidak di-pass, proses dihentikan',
      () => {
        setReasonCode('')
        setNotes('')
      },
    )
  }

  const confirmDifference = () => {
    const payload = confirmNotes.trim() ? { notes: confirmNotes.trim() } : {}

    return run(() => confirmClaimDifference(claim.id, payload), 'Selisih dikonfirmasi, approval dimulai', () => setConfirmNotes(''))
  }

  const saveFinalAmount = () => {
    const amount = finalAmount ?? expected
    if (!amount || amount <= 0) return showToast('Isi Nilai Klaim Disetujui lebih dari 0', { warn: true })

    return run(() => finalizeClaimAmount(claim.id, { amount }), 'Nilai Klaim Disetujui tersimpan')
  }

  const submitToApproval = () => {
    if (!method) return showToast('Pilih metode pencairan', { warn: true })

    return run(() => submitClaim(claim.id, { payout_method: method }), 'Klaim diajukan untuk approval')
  }

  return (
    <Screen>
      <TopBar title="Detail Pengajuan Klaim" backTo="/marketing/claims" />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{claim.customer?.name}</div>
            <div className="mb-meta">{claim.claim_no} · {claim.customer?.customer_code}</div>
          </div>
          <span className={`mb-badge ${st.tone}`}>{st.label}</span>
        </div>
        <div className="mb-amount"><b>{fmtIdr(claim.claimed_amount)}</b><span>nilai pengajuan</span></div>
        <div className="mb-kv">Program <b><Link to={`/marketing/claim-programs/${program.id}`}>{program.event_code}</Link></b></div>
        <div className="mb-kv">Jenis klaim <b>{program.claim_type_label}</b></div>
        <div className="mb-kv">Surat diterima <b>{fmtDate(claim.letter_received_date)}</b></div>
        <div className="mb-kv">Batas pengajuan klaim <b>{fmtDate(program.claim_deadline)}</b></div>
        {claim.is_late ? <div className="cl-late">Klaim ini melewati periode klaim, sehingga butuh persetujuan khusus.</div> : null}
        {claim.status === 'STOPPED' ? <div className="me-hint">Klaim dihentikan: tidak di-pass oleh {flags.pass_label}.</div> : null}
      </div>

      {claim.is_late ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Persetujuan Khusus · {flags.pass_label}</div>
          {claim.pass_decision ? (
            <div className="ap-step" style={{ borderTop: 'none', paddingTop: 0 }}>
              <span className={`ap-dot ${claim.pass_decision === 'PASSED' ? 'done' : 'bad'}`}>{claim.pass_decision === 'PASSED' ? '✓' : '✕'}</span>
              <div className="ap-body">
                <b>{claim.pass_decision === 'PASSED' ? 'Di-pass' : 'Tidak di-pass'} oleh {claim.passer?.name || '—'}</b>
                <small>
                  {fmtDate(claim.pass_at)} · Alasan: {reasonLabel(claim.pass_reason_code)}
                  {claim.pass_notes ? <><br />Catatan: {claim.pass_notes}</> : null}
                </small>
              </div>
            </div>
          ) : flags.can_pass ? (
            <form className="ap-decide" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }} onSubmit={submitDecision}>
              <div className="ap-flag">Perlu keputusan Anda</div>
              <div style={{ height: 10 }} />
              <div className="mb-seg">
                <button type="button" className={`ap-yes${decision === 'PASS' ? ' on' : ''}`} aria-pressed={decision === 'PASS'} onClick={() => { setDecision('PASS'); setReasonCode('') }}>Pass</button>
                <button type="button" className={`ap-no${decision === 'REFUSE' ? ' on' : ''}`} aria-pressed={decision === 'REFUSE'} onClick={() => { setDecision('REFUSE'); setReasonCode('') }}>Tolak</button>
              </div>
              <Field label="Kode Alasan">
                <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                  <option value="">— pilih kode alasan —</option>
                  {codes.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Catatan (opsional)">
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
              </Field>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Kirim Keputusan'}</button>
            </form>
          ) : (
            <div className="me-hint" style={{ marginTop: 0 }}>Menunggu keputusan {flags.pass_label}. Klaim hanya lanjut bila di-pass.</div>
          )}
        </div>
      ) : null}

      <div className="mb-sec">
        <div className="mb-sec-t">Perhitungan Klaim</div>
        <div className="mb-kv">Sumber data <b>{program.claim_source_label}</b></div>
        <div className="mb-kv">Basis perhitungan <b>{program.claim_basis_label}</b></div>
        <div className="mb-kv">Ambang <b>{program.claim_threshold != null ? Number(program.claim_threshold).toLocaleString('id-ID') : '—'}</b></div>
        <div className="mb-kv">Besaran <b>{claimRateLabel(program)}</b></div>

        {claim.status !== 'SUBMITTED' && claim.status !== 'STOPPED' ? (
          <>
            <button type="button" className="btn" style={{ marginTop: 10 }} disabled={busy || !flags.can_calculate} onClick={() => run(() => calculateClaim(claim.id), 'Nilai klaim dihitung')}>
              {claim.eligible_amount != null ? 'Calculate Ulang' : 'Calculate'}
            </button>
            {!flags.can_calculate && flags.calculate_blocker ? <div className="me-hint">{flags.calculate_blocker}</div> : null}
          </>
        ) : null}

        {claim.eligible_amount != null ? (
          <div className="cl-res">
            <div className="cl-res-row big"><span>Nilai Eligible Klaim</span><b>{fmtIdr(claim.eligible_amount)}</b></div>
            <div className="cl-res-row"><span>Nilai Pengajuan</span><b>{fmtIdr(claim.claimed_amount)}</b></div>
            <div className="cl-res-row diff"><span>Selisih</span><b className={diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}>{fmtIdr(diff)}</b></div>
            {calc ? (
              <div className="cl-formula">
                {calc.formula}
                <br />
                Basis {calc.basis_label}: {Number(calc.base_value).toLocaleString('id-ID')}
                {calc.source === 'SELL_OUT' ? ` · ${calc.rows} baris data sell out` : ` · ${calc.invoice_count} AR Invoice`}
                {calc.note ? <><br />{calc.note}</> : null}
                <br />Selisih = nilai pengajuan dikurangi nilai eligible.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {claim.status === 'CALCULATED' || claim.status === 'SUBMITTED' ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Metode Pencairan</div>
          {claim.status === 'SUBMITTED' ? (
            <>
              <div className="mb-kv">Metode <b>{claim.payout_method_label}</b></div>
              <div className="mb-kv">Diajukan <b>{fmtDate(claim.submitted_at)}</b></div>
              <div className="me-hint">Klaim sudah diajukan untuk approval. Nilai Klaim Disetujui terisi dari hasil approval.</div>
            </>
          ) : (
            <>
              <Field label="Metode Pencairan">
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="">— pilih metode pencairan —</option>
                  {(flags.payout_methods || []).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </Field>
              <button type="button" className="btn" disabled={busy} onClick={submitToApproval}>Ajukan untuk Approval</button>
            </>
          )}
        </div>
      ) : null}

      {claim.status === 'SUBMITTED' ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Konfirmasi Selisih ke Distributor</div>
          <div className="me-hint" style={{ marginTop: 0 }}>
            Koordinator Marketing mengonfirmasi nilai selisih ke distributor di luar aplikasi (nilai eligible, selisih, dan kertas kerja).
            Approval dimulai setelah distributor menyetujui nilai selisihnya; bila belum, konfirmasi diulang.
          </div>
          {ap?.can_confirm ? (
            <>
              <Field label="Catatan konfirmasi (opsional)">
                <textarea rows={2} value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} maxLength={500} />
              </Field>
              <button type="button" className="btn" disabled={busy} onClick={confirmDifference}>Distributor Menyetujui Selisih</button>
            </>
          ) : (
            <div className="me-hint">Menunggu konfirmasi selisih ke distributor oleh {ap?.levels?.[0]?.label || 'Koordinator Marketing'}.</div>
          )}
        </div>
      ) : null}

      {ap && claim.diff_confirmed_at ? (
        <>
          <div className="mb-sec">
            <div className="mb-sec-t">Selisih Dikonfirmasi</div>
            <div className="mb-kv">Dikonfirmasi oleh <b>{claim.diff_confirmer?.name || '—'}</b></div>
            <div className="mb-kv">Tanggal <b>{fmtDate(claim.diff_confirmed_at)}</b></div>
            {claim.diff_confirm_notes ? <div className="me-hint">Catatan: {claim.diff_confirm_notes}</div> : null}
          </div>
          <ApprovalPanel
            pg={{ ...claim, status: claim.status === 'IN_APPROVAL' ? 'PENDING_APPROVAL' : claim.status, approval: ap, approvals: claim.approvals }}
            onChange={setClaim}
            approve={(cid, payload) => approveClaimSubmission(cid, payload)}
            reject={(cid, payload) => rejectClaimSubmission(cid, payload)}
          />
        </>
      ) : null}

      {['AWAITING_AMOUNT', 'APPROVED', 'DISBURSED'].includes(claim.status) ? (
        <div className="mb-sec">
          <div className="mb-sec-t">Nilai Klaim Disetujui</div>
          {claim.adjusted_amount != null ? (
            <>
              <div className="mb-kv">Disesuaikan oleh {claim.adjuster?.name || '—'} <b>{fmtIdr(claim.adjusted_amount)}</b></div>
              <div className="me-hint" style={{ marginTop: 0 }}>Alasan penyesuaian: {claim.adjust_reason}</div>
            </>
          ) : null}
          {claim.status === 'APPROVED' || claim.status === 'DISBURSED' ? (
            <div className="cl-res">
              <div className="cl-res-row big"><span>Nilai Klaim Disetujui</span><b>{fmtIdr(claim.approved_amount)}</b></div>
              <div className="cl-formula">
                Nilai final klaim. Diteruskan ke pencairan dengan metode {claim.payout_method_label}.
                {claim.final_confirmed_at ? <><br />Ditetapkan oleh {claim.finalizer?.name || '—'} · {fmtDate(claim.final_confirmed_at)}</> : null}
              </div>
              {claim.payout_method === 'POTONG_NOTA' ? (
                <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => nav(`/marketing/deductions/${claim.id}`)}>
                  Buka Potong Nota
                </button>
              ) : null}
              {claim.payout_method === 'BARANG' ? (
                <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => nav(`/marketing/goods/${claim.id}`)}>
                  Buka Pencairan Barang
                </button>
              ) : null}
              {claim.payout_method === 'TRANSFER' ? (
                <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => nav(`/marketing/transfers/${claim.id}`)}>
                  Buka Pencairan Transfer
                </button>
              ) : null}
              {claim.payout_method === 'POTONG_TAGIHAN' ? (
                <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => nav(`/marketing/credit-memos/${claim.id}`)}>
                  Buka Potong Tagihan
                </button>
              ) : null}
            </div>
          ) : ap?.can_finalize ? (
            <>
              <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
                Semua tahap approval selesai. Tetapkan Nilai Klaim Disetujui sebagai nilai final; harus sama dengan hasil approval
                (nilai eligible, atau nilai hasil penyesuaian Direktur Sales).
              </div>
              <Field label="Nilai Klaim Disetujui (Rp)">
                <NumInput className="mb-money" value={finalAmount ?? expected} onChange={setFinalAmount} placeholder="0" />
              </Field>
              <button type="button" className="btn" disabled={busy} onClick={saveFinalAmount}>Simpan Nilai Klaim Disetujui</button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mb-sec">
        <div className="mb-sec-t">Dokumen Distributor</div>
        {(claim.attachments || []).length === 0 ? (
          <div className="me-hint" style={{ marginTop: 0 }}>Tidak ada lampiran.</div>
        ) : (
          claim.attachments.map((a) => (
            <div key={a.id} className="me-file">
              <span className="me-file-n">{a.filename}</span>
              <span className="me-file-s">{KIND[a.kind] || a.kind} · {fmtSize(a.size)}</span>
            </div>
          ))
        )}
      </div>
      <div style={{ height: 12 }} />
    </Screen>
  )
}
