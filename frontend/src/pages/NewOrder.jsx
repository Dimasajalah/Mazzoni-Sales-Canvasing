// frontend/src/pages/NewOrder.jsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createOrder, getCustomers, getProductPackagings, getProducts, getPromos } from '../api'
import { Field } from '../components/Field'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { useOnline } from '../hooks/useOnline'
import { saveDraft } from '../lib/drafts'
import { offlineSaveMessage } from '../lib/draftSync'
import { fmtRp, listOf, listProducts } from '../lib/format'
import { kgToPcs } from '../lib/packaging'
import { canOrder } from '../lib/roles'
import { uuid } from '../lib/uuid'

const NPD_OPTION_VALUE = '__NPD__'

export default function NewOrder() {
  const loc = useLocation()
  const nav = useNavigate()
  const online = useOnline()
  const { showToast } = useUi()
  const { user } = useAuth()
  const ordering = canOrder(user)
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

  // Tujuan order (HO / Distributor) dan mode input Kg (dikonversi ke pcs berdasarkan gramasi kemasan)
  const [destination, setDestination] = useState('HO')
  const [distributorId, setDistributorId] = useState('')
  const [unitMode, setUnitMode] = useState('qty') // 'qty' | 'kg'
  const [packagings, setPackagings] = useState([])
  const [packagingId, setPackagingId] = useState('')

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

  const kgMode = unitMode === 'kg' && !isNpd

  useEffect(() => {
    if (!kgMode || !productId || productId === NPD_OPTION_VALUE) return
    let alive = true
    getProductPackagings({ product_id: productId })
      .then((rows) => {
        if (!alive) return
        const list = listOf(rows)
        setPackagings(list)
        setPackagingId(list[0] ? String(list[0].id) : '')
      })
      .catch(() => alive && setPackagings([]))
    return () => {
      alive = false
    }
  }, [kgMode, productId])

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

    if (kgMode) {
      const kg = Number(qty)
      const pk = packagings.find((x) => String(x.id) === String(packagingId))
      if (!(kg > 0)) return showToast('Isi jumlah Kg', { warn: true })
      if (!pk) return showToast('Pilih kemasan produk ini', { warn: true })
      const pcs = kgToPcs(kg, pk.gramasi_gr)
      setLines((prev) => [
        ...prev,
        {
          is_custom: false,
          product_id: p.product_id || p.id,
          part_num: p.part_num || p.sku,
          description: p.description || p.name,
          qty_kg: kg,
          gramasi_gr: Number(pk.gramasi_gr),
          packaging_id: pk.id,
          packaging_name: pk.name,
          qty: pcs,
          uom: 'PCS',
          unit_price: price,
          line_total: pcs * price,
        },
      ])
      return
    }

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
    if (destination === 'DISTRIBUTOR' && !distributorId) {
      showToast('Pilih distributor tujuan order', { warn: true })
      return
    }
    const client_uuid = uuid()
    const payload = {
      customer_id: customerId,
      lead_id: loc.state?.leadId || null,
      customer_po: customerPo || null,
      destination,
      distributor_customer_id: destination === 'DISTRIBUTOR' ? Number(distributorId) || null : null,
      promo_id: promoId || null,
      client_uuid,
      lines: lines.map((l) => ({
        product_id: l.is_custom ? null : l.product_id,
        is_custom: !!l.is_custom,
        custom_part_name: l.is_custom ? l.custom_part_name : null,
        // Baris Kg: pcs dihitung ulang oleh server dari Kg dan gramasi
        ...(l.qty_kg
          ? { qty_kg: l.qty_kg, gramasi_gr: l.gramasi_gr, packaging_id: l.packaging_id }
          : { qty: l.qty, uom: l.uom }),
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
      showToast(offlineSaveMessage(err, 'Order'), { error: true })
    } finally {
      setSaving(false)
    }
  }

  if (!ordering) {
    return (
      <Screen>
        <TopBar title="Catat Order" backTo="/orders" />
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Sales Dealmaker tidak membuat order</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            Untuk prospek yang sudah Win, delegasikan ke Sales Order agar order dibuatkan. Anda tetap dapat membuat kunjungan,
            sample, dan quotation.
          </div>
          <button type="button" className="btn" onClick={() => nav('/leads')}>
            Ke daftar prospek
          </button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <TopBar title="Catat Order" backTo="/orders" />
      <form onSubmit={submit}>
        <Field label="Customer">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="PO Customer (opsional)">
          <input value={customerPo} onChange={(e) => setCustomerPo(e.target.value)} />
        </Field>
        <Field label="Tujuan order">
          <select value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="HO">HO</option>
            <option value="DISTRIBUTOR">Distributor</option>
          </select>
        </Field>
        {destination === 'DISTRIBUTOR' && (
          <Field label="Distributor">
            <select value={distributorId} onChange={(e) => setDistributorId(e.target.value)}>
              <option value="">— Pilih distributor —</option>
              {customers
                .filter((c) => String(c.id) !== String(customerId))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="Produk">
          <select value={productId} onChange={(e) => onProductChange(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.part_num || p.sku) + ' — ' + (p.description || p.name)}
              </option>
            ))}
            <option value={NPD_OPTION_VALUE}>— Lainnya (Produk Baru / NPD) —</option>
          </select>
        </Field>

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

        {!isNpd && (
          <div className="chips">
            <button type="button" className={`chip${unitMode === 'qty' ? ' on' : ''}`} onClick={() => setUnitMode('qty')}>
              Qty biasa
            </button>
            <button type="button" className={`chip${unitMode === 'kg' ? ' on' : ''}`} onClick={() => setUnitMode('kg')}>
              Berdasarkan Kg
            </button>
          </div>
        )}
        {kgMode && (
          <Field label="Kemasan (gramasi per pcs)">
            <select value={packagingId} onChange={(e) => setPackagingId(e.target.value)}>
              {packagings.length === 0 && <option value="">Belum ada kemasan untuk produk ini</option>}
              {packagings.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({Number(k.gramasi_gr)} gr)
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="ord-qty">{kgMode ? 'Jumlah (Kg)' : 'Qty'}</label>
            <input
              id="ord-qty"
              type="number"
              min={kgMode ? 0 : 1}
              step={kgMode ? 'any' : 1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
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
                {l.qty_kg
                  ? `${l.qty_kg} Kg → ${Number(l.qty).toLocaleString('id-ID')} pcs (${l.gramasi_gr} gr) × ${fmtRp(l.unit_price)}`
                  : `${l.part_num} · ${l.qty} ${l.uom} × ${fmtRp(l.unit_price)}`}
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