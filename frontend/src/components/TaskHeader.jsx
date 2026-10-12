// frontend/src/components/TaskHeader.jsx
// Header bersama semua form task: Pipeline (judul, dari status_customer), lalu Task Type, Task,
// Stage, Assigned to (baca-saja). Mengikuti keputusan tim functional + sketsa header form.
import { STAGE_LABEL, statusCustomerMeta } from '../lib/format'
import { Field } from './Field'
import { TASK_STATUS_LABEL } from './TaskFields'

export function TaskHeader({ task, pipeline, lead }) {
  if (!task) return null
  const st = statusCustomerMeta(pipeline || lead?.status_customer)
  const ro = (label, value) => (
    <Field label={label} style={{ margin: 0 }}>
      <input readOnly value={value} />
    </Field>
  )

  return (
    <div className="th">
      <div className="th-title">
        <span className="th-dot" style={{ background: st.color }} />
        {st.label}
      </div>
      <div className="th-sub">
        {[lead?.business_name, task.code ? `Task ID: ${task.code}` : null].filter(Boolean).join(' · ') || ' '}
      </div>
      <div className="th-grid">
        {ro('Task Type', task.task_type || '—')}
        {ro('Task', task.name || '—')}
        {ro('Stage', STAGE_LABEL[task.stage] || task.stage || '—')}
        {ro('Assigned to', task.assignee?.name || '—')}
      </div>
      {task.status && task.status !== 'OPEN' ? (
        <div className="th-sub" style={{ margin: '10px 0 0' }}>
          Status task: {TASK_STATUS_LABEL[task.status] || task.status}
        </div>
      ) : null}
    </div>
  )
}