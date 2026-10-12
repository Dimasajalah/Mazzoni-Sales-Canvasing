import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }),
}))
vi.mock('../src/api/index.js', () => ({
  getCustomer: vi.fn(), updateCustomer: vi.fn(), getCustomerActivity: vi.fn(),
  getPicTargets: vi.fn(), delegatePic: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import CustomerActivity from '../src/pages/CustomerActivity.jsx'
import CustomerDetail from '../src/pages/CustomerDetail.jsx'

const shell = (path = '/customers/8') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/customers/:id/activity" element={<CustomerActivity />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const baseCustomer = {
  id: 8, name: 'UD Sentosa Jaya', customer_code: 'C-10488', customer_group: 'Grosir',
  address: 'Jl. Kembang Jepun', city: 'Surabaya', sales_notes: '', visits: [], lead: null, salesperson_id: 2,
}

const entry = (kind, title, subtitle, at) => ({ kind, title, subtitle, at })

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 2, name: 'Budi Santoso', role: 'sales' }
  api.getCustomerActivity.mockResolvedValue({ items: [], total: 0 })
})

describe('CustomerDetail: tab Activity (dokumen hal. 18)', () => {
  it('tab Info tampil default; Activity menampilkan total visit, status terakhir, dan log dari server', async () => {
    api.getCustomer.mockResolvedValue({
      ...baseCustomer,
      visits: [
        { id: 2, visit_result: 'Tidak ada order', checkin_at: '2026-09-20T08:20:00Z', duration_minutes: 10 },
        { id: 1, visit_result: 'Pesanan didapat', checkin_at: '2026-09-10T03:00:00Z', duration_minutes: 25 },
      ],
    })
    api.getCustomerActivity.mockResolvedValue({
      items: [
        entry('checkout', 'Check-out', 'Visit completed at UD Sentosa Jaya', '2026-09-20T08:30:00Z'),
        entry('checkin', 'Check-in', 'Store photo & GPS recorded · 12 m from store', '2026-09-20T08:20:00Z'),
      ],
      total: 2,
    })
    const user = userEvent.setup()
    shell()

    expect(await screen.findByText('Store Information')).toBeInTheDocument() // tab Info default

    await user.click(screen.getByRole('button', { name: 'Activity' }))
    expect(await screen.findByText('Visit completed at UD Sentosa Jaya')).toBeInTheDocument()
    expect(api.getCustomerActivity).toHaveBeenCalledWith(8, { limit: 10 })
    expect(within(screen.getByText('TOTAL VISITS').closest('.cd-stat')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByText('LAST VISIT STATUS').closest('.cd-stat')).getByText('Tidak ada order')).toBeInTheDocument()
    expect(screen.getByText(/Last visit recorded on/)).toBeInTheDocument()
    expect(screen.getByText('Store photo & GPS recorded · 12 m from store')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /View all activity/ })).not.toBeInTheDocument() // total <= 10
    expect(screen.queryByText('Store Information')).not.toBeInTheDocument() // tab Info tersembunyi
  })

  it('customer tanpa kunjungan menampilkan "Belum pernah dikunjungi", bukan error', async () => {
    api.getCustomer.mockResolvedValue({ ...baseCustomer, visits: [] })
    const user = userEvent.setup()
    shell()
    await user.click(await screen.findByRole('button', { name: 'Activity' }))
    expect(within(screen.getByText('TOTAL VISITS').closest('.cd-stat')).getByText('0')).toBeInTheDocument()
    expect(screen.getByText('Belum pernah dikunjungi')).toBeInTheDocument()
    expect(await screen.findByText('Belum ada aktivitas tercatat')).toBeInTheDocument()
    expect(screen.queryByText(/Last visit recorded on/)).not.toBeInTheDocument()
  })

  it('lebih dari 10 log: tombol "View all" membuka halaman semua log', async () => {
    api.getCustomer.mockResolvedValue({ ...baseCustomer })
    const ten = Array.from({ length: 10 }, (_, i) =>
      entry('task', `Tugas ${i + 1}`, 'NEXT · TRTK', `2026-09-${String(10 + i).padStart(2, '0')}T08:00:00Z`),
    )
    api.getCustomerActivity.mockResolvedValue({ items: ten, total: 25 })
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Activity' }))
    await user.click(await screen.findByRole('button', { name: /View all activity \(25\)/ }))

    expect(await screen.findByText('Activity History', { selector: '.tt div' })).toBeInTheDocument()
    await waitFor(() => expect(api.getCustomerActivity).toHaveBeenLastCalledWith('8', { limit: 1000 }))
  })
})

