//frontend/src/pages/Expenses.jsx
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
  const { showToast } = useUi()

  useEffect(() => {
    const params = filter === 'ALL' || filter === 'UNPAID' ? {} : { status: filter }
    getExpenses(params)
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message, { warn: true }))
  }, [filter, showToast])

  const filtered = items.filter((e) => {
    // Belum dibayar = sudah disetujui dan statusnya belum PAID (status adalah satu-satunya sumber kebenaran)
    if (filter === 'UNPAID') return e.status === 'APPROVED'
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
        const st = e.status || 'SUBMITTED'
        const col =
          st === 'APPROVED' || st === 'PAID'
            ? 'var(--green)'
            : st === 'REJECTED'
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
            onClick={() => nav(`/expenses/${e.id}`)}
          />
        )
      })}
    </Screen>
  )
}
