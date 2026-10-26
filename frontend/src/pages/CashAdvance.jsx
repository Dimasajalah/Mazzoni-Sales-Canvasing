// frontend/src/pages/CashAdvance.jsx
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCashAdvanceCategories, getCashAdvanceDocuments, getCashAdvanceNotifications, getCashAdvanceSummary } from '../api'
import { Screen } from '../components/ui'
import NotificationBell from '../components/NotificationBell'
import { fmtIdr } from '../lib/money'
import '../styles/cashadvance.css'

const ICONS = { hotel: '🏨', fuel: '⛽', food: '🍽️', toll: '🚗', parking: '🅿️', other: '🏷️' }

function monthOptions() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    }
  })
}

export default function CashAdvance() {
  const nav = useNavigate()
  const months = monthOptions()
  const [month, setMonth] = useState(months[0].value)
  const [tab, setTab] = useState('issue')
  const [summary, setSummary] = useState(null)
  const [categories, setCategories] = useState([])
  const [receipts, setReceipts] = useState(null)
  const [unread, setUnread] = useState(0)
  const [state, setState] = useState('loading') // loading | ready | error-missing-desk | error

  const loadCore = useCallback(async () => {
    setState('loading')
    try {
      const [s, c, n] = await Promise.all([
        getCashAdvanceSummary(month),
        getCashAdvanceCategories(month),
        getCashAdvanceNotifications(),
      ])
      setSummary(s)
      setCategories(c)
      setUnread((n?.items || []).filter((x) => !x.read_at).length)
      setState('ready')
    } catch (e) {
      setState(e?.data?.errors?.code === 'E-01' ? 'error-missing-desk' : 'error')
    }
  }, [month])

  useEffect(() => { loadCore() }, [loadCore])

  useEffect(() => {
    if (tab !== 'receipt' || state !== 'ready') return
    getCashAdvanceDocuments(month, 'receipt').then(setReceipts).catch(() => setReceipts([]))
    setUnread(0) // badge hilang setelah tab Pemasukan dibuka (FDD 4.4-B04)
  }, [tab, month, state])

  if (state === 'error-missing-desk') {
    return (
      <Screen>
        <Topbar nav={nav} onReload={loadCore} unread={unread} />
        <div className="tp-empty">Akun Cash Advance Anda belum disiapkan. Hubungi Finance.</div>
      </Screen>
    )
  }
  if (state === 'error') {
    return (
      <Screen>
        <Topbar nav={nav} onReload={loadCore} unread={unread} />
        <div className="tp-empty">Data tidak dapat dimuat. Periksa koneksi lalu coba lagi.</div>
      </Screen>
    )
  }

  return (
    <Screen>
      <Topbar nav={nav} onReload={loadCore} unread={unread} />

      <div className="ca-balance-card">
        <span>Saldo Cash Advance</span>
        <h2>{state === 'loading' ? '…' : fmtIdr(summary?.balance)}</h2>
        <div className="ca-balance-row">
          <div><span>Pengeluaran</span><strong className="ca-neg">- {fmtIdr(summary?.total_issue)}</strong></div>
          <div><span>Pemasukan</span><strong className="ca-pos">+ {fmtIdr(summary?.total_receipt)}</strong></div>
        </div>
      </div>

      <div className="ca-tabs">
        <button className={tab === 'issue' ? 'active' : ''} onClick={() => setTab('issue')}>Pengeluaran</button>
        <button className={tab === 'receipt' ? 'active' : ''} onClick={() => setTab('receipt')}>
          Pemasukan {unread > 0 && <span className="ca-badge">{unread}</span>}
        </button>
      </div>

      <select className="ca-month" value={month} onChange={(e) => setMonth(e.target.value)}>
        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>

      {tab === 'issue' ? (
        <div className="ca-category-list">
          {categories.map((c) => (
            <button key={c.operation_type} className="ca-category-row"
              onClick={() => nav(`/cash-advance/category/${encodeURIComponent(c.operation_type)}`, { state: { month, displayName: c.display_name } })}>
              <span className="ca-icon">{ICONS[c.icon] || '🏷️'}</span>
              <span className="ca-category-info">
                <strong>{c.display_name}</strong>
                <small>{c.doc_count > 0 ? `${c.doc_count} pengeluaran` : 'Belum ada pengeluaran'}</small>
              </span>
              <span className={c.doc_count > 0 ? 'ca-amount-neg' : 'ca-amount-muted'}>
                {c.doc_count > 0 ? `- ${fmtIdr(c.total)}` : 'Rp 0'}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="ca-doc-list">
          {receipts === null && <div className="loading-center">Memuat…</div>}
          {receipts?.length === 0 && <div className="tp-empty">Belum ada pemasukan bulan ini.</div>}
          {receipts?.map((r) => (
            <div key={r.cash_document} className="ca-doc-row">
              <span>{fmtDate(r.creation_date)}</span>
              <span><strong>{r.cash_document}</strong>{r.legal_number && <small className="ca-legal">✓ {r.legal_number}</small>}</span>
              <span className="ca-amount-pos">+ {fmtIdr(r.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'issue' && (
        <button className="ca-fab-save" onClick={() => nav('/cash-advance/new')}>+ Catat Pengeluaran</button>
      )}
    </Screen>
  )
}

function Topbar({ nav, onReload, unread }) {
  return (
    <div className="topbar">
      <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div className="tt"><div>Cash Advance</div></div>
      <div className="topbar-actions">
        <NotificationBell unread={unread} />
        <button type="button" aria-label="Muat ulang" onClick={onReload}>⟳</button>
      </div>
    </div>
  )
}

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''
}