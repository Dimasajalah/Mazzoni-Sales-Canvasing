import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({
  getVisit: vi.fn(), getPromos: vi.fn(), getLeadPromos: vi.fn(), applyLeadPromo: vi.fn(), removeLeadPromo: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import StorePromo from '../src/pages/StorePromo.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const dayFromNow = (n) => {
  const d = new Date(Date.now() + n * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const PROMOS = [
  { id: 1, promo_code: 'MZN10FREE1', name: 'Buy 10 ctn, get 1 FREE', description: 'Tomato Sauce & Mayonnaise line · min. order 10 carton', end_date: dayFromNow(4) },
  { id: 2, promo_code: 'WELCOME5', name: 'Extra 5% off first order', description: 'All product groups · one-time use for new NOO', end_date: dayFromNow(12) },
  { id: 3, promo_code: 'POSMFREE', name: 'Free POSM display pack', description: 'With Black Pepper Sauce order ≥ 15 ctn', end_date: dayFromNow(9) },
]
const visitOf = () => ({ id: 21, lead: { id: 19, business_name: 'RM Sari Bahari', task_set_id: 1 } })

const renderPage = (state = { visit: visitOf() }, path = '/visit/21/promo') =>
  render(
    <MemoryRouter initialEntries={['/choose-activity/21', state ? { pathname: path, state } : path]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/visit/:id/promo" element={<StorePromo />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const card = (title) => screen.getByText(title).closest('.pr-card')

beforeEach(() => {
  vi.clearAllMocks()
  api.getPromos.mockResolvedValue({ data: PROMOS })
  api.getLeadPromos.mockResolvedValue([])
})

describe('Promo for This Store (dokumen hal. 36)', () => {
  it('menampilkan judul, petunjuk, dan kartu promo bergradasi dengan badge, sisa waktu, ketentuan, kode, dan Apply', async () => {
    renderPage()

    expect(await screen.findByText('Promo for This Store')).toBeInTheDocument()
    expect(screen.getByText('RM Sari Bahari')).toBeInTheDocument()
    expect(screen.getByText('Separate from quotation discount — promos below apply automatically at the Sales Order step.')).toBeInTheDocument()

    const first = await waitFor(() => card('Buy 10 ctn, get 1 FREE'))
    expect(first).toHaveClass('active')
    expect(first).toHaveTextContent('ACTIVE')
    expect(first).toHaveTextContent('Tomato Sauce & Mayonnaise line · min. order 10 carton')
    expect(first).toHaveTextContent('Code: MZN10FREE1')
    expect(first).toHaveTextContent(/Ends in \d+d/)
    expect(within(first).getByRole('button', { name: /Apply/ })).toBeInTheDocument()

    expect(card('Extra 5% off first order')).toHaveClass('new')
    expect(card('Extra 5% off first order')).toHaveTextContent('NEW CUSTOMER')
    expect(card('Free POSM display pack')).toHaveClass('bundle')
    expect(card('Free POSM display pack')).toHaveTextContent('BUNDLE')
    expect(screen.getAllByRole('button', { name: /Apply/ })).toHaveLength(3)
  })

  it('hanya promo yang berlaku sekarang: yang sudah berakhir atau belum mulai disembunyikan', async () => {
    api.getPromos.mockResolvedValue({
      data: [
        ...PROMOS,
        { id: 8, promo_code: 'OLD1', name: 'Promo lama', end_date: dayFromNow(-2) },
        { id: 9, promo_code: 'SOON1', name: 'Promo nanti', start_date: dayFromNow(3), end_date: dayFromNow(10) },
      ],
    })
    renderPage()
    await waitFor(() => card('Buy 10 ctn, get 1 FREE'))
    expect(screen.queryByText('Promo lama')).not.toBeInTheDocument()
    expect(screen.queryByText('Promo nanti')).not.toBeInTheDocument()
  })

  it('Apply memasang promo ke prospek ini (sekali ketuk), tombol menjadi Applied dan bisa dilepas lagi', async () => {
    api.applyLeadPromo.mockResolvedValue({})
    api.removeLeadPromo.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    const first = await waitFor(() => card('Buy 10 ctn, get 1 FREE'))
    await user.click(within(first).getByRole('button', { name: /Apply/ }))
    await waitFor(() =>
      expect(api.applyLeadPromo).toHaveBeenCalledWith(19, { promo_ref: 'MZN10FREE1', promo_name: 'Buy 10 ctn, get 1 FREE' }),
    )
    expect(await within(first).findByRole('button', { name: /Applied/ })).toBeInTheDocument()

    await user.click(within(first).getByRole('button', { name: /Applied/ }))
    await waitFor(() => expect(api.removeLeadPromo).toHaveBeenCalledWith(19, 'MZN10FREE1'))
    expect(await within(first).findByRole('button', { name: /Apply/ })).toBeInTheDocument()
  })

  it('promo yang sudah dipasang sebelumnya langsung tampil sebagai Applied', async () => {
    api.getLeadPromos.mockResolvedValue([{ promo_ref: 'WELCOME5', promo_name: 'Extra 5% off first order' }])
    renderPage()

    const welcome = await waitFor(() => card('Extra 5% off first order'))
    expect(within(welcome).getByRole('button', { name: /Applied/ })).toBeInTheDocument()
    expect(within(card('Buy 10 ctn, get 1 FREE')).getByRole('button', { name: /Apply/ })).toBeInTheDocument()
  })

  it('gagal memasang promo: tombol tetap Apply', async () => {
    api.applyLeadPromo.mockRejectedValue(new Error('Gagal'))
    const user = userEvent.setup()
    renderPage()

    const first = await waitFor(() => card('Buy 10 ctn, get 1 FREE'))
    await user.click(within(first).getByRole('button', { name: /Apply/ }))
    await waitFor(() => expect(api.applyLeadPromo).toHaveBeenCalled())
    expect(within(first).getByRole('button', { name: /Apply/ })).toBeInTheDocument()
  })

  it('tanpa promo yang berlaku: pesan kosong', async () => {
    api.getPromos.mockResolvedValue({ data: [] })
    renderPage()
    expect(await screen.findByText('No promo is valid for this store right now.')).toBeInTheDocument()
  })

  it('dibuka tanpa state (refresh): mengambil data kunjungan dari server', async () => {
    api.getVisit.mockResolvedValue(visitOf())
    renderPage(null)
    expect(await screen.findByText('RM Sari Bahari')).toBeInTheDocument()
    expect(api.getVisit).toHaveBeenCalledWith('21')
  })

  it('bilah menu bawah disembunyikan selama layar tampil dan kembali setelah ditinggalkan', async () => {
    const { unmount } = renderPage()
    await screen.findByText('Promo for This Store')
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(true)
    unmount()
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(false)
  })
})
