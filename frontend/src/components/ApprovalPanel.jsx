// frontend/src/components/ApprovalPanel.jsx
// Bagian "Persetujuan" bersama untuk detail Program Klaim (MKT05) dan detail Event (MKT06): tahap-tahap berurutan,
// riwayat keputusan putaran berjalan (dan putaran sebelumnya setelah revisi), serta formulir Setujui / Tolak dengan kode alasan.
import { useState } from 'react'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { fmtIdr } from '../lib/money'
import { Field } from './Field'
import { NumInput } from './NumInput'
import '../styles/marketingapproval.css'
import '../styles/marketingbudget.css'
import '../styles/marketingevent.css'

/**
 * pg: program/event dari server (memuat `approval` dan `approvals`); onChange(updated): dipanggil dengan hasil dari server;
 * approve(id, payload) / reject(id, payload): fungsi API sesuai jenis program.
 */
export function ApprovalPanel({ pg, onChange, approve, reject }) {
  const { showToast } = useUi()
  const [decision, setDecision] = useState('APPROVE')
  const [reasonCode, setReasonCode] = useState('')
  const [notes, setNotes] = useState('')
  const [adjust, setAdjust] = useState(false) // MKT09: Direktur Sales boleh menyesuaikan nilai klaim dengan alasan
  const [adjustedAmount, setAdjustedAmount] = useState(null)
  const [adjustReason, setAdjustReason] = useState('')
  const [saving, setSaving] = useState(false)

  const ap = pg.approval
  if (!ap) return null

  const pending = pg.status === 'PENDING_APPROVAL'
  const round = ap.round ?? 1
  const all = pg.approvals || []
  const current = all.filter((h) => (h.round ?? 1) === round)
  const earlier = all.filter((h) => (h.round ?? 1) < round)
  const codes = ap.reason_codes?.[decision] || []

  const stepOf = (level) => {
    const h = current.find((x) => x.stage === level.stage)
    if (h) return { kind: h.action === 'APPROVED' ? 'done' : 'bad', h }
    if (pending && ap.stage === level.stage) return { kind: 'now' }
    return { kind: 'wait' }
  }

  const chooseDecision = (d) => {
    setDecision(d)
    setReasonCode('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!reasonCode) return showToast('Pilih kode alasan', { warn: true })
    const payload = { reason_code: reasonCode }
    if (notes.trim()) payload.notes = notes.trim()
    if (adjust && decision === 'APPROVE') {
      if (!adjustedAmount || adjustedAmount <= 0) return showToast('Isi nilai penyesuaian lebih dari 0', { warn: true })
      if (!adjustReason.trim()) return showToast('Isi alasan penyesuaian', { warn: true })
      payload.adjusted_amount = adjustedAmount
      payload.adjust_reason = adjustReason.trim()
    }

    setSaving(true)
    try {
      const updated = await (decision === 'APPROVE' ? approve(pg.id, payload) : reject(pg.id, payload))
      onChange(updated)
      setReasonCode('')
      setNotes('')
      setAdjust(false)
      setAdjustedAmount(null)
      setAdjustReason('')
      showToast(decision === 'APPROVE' ? 'Keputusan setuju tersimpan' : 'Penolakan tersimpan')
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan keputusan', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-sec">
      <div className="mb-sec-t">Persetujuan{round > 1 ? ` · Putaran ${round}` : ''}</div>
      {ap.levels.map((level) => {
        const s = stepOf(level)
        return (
          <div key={level.stage} className="ap-step">
            <span className={`ap-dot ${s.kind}`}>{s.kind === 'done' ? '✓' : s.kind === 'bad' ? '✕' : level.stage}</span>
            <div className="ap-body">
              <b>Tahap {level.stage} · {level.label}</b>
              {s.h ? (
                <small>
                  {s.h.action === 'APPROVED' ? 'Disetujui' : 'Ditolak'} oleh {s.h.actor?.name || '—'} · {fmtDate(s.h.acted_at)}
                  <br />Alasan: {s.h.reason_label}
                  {s.h.notes ? <><br />Catatan: {s.h.notes}</> : null}
                  {s.h.adjusted_amount != null ? <><br />Penyesuaian nilai: {fmtIdr(s.h.adjusted_amount)} · {s.h.adjust_reason}</> : null}
                </small>
              ) : s.kind === 'now' ? (
                <small>Menunggu keputusan</small>
              ) : (
                <small>{pending ? 'Belum giliran' : 'Tidak dilanjutkan'}</small>
              )}
            </div>
          </div>
        )
      })}

      {ap.can_act ? (
        <form className="ap-decide" onSubmit={submit}>
          <div className="ap-flag">Perlu keputusan Anda · Tahap {ap.stage}</div>
          <div style={{ height: 10 }} />
          <div className="mb-seg">
            <button type="button" className={`ap-yes${decision === 'APPROVE' ? ' on' : ''}`} aria-pressed={decision === 'APPROVE'} onClick={() => chooseDecision('APPROVE')}>Setujui</button>
            <button type="button" className={`ap-no${decision === 'REJECT' ? ' on' : ''}`} aria-pressed={decision === 'REJECT'} onClick={() => chooseDecision('REJECT')}>Tolak</button>
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
          {ap.can_adjust && decision === 'APPROVE' ? (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 700 }}>
                <input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
                Sesuaikan nilai klaim
              </label>
              {adjust ? (
                <div style={{ marginTop: 10 }}>
                  <Field label="Nilai Penyesuaian (Rp)">
                    <NumInput className="mb-money" value={adjustedAmount} onChange={setAdjustedAmount} placeholder="0" />
                  </Field>
                  <Field label="Alasan Penyesuaian">
                    <textarea rows={2} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} maxLength={500} />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Kirim Keputusan'}</button>
        </form>
      ) : pending && ap.awaiting_label ? (
        <div className="me-hint">Menunggu keputusan {ap.awaiting_label}.</div>
      ) : null}

      {earlier.length > 0 ? (
        <div className="ap-decide">
          <div className="mb-sec-t">Riwayat putaran sebelumnya</div>
          {earlier.map((h) => (
            <div key={h.id} className="ap-body" style={{ marginBottom: 8 }}>
              <small>
                Putaran {h.round} · Tahap {h.stage}{h.stage_label ? ` (${h.stage_label})` : ''}: {h.action === 'APPROVED' ? 'disetujui' : 'ditolak'} oleh {h.actor?.name || '—'}
                {' '}· {h.reason_label}{h.notes ? ` · ${h.notes}` : ''}
              </small>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
