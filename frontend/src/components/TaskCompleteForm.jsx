// frontend/src/components/TaskCompleteForm.jsx
// Penyelesaian tugas yang belum punya formulir sendiri (mis. Verifikasi NOO melalui WhatsApp): kartu task +
// Task Completion. Win hanya di tugas penutup (QRSLT); tugas lain Next atau Lose (dokumen hal. 26).
import { useState } from 'react'
import { concludeLeadTask, updateLeadTask } from '../api'
import { TaskCard } from './TaskCard'
import { TaskCompletion, useTaskCompletion } from './TaskCompletion'
import '../styles/taskpage.css'

export default function TaskCompleteForm({ lead, task, showToast, onDone }) {
  const [busy, setBusy] = useState(false)
  const tc = useTaskCompletion(task, lead, {
    conclusions: task.is_closing ? ['WIN', 'LOSE'] : ['NEXT', 'LOSE'],
  })

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
          ? `${task.name} selesai · berikutnya: ${res?.next_task?.name || '—'}`
          : tc.conclusion === 'WIN'
            ? 'Prospek ditandai MENANG'
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
      <TaskCard task={task} metaKind="type" />
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
