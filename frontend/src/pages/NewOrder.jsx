// frontend/src/pages/NewOrder.jsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createOrder, getCustomers, getProducts, getPromos } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { useOnline } from '../hooks/useOnline'
import { saveDraft } from '../lib/drafts'
import { fmtRp, listOf, listProducts } from '../lib/format'
import { uuid } from '../lib/uuid'

const NPD_OPTION_VALUE = '__NPD__'

export default function NewOrder() {
  const loc = useLocation()
  const nav = useNavigate()
  const online = useOnline()
  const { showToast } = useUi()
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [promos, setPromos] = useState([])
  const [customerId, setCustomerId] = useState(loc.state?.customerId || '')
  const [customerPo, setCustomerPo] = useState('')
  const [promoId, setPromoId] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState(1)
  const [lines, setLines] = useState([])
  const [saving, setSaving] = useState(false)

  // State khusus untuk input NPD (free-text)
  const [isNpd, setIsNpd] = useState(false)
  const [npdName, setNpdName] = useState('')
  const [npdUom, setNpdUom] = useState('PCS')
  const [npdPrice, setNpdPrice] = useState('')

  useEffect(() => {
    Promise.all([getCustomers({}), getProducts({}), getPromos({})])
      .then(([c, p, pr]) => {
        const cl = listOf(c)
        const pl = listProducts(p)
        setCustomers(cl)
        setProducts(pl)
        setPromos(listOf(pr))
        if (!customerId && cl[0]) setCustomerId(String(cl[0].id))
        if (pl[0]) setProductId(String(pl[0].id))
      })
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  const onProductChange = (value) => {
    setProductId(value)
    setIsNpd(value === NPD_OPTION_VALUE)
  }

  const resetNpdFields = () => {
    setNpdName('')
    setNpdUom('PCS')
    setNpdPrice('')
  }

  const addLine = () => {
    const q = Number(qty) || 1

    if (isNpd) {
      const name = npdName.trim()
      if (!name) {
        showToast('Nama produk NPD wajib diisi', { warn: true })
        return
      }
      const price = Number(npdPrice) || 0
      setLines((prev) => [
        ...prev,
        {
          is_custom: true,
          custom_part_name: name,
          part_num: 'NPD',
          description: name,
          qty: q,
          uom: npdUom || 'PCS',
          unit_price: price,
          line_total: q * price,
        },
      ])
      resetNpdFields()
      return
    }

    const p = products.find((x) => String(x.id) === String(productId))
    if (!p) return
    const price = Number(p.price) || 0
    setLines((prev) => [
      ...prev,
      {
        is_custom: false,
        product_id: p.product_id || p.id,
        part_num: p.part_num || p.sku,
        description: p.description || p.name,
        qty: q,
        uom: p.uom || 'PCS',
        unit_price: price,
        line_total: q * price,
      },
    ])
  }

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.line_total, 0), [lines])
  const promo = promos.find((p) => String(p.id) === String(promoId))
  const discount = promo?.discount_percent
    ? (subtotal * Number(promo.discount_percent)) / 100
    : Number(promo?.discount_amount) || 0
  const total = Math.max(0, subtotal - discount)

  const submit = async (e) => {
    e.preventDefault()
    if (!customerId || lines.length === 0) {
      showToast('Customer & minimal 1 produk wajib', { warn: true })
      return
    }
    const client_uuid = uuid()
    const payload = {
      customer_id: customerId,
      lead_id: loc.state?.leadId || null,
      customer_po: customerPo || null,
      promo_id: promoId || null,
      client_uuid,
      lines: lines.map((l) => ({
        product_id: l.is_custom ? null : l.product_id,
        is_custom: !!l.is_custom,
        custom_part_name: l.is_custom ? l.custom_part_name : null,
        qty: l.qty,
        uom: l.uom,
        unit_price: l.unit_price,
      })),
    }

    if (!online) {
      saveDraft('order', { id: client_uuid, client_uuid, payload })
      showToast('Offline — order disimpan draft', { warn: true })
      nav('/orders')
      return
    }

    setSaving(true)
    try {
      const res = await createOrder(payload)
      if (res?.status === 'HOLD') {
        showToast('Order tersimpan tapi di-HOLD — customer dalam status Credit Hold', { warn: true })
      } else {
        showToast('Order berhasil dibuat')
      }
      nav('/orders')
    } catch (err) {
      saveDraft('order', { id: client_uuid, client_uuid, payload })
      showToast(err.message || 'Gagal — tersimpan draft', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Catat Order" backTo="/orders" />
      <form onSubmit={submit}>
        <div className="field">
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>PO Customer (opsional)</label>
          <input value={customerPo} onChange={(e) => setCustomerPo(e.target.value)} />
        </div>
        <div className="field">
          <label>Produk</label>
          <select value={productId} onChange={(e) => onProductChange(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.part_num || p.sku) + ' — ' + (p.description || p.name)}
              </option>
            ))}
            <option value={NPD_OPTION_VALUE}>— Lainnya (Produk Baru / NPD) —</option>
          </select>
        </div>

        {isNpd && (
          <div className="card" style={{ padding: 10, marginBottom: 12, border: '1px dashed var(--orange)' }}>
            <div className="field">
              <label>Nama Produk NPD</label>
              <input
                value={npdName}
                onChange={(e) => setNpdName(e.target.value)}
                placeholder="Ketik nama produk baru"
              />
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>UOM</label>
                <input value={npdUom} onChange={(e) => setNpdUom(e.target.value)} placeholder="PCS" />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Harga Satuan (opsional)</label>
                <input
                  type="number"
                  min={0}
                  value={npdPrice}
                  onChange={(e) => setNpdPrice(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        )}

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Qty</label>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 12 }}>
            <button type="button" className="btn sm" onClick={addLine}>
              + Line
            </button>
          </div>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="card li" style={{ padding: 10, marginBottom: 8 }}>
            <div className="main">
              <div className="n">
                {l.description}
                {l.is_custom && <span className="badge" style={{ marginLeft: 6 }}>NPD</span>}
              </div>
              <div className="d">
                {l.part_num} · {l.qty} {l.uom} × {fmtRp(l.unit_price)}
              </div>
            </div>
            <div className="r">{fmtRp(l.line_total)}</div>
          </div>
        ))}
        <div className="field">
          <label>Promo</label>
          <select value={promoId} onChange={(e) => setPromoId(e.target.value)}>
            <option value="">— Tanpa promo —</option>
            {promos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.promo_code || p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span className="muted">Subtotal</span>
            <span>{fmtRp(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span className="muted">Diskon</span>
            <span>{fmtRp(discount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginTop: 8 }}>
            <span>Total</span>
            <span style={{ color: 'var(--orange)' }}>{fmtRp(total)}</span>
          </div>
        </div>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Buat Order'}
        </button>
      </form>
    </Screen>
  )
}