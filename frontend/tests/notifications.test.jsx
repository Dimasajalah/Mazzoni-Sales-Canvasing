import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 2, name: 'Budi', role: 'sales', sales_type: 'ORDER', can_order: true }, isAuthenticated: true, logout: () => {} }),
}))
vi.mock('../src/api/index.js', () => ({
  getCashAdvanceNotifications: vi.fn(), markCashAdvanceRead: vi.fn(), markAllCashAdvanceRead: vi.fn(),
}))

import * as api from '../src/api/index.js'
import NotificationBell from '../src/components/NotificationBell.jsx'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import { useUnreadNotifications } from '../src/hooks/useUnreadNotifications.js'
import Notifications from '../src/pages/Notifications.jsx'

const item = (over = {}) => ({
  id: 1, cash_desk_id: 'UJFIN', cash_desk_to: 'UJIMP', cash_desk_to_name: 'UJI MJU - Impress Fund', reference_num: 25,
  legal_number: 'MJ1-202610-0011', apply_date: '2026-10-12', amount: '400000.00', currency: 'IDR', read_at: null, ...over,
})

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/notifications']}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/notifications" element={<Notifications />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Pemberitahuan uang muka', () => {
  it('menampilkan jumlah, nomor dokumen, desk asal, dan tanggal; yang belum dibaca bertanda', async () => {
    api.getCashAdvanceNotifications.mockResolvedValue({ unread: 1, items: [item(), item({ id: 2, legal_number: 'MJ1-202610-0003', amount: '3350000.00', apply_date: '2026-10-09', read_at: '2026-10-10T01:00:00Z' })] })
    renderPage()

    expect(await screen.findByText('Pemberitahuan')).toBeInTheDocument()
    expect(screen.getAllByText('Uang muka diterima')).toHaveLength(2)
    expect(screen.getByText('Rp 400.000')).toBeInTheDocument()
    expect(screen.getByText('Rp 3.350.000')).toBeInTheDocument()
    expect(screen.getByText('No. MJ1-202610-0011 · dari UJFIN · 12 Okt 2026')).toBeInTheDocument()
    expect(screen.getByText('No. MJ1-202610-0003 · dari UJFIN · 9 Okt 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Belum dibaca\. Uang muka MJ1-202610-0011/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uang muka MJ1-202610-0003' })).toBeInTheDocument()
  })

  it('mengetuk pemberitahuan menandainya dibaca di server dan tanda baru hilang', async () => {
    api.getCashAdvanceNotifications.mockResolvedValue({ unread: 1, items: [item()] })
    api.markCashAdvanceRead.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Belum dibaca\./ }))

    await waitFor(() => expect(api.markCashAdvanceRead).toHaveBeenCalledWith(1))
    expect(await screen.findByRole('button', { name: 'Uang muka MJ1-202610-0011' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tandai semua dibaca/ })).not.toBeInTheDocument()
  })

  it('gagal menandai dibaca: tanda baru kembali dan tidak ada yang terhapus', async () => {
    api.getCashAdvanceNotifications.mockResolvedValue({ unread: 1, items: [item()] })
    api.markCashAdvanceRead.mockRejectedValue(new Error('Server sibuk'))
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Belum dibaca\./ }))

    expect(await screen.findByRole('button', { name: /Belum dibaca\./ })).toBeInTheDocument()
  })

  it('Tandai semua dibaca memanggil server sekali dan menghapus semua tanda baru', async () => {
    api.getCashAdvanceNotifications.mockResolvedValue({ unread: 2, items: [item(), item({ id: 2, legal_number: 'MJ1-202610-0003' })] })
    api.markAllCashAdvanceRead.mockResolvedValue({ unread: 0 })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Tandai semua dibaca (2)' }))

    await waitFor(() => expect(api.markAllCashAdvanceRead).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: /Belum dibaca\./ })).not.toBeInTheDocument()
  })

  it('belum ada pemberitahuan: pesan kosong', async () => {
    api.getCashAdvanceNotifications.mockResolvedValue({ unread: 0, items: [] })
    renderPage()
    expect(await screen.findByText('Belum ada pemberitahuan uang muka.')).toBeInTheDocument()
  })

  it('gagal memuat: pesan galat, bukan layar kosong', async () => {
    api.getCashAdvanceNotifications.mockRejectedValue(new Error('x'))
    renderPage()
    expect(await screen.findByText(/Gagal memuat pemberitahuan/)).toBeInTheDocument()
  })

  it('mata uang selain rupiah ditampilkan dengan kodenya', async () => {
    api.getCashAdvanceNotifications.mockResolvedValue({ unread: 0, items: [item({ currency: 'USD', amount: '250.00', read_at: 'x' })] })
    renderPage()
    expect(await screen.findByText(/^USD 250/)).toBeInTheDocument()
  })
})

describe('Lencana pemberitahuan', () => {
  it('lonceng menampilkan jumlah belum dibaca dan membuka halaman Pemberitahuan', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<NotificationBell unread={3} />} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pemberitahuan, 3 belum dibaca' }))
    expect((await screen.findByTestId('probe')).textContent).toBe('/notifications')
  })

  it('tanpa yang belum dibaca: tidak ada angka, dan di atas 99 menjadi 99+', () => {
    const { rerender } = render(
      <MemoryRouter><NotificationBell unread={0} /></MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Pemberitahuan' })).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()

    rerender(<MemoryRouter><NotificationBell unread={150} /></MemoryRouter>)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('hook mengambil jumlah belum dibaca dari server', async () => {
    api.getCashAdvanceNotifications.mockResolvedValue({ unread: 4, items: [] })
    function Probe2() {
      const { unread } = useUnreadNotifications(true, 600000)
      return <div data-testid="n">{unread}</div>
    }
    render(<Probe2 />)
    await waitFor(() => expect(screen.getByTestId('n').textContent).toBe('4'))
  })

  it('hook tidak memanggil server saat dinonaktifkan', async () => {
    function Probe3() {
      const { unread } = useUnreadNotifications(false)
      return <div data-testid="n">{unread}</div>
    }
    render(<Probe3 />)
    expect(screen.getByTestId('n').textContent).toBe('0')
    expect(api.getCashAdvanceNotifications).not.toHaveBeenCalled()
  })
})
