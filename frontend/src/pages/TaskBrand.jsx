// frontend/src/pages/TaskBrand.jsx
// Dokumen hal. 26 (07b Task: Brand Awareness) sebagai halaman penuh, dibuka dari Choose Activity.
// Setelah Save, kembali ke Choose Activity (daftar aktivitas dimuat ulang dengan tugas berikutnya).
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getTaskSets, getVisit } from '../api'
import BrandAwarenessForm from '../components/BrandAwarenessForm'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'
import { recordLabel } from '../lib/leadCode'

export default function TaskBrand() {
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [visit, setVisit] = useState(loc.state?.visit || null)
  const [taskSets, setTaskSets] = useState([])

  // Nama Task Set (mis. B2B) untuk kartu header; gagal memuat tidak menghalangi form.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const sets = listOf(await getTaskSets())
        if (alive) setTaskSets(sets)
      } catch {
        /* kartu tetap tampil tanpa Task Set */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

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
  const isBrand = Boolean(task?.actions?.includes('brand'))

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ flex: 1, minWidth: 0 }}>
          <div>{task?.name || 'Brand Awareness'}</div>
          <div className="tt-sub">
            {[lead?.business_name, lead ? recordLabel(lead, task) : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {!visit ? (
        <div className="loading-center">Memuat…</div>
      ) : !task ? (
        <div className="tp-empty">Tidak ada tugas aktif untuk kunjungan ini.</div>
      ) : !isBrand ? (
        <div className="tp-empty">Tugas aktif saat ini bukan Brand Awareness. Kembali ke Choose Activity.</div>
      ) : (
        <BrandAwarenessForm
          lead={lead}
          task={task}
          taskSet={taskSets.find((t) => t.id === lead.task_set_id)}
          showToast={showToast}
          onDone={() => nav(-1)}
        />
      )}
    </Screen>
  )
}
