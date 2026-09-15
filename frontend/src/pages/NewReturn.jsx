import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createReturn, getCustomers, getProducts } from '../api'
import { PhotoUpload } from '../components/PhotoUpload'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf, listProducts } from '../lib/format'
import { uuid } from '../lib/uuid'
import { saveDraft, loadDraft, clearDraft } from '../lib/drafts'
import { useOnline } from '../hooks/useOnline'

export default function NewReturn() {
  const nav = useNavigate()
  const online = useOnline()
  const { showToast } = useUi()
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [photos, setPhotos] = useState([])
  const [form, setForm] = useState({
    customer_id: '',
    product_id: '',
    qty: '1',
    so_reference: '',
    reason: 'Kemasan rusak saat pengiriman',
    condition_notes: '',
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const d = loadDraft('return')
    if (d?.form) {
      setForm((f) => ({ ...f, ...d.form }))
      showToast('Draft retur dipulihkan')
    }
    ;(async () => {
      try {
        const [c, p] = await Promise.all([getCustomers(), getProducts()])
        const cust = listOf(c?.data || c)
        const prod = listProducts(p)
        setCustomers(cust)
        setProducts(prod)
        setForm((f) => ({
          ...f,
          customer_id: f.customer_id || String(cust[0]?.id || ''),
          product_id: f.product_id || String(prod[0]?.id || ''),
        }))
      } catch (e) {
        showToast(e.message || 'Gagal muat master', { warn: true })
      }
    })()
  }, [showToast])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!photos.length) {
      showToast('Lampirkan foto kondisi barang', { warn: true })
      return
    }
    const payload = { ...form, client_uuid: uuid() }
    if (!online) {
      saveDraft('return', { form: payload })
      showToast('Offline — draft disimpan lokal', { warn: true })
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      Object.entries(payload).forEach(([k, v]) => {
        if (v != null && v !== '') fd.append(k, v)
      })
      photos.forEach((f) => fd.append('photos[]', f))
      await createReturn(fd)
      clearDraft('return')
      showToast('Permintaan retur dikirim')
      nav('/returns')
    } catch (e) {
      saveDraft('return', { form: payload })
      showToast(e.message || 'Gagal kirim retur', { warn: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Ajukan Retur" onBack={() => nav(-1)} />
      <div className="field">
        <label>Customer</label>
        <select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Produk</label>
        <select value={form.product_id} onChange={(e) => set('product_id', e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.part_num} — {p.description}</option>
          ))}
        </select>
      </div>
      <div className="field half">
        <label>Qty</label>
        <input inputMode="numeric" value={form.qty} onChange={(e) => set('qty', e.target.value)} />
      </div>
      <div className="field half">
        <label>Ref SO/DO</label>
        <input value={form.so_reference} onChange={(e) => set('so_reference', e.target.value)} placeholder="SO-STG-..." />
      </div>
      <div className="field">
        <label>Alasan</label>
        <select value={form.reason} onChange={(e) => set('reason', e.target.value)}>
          <option>Kemasan rusak saat pengiriman</option>
          <option>Salah kirim varian</option>
          <option>Barang cacat produksi</option>
          <option>Mendekati kedaluwarsa</option>
          <option>Kelebihan kirim</option>
        </select>
      </div>
      <div className="field">
        <label>Kondisi barang</label>
        <textarea rows={2} value={form.condition_notes} onChange={(e) => set('condition_notes', e.target.value)} />
      </div>
      <div className="section-h">Foto Kondisi Barang</div>
      <PhotoUpload files={photos} onChange={setPhotos} />
      <button className="btn" type="button" disabled={busy} onClick={submit}>
        {busy ? 'Mengirim…' : 'Kirim Permintaan Retur'}
      </button>
    </Screen>
  )
}
