import { useEffect, useState } from 'react'
import { getInventory } from '../api'
import { ListItem, Screen, TopBar } from '../components/ui'
import { useDebounce } from '../hooks/useDebounce'
import { useUi } from '../context/UiContext'
import { fmtRp, listProducts } from '../lib/format'

export default function Stock() {
  const [q, setQ] = useState('')
  const debounced = useDebounce(q, 300)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useUi()

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const data = await getInventory(debounced ? { q: debounced } : {})
        if (alive) setItems(listProducts(data))
      } catch (e) {
        if (alive) showToast(e.message, { warn: true })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [debounced, showToast])

  return (
    <Screen>
      <TopBar title="Cek On Hand" backTo="/home" />
      <div className="search">
        <span>🔍</span>
        <input
          placeholder="Cari part / nama produk"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>
      {loading ? (
        <div className="loading-center">Mencari stok…</div>
      ) : items.length === 0 ? (
        <div className="muted">Tidak ada hasil</div>
      ) : (
        items.map((p) => {
          const qty = p.available_qty ?? p.on_hand_qty ?? p.q ?? 0
          const col = qty <= 0 ? 'var(--pink)' : qty < 30 ? 'var(--amber)' : 'var(--green)'
          return (
            <ListItem
              key={`${p.inventory_id || p.id}-${p.warehouse}-${p.bin}`}
              barColor={col}
              title={p.description || 'Produk'}
              subtitle={`${p.part_num || '-'} · ${p.loc || p.warehouse || 'Gudang'}`}
              right={
                <div>
                  <div style={{ color: col, fontWeight: 800 }}>{qty}</div>
                  <div className="muted" style={{ fontSize: 10, fontWeight: 600 }}>
                    {fmtRp(p.price)}
                  </div>
                </div>
              }
            />
          )
        })
      )}
    </Screen>
  )
}
