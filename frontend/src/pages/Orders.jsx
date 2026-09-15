import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrders } from '../api'
import { ListItem, Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtRp, listOf } from '../lib/format'

export default function Orders() {
  const [items, setItems] = useState([])
  const nav = useNavigate()
  const { showToast } = useUi()

  useEffect(() => {
    getOrders({})
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  return (
    <Screen>
      <h1 className="title">Orders</h1>
      <p className="sub">Daftar sales order staging</p>
      {items.map((o) => (
        <ListItem
          key={o.id || o.order_number}
          barColor="var(--orange)"
          title={o.order_number || o.so}
          subtitle={`${o.customer?.name || o.customer_name || o.cust} · ${o.status || o.st || '—'}`}
          right={o.total != null ? fmtRp(o.total) : o.d}
          onClick={() => nav('/track', { state: { orderId: o.id } })}
        />
      ))}
      {items.length === 0 ? <div className="muted">Belum ada order</div> : null}
    </Screen>
  )
}
