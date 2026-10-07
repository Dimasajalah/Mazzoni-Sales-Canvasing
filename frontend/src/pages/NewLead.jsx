// frontend/src/pages/NewLead.jsx
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createLead, getTaskSets, uploadLeadPhoto } from '../api'
import { Field } from '../components/Field'
import LocationPicker from '../components/LocationPicker'
import { PhotoUpload } from '../components/PhotoUpload'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { useGeolocation } from '../hooks/useGeolocation'
import { useOnline } from '../hooks/useOnline'
import { saveDraft } from '../lib/drafts'
import { offlineSaveMessage } from '../lib/draftSync'
import { listOf } from '../lib/format'
import { searchAddress } from '../lib/geocode'
import { uuid } from '../lib/uuid'
import { getProvinces, getRegencies, matchByName } from '../lib/wilayah'

// Nama "Jenis Usaha" lama diganti "Store Type" (poin 2) — daftar nilai masih yang sama,
// menunggu konfirmasi final tim functional soal daftar Store Type yang baru.
const STORE_TYPES = ['Distributor Retail', 'Grosir', 'Manufaktur']

const EMPTY_FORM = {
  business_name: '',
  address: '',
  city: '',
  province: '',
  postal_code: '',
  country: 'Indonesia',
  phone: '',
  email: '',
  business_type: STORE_TYPES[0],
  npwp: '',
  ktp: '',
  estimated_value: '',
}

