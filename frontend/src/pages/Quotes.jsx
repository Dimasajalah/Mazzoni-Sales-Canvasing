// frontend/src/pages/Quotes.jsx
// Daftar penawaran (Quotation).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getQuotes } from '../api'
import { Chips, Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtDate, fmtRp, listOf } from '../lib/format'

export const QUOTE_STATUS = {
  DRAFT: { label: 'Draft', color: 'var(--mut)' },
  QUOTED: { label: 'Quoted', color: 'var(--amber)' },
  WON: { label: 'Won', color: 'var(--green)' },
  LOST: { label: 'Lost', color: 'var(--pink)' },
}

const FILTERS = [
  ['ALL', 'Semua'],
  ['DRAFT', 'Draft'],
  ['QUOTED', 'Quoted'],
  ['WON', 'Won'],
  ['LOST', 'Lost'],
]

export default function Quotes() {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()
  const { showToast } = useUi()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(listOf(await getQuotes({ per_page: 100 })))
    } catch (e) {
      showToast(e.message || 'Gagal memuat Quotation', { warn: true })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const options = useMemo(
    () =>
      FILTERS.map(([value, label]) => ({
        value,
        label: `${label} (${value === 'ALL' ? items.length : items.filter((q) => q.status === value).length})`,
      })),
    [items],
  )
  const shown = filter === 'ALL' ? items : items.filter((q) => q.status === filter)

  return (
    <Screen>
      <TopBar title="Quotation" backTo="/home" />
      <p className="sub">Quotation dari prospek dan customer</p>
      <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={() => nav('/quotes/new')}>
        + Buat Quotation
      </button>
      <Chips options={options} value={filter} onChange={setFilter} />

      {loading ? (
        <div className="loading-center">Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Belum ada Quotation{filter === 'ALL' ? '. Nomor Quotation terbit otomatis saat tugas pertama prospek dikerjakan.' : ' pada status ini.'}
        </div>
      ) : (
        shown.map((q) => {
          const st = QUOTE_STATUS[q.status] || QUOTE_STATUS.DRAFT
          const who = q.lead?.business_name || q.customer?.name || '—'
          return (
            <div key={q.id} className="card li" style={{ padding: 14 }} onClick={() => nav(`/quotes/${q.id}`)} role="button" tabIndex={0}>
              <div className="barL" style={{ background: st.color }} />
              <div className="main">
                <div className="n">{q.quote_number}</div>
                <div className="d">
                  {who} · {q.lines_count ?? 0} baris · {fmtDate(q.entry_date)}
                </div>
                <div className="badges">
                  <span className="badge" style={{ background: `${st.color}22`, color: st.color }}>
                    {st.label}
                  </span>
                </div>
              </div>
              <div className="r" style={{ color: 'var(--orange)' }}>
                {fmtRp(q.total)}
              </div>
            </div>
          )
        })
      )}
    </Screen>
  )
}
