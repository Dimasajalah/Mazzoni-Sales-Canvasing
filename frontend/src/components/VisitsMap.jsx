// frontend/src/components/VisitsMap.jsx
// Sebaran titik check-in kunjungan (OpenStreetMap).
import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import { AttributionControl, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { pinIcon, selectedIcon } from '../lib/mapIcons'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

function FitAll({ points }) {
  const map = useMap()
  const key = points.map((p) => p.id).join(',')

  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15)
    else if (points.length > 1) map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [24, 24], maxZoom: 16 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])

  return null
}

export default function VisitsMap({ visits, height = 220 }) {
  const [selectedId, setSelectedId] = useState(null)

  // Backend memakai checkin_latitude / checkin_longitude
  const points = (visits || [])
    .map((v) => ({
      id: v.id,
      lat: num(v.checkin_latitude ?? v.checkin_lat ?? v.latitude ?? v.lat),
      lng: num(v.checkin_longitude ?? v.checkin_lng ?? v.longitude ?? v.lng),
      name: v.customer?.name || v.customer_name || v.cust || 'Kunjungan',
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))

  if (points.length === 0) return null

  return (
    <div className="lp-map" style={{ height, borderRadius: 12, marginBottom: 14 }}>
      <MapContainer
        center={[points[0].lat, points[0].lng]}
        zoom={13}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <AttributionControl prefix={false} position="bottomleft" />
        <FitAll points={points} />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={selectedId === p.id ? selectedIcon : pinIcon}
            eventHandlers={{ click: () => setSelectedId(p.id) }}
          >
            <Popup>{p.name}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
