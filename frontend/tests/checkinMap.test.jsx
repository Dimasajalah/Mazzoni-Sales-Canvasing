import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const made = vi.hoisted(() => ({ maps: [], markers: [], circles: [] }))

// Google Maps tiruan: jsdom tidak bisa menjalankan Google Maps sungguhan.
vi.mock('../src/lib/googleMaps.js', () => {
  class FakeMap {
    constructor(el, opts) { this.el = el; this.opts = opts; this.calls = []; made.maps.push(this) }
    setCenter(c) { this.calls.push(['center', c]) }
    setZoom(z) { this.calls.push(['zoom', z]) }
    fitBounds(b, pad) { this.calls.push(['fit', pad]) }
  }
  class FakeMarker {
    constructor(o) { this.o = o; made.markers.push(this) }
    setPosition(p) { this.o.position = p }
    setMap() {}
  }
  class FakeCircle {
    constructor(o) { this.o = o; made.circles.push(this) }
    setCenter(c) { this.o.center = c }
    setRadius(r) { this.o.radius = r }
    setMap() {}
    getBounds() { return { fake: true } }
  }
  class FakeBounds { extend() { return this } union() { return this } }
  const maps = { Map: FakeMap, Marker: FakeMarker, Circle: FakeCircle, LatLngBounds: FakeBounds, SymbolPath: { CIRCLE: 0 } }
  return { loadGoogleMaps: vi.fn(() => Promise.resolve(maps)), onMapsAuthFailure: vi.fn(() => () => {}) }
})

import CheckinMap from '../src/components/CheckinMap.jsx'
import { loadGoogleMaps } from '../src/lib/googleMaps.js'

const shop = { lat: -7.2575, lng: 112.7521 }
const me = { lat: -7.257, lng: 112.7521, accuracy: 12 }

beforeEach(() => {
  vi.clearAllMocks()
  made.maps.length = 0
  made.markers.length = 0
  made.circles.length = 0
})

describe('CheckinMap (Google Maps, dokumen hal. 22)', () => {
  it('memasang peta dengan penanda toko dan posisi, lingkaran radius 150 m, dan lingkaran akurasi', async () => {
    render(<CheckinMap userCoords={me} customerCoords={shop} radius={150} />)

    await waitFor(() => expect(made.maps).toHaveLength(1))
    await waitFor(() => expect(made.circles).toHaveLength(2))

    expect(made.circles.map((c) => c.o.radius).sort((a, b) => a - b)).toEqual([12, 150])
    expect(made.markers).toHaveLength(2)
    expect(made.markers.find((m) => m.o.title === 'Lokasi toko').o.position).toEqual(shop)
    expect(made.markers.find((m) => m.o.title === 'Lokasi Anda').o.position).toEqual({ lat: me.lat, lng: me.lng })
    expect(made.maps[0].calls.some(([name]) => name === 'fit')).toBe(true) // zoom menyesuaikan keduanya
  })

  it('tanpa GPS: hanya toko dan lingkaran radius, tanpa penanda posisi', async () => {
    render(<CheckinMap userCoords={null} customerCoords={shop} />)

    await waitFor(() => expect(made.circles).toHaveLength(1))
    expect(made.circles[0].o.radius).toBe(150) // radius bawaan sesuai dokumen
    expect(made.markers).toHaveLength(1)
    expect(made.markers[0].o.title).toBe('Lokasi toko')
  })

  it('tanpa koordinat sama sekali: tidak menampilkan apa pun', () => {
    const { container } = render(<CheckinMap userCoords={null} customerCoords={null} />)
    expect(container).toBeEmptyDOMElement()
    expect(loadGoogleMaps).not.toHaveBeenCalled()
  })

  it('gagal memuat: menampilkan pesan dan tombol muat ulang yang mencoba lagi', async () => {
    vi.mocked(loadGoogleMaps).mockRejectedValueOnce(new Error('Kunci Google Maps belum diisi'))
    const user = userEvent.setup()
    render(<CheckinMap userCoords={me} customerCoords={shop} />)

    expect(await screen.findByText('Kunci Google Maps belum diisi')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Muat ulang peta' }))
    await waitFor(() => expect(made.maps).toHaveLength(1))
  })
})
