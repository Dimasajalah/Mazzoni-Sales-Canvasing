// frontend/src/components/ProductGroupField.jsx
// Revisi functional (Okt 2026): "Product group harus dipilih" — dropdown dari master produk,
// bukan input teks bebas (yang gampang beda penulisan antar sales). Dipakai di Pengajuan Sample
// dan Feedback Sample.
import { useEffect, useState } from 'react'
import { getProductGroups } from '../api'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'
import { Field } from './Field'

export function ProductGroupField({ value, onChange }) {
  const { showToast } = useUi()
  const [groups, setGroups] = useState(null) // null = masih memuat

  useEffect(() => {
    getProductGroups()
      .then((rows) => setGroups(listOf(rows)))
      .catch((e) => {
        setGroups([])
        showToast(e.message || 'Gagal memuat Product Group', { warn: true })
      })
  }, [showToast])

  return (
    <Field
      label="Product Group"
      hint={groups && groups.length === 0 ? <div className="muted tp-hint">Belum ada Product Group di master produk.</div> : null}
    >
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Pilih product group —</option>
        {(groups || []).map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </Field>
  )
}