import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { globalSearch } from '../api'
import { useDebounce } from '../hooks/useDebounce'
import { listOf } from '../lib/format'

export function GlobalSearch({ placeholder = 'Cari customer, part, invoice...' }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounced = useDebounce(q, 350)
  const nav = useNavigate()

  useEffect(() => {
    let alive = true
    async function run() {
      if (!debounced || debounced.length < 2) {
        setResults([])
        return
      }
      setLoading(true)
      try {
        const data = await globalSearch(debounced)
        if (!alive) return
        const items = normalizeSearch(data)
        setResults(items)
        setOpen(true)
      } catch {
        if (alive) setResults([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [debounced])

  const go = (item) => {
    setOpen(false)
    setQ('')
    if (item.type === 'customer') nav(`/customers/${item.id}`)
    else if (item.type === 'lead') nav('/leads')
    else if (item.type === 'product') nav('/stock')
    else if (item.type === 'order') nav('/orders')
    else if (item.type === 'invoice') nav('/ar')
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div className="sbar">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0A1C40"
          strokeWidth="1.9"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        <input
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
        />
      </div>
      {open && (results.length > 0 || loading) && (
        <div className="search-results">
          {loading && <div className="sr-item muted">Mencari…</div>}
          {results.map((r) => (
            <div
              key={`${r.type}-${r.id}`}
              className="sr-item"
              onMouseDown={() => go(r)}
              role="button"
              tabIndex={0}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.title}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {r.subtitle || r.type}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function normalizeSearch(data) {
  if (!data) return []
  if (Array.isArray(data)) {
    return data.map((x) => ({
      id: x.id,
      type: x.type || x.entity || 'item',
      title: x.title || x.name || x.label || String(x.id),
      subtitle: x.subtitle || x.description || '',
    }))
  }
  const out = []
  for (const [type, arr] of Object.entries(data)) {
    for (const x of listOf(arr)) {
      out.push({
        id: x.id,
        type: type.replace(/s$/, '') || 'item',
        title: x.name || x.business_name || x.order_number || x.invoice_number || x.part_num || x.title,
        subtitle: x.customer_code || x.part_num || x.status || type,
      })
    }
  }
  return out
}
