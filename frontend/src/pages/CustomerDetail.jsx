import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCustomer, offerPromo } from '../api'
import { AgingBuckets, Card, ListItem, Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { bucketOf, fmtRp, listOf } from '../lib/format'

export default function CustomerDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()
  const { showToast } = useUi()

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await getCustomer(id)
        if (alive) setC(data)
      } catch (e) {
        if (alive) showToast(e.message, { error: true })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id, showToast])

  if (loading) {
    return (
      <Screen>
        <TopBar title="Customer" backTo="/customers" />
        <div className="loading-center">Memuat…</div>
      </Screen>
    )
  }

  if (!c) {
    return (
      <Screen>
        <TopBar title="Customer" backTo="/customers" />
        <div className="muted">Customer tidak ditemukan</div>
      </Screen>
    )
  }

  const invoices = listOf(c.invoices || c.ar?.invoices || c.ar?.inv)
  const products = listOf(c.top_products || c.upsell || [])
  const buckets = [0, 0, 0, 0]
  invoices.forEach((inv) => {
    buckets[bucketOf(inv.days_overdue ?? inv.days)] += Number(inv.balance ?? inv.bal ?? 0)
  })
  const totalAr = invoices.reduce((s, i) => s + Number(i.balance ?? i.bal ?? 0), 0)
  const limit = c.credit_limit ?? c.ar?.limit ?? 0

  return (
    <Screen>
      <TopBar title="Detail Customer" backTo="/customers" />
      <Card>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{c.name}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {c.customer_group || '—'} · {c.customer_code}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          {c.address}
          {c.city ? `, ${c.city}` : ''}
        </div>
        <div style={{ marginTop: 10, fontSize: 12 }}>
          AR: <b style={{ color: 'var(--pink)' }}>{fmtRp(totalAr)}</b>
          <span className="muted"> / limit {fmtRp(limit)}</span>
        </div>
        <div className="prog">
          <span
            style={{
              width: `${limit ? Math.min(100, (totalAr / limit) * 100) : 0}%`,
              background: 'var(--pink)',
            }}
          />
        </div>
      </Card>

      <div className="section-h">Aging</div>
      <AgingBuckets buckets={buckets} />

      <div className="section-h">Invoice terbuka</div>
      {invoices.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>Tidak ada invoice</div>
      ) : (
        invoices.map((i) => {
          const days = i.days_overdue ?? i.days ?? 0
          const col =
            days <= 0 ? 'var(--green)' : days <= 30 ? 'var(--amber)' : days <= 60 ? '#FF8A3D' : 'var(--pink)'
          return (
            <ListItem
              key={i.id || i.invoice_number || i.inv}
              barColor={col}
              title={i.invoice_number || i.inv}
              subtitle={`JT ${i.due_date || i.due}${days > 0 ? ` · telat ${days} hari` : ''}`}
              right={fmtRp(i.balance ?? i.bal)}
            />
          )
        })
      )}

      <div className="section-h">Top produk / upsale</div>
      {products.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>Belum ada rekomendasi</div>
      ) : (
        products.map((p) => (
          <ListItem
            key={p.id || p.part_num || p.sku}
            barColor="var(--green)"
            title={p.description || p.name || p.n}
            subtitle={p.part_num || p.sku || p.d}
            right={p.tag || p.on_hand != null ? `OH ${p.on_hand ?? p.q}` : null}
          />
        ))
      )}

      <div className="section-h">Aksi</div>
      <div className="qa">
        <div className="item" onClick={() => nav('/checkin', { state: { customerId: c.id, customer: c } })} role="button" tabIndex={0}>
          <div className="ic" style={{ background: 'rgba(18,160,90,.15)' }}>📍</div>
          <div className="t">Check-in</div>
        </div>
        <div className="item" onClick={() => nav('/payment', { state: { customerId: c.id } })} role="button" tabIndex={0}>
          <div className="ic" style={{ background: 'rgba(42,111,214,.15)' }}>💳</div>
          <div className="t">Bayar</div>
        </div>
        <div className="item" onClick={() => nav('/orders/new', { state: { customerId: c.id } })} role="button" tabIndex={0}>
          <div className="ic" style={{ background: 'rgba(238,106,10,.15)' }}>🛒</div>
          <div className="t">Order</div>
        </div>
        <div
          className="item"
          onClick={async () => {
            try {
              const promoId = c.suggested_promo_id || 1
              await offerPromo(promoId, { customer_id: c.id })
              showToast('Promo ditawarkan ke customer')
            } catch (e) {
              showToast(e.message || 'Gagal offer promo', { warn: true })
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="ic" style={{ background: 'rgba(238,106,10,.15)' }}>🎁</div>
          <div className="t">Promo</div>
        </div>
      </div>
      <div style={{ height: 16 }} />
    </Screen>
  )
}
