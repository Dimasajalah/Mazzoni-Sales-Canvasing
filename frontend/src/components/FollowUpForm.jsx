// frontend/src/components/FollowUpForm.jsx
// Isi halaman 09 Task: Follow Up Sample (dokumen hal. 30): mencatat hasil sample yang sudah diberikan
// (cocok, ditolak, perlu revisi) lewat Task Completion, lalu menyelesaikan tugas.
import { useState } from 'react'
import { concludeLeadTask, updateLeadTask } from '../api'
import { followUpView } from '../lib/taskInfo'
import { TaskCard } from './TaskCard'
import { TaskCompletion, useTaskCompletion } from './TaskCompletion'
import '../styles/taskpage.css'

// Win hanya diizinkan di QRSLT, task paling akhir (dokumen hal. 26). Revisi sample = Next dengan Next Task
// Pemberian Sample (revisi berikutnya, nomornya diberikan otomatis). Kode alasan dan status memakai bawaan
// sampai master mapping (ReasonType = T) tersedia.
export const FOLLOWUP_CONFIG = {
  conclusions: ['NEXT', 'LOSE'],
  allowSameTask: true,
  templateLabel: (t) =>
    t.code && t.code.startsWith('GIVESMPL')
      ? 'GIVESMPLn — Pemberian Sample (revisi berikutnya)'
      : `${t.code || t.seq} — ${t.name}`,
}

export default function FollowUpForm({ lead, task, showToast, onDone }) {
  const [busy, setBusy] = useState(false)
  const tc = useTaskCompletion(task, lead, FOLLOWUP_CONFIG)

  const submit = async (e) => {
    e.preventDefault()
    if (!tc.valid()) {
      showToast('Pilih tugas berikutnya', { warn: true })
      return
    }
    setBusy(true)
    try {
      if (!tc.complete) {
        await updateLeadTask(task.id, { remark: tc.comment.trim() || null })
        showToast('Comment tersimpan')
        onDone?.()
        return
      }
      const res = await concludeLeadTask(task.id, tc.toPayload())
      showToast(
        tc.conclusion === 'NEXT'
          ? `Follow Up Sample selesai · berikutnya: ${res?.next_task?.name || '—'}`
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
      <TaskCard task={followUpView(task)} metaKind="type" />
      <TaskCompletion tc={tc} />
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
