// frontend/src/components/master/StrataAdmin.jsx
import { useCallback, useEffect, useState } from 'react'
import { createDiscountStratum, deleteDiscountStratum, getDiscountStrata, updateDiscountStratum } from '../../api'
import { listOf } from '../../lib/format'
import { Field } from '../Field'

const EMPTY = { productId: '', minKg: '', maxKg: '', percent: '' }

export default function StrataAdmin({ products, showToast }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(listOf(await getDiscountStrata({ include_inactive: 1 })))
    } catch (e) {
      showToast(e.message || 'Gagal memuat strata', { warn: true })
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const productName = (id) => {
    if (id == null) return 'Semua produk'
    const p = products.find((x) => String(x.id) === String(id))
    return p ? p.description || p.name : `Produk #${id}`
  }

  const act = async (fn, okMsg) => {
    setBusy(true)
    try {
      await fn()
      if (okMsg) showToast(okMsg)
      await load()
      return true
    } catch (e) {
      showToast(e.message || 'Gagal menyimpan', { error: true })
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (e) => {
    e.preventDefault()
    if (form.minKg === '' || form.percent === '') return showToast('Isi minimal Kg dan persen diskon', { warn: true })
    const ok = await act(
      () =>
        createDiscountStratum({
          product_id: form.productId ? Number(form.productId) : null,
          min_kg: Number(form.minKg),
          max_kg: form.maxKg === '' ? null : Number(form.maxKg),
          discount_percent: Number(form.percent),
        }),
      'Tier strata ditambahkan',
    )
    if (ok) setForm(EMPTY)
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
      Diskon strata dihitung dari jumlah Kg per baris quotation. Tier khusus produk didahulukan atas tier untuk semua produk.
      </div>

      {items.length === 0 ? (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Belum ada tier strata.
        </div>
      ) : (
        items.map((t) => (
          <div key={t.id} className="card li" style={{ padding: 10, marginBottom: 8, opacity: t.active ? 1 : 0.55 }}>
            <div className="main">
              <div className="n" style={{ fontSize: 12.5 }}>
                {Number(t.min_kg)} Kg{t.max_kg == null ? ' ke atas' : ` – ${Number(t.max_kg)} Kg`} · {Number(t.discount_percent)}%
              </div>
              <div className="d">
                {productName(t.product_id)}
                {t.active ? '' : ' · nonaktif'}
              </div>
            </div>
            <div className="r" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <span
                role="button"
                tabIndex={0}
                style={{ fontSize: 11, cursor: 'pointer', color: 'var(--blue)' }}
                onClick={() => act(() => updateDiscountStratum(t.id, { active: !t.active }))}
              >
                {t.active ? 'nonaktifkan' : 'aktifkan'}
              </span>
              <span
                role="button"
                tabIndex={0}
                style={{ fontSize: 11, cursor: 'pointer', color: 'var(--pink)' }}
                onClick={() => act(() => deleteDiscountStratum(t.id), 'Tier dihapus')}
              >
                hapus
              </span>
            </div>
          </div>
        ))
      )}

      <form onSubmit={add} className="card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8 }}>Tambah tier</div>
        <Field label="Berlaku untuk">
          <select value={form.productId} onChange={set('productId')}>
            <option value="">Semua produk</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.description || p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="row">
          <Field label="Minimal (Kg)" style={{ flex: 1 }}>
            <input type="number" min="0" step="any" inputMode="decimal" value={form.minKg} onChange={set('minKg')} />
          </Field>
          <Field label="Maksimal (Kg, opsional)" style={{ flex: 1 }}>
            <input type="number" min="0" step="any" inputMode="decimal" value={form.maxKg} onChange={set('maxKg')} />
          </Field>
        </div>
        <Field label="Diskon (%)">
          <input type="number" min="0" max="100" step="any" inputMode="decimal" value={form.percent} onChange={set('percent')} />
        </Field>
        <button type="submit" className="btn" disabled={busy}>
          Tambah tier
        </button>
      </form>
    </div>
  )
}
