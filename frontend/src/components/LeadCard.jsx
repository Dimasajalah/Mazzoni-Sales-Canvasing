// frontend/src/components/LeadCard.jsx
// Kartu prospek: bar warna & badge dari status_customer (Pipeline Customer, hasil meeting Okt 2026).
import { dueMeta, fmtRp, statusCustomerMeta } from '../lib/format'

export function LeadCard({ lead, onClick }) {
  const st = statusCustomerMeta(lead.status_customer)
  const task = lead.current_task
  const closed = lead.status_customer === 'WIN' || lead.status_customer === 'LOSE' || lead.status_customer === 'DISTRIBUTION'
  const due = task ? dueMeta(task.due_date) : null

  const taskLine = closed ? 'Prospek ditutup' : task ? task.name : 'Belum ada tugas aktif'
  const value = lead.estimated_value != null && Number(lead.estimated_value) > 0 ? fmtRp(lead.estimated_value) : '—'

  return (
    <div className="card li" style={{ padding: 14 }} onClick={onClick} role="button" tabIndex={0}>
      <div className="barL" style={{ background: st.color }} />
      <div className="main">
        <div className="n">{lead.business_name}</div>
        <div className="d">
          {lead.owner_name || lead.phone || '—'} · {taskLine}
        </div>
        <div className="badges">
          <span className="badge" style={{ background: `${st.color}22`, color: st.color }}>
            {st.label}
          </span>
          {due && !closed ? (
            <span className="badge" style={{ background: `${due.color}22`, color: due.color }}>
              {due.label}
            </span>
          ) : null}
        </div>
      </div>
      <div className="r" style={{ color: value === '—' ? 'var(--mut)' : 'var(--green)' }}>
        {value}
      </div>
    </div>
  )
}