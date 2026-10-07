//frontend/src/pages/Checkin.jsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { checkinVisit, getCustomers, getLead } from '../api'
import CheckinMap from '../components/CheckinMap'
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

  // Hasil meeting lanjutan: check-in sekarang bisa langsung menyasar sebuah Lead (belum tentu
  // sudah punya Customer — itu baru terbentuk setelah Brand Awareness dijawab "Tertarik", lihat
  // poin 12). Saat leadId dibawa dari layar lain, dropdown Customer disembunyikan sepenuhnya —
  // satu kunjungan hanya untuk satu target, tidak mungkin keduanya.
  const leadId = loc.state?.leadId || null
  const [lead, setLead] = useState(loc.state?.lead || null)
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState(loc.state?.customerId || '')
  const [busy, setBusy] = useState(false)

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
    setBusy(true)
    try {
      const visit = await checkinVisit({
        ...(leadId ? { lead_id: leadId } : { customer_id: customerId }),
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
      const visitId = visit?.id || visit?.visit_id
      nav(`/visit-mode/${visitId}`, {
        replace: true,
        state: {
          visitId,
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

  return (
    <Screen noNav>
      <TopBar title="Check-in Kunjungan" backTo="/visits" />
      {leadId ? (
        <div className="field">
          <label>Lead</label>
          <input value={lead?.business_name || 'Memuat…'} readOnly />
        </div>
      ) : (
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
      <div className="map">
        <div className="gps">{gpsLoading ? 'GPS…' : coords ? 'GPS aktif' : 'GPS off'}</div>
        <CheckinMap
          userCoords={coords}
          customerCoords={target?.latitude ? { lat: Number(target.latitude), lng: Number(target.longitude) } : null}
        />
        <div className="coord">
          {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Menunggu GPS…'}
        </div>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 11 }}>Jarak ke {leadId ? 'lead' : 'customer'}</div>
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
      <button type="button" className="btn" disabled={busy || !coords || far || (leadId && !lead)} onClick={doCheckin}>
        {busy ? 'Check-in…' : far ? 'Terlalu jauh' : 'Check-in'}
      </button>
      {far ? (
        <p className="sub" style={{ textAlign: 'center' }}>
          Dekati lokasi {leadId ? 'lead' : 'customer'} untuk check-in valid.
        </p>
      ) : null}
    </Screen>
  )
}