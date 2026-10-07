//frontend/tests/locationPicker.test.jsx
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/geocode.js', () => ({
  searchAddress: vi.fn(),
  reverseGeocode: vi.fn(),
}))
vi.mock('../src/lib/googleMaps.js', async () => {
  const { fakeMaps } = await import('./helpers/fakeGoogleMaps.js')
  return { loadGoogleMaps: vi.fn(() => Promise.resolve(fakeMaps)), onMapsAuthFailure: vi.fn(() => () => {}) }
})

import LocationPicker from '../src/components/LocationPicker.jsx'
import * as geo from '../src/lib/geocode.js'
import { loadGoogleMaps } from '../src/lib/googleMaps.js'
import { instances, resetFake } from './helpers/fakeGoogleMaps.js'

const mapReady = () => waitFor(() => expect(instances).toHaveLength(1))

beforeEach(() => {
  vi.clearAllMocks()
  resetFake()
  geo.reverseGeocode.mockResolvedValue({
    label: 'Jl. Rungkut Industri No. 5, Surabaya',
    city: 'Kota Surabaya', province: 'Jawa Timur', postal_code: '60293', country: 'Indonesia',
  })
})

describe('LocationPicker (Google Maps)', () => {
  it('tanpa lokasi: titik default dan peta pertama tampil TIDAK mencari alamat dan TIDAK mengirim apa pun ke form', async () => {
    const onAddressChange = vi.fn()
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} onAddressChange={onAddressChange} />)
    await mapReady()
    act(() => instances[0].emit('idle')) // idle awal peta: posisi sama dengan default

    expect(screen.getByText('Belum ada lokasi dipilih')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 900)) // lewati debounce 700 ms
    expect(geo.reverseGeocode).not.toHaveBeenCalled()
    expect(onAddressChange).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('dengan lokasi dari parent: alamat dicari lalu dikirim ke form dan tampil di kartu bawah peta', async () => {
    const onAddressChange = vi.fn()
    render(<LocationPicker value={{ lat: -7.2575, lng: 112.7521 }} onChange={vi.fn()} onAddressChange={onAddressChange} />)

    expect(await screen.findByText('Jl. Rungkut Industri No. 5, Surabaya', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(geo.reverseGeocode).toHaveBeenCalledWith(-7.2575, 112.7521)
    expect(onAddressChange).toHaveBeenCalledWith(
      'Jl. Rungkut Industri No. 5, Surabaya',
      expect.objectContaining({ city: 'Kota Surabaya', province: 'Jawa Timur', postal_code: '60293' }),
    )
    expect(screen.getByText('-7.257500, 112.752100')).toBeInTheDocument()
  })

  it('pengguna menggeser peta: koordinat baru dikirim ke form dan alamat dicari untuk titik itu', async () => {
    const onChange = vi.fn()
    const onAddressChange = vi.fn()
    render(<LocationPicker value={{ lat: -7.2575, lng: 112.7521 }} onChange={onChange} onAddressChange={onAddressChange} />)
    await mapReady()
    await waitFor(() => expect(geo.reverseGeocode).toHaveBeenCalledTimes(1), { timeout: 2000 })

    geo.reverseGeocode.mockResolvedValue({ label: 'Jl. Baru, Sidoarjo', city: 'Kabupaten Sidoarjo', province: 'Jawa Timur', postal_code: '61219', country: 'Indonesia' })
    act(() => instances[0].dragTo({ lat: -7.3, lng: 112.8 }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ lat: -7.3, lng: 112.8 }))
    await waitFor(() => expect(geo.reverseGeocode).toHaveBeenCalledWith(-7.3, 112.8), { timeout: 2000 })
    await waitFor(() => expect(onAddressChange).toHaveBeenLastCalledWith('Jl. Baru, Sidoarjo', expect.objectContaining({ city: 'Kabupaten Sidoarjo' })))
    expect(screen.getByText('-7.300000, 112.800000')).toBeInTheDocument()
  })

  it('parent memindahkan lokasi (hasil geocode alamat yang diketik): peta ikut pindah dan alamat dicari', async () => {
    const { rerender } = render(<LocationPicker value={{ lat: -7.2575, lng: 112.7521 }} onChange={vi.fn()} onAddressChange={vi.fn()} />)
    await mapReady()

    rerender(<LocationPicker value={{ lat: -7.3, lng: 112.8 }} onChange={vi.fn()} onAddressChange={vi.fn()} />)
    await waitFor(() => expect(instances[0].center.lat).toBeCloseTo(-7.3, 4))
    await waitFor(() => expect(geo.reverseGeocode).toHaveBeenCalledWith(-7.3, 112.8), { timeout: 2000 })
  })

  it('pencarian hanya berjalan saat tombol Cari ditekan (bukan per huruf), lalu memilih hasil', async () => {
    geo.searchAddress.mockResolvedValue([
      { label: 'Jalan Ngagel, Surabaya', lat: -7.29, lng: 112.74 },
      { label: 'Jalan Ngagel Jaya, Surabaya', lat: -7.28, lng: 112.75 },
    ])
    const onAddressChange = vi.fn()
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<LocationPicker value={null} onChange={onChange} onAddressChange={onAddressChange} />)
    await mapReady()

    await user.type(screen.getByPlaceholderText(/Cari alamat/), 'ngagel')
    expect(geo.searchAddress).not.toHaveBeenCalled() // tidak ada autocomplete per huruf

    await user.click(screen.getByRole('button', { name: 'Cari' }))
    await waitFor(() => expect(geo.searchAddress).toHaveBeenCalledWith('ngagel'))
    expect(await screen.findByText('Jalan Ngagel, Surabaya')).toBeInTheDocument()

    await user.click(screen.getByText('Jalan Ngagel, Surabaya'))
    expect(onAddressChange).toHaveBeenCalledWith('Jalan Ngagel, Surabaya', expect.anything())
    expect(screen.queryByText('Jalan Ngagel Jaya, Surabaya')).not.toBeInTheDocument() // daftar tertutup

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const pos = onChange.mock.calls.at(-1)[0]
    expect(pos.lat).toBeCloseTo(-7.29, 3)
    expect(pos.lng).toBeCloseTo(112.74, 3)
    expect(instances[0].center.lat).toBeCloseTo(-7.29, 3)
    // alamat hasil pilihan tidak ditimpa reverse geocoding
    await new Promise((r) => setTimeout(r, 900))
    expect(geo.reverseGeocode).not.toHaveBeenCalled()
  })

  it('menolak pencarian terlalu pendek dan menampilkan pesan bila tidak ada hasil / layanan gagal', async () => {
    const user = userEvent.setup()
    render(<LocationPicker value={null} onChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/Cari alamat/), 'ab')
    await user.click(screen.getByRole('button', { name: 'Cari' }))
    expect(screen.getByText('Ketik minimal 3 huruf')).toBeInTheDocument()
    expect(geo.searchAddress).not.toHaveBeenCalled()

    geo.searchAddress.mockResolvedValueOnce([])
    await user.type(screen.getByPlaceholderText(/Cari alamat/), 'c')
    await user.click(screen.getByRole('button', { name: 'Cari' }))
    expect(await screen.findByText(/Alamat tidak ditemukan/)).toBeInTheDocument()

    geo.searchAddress.mockRejectedValueOnce(new Error('Layanan alamat sedang sibuk, coba lagi sebentar'))
    await user.click(screen.getByRole('button', { name: 'Cari' }))
    expect(await screen.findByText(/sedang sibuk/)).toBeInTheDocument()
  })

  it('reverse geocoding gagal: pengguna diminta mengisi alamat manual', async () => {
    geo.reverseGeocode.mockRejectedValue(new Error('offline'))
    render(<LocationPicker value={{ lat: -7.25, lng: 112.75 }} onChange={vi.fn()} />)
    expect(await screen.findByText(/Alamat tidak tersedia/, {}, { timeout: 2500 })).toBeInTheDocument()
  })

  it('peta gagal dimuat (offline / kunci ditolak): pesan tampil, tombol muat ulang ada, form tetap bisa dipakai', async () => {
    loadGoogleMaps.mockRejectedValueOnce(new Error('Gagal memuat Google Maps. Periksa koneksi internet.'))
    const user = userEvent.setup()
    render(<LocationPicker value={null} onChange={vi.fn()} />)

    expect(await screen.findByText(/Gagal memuat Google Maps/)).toBeInTheDocument()
    expect(screen.getByText('Belum ada lokasi dipilih')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Muat ulang peta' }))
    await waitFor(() => expect(instances).toHaveLength(1))
    expect(screen.queryByText(/Gagal memuat Google Maps/)).not.toBeInTheDocument()
  })

  it('tombol zoom ditaruh di kanan atas supaya tidak tertutup tombol kembali ke GPS', async () => {
    render(<LocationPicker value={{ lat: -7.2575, lng: 112.7521 }} onChange={vi.fn()} />)
    await mapReady()
    expect(instances[0].opts.zoomControlOptions.position).toBe(7)
  })
})

describe('LocationPicker: komponen alamat tetap diteruskan walau label kosong (bug: Kota/Postal terisi tapi Alamat tidak)', () => {
  it('reverse geocode dengan label kosong tetap mengirim city/province/postal_code ke parent', async () => {
    geo.reverseGeocode.mockResolvedValue({ label: '', city: 'Kota Jakarta Timur', province: 'Daerah Khusus Ibukota Jakarta', postal_code: '10540', country: 'Indonesia' })
    const onAddressChange = vi.fn()
    render(
      <LocationPicker value={{ lat: -6.1726, lng: 106.8785 }} onChange={vi.fn()} onAddressChange={onAddressChange} showSearch={false} />,
    )
    await waitFor(() => expect(onAddressChange).toHaveBeenCalledWith('', expect.objectContaining({ city: 'Kota Jakarta Timur', postal_code: '10540' })), { timeout: 2000 })
  })
})