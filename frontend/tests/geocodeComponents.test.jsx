import { beforeEach, describe, expect, it, vi } from 'vitest'

const geocodeFn = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/googleMaps.js', () => ({
  loadGoogleMaps: vi.fn(() => Promise.resolve({ Geocoder: class { geocode(req) { return geocodeFn(req) } } })),
}))

import { pickGoogleComponents, reverseGeocode, searchAddress } from '../src/lib/geocode.js'

const comp = (long_name, ...types) => ({ long_name, short_name: long_name, types })
const loc = (lat, lng) => ({ lat: () => lat, lng: () => lng })

beforeEach(() => geocodeFn.mockReset())

describe('pickGoogleComponents', () => {
  it('DKI Jakarta: level_1 = provinsi, level_2 = kota administrasi', () => {
    expect(pickGoogleComponents([
      comp('Gambir', 'administrative_area_level_3', 'political'),
      comp('Kota Jakarta Pusat', 'administrative_area_level_2', 'political'),
      comp('Daerah Khusus Ibukota Jakarta', 'administrative_area_level_1', 'political'),
      comp('Indonesia', 'country', 'political'),
      comp('10110', 'postal_code'),
    ])).toEqual({
      city: 'Kota Jakarta Pusat', province: 'Daerah Khusus Ibukota Jakarta', postal_code: '10110', country: 'Indonesia',
    })
  })

  it('Kabupaten: nama kabupaten dipakai sebagai kota, bukan kecamatannya', () => {
    expect(pickGoogleComponents([
      comp('Cisauk', 'administrative_area_level_3', 'political'),
      comp('Kabupaten Tangerang', 'administrative_area_level_2', 'political'),
      comp('Banten', 'administrative_area_level_1', 'political'),
      comp('15345', 'postal_code'),
      comp('Indonesia', 'country', 'political'),
    ])).toMatchObject({ city: 'Kabupaten Tangerang', province: 'Banten', postal_code: '15345' })
  })

  it('tanpa level_2: jatuh ke locality', () => {
    expect(pickGoogleComponents([comp('Sidoarjo', 'locality', 'political'), comp('Jawa Timur', 'administrative_area_level_1', 'political')]).city).toBe('Sidoarjo')
  })

  it('masukan kosong: nilai kosong, bukan galat', () => {
    expect(pickGoogleComponents()).toEqual({ city: '', province: '', postal_code: '', country: '' })
  })
})

describe('reverseGeocode', () => {
  it('melewati hasil plus_code, memakai alamat pertama yang nyata, dan melengkapi kolom kosong dari hasil berikutnya', async () => {
    geocodeFn.mockResolvedValue({
      results: [
        { types: ['plus_code'], formatted_address: 'P4VX+HM Cisauk', address_components: [] },
        { types: ['street_address'], formatted_address: 'Jl. BSD Green Connector, Cisauk', address_components: [comp('15345', 'postal_code'), comp('Indonesia', 'country', 'political')] },
        { types: ['administrative_area_level_2'], formatted_address: 'Kabupaten Tangerang, Banten', address_components: [comp('Kabupaten Tangerang', 'administrative_area_level_2', 'political'), comp('Banten', 'administrative_area_level_1', 'political')] },
      ],
    })
    expect(await reverseGeocode(-6.30126, 106.65437)).toEqual({
      label: 'Jl. BSD Green Connector, Cisauk',
      city: 'Kabupaten Tangerang', province: 'Banten', postal_code: '15345', country: 'Indonesia',
    })
    expect(geocodeFn).toHaveBeenCalledWith(expect.objectContaining({ location: { lat: -6.30126, lng: 106.65437 }, region: 'ID' }))
  })

  it('tidak ada hasil: label kosong, bukan galat', async () => {
    geocodeFn.mockRejectedValue({ code: 'ZERO_RESULTS' })
    expect(await reverseGeocode(-1.11111, 100.11111)).toMatchObject({ label: '', city: '' })
  })
})

describe('searchAddress', () => {
  it('kueri terlalu pendek: tidak memanggil layanan', async () => {
    expect(await searchAddress('ab')).toEqual([])
    expect(geocodeFn).not.toHaveBeenCalled()
  })

  it('memetakan hasil Google ke label, koordinat, dan komponen alamat', async () => {
    geocodeFn.mockResolvedValue({
      results: [{
        formatted_address: 'The Breeze, Jalan BSD Grand Boulevard, Tangerang',
        geometry: { location: loc(-6.3012645, 106.65437) },
        address_components: [comp('Kabupaten Tangerang', 'administrative_area_level_2', 'political'), comp('Banten', 'administrative_area_level_1', 'political'), comp('15311', 'postal_code'), comp('Indonesia', 'country', 'political')],
      }],
    })
    const rows = await searchAddress('the breeze bsd unik')
    expect(rows).toEqual([{
      label: 'The Breeze, Jalan BSD Grand Boulevard, Tangerang', lat: -6.3012645, lng: 106.65437,
      city: 'Kabupaten Tangerang', province: 'Banten', postal_code: '15311', country: 'Indonesia',
    }])
    expect(geocodeFn).toHaveBeenCalledWith(expect.objectContaining({ address: 'the breeze bsd unik', componentRestrictions: { country: 'ID' } }))
  })

  it('tidak ada hasil: daftar kosong', async () => {
    geocodeFn.mockRejectedValue({ code: 'ZERO_RESULTS' })
    expect(await searchAddress('alamat tidak ada xyz')).toEqual([])
  })

  it('kunci/API ditolak: galat yang menjelaskan penyebabnya', async () => {
    geocodeFn.mockRejectedValue({ code: 'REQUEST_DENIED' })
    await expect(searchAddress('kueri ditolak abc')).rejects.toThrow(/ditolak/)
  })
})