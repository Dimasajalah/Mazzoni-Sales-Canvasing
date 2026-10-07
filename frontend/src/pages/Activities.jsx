// frontend/src/pages/Activities.jsx
// Tab Activities / Tugas (FDD 4.3): tindak lanjut per prospek, mengacu Task Set.
import { useCallback, useEffect, useState } from 'react'
import { getLeadTasks } from '../api'
import LeadTaskPanel, { TASK_ICON } from '../components/LeadTaskPanel'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { dueMeta, STAGE_LABEL, stageColor } from '../lib/format'

const EMPTY = { items: [], summary: { unscheduled: 0, late: 0, scheduled: 0, total: 0 } }

function Stat({ value, label, color, border }) {
  return (
    <div style={{ flex: 1, padding: 13, textAlign: 'center', borderLeft: border ? '1px solid var(--stroke)' : 'none' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div className="muted" style={{ fontSize: 10 }}>
        {label}
      </div>
    </div>
  )
}

export default function Activities() {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const { showToast, openSheet, closeSheet } = useUi()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getLeadTasks({ status: 'OPEN' })
      setData({ items: res?.items || [], summary: res?.summary || EMPTY.summary })
    } catch (e) {
      showToast(e.message || 'Gagal muat tugas', { warn: true })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const { summary, items } = data

  const openTask = (task) =>
    openSheet(
      task.lead?.business_name || 'Tugas',
      <LeadTaskPanel
        lead={task.lead}
        task={task}
        onChanged={load}
        onClose={closeSheet}
        showToast={showToast}
      />,
    )

  return (
    <Screen>
      <TopBar title="Activities / Tugas" backTo="/home" />
      <p className="sub">Tindak lanjut per prospek · mengacu Task Set</p>

      <div className="card" style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
        <div
          style={{ background: '#FFF6E6', padding: '9px 14px', fontSize: 11, fontWeight: 800, color: '#7A4E00', letterSpacing: 1 }}
        >
          TINDAK LANJUT
        </div>
        <div style={{ display: 'flex' }}>
          <Stat value={summary.unscheduled} label="Belum dijadwalkan" color="var(--mut)" />
          <Stat value={summary.late} label="Terlambat" color="var(--pink)" border />
          <Stat value={summary.scheduled} label="Terjadwal" color="var(--green)" border />
        </div>
      </div>

      <div className="section-h">Tugas Aktif</div>
      {loading ? (
        <div className="loading-center">Memuat…</div>
      ) : items.length === 0 ? (
        <div className="card accent-g" style={{ textAlign: 'center', padding: 18 }}>
          <div style={{ fontSize: 20 }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 5 }}>Semua tugas selesai</div>
          <div className="muted" style={{ fontSize: 10.5 }}>
            Tidak ada tindak lanjut tertunda.
          </div>
        </div>
      ) : (
        items.map((t) => {
          const sc = stageColor(t.stage)
          const due = dueMeta(t.due_date)
          return (
            <div key={t.id} className="card li" style={{ padding: 13, marginBottom: 9 }} onClick={() => openTask(t)} role="button" tabIndex={0}>
              <div className="barL" style={{ background: sc }} />
              <div className="av" style={{ background: `${sc}18`, borderRadius: 12, fontSize: 18 }}>
                {TASK_ICON[t.task_type] || '📋'}
              </div>
              <div className="main">
                <div className="n" style={{ fontSize: 12.5 }}>
                  {t.name}
                </div>
                <div className="d">{t.lead?.business_name || '—'}</div>
                <div className="badges">
                  <span className="badge" style={{ background: `${sc}22`, color: sc }}>
                    {STAGE_LABEL[t.stage] || t.stage}
                  </span>
                  <span className="badge" style={{ background: `${due.color}22`, color: due.color }}>
                    {due.label}
                  </span>
                </div>
              </div>
              <div className="r muted" style={{ fontSize: 16 }}>
                ›
              </div>
            </div>
          )
        })
      )}
    </Screen>
  )
}
