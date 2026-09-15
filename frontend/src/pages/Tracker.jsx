import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getOrderTracker, getOrders } from '../api'
import { Card, Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'

const DEFAULT_STEPS = [
  { key: 'order', label: 'Order' },
  { key: 'shipment', label: 'Shipment' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'payment', label: 'Payment' },
]

export default function Tracker() {
  const loc = useLocation()
  const [orders, setOrders] = useState([])
  const [orderId, setOrderId] = useState(loc.state?.orderId || '')
  const [tracker, setTracker] = useState(null)
  const { showToast } = useUi()

  useEffect(() => {
    getOrders({})
      .then((d) => {
        const list = listOf(d)
        setOrders(list)
        if (!orderId && list[0]) setOrderId(String(list[0].id))
      })
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  useEffect(() => {
    if (!orderId) return
    getOrderTracker(orderId)
      .then(setTracker)
      .catch(() => setTracker(null))
  }, [orderId])

  const steps = listOf(tracker?.steps).length
    ? listOf(tracker.steps)
    : DEFAULT_STEPS.map((s, i) => ({
        ...s,
        done: i === 0,
        status: i === 0 ? 'Selesai' : 'Menunggu',
        at: i === 0 ? tracker?.order_date || '—' : '—',
      }))

  const pct = tracker?.progress_pct ?? Math.round((steps.filter((s) => s.done || s.completed).length / steps.length) * 100)

  return (
    <Screen>
      <h1 className="title">Order Tracker</h1>
      <p className="sub">Order → Shipment → Invoice → Payment</p>
      <div className="field">
        <label>Sales Order</label>
        <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.order_number || o.so} — {o.customer?.name || o.customer_name || ''}
            </option>
          ))}
        </select>
      </div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800 }}>Progress</div>
          <div className="pct" style={{ color: 'var(--orange)', fontWeight: 800 }}>
            {pct}%
          </div>
        </div>
        <div className="prog">
          <span style={{ width: `${pct}%`, background: 'var(--orange)' }} />
        </div>
      </Card>
      {steps.map((s, i) => {
        const done = s.done || s.completed || s.status === 'done'
        const col = done ? 'var(--green)' : 'var(--stroke)'
        return (
          <div key={s.key || s.label || i}>
            <div className="step">
              <div className="dot" style={{ borderColor: col, color: done ? 'var(--green)' : 'var(--mut)' }}>
                {done ? '✓' : i + 1}
              </div>
              <div className="info">
                <div className="t">{s.label || s.name || s.key}</div>
                <div className="s">{s.status || s.at || s.s || '—'}</div>
              </div>
            </div>
            {i < steps.length - 1 ? <div className="step"><div className="line" /></div> : null}
          </div>
        )
      })}
    </Screen>
  )
}
