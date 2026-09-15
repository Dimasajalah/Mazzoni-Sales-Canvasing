import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { checkinVisit, getCustomers } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { useGeolocation } from '../hooks/useGeolocation'
import { haversineMeters, listOf } from '../lib/format'

const RADIUS = 500

export default function Checkin() {
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const { coords, refresh, loading: gpsLoading } = useGeolocation()
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState(loc.state?.customerId || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getCustomers({})
      .then((d) => {
        const list = listOf(d)
        setCustomers(list)
        if (!customerId && list[0]) setCustomerId(String(list[0].id))
        if (loc.state?.customerId) setCustomerId(String(loc.state.customerId))
      })
      .catch((e) => showToast(e.message, { warn: true }))
    refresh().catch(() => {})
  }, [refresh, showToast, loc.state?.customerId])

  const customer = useMemo(
    () => customers.find((c) => String(c.id) === String(customerId)) || loc.state?.customer,
    [customers, customerId, loc.state],
  )

  const dist = useMemo(() => {
    if (!coords || !customer?.latitude) return null
    return haversineMeters(
      { lat: coords.lat, lng: coords.lng },
      { lat: Number(customer.latitude), lng: Number(customer.longitude) },
    )
  }, [coords, customer])

  const far = dist != null && dist > RADIUS

  const doCheckin = async () => {
    if (!customerId || !coords) {
      showToast('Pilih customer & aktifkan GPS', { warn: true })
      return
    }
    setBusy(true)
    try {
      const visit = await checkinVisit({
        customer_id: customerId,
        latitude: coords.lat,
        longitude: coords.lng,
        accuracy: coords.accuracy,
      })
      const valid = visit?.valid ?? visit?.within_radius ?? !far
      if (!valid) {
        showToast(`Di luar radius (${Math.round(dist)} m)`, { warn: true })
      } else {
        showToast('Check-in berhasil')
      }
      nav('/visit-mode', {
        replace: true,
        state: {
          visitId: visit?.id || visit?.visit_id,
          customer,
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

  return (
    <Screen noNav>
      <TopBar title="Check-in Kunjungan" backTo="/visits" />
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
      <div className="map">
        <div className="gps">{gpsLoading ? 'GPS…' : coords ? 'GPS aktif' : 'GPS off'}</div>
        <div className="pin">📍</div>
        <div className="coord">
          {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Menunggu GPS…'}
        </div>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 11 }}>Jarak ke customer</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: far ? 'var(--pink)' : 'var(--green)' }}>
          {dist == null ? '—' : `${Math.round(dist)} m`}
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          Radius validasi {RADIUS} m · {far ? 'Di luar radius' : 'Dalam radius'}
        </div>
      </div>
      <button type="button" className="btn ghost" style={{ marginBottom: 8 }} onClick={() => refresh()}>
        Refresh GPS
      </button>
      <button type="button" className="btn" disabled={busy || !coords || far} onClick={doCheckin}>
        {busy ? 'Check-in…' : far ? 'Terlalu jauh' : 'Check-in'}
      </button>
      {far ? (
        <p className="sub" style={{ textAlign: 'center' }}>
          Dekati lokasi customer untuk check-in valid.
        </p>
      ) : null}
    </Screen>
  )
}
