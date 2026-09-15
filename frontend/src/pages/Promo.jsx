import { useEffect, useState } from 'react'
import { getCustomers, getPromos, offerPromo } from '../api'
import { Card, Chips, Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'

const FILTERS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'discount', label: 'Diskon' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'cashback', label: 'Cashback' },
]

export default function Promo() {
  const [filter, setFilter] = useState('ALL')
  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const { showToast, openSheet, closeSheet } = useUi()

  useEffect(() => {
    const params = filter === 'ALL' ? {} : { type: filter }
    getPromos(params)
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message, { warn: true }))
    getCustomers({})
      .then((d) => setCustomers(listOf(d)))
      .catch(() => {})
  }, [filter, showToast])

  const offer = (promo) => {
    openSheet('Tawarkan Promo', (
      <OfferForm
        customers={customers}
        onSubmit={async (customerId) => {
          try {
            await offerPromo(promo.id, { customer_id: customerId, promo_id: promo.id })
            closeSheet()
            showToast(`Promo ${promo.promo_code || promo.code} ditawarkan`)
          } catch (e) {
            showToast(e.message, { error: true })
          }
        }}
      />
    ))
  }

  return (
    <Screen>
      <h1 className="title">Promo Berlaku</h1>
      <p className="sub">Penawaran aktif untuk canvassing</p>
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      {items.map((p) => (
        <Card key={p.id || p.promo_code} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <span className="badge" style={{ background: 'rgba(238,106,10,.15)', color: 'var(--orange)' }}>
                {p.promo_code || p.code}
              </span>
              <div style={{ fontWeight: 800, marginTop: 8 }}>{p.name || p.n}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                {p.description || p.m}
              </div>
              <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>
                s/d {p.end_date || p.v} · {p.customer_group || p.e || 'Semua'}
              </div>
            </div>
          </div>
          <button type="button" className="btn sm" style={{ marginTop: 12, width: '100%' }} onClick={() => offer(p)}>
            Tawarkan ke Customer
          </button>
        </Card>
      ))}
    </Screen>
  )
}

function OfferForm({ customers, onSubmit }) {
  const [id, setId] = useState(customers[0]?.id || '')
  return (
    <div>
      <div className="field">
        <label>Customer</label>
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn" disabled={!id} onClick={() => onSubmit(id)}>
        Kirim Offer
      </button>
    </div>
  )
}
