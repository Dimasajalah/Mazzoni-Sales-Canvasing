// frontend/src/lib/geocode.js
// Pencarian alamat dan reverse geocoding lewat Google Geocoder (dimuat bersama Google Maps).
import { loadGoogleMaps } from './googleMaps'

const cache = new Map()

const part = (components, type) => components.find((c) => c.types?.includes(type))?.long_name || ''

/**
 * Komponen alamat Indonesia dari address_components Google:
 * level_1 = provinsi, level_2 = kabupaten/kota ("Kota Surabaya", "Kabupaten Tangerang").
 */
export function pickGoogleComponents(components = []) {
  return {
    city: part(components, 'administrative_area_level_2') || part(components, 'locality'),
    province: part(components, 'administrative_area_level_1'),
    postal_code: part(components, 'postal_code'),
    country: part(components, 'country'),
  }
}

// Hasil reverse geocode berurutan dari yang paling spesifik. Kolom yang kosong di hasil pertama
// diisi dari hasil berikutnya (yang lebih luas, di area yang sama).
function mergeComponents(results) {
  const out = { city: '', province: '', postal_code: '', country: '' }
  for (const r of results) {
    const c = pickGoogleComponents(r.address_components)
    for (const k of Object.keys(out)) if (!out[k] && c[k]) out[k] = c[k]
  }
  return out
}

async function geocode(request) {
  const maps = await loadGoogleMaps()
  const geocoder = new maps.Geocoder()
  try {
    const res = await geocoder.geocode({ ...request, region: 'ID' })
    return res.results || []
  } catch (err) {
    const code = err?.code || ''
    if (code === 'ZERO_RESULTS') return []
    if (code === 'OVER_QUERY_LIMIT') throw new Error('Layanan alamat sedang sibuk, coba lagi sebentar')
    if (code === 'REQUEST_DENIED') {
      throw new Error('Google Geocoding API ditolak: periksa API yang diaktifkan dan pembatasan kunci')
    }
    throw new Error(`Layanan alamat gagal${code ? ` (${code})` : ''}`)
  }
}

/** Cari alamat/tempat di Indonesia. @returns {Promise<{label:string,lat:number,lng:number,city:string,province:string,postal_code:string,country:string}[]>} */
export async function searchAddress(query, { limit = 6 } = {}) {
  const q = String(query || '').trim()
  if (q.length < 3) return []

  const key = `s:${q.toLowerCase()}`
  if (cache.has(key)) return cache.get(key)

  const results = await geocode({ address: q, componentRestrictions: { country: 'ID' } })
  const out = results.slice(0, limit).map((r) => ({
    label: r.formatted_address,
    lat: r.geometry.location.lat(),
    lng: r.geometry.location.lng(),
    ...pickGoogleComponents(r.address_components),
  }))
  cache.set(key, out)
  return out
}

/** Koordinat -> alamat terbaca + komponennya. @returns {Promise<{label:string,city:string,province:string,postal_code:string,country:string}>} */
export async function reverseGeocode(lat, lng) {
  const key = `r:${lat.toFixed(5)},${lng.toFixed(5)}`
  if (cache.has(key)) return cache.get(key)

  const results = (await geocode({ location: { lat, lng } })).filter((r) => !r.types?.includes('plus_code'))
  const out = { label: results[0]?.formatted_address || '', ...mergeComponents(results) }
  cache.set(key, out)
  return out
}