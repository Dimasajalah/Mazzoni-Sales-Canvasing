//frontend/src/pages/ArReport.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAging } from '../api'
import { AgingBuckets, Chips, ListItem, Screen, TopBar } from '../components/ui'
import { agingBuckets, agingCounts, agingCustomers, agingTotal } from '../lib/aging'
import { fmtIdr } from '../lib/money'

const FILTERS = [
  { value: -1, label: 'Semua', bucket: null },
  { value: 0, label: 'Lancar', bucket: 'CURRENT' },
  { value: 1, label: '1-30', bucket: '1-30' },
  { value: 2, label: '31-60', bucket: '31-60' },
  { value: 3, label: '60+', bucket: '60+' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** "16 Okt 2026 09:12" dari penanda waktu ISO; kosong bila tidak valid. */
const fmtAsOf = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm}`
}

const barColor = (days) => (days > 60 ? 'var(--pink)' : days > 0 ? 'var(--amber)' : 'var(--green)')

const subtitleOf = (c) => {
  const days = Number(c.max_days_overdue ?? c.days_overdue ?? c.days ?? 0)
  const parts = [
    c.customer_code || null,
    c.invoice_count ? `${c.invoice_count} invoice` : null,
    days > 0 ? `telat ${days} hari` : 'belum jatuh tempo',
  ].filter(Boolean)
  return parts.join(' · ') || c.bucket_label || '—'
}

export default function ArReport() {
  const [filter, setFilter] = useState(-1)
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const nav = useNavigate()

  useEffect(() => {
    let alive = true
    getAging({})
      .then((d) => {
        if (!alive) return
        setData(d)
        setStatus('ready')
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || 'Terjadi kesalahan saat memuat laporan.')
        setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [attempt])

  const retry = () => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }

  const bucketKey = FILTERS.find((f) => f.value === filter)?.bucket ?? null
  const buckets = agingBuckets(data)
  const total = agingTotal(data)
  const counts = agingCounts(data)
  const allCustomers = agingCustomers(data)
  const shown = agingCustomers(data, bucketKey)
  const asOf = data?.as_of ? fmtAsOf(data.as_of) : ''

  return (
    <Screen>
      <TopBar title="Outstanding Report" backTo="/home" />

      {status === 'loading' ? (
        <div className="loading-center">Memuat…</div>
      ) : status === 'error' ? (
        <div className="card" role="alert">
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Laporan belum bisa dimuat</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{error}</div>
          <button type="button" className="btn" onClick={retry}>Muat ulang</button>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="muted" style={{ fontSize: 11 }}>Total outstanding</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--pink)' }}>{fmtIdr(total)}</div>
            {counts ? (
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                {counts.customers} customer · {counts.overdue} invoice telat
              </div>
            ) : null}
            {asOf ? <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Per {asOf}</div> : null}
          </div>
          <AgingBuckets buckets={buckets} />
          <div style={{ height: 12 }} />

          {allCustomers.length === 0 ? (
            <div className="muted" style={{ fontSize: 12, padding: 12, textAlign: 'center' }}>
              {total > 0 ? 'Rincian per customer belum tersedia.' : 'Tidak ada piutang terbuka.'}
            </div>
          ) : (
            <>
              <Chips
                options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
                value={filter}
                onChange={setFilter}
              />
              {shown.length === 0 ? (
                <div className="muted" style={{ fontSize: 12, padding: 12, textAlign: 'center' }}>
                  Tidak ada customer di kelompok ini.
                </div>
              ) : null}
              {shown.map((c) => (
                <ListItem
                  key={c.id || c.customer_id}
                  barColor={barColor(Number(c.max_days_overdue ?? c.days_overdue ?? c.days ?? 0))}
                  title={c.name || c.customer_name}
                  subtitle={subtitleOf(c)}
                  right={fmtIdr(c.balance ?? c.total ?? c.amount)}
                  onClick={() => nav(`/customers/${c.id || c.customer_id}`)}
                />
              ))}
            </>
          )}

          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => nav('/payment')}>
            Catat Pembayaran
          </button>
        </>
      )}
    </Screen>
  )
}
