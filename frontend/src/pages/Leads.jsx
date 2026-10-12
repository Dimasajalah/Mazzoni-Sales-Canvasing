// frontend/src/pages/Leads.jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLeads } from '../api'
import { LeadCard } from '../components/LeadCard'
import { Chips, Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf, STATUS_CUSTOMER_STEPS } from '../lib/format'

// Pipeline mengikuti dokumen: Prospect sampai Win/Lose/Distribution. "Lead" adalah stage task, bukan tahap pipeline.
const LABELS = [['ALL', 'Semua'], ...STATUS_CUSTOMER_STEPS.filter(([key]) => key !== 'LEAD').map(([key, label]) => [key, label])]

const matches = (lead, filter) => filter === 'ALL' || lead.status_customer === filter

export default function Leads() {
  const [filter, setFilter] = useState('ALL')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()
  const { showToast } = useUi()

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

  // Revisi: kartu dibuka sebagai halaman, langsung ke Check-in (bukan sheet form).
  const openLead = (lead) => nav('/checkin', { state: { leadId: lead.id } })

  return (
    <Screen>
      <h1 className="title">Leads</h1>
      <p className="sub">Pipeline Customer: Prospek · Brand Awareness · Sampling · Quotation · Win · Lose · Distribution</p>
      <Chips options={options} value={filter} onChange={setFilter} />
      {loading ? (
        <div className="loading-center">Memuat leads…</div>
      ) : filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Tidak ada prospek pada kategori ini.
        </div>
      ) : (
        filtered.map((l) => (
          <LeadCard
            key={l.id}
            lead={l}
            onClick={() => openLead(l)}
            onDetail={() => nav(`/customers/${l.customer_id}`)}
          />
        ))
      )}
    </Screen>
  )
}