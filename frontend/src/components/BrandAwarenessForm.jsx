// frontend/src/components/BrandAwarenessForm.jsx
// Isi halaman 07b Task: Brand Awareness (dokumen hal. 26): header task, Visit Notes, Task Completion.
// Aturan Brand Awareness: Conclusion hanya Next atau Lose; kode alasan TRTK/TDKTRTK/NOCNTC/TKTTP.
import { useState } from 'react'
import { concludeLeadTask, updateLead, updateLeadTask } from '../api'
import { Field } from './Field'
import { TaskCompletion, useTaskCompletion } from './TaskCompletion'
import { TaskCard } from './TaskCard'
import '../styles/taskpage.css'

export const BRAND_CONFIG = {
  conclusions: ['NEXT', 'LOSE'],
  reasons: {
    NEXT: [{ value: 'TRTK', label: 'TRTK — Tertarik' }],
    LOSE: [
      { value: 'TDKTRTK', label: 'TDKTRTK — Tidak Tertarik' },
      { value: 'NOCNTC', label: 'NOCNTC — Prospek Tidak Bisa Dihubungi' },
      { value: 'TKTTP', label: 'TKTTP — Toko Tutup Permanen' },
    ],
  },
  statuses: ['Process', 'WaitCust', 'Hold'],
  defaultStatus: 'Process',
  defaultNextCode: 'VRFKSNOO',
  nextTaskReadOnly: true, // dokumen hal. 26: Next Task read-only, diturunkan dari Reason Code
  reasonHint:
    'Reason Code = TRTK (Tertarik) when moving forward. Lose options at this step: TDKTRTK (Tidak Tertarik), NOCNTC (Prospek Tidak Bisa Dihubungi), TKTTP (Toko Tutup Permanen) — no Win here, Win is only set at Quote Result (QRSLT).',
}

export default function BrandAwarenessForm({ lead, task, taskSet, showToast, onDone }) {
  const [busy, setBusy] = useState(false)
  const [contact, setContact] = useState(lead.owner_name || '')
  const tc = useTaskCompletion(task, lead, BRAND_CONFIG)

  const submit = async (e) => {
    e.preventDefault()
    if (!task?.id) {
      showToast('Tidak ada tugas aktif untuk diselesaikan', { warn: true })
      return
    }
    if (!tc.valid()) {
      showToast('Pilih tugas berikutnya', { warn: true })
      return
    }
    setBusy(true)
    try {
      if (contact.trim() !== (lead.owner_name || '')) {
        await updateLead(lead.id, { owner_name: contact.trim() || null })
      }
      if (!tc.complete) {
        await updateLeadTask(task.id, { remark: tc.comment.trim() || null })
        showToast('Comment tersimpan')
        onDone?.()
        return
      }
      const res = await concludeLeadTask(task.id, tc.toPayload())
      showToast(
        tc.conclusion === 'NEXT'
          ? `Brand Awareness selesai · berikutnya: ${res?.next_task?.name || '—'}`
          : 'Prospek ditandai KALAH',
      )
      onDone?.(res)
    } catch (err) {
      showToast(err?.message || 'Gagal menyimpan', { error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="tp-form">
      <TaskCard task={task} taskSet={taskSet} />
      <div className="th">
        <div className="tc-h">Visit Notes</div>
        <Field label="Contact Person" style={{ margin: 0 }}>
          <input value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        {/* Comment ada di Visit Notes (dokumen hal. 26); nilainya sama dengan remark tugas. */}
        <Field label="Comment" style={{ margin: '10px 0 0' }}>
          <textarea
            rows={4}
            maxLength={500}
            value={tc.comment}
            onChange={(e) => tc.setComment(e.target.value)}
            placeholder="What was introduced, prospect's initial reaction"
          />
        </Field>
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
