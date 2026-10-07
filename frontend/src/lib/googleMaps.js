// frontend/src/lib/googleMaps.js
// Pemuat Google Maps JavaScript API (satu kali, dibagi bersama peta dan geocoding).
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

let loading = null
let authFailed = false
const authListeners = new Set()

// Google memanggil fungsi global ini bila kunci ditolak (referrer salah, API belum aktif, penagihan mati).
if (typeof window !== 'undefined') {
  window.gm_authFailure = () => {
    authFailed = true
    authListeners.forEach((fn) => fn())
  }
}

export function onMapsAuthFailure(fn) {
  authListeners.add(fn)
  if (authFailed) fn()
  return () => authListeners.delete(fn)
}

/** @returns {Promise<typeof google.maps>} */
export function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Peta hanya tersedia di browser'))
  if (!KEY) return Promise.reject(new Error('Kunci Google Maps belum diisi (VITE_GOOGLE_MAPS_API_KEY di frontend/.env)'))
  if (loading) return loading

  loading = new Promise((resolve, reject) => {
    window.__mazzoniMapsReady = async () => {
      try {
        const { maps } = window.google
        await maps.importLibrary('maps')
        await maps.importLibrary('geocoding')
        resolve(maps)
      } catch (err) {
        loading = null
        reject(err)
      }
    }
    const script = document.createElement('script')
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}` +
      '&callback=__mazzoniMapsReady&loading=async&language=id&region=ID'
    script.async = true
    script.onerror = () => {
      loading = null // boleh dicoba lagi (mis. setelah sinyal kembali)
      script.remove()
      reject(new Error('Gagal memuat Google Maps. Periksa koneksi internet.'))
    }
    document.head.appendChild(script)
  })
  return loading
}