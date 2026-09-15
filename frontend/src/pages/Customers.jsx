import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCustomers } from '../api'
import { ListItem, Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtRp, initials, listOf } from '../lib/format'

export default function Customers() {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()
  const { showToast } = useUi()

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await getCustomers(q ? { q } : {})
        if (alive) setItems(listOf(data))
      } catch (e) {
        if (alive) showToast(e.message, { warn: true })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [q, showToast])

  return (
    <Screen>
      <h1 className="title">Customers</h1>
      <p className="sub">Portofolio pelanggan sales</p>
      <div className="search">
        <span>🔍</span>
        <input
          placeholder="Cari nama / kode customer"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {loading ? (
        <div className="loading-center">Memuat…</div>
      ) : (
        items.map((c) => (
          <ListItem
            key={c.id}
            avatar={initials(c.name)}
            title={c.name}
            subtitle={`${c.customer_group || c.grade || '—'} · ${c.customer_code || ''}`}
            right={c.ar_balance != null ? fmtRp(c.ar_balance) : null}
            onClick={() => nav(`/customers/${c.id}`)}
          />
        ))
      )}
    </Screen>
  )
}
