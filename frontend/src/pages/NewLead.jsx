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
import { getTaskSets, getTaskTypes, getTasks } from '../api'
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
  const [taskSets, setTaskSets] = useState([])
  const [taskTypes, setTaskTypes] = useState([])
  const [tasks, setTasks] = useState([])
  const [taskSetId, setTaskSetId] = useState('')
  const [taskTypeId, setTaskTypeId] = useState('')
  const [taskId, setTaskId] = useState('')
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

  useEffect(() => {
    Promise.all([getTaskSets(), getTaskTypes()])
      .then(([ts, tt]) => {
        setTaskSets(Array.isArray(ts) ? ts : ts?.data || [])
        setTaskTypes(Array.isArray(tt) ? tt : tt?.data || [])
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    if (!taskTypeId) {
      setTasks([])
      setTaskId('')
      return
    }
    getTasks({ task_type_id: taskTypeId })
      .then((res) => setTasks(Array.isArray(res) ? res : res?.data || []))
      .catch(() => { })
  }, [taskTypeId])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const client_uuid = uuid()
    const finalcoords = mapPosition || coords
    const payload = {
      ...form,
      task_set_id: taskSetId || null,
      task_type_id: taskTypeId || null,
      task_id: taskId || null,
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
          <textarea
            rows={2}
            value={form.address}
            onChange={set('address')}
            placeholder="Pilih lokasi di peta di bawah untuk isi otomatis"
          />
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
          <label>Task Set</label>
          <select value={taskSetId} onChange={(e) => setTaskSetId(e.target.value)}>
            <option value="">— Pilih Task Set —</option>
            {taskSets.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Task Type</label>
          <select value={taskTypeId} onChange={(e) => setTaskTypeId(e.target.value)}>
            <option value="">— Pilih Task Type —</option>
            {taskTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Task</label>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!taskTypeId}>
            <option value="">{taskTypeId ? '— Pilih Task —' : 'Pilih Task Type dahulu'}</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>NPWP</label>
          <input value={form.npwp} onChange={set('npwp')} />
        </div>

        <div className="map">
          <div className="gps">GPS {coords ? 'OK' : gpsError ? 'Gagal' : '…'}</div>
          <LocationPicker
            value={mapPosition}
            onChange={setMapPosition}
            onAddressChange={(addr) => setForm((f) => ({ ...f, address: addr }))}
          />
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
