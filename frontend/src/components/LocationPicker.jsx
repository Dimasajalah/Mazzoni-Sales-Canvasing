// frontend/src/components/LocationPicker.jsx
// Peta lokasi berbasis Google Maps.
//  - pin diam di tengah, peta digeser di bawahnya (untuk koreksi halus setelah alamat diketik)
//  - showSearch=false (dipakai New Lead): kotak pencarian sendiri disembunyikan karena alamat
//    sudah diketik di field terpisah — peta cuma pratinjau + koreksi
//  - onAddressChange(label, components) dipanggil setiap reverse geocoding selesai (geser/pencarian)
import { useCallback, useEffect, useRef, useState } from 'react'
import { reverseGeocode, searchAddress } from '../lib/geocode'
import { loadGoogleMaps, onMapsAuthFailure } from '../lib/googleMaps'

const DEFAULT_CENTER = { lat: -7.2575, lng: 112.7521 } // Surabaya
const EPS = 1e-6
const same = (a, b) => Boolean(a && b) && Math.abs(a.lat - b.lat) < EPS && Math.abs(a.lng - b.lng) < EPS

export default function LocationPicker({ value, onChange, onAddressChange, height = 300, showSearch = true }) {
  const initial = value || DEFAULT_CENTER
  const [position, setPosition] = useState(initial)
  // Lokasi dianggap dipilih bila datang dari parent (GPS/geocoding alamat) atau peta digeser/dicari.
  // Titik default hanya tampilan awal: tidak dicari alamatnya dan tidak dikirim ke parent.
  const [chosen, setChosen] = useState(Boolean(value))
  const [address, setAddress] = useState('')
  const [addressState, setAddressState] = useState('idle') // idle | loading | error
  const [dragging, setDragging] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchMsg, setSearchMsg] = useState('')
  const [mapError, setMapError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const lastTarget = useRef(initial) // posisi terakhir yang SUDAH diketahui komponen ini
  const reverseTimer = useRef(null)
  const reverseSeq = useRef(0)
  const movedRef = useRef(() => {})

  const applyAddress = useCallback(
    (label, components) => {
      setAddress(label)
      onAddressChange?.(label, components)
    },
    [onAddressChange],
  )

  const lookupAddress = useCallback(
    (pos) => {
      clearTimeout(reverseTimer.current)
      const seq = ++reverseSeq.current
      setAddressState('loading')
      reverseTimer.current = setTimeout(async () => {
        try {
          const result = await reverseGeocode(pos.lat, pos.lng)
          if (seq !== reverseSeq.current) return
          applyAddress(result.label, result)
          setAddressState('idle')
        } catch {
          if (seq !== reverseSeq.current) return
          setAddressState('error')
        }
      }, 700)
    },
    [applyAddress],
  )

  useEffect(() => () => clearTimeout(reverseTimer.current), [])

  // Alamat untuk posisi awal (hanya bila parent memang memberi lokasi)
  useEffect(() => {
    if (value) lookupAddress(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Peta dipindah dari LUAR (prop `value` berubah, mis. hasil geocode alamat yang baru diketik).
  const handleTarget = useCallback(
    (pos) => {
      setChosen(true)
      setPosition(pos)
      onChange?.(pos)
      lookupAddress(pos)
    },
    [onChange, lookupAddress],
  )

  // Peta digeser/di-zoom oleh PENGGUNA.
  const handleMoved = useCallback(
    (pos) => {
      setDragging(false)
      setChosen(true)
      setPosition(pos)
      onChange?.(pos)
      lookupAddress(pos)
    },
    [onChange, lookupAddress],
  )

  useEffect(() => {
    movedRef.current = handleMoved
  })

  // Muat Google Maps lalu pasang peta.
  useEffect(() => {
    let cancelled = false
    let listeners = []
    setMapError('')

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return
        const map = new maps.Map(containerRef.current, {
          center: lastTarget.current,
          zoom: 16,
          gestureHandling: 'greedy',
          disableDefaultUI: true,
          zoomControl: true,
          // Tombol zoom di kanan atas supaya tidak tertutup tombol "kembali ke GPS" (kanan bawah).
          ...(maps.ControlPosition ? { zoomControlOptions: { position: maps.ControlPosition.RIGHT_TOP } } : {}),
          clickableIcons: false,
        })
        mapRef.current = map
        listeners = [
          map.addListener('dragstart', () => setDragging(true)),
          // `idle` juga menyala setelah pindah terprogram dan saat peta pertama kali tampil:
          // hanya posisi yang BERBEDA dari yang sudah diketahui dianggap geseran pengguna.
          map.addListener('idle', () => {
            setDragging(false)
            const c = map.getCenter()
            const pos = { lat: c.lat(), lng: c.lng() }
            if (same(lastTarget.current, pos)) return
            lastTarget.current = pos
            movedRef.current(pos)
          }),
        ]
      })
      .catch((err) => {
        if (!cancelled) setMapError(err?.message || 'Peta tidak dapat dimuat')
      })

    const offAuth = onMapsAuthFailure(() =>
      setMapError('Kunci Google Maps ditolak. Periksa API yang diaktifkan dan pembatasan kunci di Google Cloud.'),
    )

    return () => {
      cancelled = true
      listeners.forEach((l) => l.remove())
      offAuth()
      mapRef.current = null
    }
  }, [attempt])

  useEffect(() => {
    if (!value || same(lastTarget.current, value)) return
    lastTarget.current = { lat: value.lat, lng: value.lng }
    mapRef.current?.setCenter(value)
    handleTarget(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng])

  const doSearch = async (e) => {
    e?.preventDefault()
    setSearchMsg('')
    if (query.trim().length < 3) {
      setSearchMsg('Ketik minimal 3 huruf')
      return
    }
    setSearching(true)
    try {
      const rows = await searchAddress(query)
      setResults(rows)
      if (!rows.length) setSearchMsg('Alamat tidak ditemukan. Coba kata kunci lain.')
    } catch (err) {
      setResults([])
      setSearchMsg(err.message || 'Pencarian gagal')
    } finally {
      setSearching(false)
    }
  }

  const pick = (row) => {
    const pos = { lat: row.lat, lng: row.lng }
    lastTarget.current = pos
    mapRef.current?.setCenter(pos)
    mapRef.current?.setZoom(17)
    applyAddress(row.label, row)
    setAddressState('idle')
    setResults([])
    setQuery('')
    setChosen(true)
    setPosition(pos)
    onChange?.(pos)
  }

  const recenter = () => {
    if (!value) return
    lastTarget.current = { lat: value.lat, lng: value.lng }
    mapRef.current?.setCenter(value)
    mapRef.current?.setZoom(17)
  }

  return (
    <div className="lp">
      {showSearch && (
        <>
          {/* Sengaja BUKAN <form>: dipakai di dalam form halaman pemanggil, dan form-di-dalam-form
              tidak valid di HTML — tombol "Cari" bisa malah men-submit form terluar. */}
          <div className="lp-search">
            <input
              type="search"
              placeholder="Cari alamat lalu tekan Cari…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  doSearch()
                }
              }}
              enterKeyHint="search"
            />
            <button type="button" className="btn sm" disabled={searching} onClick={doSearch}>
              {searching ? '…' : 'Cari'}
            </button>
          </div>

          {results.length > 0 && (
            <div className="lp-results">
              {results.map((r, i) => (
                <div key={`${r.lat}-${r.lng}-${i}`} className="lp-result" role="button" tabIndex={0} onClick={() => pick(r)}>
                  {r.label}
                </div>
              ))}
            </div>
          )}
          {searchMsg && <div className="muted lp-msg">{searchMsg}</div>}
        </>
      )}

      <div className="lp-map" style={{ height }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

        {mapError ? (
          <div
            className="muted lp-msg"
            style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', gap: 8, padding: 16, textAlign: 'center', background: '#F7F9FC' }}
          >
            <div>{mapError}</div>
            <button type="button" className="btn ghost sm" style={{ justifySelf: 'center' }} onClick={() => setAttempt((a) => a + 1)}>
              Muat ulang peta
            </button>
          </div>
        ) : (
          <>
            <div className={`lp-pin${dragging ? ' lifted' : ''}`} aria-hidden="true">
              📍
            </div>

            {value && (
              <button type="button" className="lp-recenter" onClick={recenter} aria-label="Kembali ke lokasi GPS">
                🎯
              </button>
            )}
          </>
        )}
      </div>

      <div className="lp-card">
        <span className="lp-card-ic">📌</span>
        <div className="lp-card-body">
          <div className="lp-addr">
            {addressState === 'loading'
              ? 'Mencari alamat…'
              : address ||
                (addressState === 'error'
                  ? 'Alamat tidak tersedia — isi manual di kolom Alamat.'
                  : showSearch
                    ? 'Geser peta atau cari alamat untuk memilih lokasi'
                    : 'Isi Alamat di atas untuk memunculkan peta')}
          </div>
          <div className="lp-coord muted">
            {chosen ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}` : 'Belum ada lokasi dipilih'}
          </div>
        </div>
      </div>
    </div>
  )
}