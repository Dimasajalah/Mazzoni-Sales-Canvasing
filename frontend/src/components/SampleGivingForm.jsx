// frontend/src/components/SampleGivingForm.jsx
// Isi halaman 08 Task: Pemberian Sample (dokumen hal. 28): identitas produk (Product Group, Part,
// Rev, Description), Package Size, Qty Given, banner revisi, Comment, lalu Task Completion. Save mencatat sample dan
// menyelesaikan tugas (konklusi diterapkan, task berikutnya terbuka otomatis).
import { useState } from 'react'
import { concludeLeadTask, createSample, updateLeadTask } from '../api'
import { Field } from './Field'
import { ProductGroupField } from './ProductGroupField'
import { RevisionBanner } from './RevisionBanner'
import { TaskCard } from './TaskCard'
import { TaskCompletion, useTaskCompletion } from './TaskCompletion'
import { SAMPLE_MAX_REVISIONS, sampleRevision } from '../lib/taskInfo'
import '../styles/taskpage.css'

// Win hanya diizinkan di QRSLT, task paling akhir (dokumen hal. 26). Kode alasan dan status memakai bawaan
// sampai master mapping (Mapping_Status_Reason_Task_Quotation) tersedia.
export const SAMPLE_CONFIG = { conclusions: ['NEXT', 'LOSE'] }

export default function SampleGivingForm({ lead, task, showToast, onDone }) {
  const [busy, setBusy] = useState(false)
  const [sampleSaved, setSampleSaved] = useState(false) // sudah tersimpan: percobaan ulang tidak membuat sample ganda
  const [productGroup, setProductGroup] = useState('')
  const [part, setPart] = useState('')
  const [rev, setRev] = useState('')
  const [description, setDescription] = useState('')
  const [packageSize, setPackageSize] = useState('')
  const [qtyGiven, setQtyGiven] = useState('')
  const tc = useTaskCompletion(task, lead, SAMPLE_CONFIG)

  const submit = async (e) => {
    e.preventDefault()
    if (!sampleSaved && (!productGroup || !part.trim() || !packageSize)) {
      showToast('Isi Product Group, Part, dan Package Size', { warn: true })
      return
    }
    if (!tc.valid()) {
      showToast('Pilih tugas berikutnya', { warn: true })
      return
    }
    setBusy(true)
    let saved = sampleSaved
    try {
      if (!saved) {
        await createSample({
          customer_id: lead.customer_id ?? null,
          lead_id: lead.id,
          lead_task_id: task.id,
          product_group: productGroup,
          part: part.trim(),
          rev: rev.trim() || null,
          description: description.trim() || null,
          qty: Number(packageSize), // Package Size (gram)
          qty_given: qtyGiven.trim() || null,
          notes: tc.comment.trim() || null,
        })
        saved = true
        setSampleSaved(true)
      }

      if (!tc.complete) {
        const remark = tc.comment.trim() || null
        if (remark !== (task.remark || null)) await updateLeadTask(task.id, { remark })
        showToast('Sample tersimpan')
        onDone?.()
        return
      }

      const res = await concludeLeadTask(task.id, tc.toPayload())
      showToast(
        tc.conclusion === 'NEXT'
          ? `Sample dicatat · berikutnya: ${res?.next_task?.name || '—'}`
          : 'Prospek ditandai KALAH',
      )
      onDone?.(res)
    } catch (err) {
      showToast(
        saved
          ? `Sample sudah tersimpan, tetapi tugas belum selesai: ${err?.message || 'gagal'}`
          : err?.message || 'Gagal menyimpan sample',
        { error: true },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="tp-form">
      <TaskCard task={task} metaKind="type" />

      <div className="th">
        <div className="tc-h">Sample Given — Product</div>
        <div className="pg-req">
          <ProductGroupField value={productGroup} onChange={setProductGroup} />
        </div>
        <div className="tc-grid" style={{ marginTop: 10 }}>
          <Field label="Part (free text) *" style={{ margin: 0 }}>
            <input value={part} onChange={(e) => setPart(e.target.value)} />
          </Field>
          <Field label="Rev (free text)" style={{ margin: 0 }}>
            <input value={rev} onChange={(e) => setRev(e.target.value)} />
          </Field>
        </div>
        <Field label="Description" style={{ margin: '10px 0 0' }}>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="tc-grid" style={{ marginTop: 10 }}>
          <Field label="Package Size (gram) *" style={{ margin: 0 }}>
            <input type="number" min="1" inputMode="numeric" value={packageSize} onChange={(e) => setPackageSize(e.target.value)} />
          </Field>
          <Field label="Qty Given" style={{ margin: 0 }}>
            <input value={qtyGiven} onChange={(e) => setQtyGiven(e.target.value)} placeholder='e.g. "2 pcs"' />
          </Field>
        </div>
        <RevisionBanner revision={sampleRevision(task)} max={SAMPLE_MAX_REVISIONS} />
      </div>

      <div className="th">
        <div className="tc-h">Comment</div>
        <div className="field" style={{ margin: 0 }}>
          <textarea
            aria-label="Comment"
            rows={4}
            maxLength={500}
            value={tc.comment}
            onChange={(e) => tc.setComment(e.target.value)}
            placeholder="Batch no., label revision, R&D notes"
          />
        </div>
      </div>

      <TaskCompletion tc={tc} hideComment />
      <button className="btn ok" type="submit" disabled={busy}>
        {busy ? 'Menyimpan…' : 'Save'}
      </button>
      <p className="tc-foot">
        Checking Complete applies Conclusion/Reason and routes to the Next Task automatically — no separate
        Submit/Draft step.
      </p>
    </form>
  )
}
