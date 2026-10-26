import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getMarketingBudgets: vi.fn(), getMarketingEvents: vi.fn(), getMarketingEvent: vi.fn(),
  getMarketingEventOptions: vi.fn(), createMarketingEvent: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import MarketingEventDetail from '../src/pages/MarketingEventDetail.jsx'
import MarketingEventForm from '../src/pages/MarketingEventForm.jsx'
import MarketingEvents from '../src/pages/MarketingEvents.jsx'

function Probe() {
  return <div data-testid="probe">{useLocation().pathname}</div>
}

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/events" element={<MarketingEvents />} />
            <Route path="/marketing/events/new" element={<MarketingEventForm />} />
            <Route path="/marketing/events/:id" element={<MarketingEventDetail />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const event = (over = {}) => ({
  id: 1, event_code: 'BDG-2026-001-E01', description: 'Bazaar Ramadan', activity_type: 'EVENT', activity_type_label: 'Event',
  status: 'PENDING_APPROVAL', budget_amount: '400000.00', start_date: '2026-11-01', end_date: '2026-11-30',
  target_type: 'NATIONAL', target_territories: null, reference_letter_no: 'SK/001/2026', participants_count: 2,
  budget: { id: 1, campaign_code: 'BDG-2026-001', name: 'Campaign Ramadan' }, attachments: [],
  participants: [{ id: 1, customer_code: 'C1', name: 'Toko C1', city: 'Jakarta' }, { id: 2, customer_code: 'C2', name: 'Toko C2', city: null }],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Mgr', role: 'supervisor' }
  api.getMarketingEvent.mockResolvedValue(event()) // halaman detail terbuka setelah simpan
  api.getMarketingBudgets.mockResolvedValue([
    { id: 1, campaign_code: 'BDG-2026-001', name: 'Campaign Ramadan', status: 'ACTIVE', remaining_budget: 1000000 },
    { id: 2, campaign_code: 'BDG-2026-002', name: 'Campaign Lama', status: 'CLOSED', remaining_budget: 5 },
  ])
  api.getMarketingEventOptions.mockResolvedValue({
    activity_types: [{ value: 'EVENT', label: 'Event' }, { value: 'BRANDING', label: 'Branding' }],
    territories: ['Jakarta', 'Surabaya'],
    customers: [{ id: 7, customer_code: 'KRM-1', name: 'Toko Karma', city: 'Bandung' }],
  })
})

describe('Daftar Event Marketing', () => {
  it('menampilkan event dengan status dan memfilter', async () => {
    api.getMarketingEvents.mockResolvedValue([event(), event({ id: 2, description: 'Branding Toko', status: 'APPROVED', event_code: 'BDG-2026-001-E02' })])
    const user = userEvent.setup()
    shell(['/marketing/events'])

    expect(await screen.findByText('Bazaar Ramadan')).toBeInTheDocument()
    expect(screen.getByText('Menunggu Persetujuan')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Disetujui' }))
    expect(screen.queryByText('Bazaar Ramadan')).not.toBeInTheDocument()
    expect(screen.getByText('Branding Toko')).toBeInTheDocument()
  })

  it('pengguna sales tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/events'])
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getMarketingEvents).not.toHaveBeenCalled()
  })
})

