import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({ getVisits: vi.fn() }))

import * as api from '../src/api/index.js'
import { UiProvider } from '../src/context/UiContext.jsx'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import Visits from '../src/pages/Visits.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const shell = (entries = ['/visits']) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/visits" element={<Visits />} />
            <Route path="/visit-mode/:id" element={<Probe />} />
            <Route path="/checkin" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Visits (poin: kunjungan yang lupa di-Checkout harus bisa dibuka lagi lewat UI)', () => {
  it('menampilkan nama Lead (bukan cuma Customer) untuk kunjungan yang menyasar Lead langsung', async () => {
    api.getVisits.mockResolvedValue({
      data: [{ id: 12, lead: { business_name: 'easypay' }, customer: null, checkin_at: '08:00', checkout_at: null }],
    })
    shell()
    expect(await screen.findByText('easypay')).toBeInTheDocument()
    expect(screen.getByText(/Belum checkout/)).toBeInTheDocument()
  })

  it('baris kunjungan bisa diklik -> membuka /visit-mode/:id untuk lanjut Checkout', async () => {
    api.getVisits.mockResolvedValue({
      data: [{ id: 12, lead: { business_name: 'easypay' }, customer: null, checkin_at: '08:00', checkout_at: null }],
    })
    const user = userEvent.setup()
    shell()
    await user.click(await screen.findByText('easypay'))
    expect(await screen.findByTestId('probe')).toHaveTextContent('/visit-mode/12')
  })

  it('kunjungan yang sudah di-checkout tetap menampilkan nama customer seperti biasa', async () => {
    api.getVisits.mockResolvedValue({
      data: [{ id: 10, customer: { name: 'PT Lama' }, lead: null, checkin_at: '08:00', checkout_at: '09:00', visit_result: 'Pesanan didapat' }],
    })
    shell()
    expect(await screen.findByText('PT Lama')).toBeInTheDocument()
    expect(screen.getByText(/Pesanan didapat/)).toBeInTheDocument()
  })
})