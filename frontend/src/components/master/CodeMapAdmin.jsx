// frontend/src/components/master/CodeMapAdmin.jsx
// Mapping kode SKU produk dan kode Customer ke sistem lain (mis. Epicor). Satu kode lokal = satu kode per sistem.
import { useCallback, useEffect, useState } from 'react'
import { deleteCodeMapping, getCodeMappings, saveCodeMapping } from '../../api'
import { listOf } from '../../lib/format'
import { Field } from '../Field'

const TYPES = [
  { value: 'product', label: 'Produk (SKU)' },
  { value: 'customer', label: 'Customer' },
]

export default function CodeMapAdmin({ products, customers, showToast }) {
  const [type, setType] = useState('product')
  const [items, setItems] = useState([])
  const [localId, setLocalId] = useState('')
  const [system, setSystem] = useState('epicor')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const locals = type === 'product' ? products : customers
  const nameOf = (id) => {
    const row = locals.find((x) => String(x.id) === String(id))
    return row ? row.description || row.name : `#${id}`
  }
  const labelOf = (row) => (type === 'product' ? `${row.part_num || row.sku || ''} — ${row.description || row.name}` : row.name)

  const load = useCallback(async () => {
    try {
      setItems(listOf(await getCodeMappings({ entity_type: type })))
    } catch (e) {
      showToast(e.message || 'Gagal memuat mapping', { warn: true })
    }
  }, [type, showToast])

  useEffect(() => {
    setLocalId('')
    load()
  }, [load])

  const submit = async (e) => {
    e.preventDefault()
    if (!localId || !code.trim()) return showToast('Pilih data lokal dan isi kode tujuan', { warn: true })
    setBusy(true)
    try {
      await saveCodeMapping({
        entity_type: type,
        local_id: Number(localId),
        external_system: system.trim() || 'epicor',
        external_code: code.trim(),
      })
      showToast('Mapping disimpan')
      setCode('')
      await load()
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan mapping', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    try {
      await deleteCodeMapping(id)
      showToast('Mapping dihapus')
      await load()
    } catch (err) {
      showToast(err.message || 'Gagal menghapus', { error: true })
    }
  }

  return (
    <div>
      <div className="chips">
        {TYPES.map((t) => (
          <button key={t.value} type="button" className={`chip${type === t.value ? ' on' : ''}`} onClick={() => setType(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Belum ada mapping.
        </div>
      ) : (
        items.map((m) => (
          <div key={m.id} className="card li" style={{ padding: 10, marginBottom: 8 }}>
            <div className="main">
              <div className="n" style={{ fontSize: 12.5 }}>
                {nameOf(m.local_id)}
              </div>
              <div className="d">
                {m.external_system} · <b>{m.external_code}</b>
              </div>
            </div>
            <div className="r">
              <span role="button" tabIndex={0} style={{ fontSize: 11, cursor: 'pointer', color: 'var(--pink)' }} onClick={() => remove(m.id)}>
                hapus
              </span>
            </div>
          </div>
        ))
      )}

      <form onSubmit={submit} className="card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8 }}>Simpan mapping</div>
        <Field label={type === 'product' ? 'Produk' : 'Customer'}>
          <select value={localId} onChange={(e) => setLocalId(e.target.value)}>
            <option value="">— Pilih —</option>
            {locals.map((row) => (
              <option key={row.id} value={row.id}>
                {labelOf(row)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sistem tujuan">
          <input value={system} onChange={(e) => setSystem(e.target.value)} />
        </Field>
        <Field label="Kode di sistem tujuan">
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <div className="muted tp-hint">Menyimpan kode lokal yang sudah dipetakan akan menimpa kode sebelumnya.</div>
        <button type="submit" className="btn" disabled={busy}>
          Simpan
        </button>
      </form>
    </div>
  )
}
