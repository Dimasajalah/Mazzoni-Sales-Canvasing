// frontend/src/pages/MarketingBudgets.jsx
// Blueprint MJU 3.2.1 (MKT01): daftar Campaign berisi budget marketing per tahun.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMarketingBudgets } from '../api'
import { Chips, Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { initials, listOf } from '../lib/format'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingbudget.css'

const pctOf = (used, total) => (total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0)
const barTone = (p) => (p >= 100 ? 'full' : p >= 80 ? 'warn' : '')

export default function MarketingBudgets() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState('ALL')
  const allowed = isManager(user)

  useEffect(() => {
    if (!allowed) return
    getMarketingBudgets()
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message || 'Gagal memuat budget marketing', { warn: true }))
      .finally(() => setLoading(false))
  }, [allowed, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Budget Marketing" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const years = [...new Set(items.map((b) => b.fiscal_year))].sort((a, b) => b - a)
  const options = [{ value: 'ALL', label: 'Semua' }, ...years.map((y) => ({ value: String(y), label: String(y) }))]
  const shown = items.filter((b) => year === 'ALL' || String(b.fiscal_year) === year)
  const sum = (k) => shown.reduce((t, b) => t + (Number(b[k]) || 0), 0)
  const total = sum('total_budget')
  const allocated = sum('allocated_amount')
  const pct = pctOf(allocated, total)

  return (
    <Screen>
      <TopBar title="Budget Marketing" backTo="/home" />

      <div className="mb-hero">
        <div className="mb-hero-cap">Total Budget {year === 'ALL' ? 'Semua Tahun' : year}</div>
        <div className="mb-hero-total" data-testid="sum-total">{fmtIdr(total)}</div>
        <div className="mb-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="mb-hero-sub">{pct}% sudah dialokasikan ke Event/Klaim</div>
        <div className="mb-stats">
          <div><span>Teralokasi</span><b>{fmtIdr(allocated)}</b></div>
          <div><span>Sisa</span><b>{fmtIdr(total - allocated)}</b></div>
          <div><span>Campaign</span><b>{shown.length}</b></div>
        </div>
      </div>

      <button type="button" className="btn mb-add" onClick={() => nav('/marketing/budgets/new')}>
        Tambah Budget (Campaign)
      </button>
      <button type="button" className="btn ghost mb-add" onClick={() => nav('/marketing/events')}>
        Event Marketing
      </button>
      <Chips options={options} value={year} onChange={setYear} />

      {loading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="mb-empty">
          <span className="mb-empty-ic">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" />
            </svg>
          </span>
          <p>Belum ada budget marketing.</p>
          <small>Ketuk "Tambah Budget" untuk membuat Campaign pertama.</small>
        </div>
      ) : (
        shown.map((b) => {
          const p = pctOf(Number(b.allocated_amount), Number(b.total_budget))
          const closed = b.status === 'CLOSED'
          return (
            <div
              key={b.id}
              className={`mb-card${closed ? ' off' : ''}`}
              onClick={() => nav(`/marketing/budgets/${b.id}`)}
              role="button"
              tabIndex={0}
            >
              <div className="mb-top">
                <div className="mb-av">{initials(b.name)}</div>
                <div className="mb-main">
                  <div className="mb-name">{b.name}</div>
                  <div className="mb-meta">{b.campaign_code} · {b.fiscal_year}</div>
                </div>
                <span className={`mb-badge ${closed ? 'off' : 'on'}`}>{closed ? 'Ditutup' : 'Aktif'}</span>
              </div>
              <div className="mb-amount">
                <b>{fmtIdr(b.total_budget)}</b>
                <span>total budget</span>
              </div>
              <div className="mb-bar"><i className={barTone(p)} style={{ width: `${p}%` }} /></div>
              <div className="mb-foot">
                <span>Teralokasi {fmtIdr(b.allocated_amount)} ({p}%)</span>
                <span>Sisa <b>{fmtIdr(b.remaining_budget)}</b></span>
              </div>
            </div>
          )
        })
      )}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
