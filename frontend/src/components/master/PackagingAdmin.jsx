// frontend/src/components/master/PackagingAdmin.jsx
import { useCallback, useEffect, useState } from 'react'
import {
  createProductPackaging,
  deleteProductPackaging,
  getProductPackagings,
  updateProductPackaging,
} from '../../api'
import { listOf } from '../../lib/format'
import { Field } from '../Field'

export default function PackagingAdmin({ products, showToast }) {
  const [productId, setProductId] = useState('')
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [gram, setGram] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!productId && products[0]) setProductId(String(products[0].id))
  }, [products, productId])

  const load = useCallback(async () => {
    if (!productId) return
    try {
      setItems(listOf(await getProductPackagings({ product_id: productId, include_inactive: 1 })))
    } catch (e) {
      showToast(e.message || 'Gagal memuat kemasan', { warn: true })
    }
  }, [productId, showToast])

  useEffect(() => {
    load()
  }, [load])

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
    if (!name.trim() || !(Number(gram) > 0)) return showToast('Isi nama kemasan dan gramasi (gr per pcs)', { warn: true })
    const ok = await act(
      () => createProductPackaging({ product_id: Number(productId), name: name.trim(), gramasi_gr: Number(gram) }),
      'Kemasan ditambahkan',
    )
    if (ok) {
      setName('')
      setGram('')
    }
  }

  return (
    <div>
      <Field label="Produk">
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {(p.part_num || p.sku) + ' — ' + (p.description || p.name)}
            </option>
          ))}
        </select>
      </Field>

      {items.length === 0 ? (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Produk ini belum punya kemasan.
        </div>
      ) : (
        items.map((k) => (
          <div key={k.id} className="card li" style={{ padding: 10, marginBottom: 8, opacity: k.active ? 1 : 0.55 }}>
            <div className="main">
              <div className="n" style={{ fontSize: 12.5 }}>
                {k.name}
              </div>
              <div className="d">
                {Number(k.gramasi_gr)} gr per pcs{k.active ? '' : ' · nonaktif'}
              </div>
            </div>
            <div className="r" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <span
                role="button"
                tabIndex={0}
                style={{ fontSize: 11, cursor: 'pointer', color: 'var(--blue)' }}
                onClick={() => act(() => updateProductPackaging(k.id, { active: !k.active }))}
              >
                {k.active ? 'nonaktifkan' : 'aktifkan'}
              </span>
              <span
                role="button"
                tabIndex={0}
                style={{ fontSize: 11, cursor: 'pointer', color: 'var(--pink)' }}
                onClick={() => act(() => deleteProductPackaging(k.id), 'Kemasan dihapus')}
              >
                hapus
              </span>
            </div>
          </div>
        ))
      )}

      <form onSubmit={add} className="card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8 }}>Tambah kemasan</div>
        <Field label="Nama kemasan">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Sachet 20 gr" />
        </Field>
        <Field label="Gramasi (gr per pcs)">
          <input type="number" min="0" step="any" inputMode="decimal" value={gram} onChange={(e) => setGram(e.target.value)} />
        </Field>
        <button type="submit" className="btn" disabled={busy || !productId}>
          Tambah
        </button>
      </form>
    </div>
  )
}
