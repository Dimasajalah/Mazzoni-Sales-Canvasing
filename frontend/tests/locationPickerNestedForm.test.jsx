//frontend/tests/locationPickerNestedForm.test.jsx
import { render, screen } from '@testing-library/react'
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

beforeEach(() => {
  vi.clearAllMocks()
  geo.searchAddress.mockResolvedValue([])
})

describe('LocationPicker di dalam form halaman pemanggil (bug: tombol Cari ikut men-submit form luar)', () => {
  it('menekan Cari TIDAK men-submit form luar (mis. form New Lead)', async () => {
    const outerSubmit = vi.fn((e) => e.preventDefault())
    const user = userEvent.setup()
    render(
      <form onSubmit={outerSubmit}>
        <LocationPicker value={null} onChange={vi.fn()} onAddressChange={vi.fn()} />
      </form>,
    )

    await user.type(screen.getByPlaceholderText('Cari alamat lalu tekan Cari…'), 'Rungkut')
    await user.click(screen.getByRole('button', { name: 'Cari' }))

    expect(geo.searchAddress).toHaveBeenCalledWith('Rungkut')
    expect(outerSubmit).not.toHaveBeenCalled()
  })

  it('menekan Enter di kotak pencarian juga TIDAK men-submit form luar', async () => {
    const outerSubmit = vi.fn((e) => e.preventDefault())
    const user = userEvent.setup()
    render(
      <form onSubmit={outerSubmit}>
        <LocationPicker value={null} onChange={vi.fn()} onAddressChange={vi.fn()} />
      </form>,
    )

    await user.type(screen.getByPlaceholderText('Cari alamat lalu tekan Cari…'), 'Rungkut{Enter}')

    expect(geo.searchAddress).toHaveBeenCalledWith('Rungkut')
    expect(outerSubmit).not.toHaveBeenCalled()
  })
})