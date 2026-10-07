// frontend/src/pages/NooReport.jsx
// Traceability NOO (New Open Outlet) per sales dan per territory.
import { useEffect, useMemo, useState } from 'react'
import { getNooReport } from '../api'
import { Chips, Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function rangeFor(period, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  if (period === 'lastmonth') return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
  if (period === '90d') return { from: iso(new Date(y, m, now.getDate() - 89)), to: iso(now) }
  if (period === 'year') return { from: iso(new Date(y, 0, 1)), to: iso(now) }
  return { from: iso(new Date(y, m, 1)), to: iso(now) } // bulan ini
}

const PERIODS = [
  { value: 'month', label: 'Bulan ini' },
  { value: 'lastmonth', label: 'Bulan lalu' },
  { value: '90d', label: '90 hari' },
  { value: 'year', label: 'Tahun ini' },
]

const GROUPS = [
  { value: 'sales', label: 'Per Sales' },
  { value: 'territory', label: 'Per Territory' },
]

function Stat({ value, label, color }) {
  return (
    <div className="card" style={{ flex: 1, padding: 12, textAlign: 'center', marginBottom: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div className="muted" style={{ fontSize: 10 }}>
        {label}
      </div>
    </div>
  )
}

export default function NooReport() {
  const [period, setPeriod] = useState('month')
  const [groupBy, setGroupBy] = useState('sales')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const { showToast } = useUi()

  const range = useMemo(() => rangeFor(period), [period])

  useEffect(() => {
    let alive = true
    setLoading(true)
    getNooReport({ ...range, group_by: groupBy })
      .then((r) => alive && setReport(r))
      .catch((e) => alive && showToast(e.message || 'Gagal memuat laporan NOO', { warn: true }))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [range, groupBy, showToast])

  const rows = report?.rows || []
  const totals = report?.totals
  const maxWon = Math.max(1, ...rows.map((r) => r.won))

  return (
    <Screen>
      <TopBar title="Laporan NOO" backTo="/home" />
      <p className="sub">New Open Outlet: prospek yang Win, dihitung ke pemilik prospek</p>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      <Chips options={GROUPS} value={groupBy} onChange={setGroupBy} />

      {loading ? (
        <div className="loading-center">Memuat…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <Stat value={totals?.registered ?? 0} label="Terdaftar" color="var(--blue)" />
            <Stat value={totals?.won ?? 0} label="NOO (Win)" color="var(--green)" />
            <Stat value={totals?.lost ?? 0} label="Lose" color="var(--pink)" />
            <Stat value={totals?.win_rate == null ? '—' : `${totals.win_rate}%`} label="Win rate" color="var(--orange)" />
          </div>

          {rows.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              Belum ada data pada periode ini.
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.key} className="card" style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{r.label}</div>
                  <div style={{ fontWeight: 800, color: 'var(--green)' }}>{r.won} NOO</div>
                </div>
                <div className="prog" style={{ margin: '8px 0' }}>
                  <span style={{ width: `${(r.won / maxWon) * 100}%`, background: 'var(--green)' }} />
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Terdaftar {r.registered} · Lose {r.lost} · Sudah order {r.ordered} dari {r.won} NOO
                  {r.win_rate != null ? ` · Win rate ${r.win_rate}%` : ''}
                </div>
              </div>
            ))
          )}
          <div className="muted" style={{ fontSize: 10.5, marginTop: 10 }}>
            Periode {report?.period?.from} s/d {report?.period?.to}. Order yang dibuat lewat delegasi tetap dihitung ke pembuka prospek.
          </div>
        </>
      )}
    </Screen>
  )
}