export default function NewLead() {
  const { user } = useAuth()
  const loc = useLocation()
  const { coords, error: gpsError, refresh } = useGeolocation()
  const online = useOnline()
  const { showToast } = useUi()
  const nav = useNavigate()

  const [saving, setSaving] = useState(false)
  const [mapPosition, setMapPosition] = useState(loc.state?.prefill?.coords || null)
  const [taskSets, setTaskSets] = useState([])
  const [taskSetId, setTaskSetId] = useState('')
  const [photos, setPhotos] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)

  // Hasil meeting lanjutan: Provinsi & Kota sekarang dropdown data wilayah resmi (bukan teks
  // bebas) — urutan pengisian Provinsi dulu, baru Kota (tergantung Provinsi), baru Alamat.
  const [provinces, setProvinces] = useState([])
  const [regencies, setRegencies] = useState([])
  const [provinceId, setProvinceId] = useState('')

  // Begitu sales mengetik/memilih sendiri salah satu field alamat, field ITU SAJA (bukan yang
  // lain) berhenti diisi otomatis oleh peta — dilacak per-field, bukan satu saklar untuk semuanya,
  // supaya field yang belum pernah disentuh tetap ikut diperbarui ke lokasi terbaru begitu Alamat
  // diganti ke tempat yang berbeda (sebelumnya field itu "terkunci" di nilai lama setelah terisi
  // sekali, walau Alamat sudah berubah total).
  const touched = useRef({ address: false, city: false, province: false, postal_code: false })
  const geocodeTimer = useRef(null)

  useEffect(() => {
    refresh().catch(() => { })
  }, [refresh])

  useEffect(() => {
    if (coords && !mapPosition) setMapPosition({ lat: coords.lat, lng: coords.lng })
  }, [coords, mapPosition])

  useEffect(() => {
    getTaskSets()
      .then((res) => {
        const list = listOf(res)
        setTaskSets(list)
        const b2b = list.find((t) => t.code === 'B2B') || list[0]
        if (b2b) setTaskSetId(String(b2b.id))
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    getProvinces()
      .then(setProvinces)
      .catch(() => showToast('Gagal memuat daftar provinsi', { warn: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lokasi & Alamat saling mengisi otomatis: hasil geocoding (baik dari Alamat yang diketik,
  // maupun dari peta yang digeser) mencoba mencocokkan Provinsi/Kota ke data wilayah resmi.
  // Field yang BELUM pernah disentuh manual ikut diperbarui; yang sudah disentuh tidak ditimpa.
  const applyGeoComponents = async (components = {}) => {
    let matchedProvince = null
    let regencyList = regencies

    if (!touched.current.province && components.province) {
      // Jangan andalkan state `provinces` sudah ter-load (ada celah waktu saat GPS/peta lebih
      // cepat selesai daripada daftar provinsi) — getProvinces() sendiri sudah punya cache,
      // jadi memanggilnya lagi di sini aman dan tidak menambah permintaan jaringan.
      const list = provinces.length ? provinces : await getProvinces().catch(() => [])
      matchedProvince = matchByName(list, components.province)
      if (matchedProvince) {
        setProvinceId(matchedProvince.id)
        try {
          regencyList = await getRegencies(matchedProvince.id)
          setRegencies(regencyList)
        } catch {
          regencyList = []
        }
      }
    }

    const matchedCity = !touched.current.city && components.city ? matchByName(regencyList, components.city) : null

    setForm((f) => ({
      ...f,
      province: matchedProvince ? matchedProvince.name : f.province,
      city: matchedCity ? matchedCity.name : f.city,
      postal_code: touched.current.postal_code ? f.postal_code : components.postal_code || f.postal_code || '',
      country: f.country || components.country || 'Indonesia',
    }))
  }

  // Poin 1: begitu Alamat diketik (bukan dari auto-isi GPS), cari lokasinya dan pindahkan peta ke
  // situ — didiamkan dulu (debounce) supaya tidak membanjiri layanan alamat. Sengaja HANYA memakai
  // teks Alamat (tidak digabung Kota/Provinsi) supaya kalimat pencariannya tidak kontradiktif kalau
  // Kota/Provinsi masih menyimpan nilai lama dari lokasi sebelumnya.
  useEffect(() => {
    if (!touched.current.address) return
    clearTimeout(geocodeTimer.current)
    const query = form.address.trim()
    if (query.length < 5) return

    geocodeTimer.current = setTimeout(async () => {
      try {
        const rows = await searchAddress(query)
        if (rows[0]) {
          setMapPosition({ lat: rows[0].lat, lng: rows[0].lng })
          await applyGeoComponents(rows[0])
        }
      } catch {
        // alamat tetap tersimpan apa adanya; peta cukup tidak ikut pindah
      }
    }, 800)
    return () => clearTimeout(geocodeTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.address])

  const set = (k) => (e) => {
    if (k in touched.current) touched.current[k] = true
    setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  const onProvinceChange = (e) => {
    const id = e.target.value
    touched.current.province = true
    setProvinceId(id)
    const prov = provinces.find((p) => p.id === id)
    setForm((f) => ({ ...f, province: prov?.name || '', city: '' }))
    setRegencies([])
    if (id) {
      getRegencies(id)
        .then(setRegencies)
        .catch(() => showToast('Gagal memuat daftar kota', { warn: true }))
    }
  }

  const onCityChange = (e) => {
    const id = e.target.value
    touched.current.city = true
    const reg = regencies.find((r) => r.id === id)
    setForm((f) => ({ ...f, city: reg?.name || '' }))
  }

  const onMapAddress = (label, components = {}) => {
    if (label) {
      // Alamat diisi sistem dari hasil peta, bukan ketikan sales: tandai belum "disentuh" supaya
      // pengisian ini tidak memicu pencarian alamat ulang (efek geocode hanya jalan bila disentuh).
      touched.current.address = false
      setForm((f) => ({ ...f, address: label }))
    }
    applyGeoComponents(components)
  }

  const regps = async () => {
    try {
      const c = await refresh()
      setMapPosition({ lat: c.lat, lng: c.lng })
    } catch {
      showToast('GPS tidak tersedia — isi Alamat untuk memunculkan peta', { warn: true })
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    const client_uuid = uuid()
    const finalCoords = mapPosition || coords
    const payload = {
      ...form,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      task_set_id: taskSetId ? Number(taskSetId) : null,
      latitude: finalCoords?.lat ?? null,
      longitude: finalCoords?.lng ?? null,
      client_uuid,
      register_date: new Date().toISOString().slice(0, 10),
    }

    if (!online) {
      saveDraft('lead', { id: client_uuid, client_uuid, payload })
      showToast(
        photos.length
          ? 'Offline — lead disimpan sebagai draft (foto toko belum ikut, tambahkan lagi setelah online)'
          : 'Offline — lead disimpan sebagai draft lokal',
        { warn: true },
      )
      nav('/leads')
      return
    }

    setSaving(true)
    try {
      const lead = await createLead(payload)
      let photoFailed = false
      if (photos[0] && lead?.id) {
        try {
          await uploadLeadPhoto(lead.id, photos[0])
        } catch {
          photoFailed = true
        }
      }
      showToast(
        photoFailed ? 'Lead terdaftar, tetapi foto toko gagal diunggah' : 'Lead berhasil didaftarkan · tugas pertama dibuat',
        photoFailed ? { warn: true } : {},
      )
      nav('/leads')
    } catch (err) {
      saveDraft('lead', { id: client_uuid, client_uuid, payload })
      showToast(offlineSaveMessage(err, 'Lead'), { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Register New Lead" backTo="/leads" />
      <form onSubmit={submit}>
        <div className="row">
          <Field label="Salesperson" style={{ flex: 1 }}>
            <input value={user?.name || '—'} readOnly />
          </Field>
          <Field label="Register Date" style={{ flex: 1 }}>
            <input value={new Date().toLocaleDateString('id-ID')} readOnly />
          </Field>
        </div>

        <div className="section-h">Informasi Customer</div>
        <Field label="Nama Customer">
          <input required value={form.business_name} onChange={set('business_name')} />
        </Field>
        <Field label="Store Type">
          <select value={form.business_type} onChange={set('business_type')}>
            {STORE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>

        <div className="section-h">Customer Address</div>
        <Field label="Provinsi">
          <select value={provinceId} onChange={onProvinceChange}>
            <option value="">— Pilih provinsi —</option>
            {provinces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kota" hint={!provinceId ? <div className="muted tp-hint">Pilih Provinsi dulu.</div> : null}>
          <select value={regencies.find((r) => r.name === form.city)?.id || ''} onChange={onCityChange} disabled={!provinceId}>
            <option value="">— Pilih kota/kabupaten —</option>
            {regencies.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="row">
          <Field label="Postal Code" style={{ flex: 1 }}>
            <input value={form.postal_code} onChange={set('postal_code')} />
          </Field>
          <Field label="Country" style={{ flex: 1 }}>
            <input value={form.country} onChange={set('country')} />
          </Field>
        </div>
        <Field label="Alamat">
          <textarea rows={2} value={form.address} onChange={set('address')} placeholder="Jalan, nomor, RT/RW…" />
        </Field>

        <div className="section-h" style={{ marginTop: 6 }}>
          Lokasi <span className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>GPS {coords ? 'OK' : gpsError ? 'gagal' : '…'}</span>
        </div>
        <LocationPicker value={mapPosition} onChange={setMapPosition} onAddressChange={onMapAddress} showSearch={false} />
        <button type="button" className="btn ghost sm" style={{ marginBottom: 12 }} onClick={regps}>
          Ambil ulang GPS
        </button>

        <div className="section-h">Customer Contact</div>
        <div className="row">
          <Field label="No. HP/Telp" style={{ flex: 1 }}>
            <input value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email" style={{ flex: 1 }}>
            <input type="email" value={form.email} onChange={set('email')} />
          </Field>
        </div>
        <div className="row">
          <Field label="NPWP" style={{ flex: 1 }}>
            <input value={form.npwp} onChange={set('npwp')} />
          </Field>
          <Field label="KTP" style={{ flex: 1 }}>
            <input value={form.ktp} onChange={set('ktp')} />
          </Field>
        </div>

        <div className="section-h">Information Add-on</div>
        <Field label="Potensi / Value">
          <input type="number" min="0" value={form.estimated_value} onChange={set('estimated_value')} />
        </Field>
        <div className="field">
          <label>Foto Store</label>
          <PhotoUpload files={photos} onChange={setPhotos} max={1} />
        </div>
        <Field
          label="Task Set"
          hint={<div className="muted tp-hint">Tugas pertama otomatis dibuat setelah lead disimpan.</div>}
        >
          <select value={taskSetId} onChange={(e) => setTaskSetId(e.target.value)}>
            <option value="">— Tanpa Task Set —</option>
            {taskSets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Lead'}
        </button>
      </form>
    </Screen>
  )
}