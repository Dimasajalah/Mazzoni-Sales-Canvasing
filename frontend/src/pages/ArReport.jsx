import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAging } from '../api'
import { AgingBuckets, Chips, ListItem, Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtRp, listOf } from '../lib/format'

const FILTERS = [
  { value: -1, label: 'Semua' },
  { value: 1, label: '1-30' },
  { value: 2, label: '31-60' },
  { value: 3, label: '60+' },
]

export default function ArReport() {
  const [filter, setFilter] = useState(-1)
  const [data, setData] = useState(null)
  const nav = useNavigate()
  const { showToast } = useUi()

  useEffect(() => {
    getAging({})
      .then(setData)
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  const buckets = data?.buckets || [
    data?.current || 0,
    data?.d1_30 || 0,
    data?.d31_60 || 0,
    data?.d60_plus || 0,
  ]
  const customers = listOf(data?.customers || data?.top || data?.items)

  const filtered = customers.filter((c) => {
    if (filter < 0) return true
    const days = c.max_days_overdue ?? c.days ?? worstDays(c)
    if (filter === 1) return days > 0 && days <= 30
    if (filter === 2) return days > 30 && days <= 60
    if (filter === 3) return days > 60
    return true
  })

  return (
    <Screen>
      <TopBar title="Laporan Aging AR" backTo="/home" />
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 11 }}>Total outstanding</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--pink)' }}>
          {fmtRp(data?.total ?? 0)}
        </div>
      </div>
      <AgingBuckets buckets={buckets} />
      <div style={{ height: 12 }} />
      <Chips
        options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        value={filter}
        onChange={setFilter}
      />
      {filtered.map((c) => (
        <ListItem
          key={c.id || c.customer_id}
          barColor="var(--pink)"
          title={c.name || c.customer_name}
          subtitle={c.customer_code || c.bucket_label || '—'}
          right={fmtRp(c.balance ?? c.total ?? c.amount)}
          onClick={() => nav(`/customers/${c.id || c.customer_id}`)}
        />
      ))}
      <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => nav('/payment')}>
        Catat Pembayaran
      </button>
    </Screen>
  )
}

function worstDays(c) {
  const inv = listOf(c.invoices)
  if (!inv.length) return 0
  return Math.max(...inv.map((i) => Number(i.days_overdue ?? i.days ?? 0)))
}
