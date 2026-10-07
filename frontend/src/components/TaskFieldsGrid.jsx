// frontend/src/components/TaskFieldsGrid.jsx
// Poin 9: field tugas dalam grid dua kolom untuk form Visit Mode dan Leads. Field baca-saja
// memakai <input readOnly>; Comment bisa diisi bila onCommentChange diberikan.
import { STAGE_LABEL } from '../lib/format'
import { Field } from './Field'
import { TASK_STATUS_LABEL } from './TaskFields'

const READONLY_STYLE = { background: '#E9EEF6', cursor: 'default' }

export function TaskFieldsGrid({ task, comment, onCommentChange, commentLabel = 'Comment', style }) {
  if (!task) return null

  const readOnly = (label, value) => (
    <Field label={label} style={{ margin: 0 }}>
      <input readOnly value={value} style={READONLY_STYLE} />
    </Field>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, ...style }}>
      {readOnly('Task Type', task.task_type || '—')}
      {readOnly('Stage', STAGE_LABEL[task.stage] || task.stage || '—')}
      {readOnly('Task', task.name || '—')}
      {readOnly('Assigned to', task.assignee?.name || '—')}
      {readOnly('Task Status', TASK_STATUS_LABEL[task.status] || task.status || '—')}
      {onCommentChange ? (
        <Field label={commentLabel} style={{ margin: 0 }}>
          <input value={comment ?? ''} onChange={(e) => onCommentChange(e.target.value)} />
        </Field>
      ) : (
        readOnly(commentLabel, task.remark || '—')
      )}
    </div>
  )
}