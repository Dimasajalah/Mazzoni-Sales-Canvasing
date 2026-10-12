// frontend/src/pages/NewLead.jsx
// Dokumen hal. 12 (02 New Lead Registration). Logika (geocoding alamat, provinsi/kota, draft offline,
// unggah foto) tidak berubah; tampilan mengikuti dokumen.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createLead, getTaskSets, uploadLeadPhoto } from '../api'
import { Field } from '../components/Field'
import LocationPicker from '../components/LocationPicker'
import { Screen } from '../components/ui'
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
import '../styles/newlead.css'

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

const ICONS = {
  person: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>),
  pin: (<><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  camera: (<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
}

function Ic({ n, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[n]}
    </svg>
  )
}

function Card({ icon, title, children }) {
  return (
    <section className="nl-card">
      <h3 className="nl-h">
        <Ic n={icon} />
        {title}
      </h3>
      {children}
    </section>
  )
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
  // Saran kode pos untuk dropdown (dari hasil geocoding alamat/peta); isian tetap bebas diketik.
  const [postalHints, setPostalHints] = useState([])
  const camRef = useRef(null)
  const photoUrl = useMemo(
    () => (photos[0] && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(photos[0]) : null),
    [photos],
  )
  useEffect(
    () => () => {
      if (photoUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(photoUrl)
    },
    [photoUrl],
  )

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
  const addPostalHints = (codes) => {
    const clean = codes.filter(Boolean).map(String)
    if (!clean.length) return
    setPostalHints((h) => [...new Set([...clean, ...h])].slice(0, 8))
  }

  const applyGeoComponents = async (components = {}) => {
    addPostalHints([components.postal_code])
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
        addPostalHints(rows.slice(0, 5).map((r) => r.postal_code))
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
    setPostalHints([])
    if (id) {
      getRegencies(id)
        .then(setRegencies)
        .catch(() => showToast('Gagal memuat daftar kota', { warn: true }))
    }
  }

  const onCityChange = (e) => {
    const id = e.target.value
    touched.current.city = true
    setPostalHints([])
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

  const registerDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ flex: 1 }}>
          New Lead
        </div>
        <span className="nl-draft">DRAFT</span>
      </div>

      <form onSubmit={submit}>
        <div className="nl-meta">
          <div className="nl-m">
            <Ic n="person" size={18} />
            <div>
              <small>Salesperson</small>
              <b>{user?.name || '—'}</b>
            </div>
          </div>
          <div className="nl-m">
            <Ic n="cal" size={18} />
            <div>
              <small>Register Date</small>
              <b>{registerDate}</b>
            </div>
          </div>
        </div>

        <Card icon="person" title="Customer Information">
          <Field label="Customer / Store Name *">
            <input required value={form.business_name} onChange={set('business_name')} placeholder="e.g. Toko Nuryadi Jaya" />
          </Field>
          <Field label="Store Type *">
            <select value={form.business_type} onChange={set('business_type')}>
              {STORE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </Card>

        <Card icon="pin" title="Customer Address">
          <Field label="Province *">
            <select value={provinceId} onChange={onProvinceChange}>
              <option value="">— Pilih provinsi —</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="row">
            <Field
              label="City / Regency *"
              style={{ flex: 1 }}
              hint={!provinceId ? <div className="muted tp-hint">Pilih Provinsi dulu.</div> : null}
            >
              <select value={regencies.find((r) => r.name === form.city)?.id || ''} onChange={onCityChange} disabled={!provinceId}>
                <option value="">— Pilih kota/kabupaten —</option>
                {regencies.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Postal Code *" style={{ flex: 1 }}>
            <input
                list="nl-postal"
                inputMode="numeric"
                autoComplete="postal-code"
                value={form.postal_code}
                onChange={set('postal_code')}
              />
            </Field>
          </div>
          <datalist id="nl-postal">
            {postalHints.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Field label="Country *">
            <input value={form.country} readOnly />
          </Field>
          <div className="nl-note">
            Province → City → Postal Code cascade like a Shopee-style address picker — each field filters the next.
          </div>
          <Field label="Full Address (street, RT/RW, landmark) *">
            <textarea rows={2} value={form.address} onChange={set('address')} placeholder="Jalan, nomor, RT/RW…" />
          </Field>

          <LocationPicker value={mapPosition} onChange={setMapPosition} onAddressChange={onMapAddress} showSearch={false} />
          <div>
            <span className="nl-mapnote">✓ Map pin generated automatically from full address</span>
          </div>
          <button type="button" className="btn ghost sm" onClick={regps}>
            Ambil ulang GPS {coords ? '' : gpsError ? '(GPS gagal)' : ''}
          </button>
        </Card>

        <Card icon="phone" title="Customer Contact">
          <div className="row">
            <Field label="Phone *" style={{ flex: 1 }}>
              <input value={form.phone} onChange={set('phone')} placeholder="0812-xxxx" />
            </Field>
            <Field label="Email" style={{ flex: 1 }}>
              <input type="email" value={form.email} onChange={set('email')} placeholder="store@mail.com" />
            </Field>
          </div>
          <div className="row">
            <Field label="NPWP" style={{ flex: 1 }}>
              <input value={form.npwp} onChange={set('npwp')} placeholder="Optional" />
            </Field>
            <Field label="KTP" style={{ flex: 1 }}>
              <input value={form.ktp} onChange={set('ktp')} placeholder="Optional" />
            </Field>
          </div>
        </Card>

        <Card icon="star" title="Additional Information">
          <Field label="Estimated Potential Value (Rp)">
            <input type="number" min="0" value={form.estimated_value} onChange={set('estimated_value')} placeholder="e.g. 15.000.000 / month" />
          </Field>
          <div className="field">
            <div className="nl-lab">Store Photo</div>
            <button type="button" className={`ck-cam${photoUrl ? ' has' : ''}`} onClick={() => camRef.current?.click()}>
              {photoUrl ? (
                <img src={photoUrl} alt="Store photo" />
              ) : (
                <>
                  <Ic n="camera" size={22} />
                  <b>Tap to capture store photo</b>
                </>
              )}
            </button>
            {photoUrl && (
              <button type="button" className="ck-retake" onClick={() => camRef.current?.click()}>
                Retake photo
              </button>
            )}
            <input
              ref={camRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setPhotos([f])
                e.target.value = ''
              }}
            />
          </div>
          <div className="field">
            <div className="nl-lab">Journey Task Set *</div>
            <div className="nl-segs" role="group" aria-label="Journey Task Set">
              {taskSets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={String(t.id) === taskSetId}
                  className={String(t.id) === taskSetId ? 'on' : ''}
                  onClick={() => setTaskSetId(String(t.id))}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <div className="muted tp-hint">Tugas pertama otomatis dibuat setelah lead disimpan.</div>
          </div>
        </Card>

        <div className="nl-foot">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Lead'}
          </button>
        </div>
      </form>
    </Screen>
  )
}
