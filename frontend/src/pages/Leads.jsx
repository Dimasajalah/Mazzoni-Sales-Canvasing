// frontend/src/pages/Leads.jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getLeads } from '../api'
import { LeadCard } from '../components/LeadCard'
import LeadTaskPanel from '../components/LeadTaskPanel'
import { Chips, Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf, STATUS_CUSTOMER_STEPS } from '../lib/format'

// Pipeline Customer (hasil meeting Okt 2026, poin 6): 8 status linear menggantikan Stage+Status lama.
const LABELS = [['ALL', 'Semua'], ...STATUS_CUSTOMER_STEPS.map(([key, label]) => [key, label])]

const matches = (lead, filter) => filter === 'ALL' || lead.status_customer === filter

export default function Leads() {
  const [filter, setFilter] = useState('ALL')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast, openSheet, closeSheet } = useUi()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getLeads({ per_page: 100 })
      setItems(listOf(data))
    } catch (e) {
      showToast(e.message || 'Gagal muat leads', { warn: true })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const options = useMemo(
    () =>
      LABELS.map(([value, label]) => ({
        value,
        label: `${label} (${items.filter((l) => matches(l, value)).length})`,
      })),
    [items],
  )

  const filtered = useMemo(() => items.filter((l) => matches(l, filter)), [items, filter])

  const openLead = (lead) =>
    openSheet(
      'Prospek',
      // key wajib ada: LeadTaskPanel menyimpan tugas di state internalnya sendiri (useState), yang
      // TIDAK otomatis ter-reset kalau cuma prop `task` yang berubah (mis. lead yang sama dibuka
      // lagi setelah tugasnya maju ke tahap berikutnya) — tanpa key beda, panel akan tetap
      // menampilkan tugas LAMA yang sudah basi. Mengganti key memaksa React membuat instance baru.
      <LeadTaskPanel
        key={`${lead.id}-${lead.current_task?.id ?? 'none'}`}
        lead={lead}
        task={lead.current_task}
        onChanged={load}
        onClose={closeSheet}
        showToast={showToast}
      />,
    )

  return (
    <Screen>
      <h1 className="title">Leads</h1>
      <p className="sub">Pipeline Customer: Lead · Prospek · Brand Awareness · Sampling · Quotation · Win · Lose · Distribution</p>
      <Chips options={options} value={filter} onChange={setFilter} />
      {loading ? (
        <div className="loading-center">Memuat leads…</div>
      ) : filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Tidak ada prospek pada kategori ini.
        </div>
      ) : (
        filtered.map((l) => <LeadCard key={l.id} lead={l} onClick={() => openLead(l)} />)
      )}
    </Screen>
  )
}