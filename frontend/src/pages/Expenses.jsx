import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getExpenses } from '../api'
import { Chips, ListItem, Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtRp, listOf } from '../lib/format'

const FILTERS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'SUBMITTED', label: 'Menunggu' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'UNPAID', label: 'Belum dibayar' },
]

const CAT = {
  bensin: '⛽',
  tol: '🛣️',
  makan: '🍽️',
  hotel: '🏨',
  entertain: '🎁',
}

export default function Expenses() {
  const [filter, setFilter] = useState('ALL')
  const [items, setItems] = useState([])
  const nav = useNavigate()
  const { showToast, openSheet } = useUi()

  useEffect(() => {
    const params = filter === 'ALL' || filter === 'UNPAID' ? {} : { status: filter }
    getExpenses(params)
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message, { warn: true }))
  }, [filter, showToast])

  const filtered = items.filter((e) => {
    if (filter === 'UNPAID') return (e.status === 'APPROVED' || e.approval === 1) && !e.paid
    return true
  })

  return (
    <Screen>
      <TopBar title="Expense Saya" backTo="/home" />
      <button type="button" className="btn" style={{ marginBottom: 12 }} onClick={() => nav('/expenses/new')}>
        Laporkan Expense
      </button>
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      {filtered.map((e) => {
        const st = e.status || statusLabel(e.approval)
        const col =
          st === 'APPROVED' || e.approval === 1
            ? 'var(--green)'
            : st === 'REJECTED' || e.approval === -1
              ? 'var(--pink)'
              : 'var(--amber)'
        return (
          <ListItem
            key={e.id || e.expense_number}
            barColor={col}
            avatar={CAT[e.category] || '🧾'}
            title={e.expense_number || e.id}
            subtitle={`${e.category} · ${st}${e.note ? ` · ${e.note}` : ''}`}
            right={fmtRp(e.amount)}
            onClick={() =>
              openSheet('Detail Expense', (
                <div>
                  <div style={{ fontWeight: 800 }}>{e.expense_number}</div>
                  <p className="muted" style={{ fontSize: 12 }}>
                    {e.note}
                  </p>
                  <div>{fmtRp(e.amount)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    Status: {st}
                  </div>
                </div>
              ))
            }
          />
        )
      })}
    </Screen>
  )
}

function statusLabel(a) {
  if (a === 1) return 'APPROVED'
  if (a === -1) return 'REJECTED'
  return 'SUBMITTED'
}
