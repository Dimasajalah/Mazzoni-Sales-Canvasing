// frontend/src/components/CheckinMap.jsx
// Peta check-in (Google Maps), dokumen hal. 22: posisi sales (GPS) + lingkaran akurasi, lokasi toko +
// lingkaran radius validasi. Sengaja read-only: posisi sales SELALU dari GPS, tidak bisa digeser manual.
import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps, onMapsAuthFailure } from '../lib/googleMaps'

const GREEN = '#1B7F46'
const BLUE = '#2F6FED'
const RED = '#C8233A'

// Google hanya perlu {lat, lng}; properti lain (mis. accuracy) tidak ikut dikirim.
const ll = (c) => ({ lat: Number(c.lat), lng: Number(c.lng) })

const dot = (maps, color) => ({
  path: maps.SymbolPath.CIRCLE,
  scale: 9,
  fillColor: color,
  fillOpacity: 1,
  strokeColor: '#FFFFFF',
  strokeWeight: 3,
})

function GoogleCheckinMap({ userCoords, customerCoords, radius, height }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const overlays = useRef({})
  const [maps, setMaps] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  // 1) Muat Google Maps lalu pasang peta (sekali; diulang bila pengguna menekan "Muat ulang peta").
  useEffect(() => {
    let cancelled = false
    setError('')

    loadGoogleMaps()
      .then((lib) => {
        if (cancelled || !containerRef.current) return
        mapRef.current = new lib.Map(containerRef.current, {
          center: ll(customerCoords || userCoords),
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        })
        setMaps(lib)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Peta tidak dapat dimuat')
      })

    const offAuth = onMapsAuthFailure(() =>
      setError('Kunci Google Maps ditolak. Periksa API yang diaktifkan dan pembatasan kunci di Google Cloud.'),
    )

    return () => {
      cancelled = true
      offAuth()
      Object.values(overlays.current).forEach((o) => o?.setMap?.(null))
      overlays.current = {}
      mapRef.current = null
      setMaps(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  // 2) Gambar atau perbarui penanda dan lingkaran setiap kali posisi berubah.
  const uLat = userCoords?.lat
  const uLng = userCoords?.lng
  const uAcc = userCoords?.accuracy
  const cLat = customerCoords?.lat
  const cLng = customerCoords?.lng

  useEffect(() => {
    const map = mapRef.current
    if (!maps || !map) return
    const ov = overlays.current
    const upsert = (key, create, update) => {
      if (ov[key]) update(ov[key])
      else ov[key] = create()
    }

    if (cLat != null && cLng != null) {
      const shop = ll({ lat: cLat, lng: cLng })
      upsert(
        'shop',
        () => new maps.Marker({ map, position: shop, title: 'Lokasi toko', icon: dot(maps, RED) }),
        (m) => m.setPosition(shop),
      )
      upsert(
        'zone',
        () =>
          new maps.Circle({
            map, center: shop, radius, strokeColor: GREEN, strokeWeight: 2,
            fillColor: GREEN, fillOpacity: 0.08, clickable: false,
          }),
        (c) => {
          c.setCenter(shop)
          c.setRadius(radius)
        },
      )
    }

    if (uLat != null && uLng != null) {
      const me = ll({ lat: uLat, lng: uLng })
      upsert(
        'me',
        () => new maps.Marker({ map, position: me, title: 'Lokasi Anda', icon: dot(maps, BLUE) }),
        (m) => m.setPosition(me),
      )
      if (uAcc) {
        upsert(
          'acc',
          () =>
            new maps.Circle({
              map, center: me, radius: Number(uAcc), strokeWeight: 0,
              fillColor: BLUE, fillOpacity: 0.15, clickable: false,
            }),
          (c) => {
            c.setCenter(me)
            c.setRadius(Number(uAcc))
          },
        )
      }
    }

    if (cLat != null && uLat != null) {
      const bounds = new maps.LatLngBounds()
      bounds.extend(ll({ lat: cLat, lng: cLng }))
      bounds.extend(ll({ lat: uLat, lng: uLng }))
      const zoneBounds = ov.zone?.getBounds?.()
      if (zoneBounds) bounds.union(zoneBounds)
      map.fitBounds(bounds, 30)
    } else {
      map.setCenter(ll(cLat != null ? { lat: cLat, lng: cLng } : { lat: uLat, lng: uLng }))
      map.setZoom(17)
    }
  }, [maps, uLat, uLng, uAcc, cLat, cLng, radius])

  return (
    <div className="lp-map" style={{ height, borderRadius: 12 }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      {error ? (
        <div
          className="muted lp-msg"
          style={{
            position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', gap: 8,
            padding: 16, textAlign: 'center', background: 'var(--card2)',
          }}
        >
          <div>{error}</div>
          <button type="button" className="btn ghost sm" style={{ justifySelf: 'center' }} onClick={() => setAttempt((a) => a + 1)}>
            Muat ulang peta
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function CheckinMap({ userCoords, customerCoords, radius = 150, height = 200 }) {
  if (!userCoords && !customerCoords) return null
  return <GoogleCheckinMap userCoords={userCoords} customerCoords={customerCoords} radius={radius} height={height} />
}
