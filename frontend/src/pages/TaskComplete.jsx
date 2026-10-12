// frontend/src/pages/TaskComplete.jsx
// Halaman penyelesaian tugas yang belum punya formulir sendiri, dibuka dari kartu "Complete Task" di Choose Activity.
// Setelah Save, kembali ke Choose Activity yang memuat ulang tugas aktif terbaru.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getVisit } from '../api'
import TaskCompleteForm from '../components/TaskCompleteForm'
import { TaskErrorBoundary } from '../components/TaskErrorBoundary'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { recordLabel } from '../lib/leadCode'

export default function TaskComplete() {
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [visit, setVisit] = useState(loc.state?.visit || null)

  // Dibuka ulang tanpa state (mis. refresh): ambil data kunjungan dari server.
  useEffect(() => {
    if (visit) return undefined
    let alive = true
    ;(async () => {
      try {
        const v = await getVisit(id)
        if (alive && v) setVisit(v)
      } catch (e) {
        if (alive) showToast(e.message || 'Gagal memuat kunjungan', { warn: true })
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const lead = visit?.lead || null
  const task = lead?.current_task || null

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ flex: 1, minWidth: 0 }}>
          <div>{task?.name || 'Complete Task'}</div>
          <div className="tt-sub">
            {[lead?.business_name, lead ? recordLabel(lead, task) : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {!visit ? (
        <div className="loading-center">Memuat…</div>
      ) : !task ? (
        <div className="tp-empty">Tidak ada tugas aktif untuk kunjungan ini.</div>
      ) : (
        <TaskErrorBoundary>
          <TaskCompleteForm lead={lead} task={task} showToast={showToast} onDone={() => nav(-1)} />
        </TaskErrorBoundary>
      )}
    </Screen>
  )
}
