// frontend/src/pages/TaskFollowUp.jsx
// Dokumen hal. 30 (09 Task: Follow Up Sample) sebagai halaman penuh, dibuka dari Choose Activity.
// Setelah Save, kembali ke Choose Activity (daftar aktivitas dimuat ulang dengan tugas berikutnya).
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getVisit } from '../api'
import FollowUpForm from '../components/FollowUpForm'
import { TaskErrorBoundary } from '../components/TaskErrorBoundary'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { recordLabel } from '../lib/leadCode'
import { sampleRevision } from '../lib/taskInfo'

export default function TaskFollowUp() {
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
  const isFollowUp = Boolean(task?.actions?.includes('feedback'))
  const n = sampleRevision(task)

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ flex: 1, minWidth: 0 }}>
          <div>{n ? `Follow Up Sample ${n}` : 'Follow Up Sample'}</div>
          <div className="tt-sub">
            {[lead?.business_name, lead ? recordLabel(lead, task) : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {!visit ? (
        <div className="loading-center">Memuat…</div>
      ) : !task ? (
        <div className="tp-empty">Tidak ada tugas aktif untuk kunjungan ini.</div>
      ) : !isFollowUp ? (
        <div className="tp-empty">Tugas aktif saat ini bukan Follow Up Sample. Kembali ke Choose Activity.</div>
      ) : (
        <TaskErrorBoundary>
          <FollowUpForm lead={lead} task={task} showToast={showToast} onDone={() => nav(-1)} />
        </TaskErrorBoundary>
      )}
    </Screen>
  )
}
