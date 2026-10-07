// frontend/src/pages/Canvassing.jsx
import { useCallback, useEffect, useState } from 'react'
import { getLeads } from '../api'
import { LeadCard } from '../components/LeadCard'
import LeadTaskPanel from '../components/LeadTaskPanel'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'

export default function Canvassing() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast, openSheet, closeSheet } = useUi()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getLeads({ per_page: 100 })
      setItems(listOf(data).filter((l) => l.win_loss === 'OPEN'))
    } catch (e) {
      showToast(e.message, { warn: true })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Screen>
      <TopBar title="Canvassing / Follow-up" backTo="/home" />
      <p className="sub">Tindak lanjut prospek yang masih berjalan</p>
      {loading ? (
        <div className="loading-center">Memuat…</div>
      ) : items.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Tidak ada prospek aktif.
        </div>
      ) : (
        items.map((l) => (
          <LeadCard
            key={l.id}
            lead={l}
            onClick={() =>
              openSheet(
                'Follow-up',
                <LeadTaskPanel
                  lead={l}
                  task={l.current_task}
                  onChanged={load}
                  onClose={closeSheet}
                  showToast={showToast}
                />,
              )
            }
          />
        ))
      )}
    </Screen>
  )
}