describe('CustomerDetail: Delegate PIC (dokumen hal. 20)', () => {
  const targets = [
    { id: 3, name: 'Vieka Putri', salesperson_code: 'VIE', territory: 'Bekasi' },
    { id: 4, name: 'Ahmad Fauzi', salesperson_code: 'AHM', territory: 'Jakarta' },
  ]

  it('PIC saat ini memilih sales, menekan Delegate, lalu tombol hilang karena sudah bukan PIC', async () => {
    api.getCustomer.mockResolvedValue({ ...baseCustomer })
    api.getPicTargets.mockResolvedValue(targets)
    api.delegatePic.mockResolvedValue({ id: 8, salesperson_id: 3 })
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Delegate PIC to Another Sales' }))
    expect(await screen.findByText('Vieka Putri')).toBeInTheDocument()
    expect(screen.getByText(/Hand over PIC for/)).toBeInTheDocument()
    expect(api.getPicTargets).toHaveBeenCalledWith(8)
    expect(screen.getByText('VIE · Bekasi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delegate' })).toBeDisabled() // belum ada yang dipilih

    await user.click(screen.getByText('Vieka Putri'))
    await user.click(screen.getByRole('button', { name: 'Delegate to Vieka' }))

    await waitFor(() => expect(api.delegatePic).toHaveBeenCalledWith(8, { to_user_id: 3 }))
    expect(await screen.findByText('PIC dipindahkan ke Vieka Putri')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Delegate PIC to Another Sales' })).not.toBeInTheDocument(),
    )
  })

  it('kolom cari menyaring nama, kode, atau wilayah', async () => {
    api.getCustomer.mockResolvedValue({ ...baseCustomer })
    api.getPicTargets.mockResolvedValue(targets)
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Delegate PIC to Another Sales' }))
    await screen.findByText('Vieka Putri')
    await user.type(screen.getByPlaceholderText('Search name / code / area'), 'AHM')
    expect(screen.queryByText('Vieka Putri')).not.toBeInTheDocument()
    expect(screen.getByText('Ahmad Fauzi')).toBeInTheDocument()
  })

  it('galat dari server ditampilkan dan lembar tetap terbuka', async () => {
    api.getCustomer.mockResolvedValue({ ...baseCustomer })
    api.getPicTargets.mockResolvedValue(targets)
    api.delegatePic.mockRejectedValue(new Error('Sales tujuan tidak valid'))
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Delegate PIC to Another Sales' }))
    await user.click(await screen.findByText('Ahmad Fauzi'))
    await user.click(screen.getByRole('button', { name: 'Delegate to Ahmad' }))
    expect(await screen.findByText('Sales tujuan tidak valid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delegate to Ahmad' })).toBeInTheDocument()
  })

  it('sales yang bukan PIC tidak melihat tombol; supervisor melihatnya', async () => {
    api.getCustomer.mockResolvedValue({ ...baseCustomer })
    auth.user = { id: 9, name: 'Orang Lain', role: 'sales' }
    const { unmount } = shell()
    expect(await screen.findByText('Store Information')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delegate PIC to Another Sales' })).not.toBeInTheDocument()
    unmount()

    auth.user = { id: 9, name: 'Supervisor', role: 'supervisor' }
    shell()
    expect(await screen.findByRole('button', { name: 'Delegate PIC to Another Sales' })).toBeInTheDocument()
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
