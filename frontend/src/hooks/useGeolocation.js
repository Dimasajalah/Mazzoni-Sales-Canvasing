import { useCallback, useState } from 'react'

export function useGeolocation() {
  const [coords, setCoords] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation tidak didukung')
      return Promise.reject(new Error('Geolocation tidak didukung'))
    }
    setLoading(true)
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }
          setCoords(c)
          setError(null)
          setLoading(false)
          resolve(c)
        },
        (err) => {
          setError(err.message || 'Gagal ambil GPS')
          setLoading(false)
          reject(err)
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
      )
    })
  }, [])

  return { coords, error, loading, refresh }
}