describe('Form Event Marketing', () => {
  const fillBasics = async (user, over = {}) => {
    await screen.findByRole('option', { name: /BDG-2026-001/ })
    await user.selectOptions(screen.getByLabelText('Campaign'), '1')
    await user.type(screen.getByLabelText('Deskripsi Event'), 'Bazaar Ramadan')
    await user.type(screen.getByLabelText('Nomor Surat Komunikasi'), 'SK/001/2026')
    fireEvent.change(screen.getByLabelText('Tanggal Mulai'), { target: { value: over.start || '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Tanggal Selesai'), { target: { value: over.end || '2026-11-30' } })
  }

  it('hanya Campaign aktif yang bisa dipilih', async () => {
    shell(['/marketing/events/new'])
    await screen.findByRole('option', { name: /BDG-2026-001/ })
    expect(screen.queryByRole('option', { name: /BDG-2026-002/ })).not.toBeInTheDocument()
  })

  it('Campaign dari tautan terpilih otomatis dan sisa budget tampil', async () => {
    shell(['/marketing/events/new?budget=1'])
    expect(await screen.findByText(/Sisa budget Campaign/)).toHaveTextContent('Rp 1.000.000')
  })

  it('menolak deskripsi kosong', async () => {
    const user = userEvent.setup()
    shell(['/marketing/events/new'])
    await screen.findByRole('option', { name: /BDG-2026-001/ })
    await user.selectOptions(screen.getByLabelText('Campaign'), '1')
    await user.click(screen.getByRole('button', { name: 'Simpan Event' }))
    expect(await screen.findByText('Isi deskripsi event')).toBeInTheDocument()
    expect(api.createMarketingEvent).not.toHaveBeenCalled()
  })

  it('target Territory wajib memilih minimal satu territory', async () => {
    const user = userEvent.setup()
    shell(['/marketing/events/new'])
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Territory' }))
    await user.type(screen.getByLabelText('Budget / RAB (Rp)'), '400000')
    await user.click(screen.getByRole('button', { name: 'Simpan Event' }))
    expect(await screen.findByText('Pilih minimal satu territory')).toBeInTheDocument()
    expect(api.createMarketingEvent).not.toHaveBeenCalled()
  })

  it('budget di atas sisa Campaign ditolak sebelum dikirim', async () => {
    const user = userEvent.setup()
    shell(['/marketing/events/new'])
    await fillBasics(user)
    await user.type(screen.getByLabelText('Budget / RAB (Rp)'), '2000000')
    expect(screen.getByText(/Melebihi sisa budget Campaign/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simpan Event' }))
    expect(await screen.findByText('Budget melebihi sisa budget Campaign')).toBeInTheDocument()
    expect(api.createMarketingEvent).not.toHaveBeenCalled()
  })

  it('tanggal selesai sebelum mulai ditolak', async () => {
    const user = userEvent.setup()
    shell(['/marketing/events/new'])
    await fillBasics(user, { start: '2026-12-01', end: '2026-11-01' })
    await user.type(screen.getByLabelText('Budget / RAB (Rp)'), '1000')
    await user.click(screen.getByRole('button', { name: 'Simpan Event' }))
    expect(await screen.findByText('Tanggal selesai tidak boleh sebelum tanggal mulai')).toBeInTheDocument()
  })

  it('event nasional dikirim sebagai form data lalu pindah ke detail', async () => {
    api.createMarketingEvent.mockResolvedValue({ id: 9 })
    const user = userEvent.setup()
    shell(['/marketing/events/new'])
    await fillBasics(user)
    await user.type(screen.getByLabelText('Budget / RAB (Rp)'), '400000')
    await user.click(screen.getByRole('button', { name: 'Simpan Event' }))

    await waitFor(() => expect(api.createMarketingEvent).toHaveBeenCalledTimes(1))
    const fd = api.createMarketingEvent.mock.calls[0][0]
    expect(fd.get('marketing_budget_id')).toBe('1')
    expect(fd.get('description')).toBe('Bazaar Ramadan')
    expect(fd.get('reference_letter_no')).toBe('SK/001/2026')
    expect(fd.get('activity_type')).toBe('EVENT')
    expect(fd.get('target_type')).toBe('NATIONAL')
    expect(fd.get('budget_amount')).toBe('400000')
    await waitFor(() => expect(api.getMarketingEvent).toHaveBeenCalledWith('9'))
    expect(await screen.findByText('Daftar Peserta (2)')).toBeInTheDocument() // pindah ke halaman detail
  })

  it('target Customer mengirim customer_ids[] dari customer yang dipilih', async () => {
    api.createMarketingEvent.mockResolvedValue({ id: 10 })
    const user = userEvent.setup()
    shell(['/marketing/events/new'])
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Customer' }))
    await user.click(await screen.findByRole('button', { name: /Toko Karma/ }))
    await user.type(screen.getByLabelText('Budget / RAB (Rp)'), '100000')
    await user.click(screen.getByRole('button', { name: 'Simpan Event' }))

    await waitFor(() => expect(api.createMarketingEvent).toHaveBeenCalled())
    expect(api.createMarketingEvent.mock.calls[0][0].getAll('customer_ids[]')).toEqual(['7'])
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.createMarketingEvent.mockRejectedValue(new Error('Campaign ini sudah ditutup, tidak bisa menambah event.'))
    const user = userEvent.setup()
    shell(['/marketing/events/new'])
    await fillBasics(user)
    await user.type(screen.getByLabelText('Budget / RAB (Rp)'), '1000')
    await user.click(screen.getByRole('button', { name: 'Simpan Event' }))
    expect(await screen.findByText(/sudah ditutup/)).toBeInTheDocument()
  })
})

describe('Detail Event Marketing', () => {
  it('menampilkan info, peserta, dan lampiran', async () => {
    api.getMarketingEvent.mockResolvedValue(event({ attachments: [{ id: 1, filename: 'rab.pdf', size: 204800 }] }))
    shell(['/marketing/events/1'])

    expect(await screen.findByText('Bazaar Ramadan')).toBeInTheDocument()
    expect(screen.getByText('Daftar Peserta (2)')).toBeInTheDocument()
    expect(screen.getByText('Toko C1')).toBeInTheDocument()
    expect(screen.getByText('rab.pdf')).toBeInTheDocument()
    expect(screen.getByText('Nasional (semua customer aktif)')).toBeInTheDocument()
    expect(screen.getByText(/menunggu persetujuan/)).toBeInTheDocument()
  })
})
