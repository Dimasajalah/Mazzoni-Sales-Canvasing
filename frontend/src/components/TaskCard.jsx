// frontend/src/components/TaskCard.jsx
// Kartu header halaman task (dokumen hal. 26 dan 28): "Task: <nama>" + MILESTONE, satu baris meta,
// label Current Stage dan Assigned, lalu deskripsi tugas.
//   metaKind="set"  -> Task ID · Task Set · Seq   (Brand Awareness)
//   metaKind="type" -> Task ID · Task Type        (Pemberian Sample)
import { stageCode } from '../lib/stageCode'
import { TASK_DESCRIPTIONS, taskTitle } from '../lib/taskInfo'
import '../styles/taskpage.css'

export function TaskCard({ task, taskSet, metaKind = 'set' }) {
  if (!task) return null
  const set = taskSet?.code || taskSet?.name
  const parts =
    metaKind === 'type'
      ? [task.code ? `Task ID: ${task.code}` : null, task.task_type ? `Task Type: ${task.task_type}` : null]
      : [
          task.code ? `Task ID: ${task.code}` : null,
          set ? `Task Set: ${set}` : null,
          task.seq != null ? `Seq ${task.seq}` : null,
        ]
  const meta = parts.filter(Boolean).join(' · ')
  const description = TASK_DESCRIPTIONS[task.code]

  return (
    <div className="tk-card">
      <div className="tk-top">
        <div className="tk-title">Task: {taskTitle(task)}</div>
        <span className="tk-mile">MILESTONE</span>
      </div>
      {meta ? <div className="tk-meta">{meta}</div> : null}
      <div className="tk-chips">
        <span className="tk-chip blue">Current Stage: {stageCode(task.stage)}</span>
        <span className="tk-chip">Assigned: {task.assignee?.name || '—'}</span>
      </div>
      {description ? <p className="tk-desc">{description}</p> : null}
    </div>
  )
}
