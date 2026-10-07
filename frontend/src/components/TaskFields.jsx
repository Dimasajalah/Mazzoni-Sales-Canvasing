// Poin 9: field tugas seragam di kartu utama, Form Brand, Selesaikan Tugas, Feedback Sample.
import { STAGE_LABEL } from '../lib/format'

export const TASK_STATUS_LABEL = { OPEN: 'Berjalan', DONE: 'Selesai' }

export function TaskFields({ task, showName = false, showType = false, commentLabel = 'Comment', style }) {
  if (!task) return null
  return (
    <div style={style}>
      {showName && <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>{task.name}</div>}
      <div className="muted" style={{ fontSize: 10.5, display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
        {showType && <span>{task.task_type}</span>}
        <span>Stage: {STAGE_LABEL[task.stage] || task.stage || '—'}</span>
        <span>Status: {TASK_STATUS_LABEL[task.status] || task.status || '—'}</span>
        <span>Assigned to: {task.assignee?.name || '—'}</span>
      </div>
      {task.remark && (
        <div className="muted" style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>
          {commentLabel}: “{task.remark}”
        </div>
      )}
    </div>
  )
}