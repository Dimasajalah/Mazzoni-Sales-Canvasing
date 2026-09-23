// frontend/src/pages/NewLead.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createLead } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { useGeolocation } from '../hooks/useGeolocation'
import { useOnline } from '../hooks/useOnline'
import { saveDraft } from '../lib/drafts'
import LocationPicker from '../components/LocationPicker'
import { uuid } from '../lib/uuid'

export default function NewLead() {
  const { user } = useAuth()
  const { coords, error: gpsError, refresh } = useGeolocation()
  const online = useOnline()
  const { showToast } = useUi()
  const nav = useNavigate()
  const [saving, setSaving] = useState(false)
  const [mapPosition, setMapPosition] = useState(null)
  const [form, setForm] = useState({
    business_name: '',
    owner_name: '',
    address: '',
    phone: '',
    email: '',
    business_type: 'Distributor Retail',
    npwp: '',
    ktp: '',
    scoring: '',
  })

  useEffect(() => {
    refresh().catch(() => { })
  }, [refresh])

  useEffect(() => {
    if (coords && !mapPosition) {
      setMapPosition({ lat: coords.lat, lng: coords.lng })
    }
  }, [coords, mapPosition])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const client_uuid = uuid()
    const finalcoords = mapPosition || coords
    const payload = {
      ...form,
      latitude: finalcoords?.lat ?? null,
      longitude: finalcoords?.lng ?? null,
      client_uuid,
      register_date: new Date().toISOString().slice(0, 10),
    }

    if (!online) {
      saveDraft('lead', { id: client_uuid, client_uuid, payload })
      showToast('Offline — lead disimpan sebagai draft lokal', { warn: true })
      nav('/leads')
      return
    }

    setSaving(true)
    try {
      await createLead(payload)
      showToast('Lead berhasil didaftarkan')
      nav('/leads')
    } catch (err) {
      saveDraft('lead', { id: client_uuid, client_uuid, payload })
      showToast(err.message || 'Gagal simpan — tersimpan draft', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Register New Lead" backTo="/leads" />
      <form onSubmit={submit}>
        <div className="field">
          <label>Nama Usaha</label>
          <input required value={form.business_name} onChange={set('business_name')} />
        </div>
        <div className="field">
          <label>Nama Pemilik</label>
          <input value={form.owner_name} onChange={set('owner_name')} />
        </div>
        <div className="field">
          <label>Alamat</label>
          <textarea rows={2} value={form.address} onChange={set('address')} />
        </div>
        <div className="field half">
          <label>No. HP/Telp</label>
          <input value={form.phone} onChange={set('phone')} />
        </div>
        <div className="field half">
          <label>Email</label>
          <input type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label>Jenis Usaha</label>
          <select value={form.business_type} onChange={set('business_type')}>
            <option>Distributor Retail</option>
            <option>Grosir</option>
            <option>Manufaktur</option>
            <option>Retail</option>
          </select>
        </div>
        <div className="field">
          <label>Scoring Lead</label>
          <select value={form.scoring} onChange={set('scoring')}>
            <option value="">— Belum dinilai —</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div className="field">
          <label>KTP</label>
          <input required value={form.ktp} onChange={set('ktp')} />
        </div>
        <div className="field">
          <label>NPWP</label>
          <input value={form.npwp} onChange={set('npwp')} />
        </div>

        <div className="map">
          <div className="gps">GPS {coords ? 'OK' : gpsError ? 'Gagal' : '…'}</div>
          <LocationPicker value={mapPosition} onChange={setMapPosition} />
          <div className="coord">
            {mapPosition
              ? `${mapPosition.lat.toFixed(5)}, ${mapPosition.lng.toFixed(5)}`
              : 'Menunggu koordinat…'}
          </div>
        </div>
        <button type="button" className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => refresh()}>
          Ambil ulang GPS
        </button>

        <div className="field">
          <label>Salesperson</label>
          <input value={user?.name || '—'} readOnly />
          <span className="auto">auto</span>
        </div>
        <div className="field">
          <label>Register Date</label>
          <input value={new Date().toLocaleDateString('id-ID')} readOnly />
          <span className="auto">auto</span>
        </div>

        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Lead'}
        </button>
      </form>
    </Screen>
  )
}
