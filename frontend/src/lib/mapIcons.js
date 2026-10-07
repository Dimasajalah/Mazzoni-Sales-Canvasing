// frontend/src/lib/mapIcons.js
// Ikon peta berbasis emoji/CSS (divIcon) supaya tidak bergantung pada file gambar bawaan Leaflet.
import L from 'leaflet'

const make = (html, size, anchor) =>
  L.divIcon({ className: 'map-icon', html, iconSize: size, iconAnchor: anchor })

export const pinIcon = make('<div class="map-pin">📍</div>', [30, 38], [15, 36])
export const shopIcon = make('<div class="map-pin">🏢</div>', [30, 38], [15, 36])
export const meIcon = make('<div class="map-me"></div>', [18, 18], [9, 9])
export const selectedIcon = make('<div class="map-pin map-pin-active">📍</div>', [34, 42], [17, 40])
