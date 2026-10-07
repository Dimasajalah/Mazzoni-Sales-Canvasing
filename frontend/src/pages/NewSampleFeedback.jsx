// frontend/src/pages/NewSampleFeedback.jsx
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { concludeLeadTask, createSampleFeedback } from '../api'
import { ConclusionFields, useConclusionFields } from '../components/ConclusionFields'
import { Field } from '../components/Field'
import { ProductGroupField } from '../components/ProductGroupField'
import { TaskFieldsGrid } from '../components/TaskFieldsGrid'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'

const REVISION_TYPES = ['warna', 'tekstur', 'bau', 'rasa']

export default function NewSampleFeedback() {
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [productGroup, setProductGroup] = useState('')
  const [qty, setQty] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [revisionTypes, setRevisionTypes] = useState([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Revisi tim functional: Conclusion & Reason Code dipilih MANUAL oleh sales di form ini juga
  // (bukan lagi disimpulkan otomatis dari Interest/Not Interest/Revisi seperti sebelumnya, poin 12).
  const leadTaskId = loc.state?.leadTaskId || null
  const fields = useConclusionFields(loc.state?.taskSetId || null, loc.state?.taskSeq ?? null, loc.state?.taskClosing || false)
  // Poin 9: ringkasan tugas (dikirim LeadTaskPanel lewat state navigasi) supaya field tugas
  // tampil seragam di layar ini juga.
  const task = loc.state?.task || null

  const [comment, setComment] = useState(task?.remark || '')

  // Keterangan wajib bila hasilnya tidak oke: ada Jenis Revisi yang dipilih, atau Conclusion = Kalah.
  // (Mau Keterangan wajib hanya saat Jenis Revisi dipilih? Hapus bagian "|| (... === 'LOSE')".)
  const notesRequired = revisionTypes.length > 0 || (Boolean(leadTaskId) && fields.conclusion === 'LOSE')

  const toggleRevisionType = (type) => {
    setRevisionTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!productGroup || !qty || !batchNumber.trim()) {
      showToast('Pilih Product Group, lalu isi Qty dan Batch', { warn: true })
      return
    }
    if (notesRequired && !notes.trim()) {
      showToast('Isi keterangan untuk hasil yang tidak oke', { warn: true })
      return
    }
    if (leadTaskId && !fields.valid()) {
      showToast('Pilih tugas berikutnya', { warn: true })
      return
    }
    setSaving(true)
    try {
      await createSampleFeedback({
        product_sample_id: loc.state?.sampleId || null,
        customer_id: loc.state?.customerId || null,
        lead_id: loc.state?.leadId || null,
        lead_task_id: leadTaskId,
        product_group: productGroup,
        qty: Number(qty),
        batch_number: batchNumber.trim(),
        revision_types: revisionTypes.length ? revisionTypes : null,
        notes: notes.trim() || null,
        // form ini sekarang HANYA mencatat feedback -> penyelesaian tugas dikirim terpisah di
        // bawah lewat concludeLeadTask, sesuai pilihan Conclusion/Reason Code sales.
        manual_conclude: Boolean(leadTaskId),
      })
      if (leadTaskId) {
        await concludeLeadTask(leadTaskId, { ...fields.toPayload(), remark: comment.trim() || null })
      }
      showToast('Feedback sample berhasil dicatat')
      nav(-1)
    } catch (err) {
      showToast(err.message || 'Gagal simpan feedback', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Feedback Sample" backTo="/leads" />
      <form onSubmit={submit}>
        {task && (
          <TaskFieldsGrid task={task} comment={comment} onCommentChange={setComment} style={{ marginBottom: 12 }} />
        )}

        <ProductGroupField value={productGroup} onChange={setProductGroup} />
        <div className="row">
          <Field label="Qty (Gram)" style={{ flex: 1 }}>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Batch" style={{ flex: 1 }}>
            <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="mis. B-2026-01" />
          </Field>
        </div>
        <Field label="Jenis Revisi (opsional, bisa pilih lebih dari satu)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {REVISION_TYPES.map((t) => (
              <button
                type="button"
                key={t}
                className={`chip${revisionTypes.includes(t) ? ' on' : ''}`}
                onClick={() => toggleRevisionType(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </Field>

        <Field label={notesRequired ? 'Keterangan (wajib — hasil tidak oke)' : 'Keterangan (opsional)'}>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {leadTaskId && (
          <>
            <div className="section-h" style={{ marginTop: 4 }}>Selesaikan Tugas</div>
            <ConclusionFields isClosing={loc.state?.taskClosing || false} fields={fields} />
          </>
        )}

        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Feedback'}
        </button>
      </form>
    </Screen>
  )
}