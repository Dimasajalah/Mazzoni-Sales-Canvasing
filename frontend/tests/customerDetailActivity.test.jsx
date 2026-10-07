import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 1, role: 'sales', sales_type: 'ORDER', can_order: true }, isAuthenticated: true, logout: vi.fn() }),
}))
vi.mock('../src/api/index.js', () => ({
  getCustomer: vi.fn(), updateCustomer: vi.fn(), offerPromo: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import CustomerDetail from '../src/pages/CustomerDetail.jsx'

const shell = () =>
  render(
    <MemoryRouter initialEntries={['/customers/8']}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/customers/:id" element={<CustomerDetail />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const baseCustomer = {
  id: 8, name: 'UD Sentosa Jaya', customer_code: 'C-10488', customer_group: 'Grosir',
  address: 'Jl. Kembang Jepun', city: 'Surabaya', credit_limit: '250000000', invoices: [],
  sales_notes: '',
  visits: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CustomerDetail: tab Aktivitas (poin 4)', () => {
  it('tab Info tampil default; pindah ke Aktivitas menampilkan total kunjungan dan status terakhir', async () => {
    api.getCustomer.mockResolvedValue({
      ...baseCustomer,
      visits: [
        { id: 2, visit_result: 'NO_ORDER', checkin_at: '2026-09-20', duration_minutes: 10 },
        { id: 1, visit_result: 'ORDER', checkin_at: '2026-09-10', duration_minutes: 25 },
      ],
    })
    const user = userEvent.setup()
    shell()

    expect(await screen.findByText('Aging')).toBeInTheDocument() // tab Info default

    await user.click(screen.getByRole('button', { name: 'Aktivitas' }))
    expect(screen.getByText('Total Kunjungan')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Status Kunjungan Terakhir')).toBeInTheDocument()
    expect(screen.getAllByText('Tidak ada order').length).toBeGreaterThanOrEqual(1) // visits[0] = NO_ORDER (terbaru)
    expect(screen.queryByText('Belum pernah dikunjungi')).not.toBeInTheDocument() // ada riwayat -> bukan status kosong
    expect(screen.queryByText('Aging')).not.toBeInTheDocument() // tab Info tersembunyi
  })

  it('customer tanpa kunjungan menampilkan "Belum pernah dikunjungi", bukan error', async () => {
    api.getCustomer.mockResolvedValue({ ...baseCustomer, visits: [] })
    const user = userEvent.setup()
    shell()
    await user.click(await screen.findByRole('button', { name: 'Aktivitas' }))
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('Belum pernah dikunjungi')).toBeInTheDocument()
    expect(screen.getByText('Belum ada kunjungan tercatat')).toBeInTheDocument()
  })
})

describe('CustomerDetail: Catatan untuk Sales (poin 5)', () => {
  it('memuat catatan yang sudah ada, tombol Simpan nonaktif sampai diubah', async () => {
    api.getCustomer.mockResolvedValue({ ...baseCustomer, sales_notes: 'Buka jam 9 pagi' })
    shell()
    expect(await screen.findByDisplayValue('Buka jam 9 pagi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simpan Catatan' })).toBeDisabled()
  })

  it('mengetik catatan baru lalu menyimpan memanggil updateCustomer', async () => {
    api.getCustomer.mockResolvedValue({ ...baseCustomer })
    api.updateCustomer.mockResolvedValue({ sales_notes: 'Pemilik sering tutup siang' })
    const user = userEvent.setup()
    shell()

    const textarea = await screen.findByPlaceholderText(/Catatan internal/)
    await user.type(textarea, 'Pemilik sering tutup siang')
    const btn = screen.getByRole('button', { name: 'Simpan Catatan' })
    expect(btn).toBeEnabled()
    await user.click(btn)

    await waitFor(() => expect(api.updateCustomer).toHaveBeenCalledWith(8, { sales_notes: 'Pemilik sering tutup siang' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan Catatan' })).toBeDisabled())
  })
})