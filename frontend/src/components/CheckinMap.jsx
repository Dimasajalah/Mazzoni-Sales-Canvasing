// frontend/src/components/CheckinMap.jsx
// Peta check-in (OpenStreetMap): posisi sales (GPS), lokasi customer, garis jarak, dan lingkaran radius validasi.
// Sengaja read-only: posisi sales SELALU dari GPS, tidak bisa digeser manual (aturan check-in 500 m).
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { AttributionControl, Circle, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import { meIcon, shopIcon } from '../lib/mapIcons'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function Fit({ points, radius }) {
  const map = useMap()
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')

  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16)
      return
    }
    map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 17 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, radius, map])

  return null
}

export default function CheckinMap({ userCoords, customerCoords, radius = 500, height = 200 }) {
  const points = [userCoords, customerCoords].filter(Boolean)
  if (points.length === 0) return null

  const center = points[0]

  return (
    <div className="lp-map" style={{ height, borderRadius: 12 }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={16}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <AttributionControl prefix={false} position="bottomleft" />
        <Fit points={points} radius={radius} />
        {customerCoords && (
          <>
            <Circle
              center={[customerCoords.lat, customerCoords.lng]}
              radius={radius}
              pathOptions={{ color: '#12A05A', weight: 2, fillOpacity: 0.08 }}
            />
            <Marker position={[customerCoords.lat, customerCoords.lng]} icon={shopIcon} title="Lokasi customer" />
          </>
        )}
        {userCoords && <Marker position={[userCoords.lat, userCoords.lng]} icon={meIcon} title="Lokasi Anda" />}
        {userCoords && customerCoords && (
          <Polyline
            positions={[
              [userCoords.lat, userCoords.lng],
              [customerCoords.lat, customerCoords.lng],
            ]}
            pathOptions={{ color: '#DC3055', opacity: 0.7, weight: 2, dashArray: '6 6' }}
          />
        )}
      </MapContainer>
    </div>
  )
}
