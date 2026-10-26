import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getStarOutlets: vi.fn(), getStarOutletCandidates: vi.fn(), createStarOutlet: vi.fn(), updateStarOutlet: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import StarOutletForm from '../src/pages/StarOutletForm.jsx'
import StarOutlets from '../src/pages/StarOutlets.jsx'

function Probe() {
  return <div data-testid="probe">{useLocation().pathname}</div>
}

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/star-outlets" element={<StarOutlets />} />
            <Route path="/marketing/star-outlets/new" element={<StarOutletForm />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const star = (over = {}) => ({
  id: 1, active: true, requested_by: 'PT Distributor Jaya', request_reference: 'REQ/01',
  activated_at: '2026-10-20T03:00:00.000000Z', deactivated_at: null,
  customer: { id: 5, customer_code: 'C-005', name: 'Toko Bintang', city: 'Bandung' }, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Mgr', role: 'supervisor' }
  api.getStarOutletCandidates.mockResolvedValue([
    { id: 5, customer_code: 'C-005', name: 'Toko Bintang', city: 'Bandung', star_status: null },
    { id: 6, customer_code: 'C-006', name: 'Toko Sudah Star', city: null, star_status: 'ACTIVE' },
  ])
})

describe('Daftar Star Outlet', () => {
  it('menampilkan jumlah aktif, memfilter status, dan mencari', async () => {
    api.getStarOutlets.mockResolvedValue([
      star(),
      star({ id: 2, active: false, deactivated_at: '2026-10-21T03:00:00.000000Z', customer: { id: 7, customer_code: 'C-007', name: 'Toko Mati', city: null } }),
    ])
    const user = userEvent.setup()
    shell(['/marketing/star-outlets'])

    expect(await screen.findByText('Toko Bintang')).toBeInTheDocument()
    expect(screen.getByTestId('star-active-count')).toHaveTextContent('1')
    await user.click(screen.getByRole('button', { name: 'Nonaktif' }))
    expect(screen.queryByText('Toko Bintang')).not.toBeInTheDocument()
    expect(screen.getByText('Toko Mati')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Semua' }))
    await user.type(screen.getByLabelText('Cari outlet'), 'bintang')
    expect(screen.queryByText('Toko Mati')).not.toBeInTheDocument()
    expect(screen.getByText('Toko Bintang')).toBeInTheDocument()
  })

  it('menonaktifkan setelah konfirmasi', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.getStarOutlets.mockResolvedValue([star()])
    api.updateStarOutlet.mockResolvedValue({ id: 1, active: false, deactivated_at: '2026-10-21T03:00:00.000000Z' })
    const user = userEvent.setup()
    shell(['/marketing/star-outlets'])

    await user.click(await screen.findByRole('switch', { name: /Toko Bintang/ }))
    await waitFor(() => expect(api.updateStarOutlet).toHaveBeenCalledWith(1, { active: false }))
    await waitFor(() => expect(screen.getByRole('switch', { name: /Toko Bintang/ })).toHaveAttribute('aria-checked', 'false'))
  })

  it('batal konfirmasi: status tidak berubah dan tidak ada permintaan', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    api.getStarOutlets.mockResolvedValue([star()])
    const user = userEvent.setup()
    shell(['/marketing/star-outlets'])

    await user.click(await screen.findByRole('switch', { name: /Toko Bintang/ }))
    expect(api.updateStarOutlet).not.toHaveBeenCalled()
  })

  it('mengaktifkan kembali outlet nonaktif tanpa konfirmasi', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    api.getStarOutlets.mockResolvedValue([star({ active: false, deactivated_at: '2026-10-21T03:00:00.000000Z' })])
    api.updateStarOutlet.mockResolvedValue({ id: 1, active: true, deactivated_at: null, activated_at: '2026-10-22T03:00:00.000000Z' })
    const user = userEvent.setup()
    shell(['/marketing/star-outlets'])

    await user.click(await screen.findByRole('switch', { name: /Toko Bintang/ }))
    await waitFor(() => expect(api.updateStarOutlet).toHaveBeenCalledWith(1, { active: true }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('pengguna sales tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/star-outlets'])
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getStarOutlets).not.toHaveBeenCalled()
  })
})

describe('Form Star Outlet', () => {
  it('menolak simpan tanpa memilih outlet', async () => {
    const user = userEvent.setup()
    shell(['/marketing/star-outlets/new'])
    await user.click(screen.getByRole('button', { name: 'Aktifkan Star Outlet' }))
    expect(await screen.findByText('Pilih outlet')).toBeInTheDocument()
    expect(api.createStarOutlet).not.toHaveBeenCalled()
  })

  it('menolak outlet yang sudah Star aktif', async () => {
    const user = userEvent.setup()
    shell(['/marketing/star-outlets/new'])
    await user.click(await screen.findByRole('button', { name: /Toko Sudah Star/ }))
    await user.click(screen.getByRole('button', { name: 'Aktifkan Star Outlet' }))
    expect(await screen.findByText('Outlet ini sudah Star Outlet aktif')).toBeInTheDocument()
    expect(api.createStarOutlet).not.toHaveBeenCalled()
  })

  it('mengirim payload yang benar lalu kembali ke daftar', async () => {
    api.createStarOutlet.mockResolvedValue({ id: 9 })
    api.getStarOutlets.mockResolvedValue([])
    const user = userEvent.setup()
    shell(['/marketing/star-outlets/new'])
    await user.type(screen.getByLabelText('Distributor Pengaju'), 'PT Distributor Jaya')
    await user.type(screen.getByLabelText('No. / Referensi Pengajuan'), 'REQ/01')
    await user.click(await screen.findByRole('button', { name: /Toko Bintang/ }))
    await user.click(screen.getByRole('button', { name: 'Aktifkan Star Outlet' }))

    await waitFor(() => expect(api.createStarOutlet).toHaveBeenCalledWith({
      customer_id: 5, requested_by: 'PT Distributor Jaya', request_reference: 'REQ/01',
    }))
    expect(await screen.findByText('Belum ada Star Outlet.')).toBeInTheDocument()
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.createStarOutlet.mockRejectedValue(new Error('Customer nonaktif tidak bisa dijadikan Star Outlet.'))
    const user = userEvent.setup()
    shell(['/marketing/star-outlets/new'])
    await user.click(await screen.findByRole('button', { name: /Toko Bintang/ }))
    await user.click(screen.getByRole('button', { name: 'Aktifkan Star Outlet' }))
    expect(await screen.findByText(/nonaktif tidak bisa/)).toBeInTheDocument()
  })
})
