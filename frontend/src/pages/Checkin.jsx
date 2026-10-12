//frontend/src/pages/Checkin.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { checkinVisit, getCustomers, getLead } from '../api'
import CheckinMap from '../components/CheckinMap'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { useGeolocation } from '../hooks/useGeolocation'
import { haversineMeters, listOf } from '../lib/format'

const RADIUS = 150

export default function Checkin() {
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const { coords, refresh, loading: gpsLoading } = useGeolocation()

  // Hasil meeting lanjutan: check-in sekarang bisa langsung menyasar sebuah Lead (belum tentu
  // sudah punya Customer — itu baru terbentuk setelah Brand Awareness dijawab "Tertarik", lihat
  // poin 12). Saat leadId dibawa dari layar lain, dropdown Customer disembunyikan sepenuhnya —
  // satu kunjungan hanya untuk satu target, tidak mungkin keduanya.
  const leadId = loc.state?.leadId || null
  const [lead, setLead] = useState(loc.state?.lead || null)
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState(loc.state?.customerId || '')
  const [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState(null)
  const camRef = useRef(null)
  const photoUrl = useMemo(
    () => (photo && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(photo) : null),
    [photo],
  )
  useEffect(
    () => () => {
      if (photoUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(photoUrl)
    },
    [photoUrl],
  )

  useEffect(() => {
    if (leadId) {
      if (!lead) getLead(leadId).then(setLead).catch((e) => showToast(e.message, { warn: true }))
      return
    }
    getCustomers({})
      .then((d) => {
        const list = listOf(d)
        setCustomers(list)
        if (!customerId && list[0]) setCustomerId(String(list[0].id))
        if (loc.state?.customerId) setCustomerId(String(loc.state.customerId))
      })
      .catch((e) => showToast(e.message, { warn: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  useEffect(() => {
    refresh().catch(() => { })
  }, [refresh])

  const customer = useMemo(
    () => (leadId ? null : customers.find((c) => String(c.id) === String(customerId)) || loc.state?.customer),
    [leadId, customers, customerId, loc.state],
  )
  const target = leadId ? lead : customer

  const dist = useMemo(() => {
    if (!coords || !target?.latitude) return null
    return haversineMeters(
      { lat: coords.lat, lng: coords.lng },
      { lat: Number(target.latitude), lng: Number(target.longitude) },
    )
  }, [coords, target])

  const far = dist != null && dist > RADIUS

  const doCheckin = async () => {
    if ((!leadId && !customerId) || !coords) {
      showToast(leadId ? 'Aktifkan GPS' : 'Pilih customer & aktifkan GPS', { warn: true })
      return
    }
    if (!photo) {
      showToast('Foto toko wajib diambil', { warn: true })
      return
    }
    setBusy(true)
    try {
      const visit = await checkinVisit({
        ...(leadId ? { lead_id: leadId } : { customer_id: customerId }),
        latitude: coords.lat,
        longitude: coords.lng,
        accuracy: coords.accuracy,
        photo,
      })
      const valid = visit?.valid ?? visit?.within_radius ?? !far
      if (!valid) {
        showToast(`Di luar radius (${Math.round(dist)} m)`, { warn: true })
      } else {
        showToast('Check-in successful')
      }
      const visitId = visit?.id || visit?.visit_id
      // Check-in ulang ke lead yang pernah dikunjungi -> Choose Activity (dokumen hal. 24);
      // kunjungan pertama langsung ke Visit Mode (tugas aktif).
      const returning = (visit?.previous_visits ?? 0) > 0 && Boolean(visit?.lead || lead)
      nav(returning ? `/choose-activity/${visitId}` : `/visit-mode/${visitId}`, {
        replace: true,
        state: {
          visitId,
          visit,
          customer,
          lead: visit?.lead || lead,
          distance: visit?.distance ?? dist,
          checkedInAt: new Date().toISOString(),
        },
      })
    } catch (e) {
      showToast(e.message || 'Check-in gagal', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const fixedTarget = !!leadId || !!loc.state?.customerId
  const matched = dist != null && !far
  const targetName = leadId ? lead?.business_name : customer?.name
  const targetMeta = [target?.business_type || target?.customer_group, target?.city].filter(Boolean).join(', ')
  const ready = !!coords && !!target && !far && !!photo
  const statusText =
    dist != null
      ? `${Math.round(dist)} m from registered coordinates${
          coords?.accuracy ? ` · accuracy ±${Math.round(coords.accuracy)} m` : ''
        }`
      : target && !target.latitude
        ? 'Lokasi toko belum terdaftar'
        : 'Menunggu GPS…'

  return (
    <Screen noNav>
      <TopBar
        title={
          <>
            <div>Visit Check-in</div>
            <div className="tt-sub">{[targetName || 'Memuat…', targetMeta].filter(Boolean).join(' · ')}</div>
          </>
        }
      />

      {!fixedTarget && (
        <div className="field">
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="ck-map">
        <CheckinMap
          userCoords={coords}
          customerCoords={target?.latitude ? { lat: Number(target.latitude), lng: Number(target.longitude) } : null}
          radius={RADIUS}
          height={210}
        />
        {!coords && <div className="ck-wait">{gpsLoading ? 'Mencari GPS…' : 'Menunggu GPS…'}</div>}
        <span className="ck-live">Live GPS position</span>
      </div>

      <div className={`ck-status${far ? ' bad' : matched ? ' ok' : ''}`}>
        <span className="ck-st-ic">{far ? '!' : matched ? '✓' : '…'}</span>
        <div className="ck-st-body">
          <div className="ck-st-t">
            {far ? 'Too far from store' : matched ? 'Location matched to store' : 'Waiting for location'}
          </div>
          <div className="ck-st-s">{statusText}</div>
        </div>
        <button type="button" className="ck-refresh" aria-label="Refresh GPS" onClick={() => refresh().catch(() => {})}>
          ↻
        </button>
      </div>

      <div className="ck-card">
        <div className="ck-card-t">Store Photo *</div>
        <button type="button" className={`ck-cam${photoUrl ? ' has' : ''}`} onClick={() => camRef.current?.click()}>
          {photoUrl ? (
            <img src={photoUrl} alt="Store photo" />
          ) : (
            <>
              <b>Tap to capture store photo</b>
              <small>Required for check-in — storefront or signage, taken live (gallery upload not allowed)</small>
            </>
          )}
        </button>
        {photo && (
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
            if (f) setPhoto(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="ck-info">
        Check-in is enabled once you're within {RADIUS} m of the store's registered coordinates and the photo is
        captured. Both are logged to the visit record.
      </div>

      <button type="button" className="btn ok" disabled={busy || !ready} onClick={doCheckin}>
        {busy ? 'Check-in…' : 'Check In'}
      </button>
      <p className="ck-note">After check-in, choose the activity for this visit on the next screen.</p>
    </Screen>
  )
}