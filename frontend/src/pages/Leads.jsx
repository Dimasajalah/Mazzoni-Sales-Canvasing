import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLeads } from '../api'
import { Chips, ListItem, Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtRp, listOf, stageColor } from '../lib/format'

const FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'QUOTE', label: 'Quote' },
  { value: 'WON', label: 'Won' },
]

export default function Leads() {
  const [filter, setFilter] = useState('ALL')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast, openSheet, closeSheet } = useUi()
  const nav = useNavigate()

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const params = filter === 'ALL' ? {} : { stage: filter }
        const data = await getLeads(params)
        if (alive) setItems(listOf(data))
      } catch (e) {
        if (alive) showToast(e.message || 'Gagal muat leads', { warn: true })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [filter, showToast])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return items
    return items.filter((l) => String(l.stage || '').toUpperCase() === filter)
  }, [items, filter])

  const openFollowUp = (lead) => {
    openSheet('Follow-up Canvassing', (
      <div>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>{lead.business_name || lead.name}</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Stage: {lead.stage} · {lead.owner_name || '—'}
        </div>
        <button
          type="button"
          className="btn"
          style={{ marginBottom: 8 }}
          onClick={() => {
            closeSheet()
            nav('/orders/new', { state: { leadId: lead.id, customerName: lead.business_name } })
          }}
        >
          Buat Order
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            closeSheet()
            nav('/canvassing')
          }}
        >
          Buka Canvassing
        </button>
      </div>
    ))
  }

  return (
    <Screen>
      <h1 className="title">Leads</h1>
      <p className="sub">Pipeline canvassing lapangan</p>
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      {loading ? (
        <div className="loading-center">Memuat leads…</div>
      ) : filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Belum ada lead.
        </div>
      ) : (
        filtered.map((l) => {
          const stage = String(l.stage || 'NEW').toUpperCase()
          return (
            <ListItem
              key={l.id}
              barColor={stageColor(stage)}
              title={l.business_name || l.name}
              subtitle={`${stage} · ${l.owner_name || l.phone || '—'}`}
              right={l.estimated_value != null ? fmtRp(l.estimated_value) : '—'}
              onClick={() => openFollowUp(l)}
            />
          )
        })
      )}
    </Screen>
  )
}
