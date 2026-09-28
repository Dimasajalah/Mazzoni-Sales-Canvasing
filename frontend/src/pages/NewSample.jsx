// frontend/src/pages/NewSample.jsx
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createSample, getCustomers } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'

const VARIANTS = ['BBQ', 'Red Hot', 'Mayonaise']

export default function NewSample() {
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState(loc.state?.customerId || '')
  const [flavorVariant, setFlavorVariant] = useState(VARIANTS[0])
  const [version, setVersion] = useState(1)
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCustomers({})
      .then((d) => {
        const list = listOf(d)
        setCustomers(list)
        if (!customerId && list[0]) setCustomerId(String(list[0].id))
      })
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createSample({
        customer_id: customerId || null,
        lead_id: loc.state?.leadId || null,
        flavor_variant: flavorVariant,
        version: Number(version),
        qty: Number(qty),
        notes: notes || null,
      })
      showToast('Pengajuan sample berhasil dicatat')
      nav(-1)
    } catch (err) {
      showToast(err.message || 'Gagal simpan pengajuan sample', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Pengajuan Sample" backTo="/leads" />
      <form onSubmit={submit}>
        <div className="field">
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— Tidak terkait customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Nama Produk</label>
          <input value="Sample" readOnly />
        </div>
        <div className="field">
          <label>Varian Rasa</label>
          <select value={flavorVariant} onChange={(e) => setFlavorVariant(e.target.value)}>
            {VARIANTS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Version</label>
            <input type="number" min={1} value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Qty</label>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Keterangan</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Pengajuan Sample'}
        </button>
      </form>
    </Screen>
  )
}