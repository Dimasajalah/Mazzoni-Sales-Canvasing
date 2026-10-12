import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }),
}))
vi.mock('../src/api/index.js', () => ({
  getVisit: vi.fn(), getQuotes: vi.fn(), getQuote: vi.fn(), bindQuotePart: vi.fn(), confirmQuoteOrder: vi.fn(),
  concludeLeadTask: vi.fn(), getLeadPromos: vi.fn(), getPromos: vi.fn(), removeLeadPromo: vi.fn(), searchQuoteProducts: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import { getQueued, WIN_PAYLOAD } from '../src/lib/orderQueue.js'
import OrderCheckout from '../src/pages/OrderCheckout.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const CLOSING = { id: 55, seq: 40, name: 'Order', is_closing: true, status: 'OPEN', actions: ['order'] }
const visitOf = (task = CLOSING) => ({
  id: 21, customer: null,
  lead: { id: 19, business_name: 'RM Sari Bahari', customer_id: 12, task_set_id: 1, current_task: task },
})
const LINE = {
  id: 7, product_id: 31, description: 'Tomato Sauce Custom B2B — Batch Trial', qty_kg: '450.000', gramasi_gr: '100.00',
  qty_pcs: 4500, unit_price: '3000.00', line_total: '13230000.00',
  product: { part_num: 'CUSTOM-STM-R1247', revision: 'V2', product_group: 'Saus & Condiment', epicor_part_num: null },
}
const quoteOf = (over = {}) => ({
  id: 44, lead_id: 19, status: 'WON', customer_po: 'PO-NUR-1006', payment_term: '30D',
  subtotal: '13500000.00', discount_total: '270000.00', total: '13230000.00', lines: [LINE], ...over,
})
const BOUND = quoteOf({ lines: [{ ...LINE, product: { ...LINE.product, part_num: 'STM-100', revision: null, epicor_part_num: 'STM-100-EP' } }] })

const renderPage = (state = { visit: visitOf() }, path = '/visit/21/order') =>
  render(
    <MemoryRouter initialEntries={['/choose-activity/21', state ? { pathname: path, state } : path]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/visit/:id/order" element={<OrderCheckout />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setOnline(true)
  auth.user = { id: 2, name: 'Budi', role: 'sales', sales_type: 'ORDER', can_order: true }
  api.getQuotes.mockResolvedValue({ data: [{ id: 44 }] })
  api.getQuote.mockResolvedValue(quoteOf())
  api.getPromos.mockResolvedValue({ data: [{ id: 1, promo_code: 'MZN10FREE1', name: 'Buy 10 ctn, get 1 FREE' }] })
  api.getLeadPromos.mockResolvedValue([{ promo_ref: 'MZN10FREE1', promo_name: 'Buy 10 ctn, get 1 FREE' }])
  api.searchQuoteProducts.mockResolvedValue({ products: [], groups: [] })
})

afterEach(() => setOnline(true))

describe('Sales Order / Checkout (dokumen hal. 37)', () => {
  it('menampilkan susunan dokumen dengan Part yang belum terikat: Confirm Part, ringkasan, promo, total, dan Confirm terkunci', async () => {
    renderPage()

    expect(await screen.findByText('Register New Order')).toBeInTheDocument()
    expect(await screen.findByText('RM Sari Bahari · from Quote 10019 (Win)')).toBeInTheDocument()
    expect(screen.queryByText('No signal')).not.toBeInTheDocument()

    expect(screen.getByText('Confirm Part — required before order')).toBeInTheDocument()
    expect(screen.getByText(/Part CUSTOM-STM-R1247 \/ Rev V2 · From the won Quotation line · Product Group: Saus & Condiment/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/Not yet bound to a registered Epicor Part\. Search within Saus & Condiment/)
    expect(screen.getByRole('alert')).toHaveTextContent(/a new custom B2B part needs Sales Admin to register it first/)
    expect(screen.getByPlaceholderText('Search registered part in Saus & Condiment…')).toBeInTheDocument()
    expect(screen.getByText('Confirm Sales Order stays disabled until a registered Part is bound here.')).toBeInTheDocument()

    expect(screen.getByText('Order Summary')).toBeInTheDocument()
    expect(screen.getByText('PO-NUR-1006')).toBeInTheDocument()
    expect(screen.getByText('30 Days')).toBeInTheDocument()
    expect(screen.getByText('Tomato Sauce Custom B2B — Batch Trial 100gr')).toBeInTheDocument()
    expect(screen.getByText(/450 kg \(4,500 pcs\) · @Rp 3\.000/)).toBeInTheDocument()

    expect(screen.getByText('Promo Applied')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.getByText('Buy 10 ctn, get 1 FREE')).toBeInTheDocument()
    expect(screen.getByText('Code MZN10FREE1 · applied at order level, before Save')).toBeInTheDocument()

    expect(screen.getByText('Totals')).toBeInTheDocument()
    expect(screen.getByText('Total Gross').parentElement).toHaveTextContent('13.500.000')
    expect(screen.getByText('Discount 1 (2%)').parentElement).toHaveTextContent('270.000')
    expect(screen.getByText('Promo Bonus').parentElement).toHaveTextContent('1 ctn free')
    expect(screen.getByText('Total Deal').parentElement).toHaveTextContent('13.230.000')

    expect(screen.getByRole('button', { name: 'Confirm Sales Order 🔒 — bind part first' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled()
    expect(screen.getByText(/No print-out here — the SSRS quotation PDF is downloaded from the Quotation screen, before Win\./)).toBeInTheDocument()
  })

  it('mengikat Part: cari dalam Product Group baris, pilih Part terdaftar, lalu Confirm terbuka', async () => {
    api.getQuote.mockResolvedValueOnce(quoteOf()).mockResolvedValue(BOUND)
    api.searchQuoteProducts.mockResolvedValue({
      products: [{ id: 90, part_num: 'STM-100', revision: null, description: 'Tomato Sauce 100 g', product_group: 'Saus & Condiment', epicor_part_num: 'STM-100-EP' }],
      groups: [],
    })
    api.bindQuotePart.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByPlaceholderText('Search registered part in Saus & Condiment…'), 'saus')
    await waitFor(() =>
      expect(api.searchQuoteProducts).toHaveBeenCalledWith(44, { q: 'saus', product_group: 'Saus & Condiment', registered: 1 }),
    )
    await user.click(await screen.findByText('STM-100'))

    await waitFor(() => expect(api.bindQuotePart).toHaveBeenCalledWith(44, 7, 90))
    expect(await screen.findByText('✓ All parts are registered Epicor Parts.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm Sales Order' })).toBeEnabled()
  })

  it('Confirm online: membuat Sales Order, menutup tugas penutup dengan Win, lalu ke daftar order', async () => {
    api.getQuote.mockResolvedValue(BOUND)
    api.confirmQuoteOrder.mockResolvedValue({ order: { order_number: 'SO-0001' } })
    api.concludeLeadTask.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Confirm Sales Order' }))

    await waitFor(() =>
      expect(api.confirmQuoteOrder).toHaveBeenCalledWith(44, { customer_id: 12, customer_po: 'PO-NUR-1006', destination: 'HO' }),
    )
    expect(api.concludeLeadTask).toHaveBeenCalledWith(55, WIN_PAYLOAD)
    expect((await screen.findByTestId('probe')).textContent).toBe('/orders')
    expect(getQueued(44)).toBeNull()
  })

  it('tugas aktif bukan tugas penutup: order dibuat tanpa menutup tugas', async () => {
    api.getQuote.mockResolvedValue(BOUND)
    api.confirmQuoteOrder.mockResolvedValue({ order: { order_number: 'SO-0002' } })
    const user = userEvent.setup()
    renderPage({ visit: visitOf({ ...CLOSING, is_closing: false }) })

    await user.click(await screen.findByRole('button', { name: 'Confirm Sales Order' }))
    await waitFor(() => expect(api.confirmQuoteOrder).toHaveBeenCalledTimes(1))
    expect(api.concludeLeadTask).not.toHaveBeenCalled()
  })

  it('offline: banner No signal, Confirm menyimpan di perangkat tanpa memanggil server', async () => {
    api.getQuote.mockResolvedValue(BOUND)
    setOnline(false)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('No signal')).toBeInTheDocument()
    expect(screen.getByText(/Order saved on this device\. It will sync and get an Order Number automatically once your connection returns\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm Sales Order' }))

    expect(api.confirmQuoteOrder).not.toHaveBeenCalled()
    expect(await screen.findByText(/Saved locally at \d\d:\d\d · will sync automatically once online/)).toBeInTheDocument()
    expect(getQueued(44)).toMatchObject({ status: 'pending', closingTaskId: 55, payload: { customer_id: 12, customer_po: 'PO-NUR-1006', destination: 'HO' } })
  })

  it('jaringan terputus saat mengirim: order masuk antrean lokal', async () => {
    api.getQuote.mockResolvedValue(BOUND)
    api.confirmQuoteOrder.mockRejectedValue(Object.assign(new Error('Failed to fetch'), { name: 'TypeError' }))
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Confirm Sales Order' }))
    expect(await screen.findByText(/Saved locally at \d\d:\d\d · will sync automatically once online/)).toBeInTheDocument()
    expect(getQueued(44)).toMatchObject({ status: 'pending' })
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument() // tetap di layar ini
  })

  it('galat dari server (bukan jaringan): tidak masuk antrean dan tetap di layar', async () => {
    api.getQuote.mockResolvedValue(BOUND)
    api.confirmQuoteOrder.mockRejectedValue(new Error('Pilih customer untuk order ini.'))
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Confirm Sales Order' }))
    await waitFor(() => expect(api.confirmQuoteOrder).toHaveBeenCalled())
    expect(getQueued(44)).toBeNull()
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument()
  })

  it('Save Draft: tersimpan di perangkat sebagai draft (tidak dikirim)', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Save Draft' }))

    expect(await screen.findByText(/Draft saved locally at \d\d:\d\d/)).toBeInTheDocument()
    expect(getQueued(44)).toMatchObject({ status: 'draft' })
    expect(api.confirmQuoteOrder).not.toHaveBeenCalled()
  })

  it('catatan lokal dari sesi sebelumnya tampil saat layar dibuka lagi', async () => {
    localStorage.setItem('mazzoni.orderQueue', JSON.stringify([{ quoteId: 44, status: 'pending', savedAt: new Date(2026, 9, 12, 14, 52).toISOString(), payload: {} }]))
    renderPage()
    expect(await screen.findByText('Saved locally at 14:52 · will sync automatically once online')).toBeInTheDocument()
  })

  it('melepas promo dengan tanda ×', async () => {
    api.removeLeadPromo.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Remove promo MZN10FREE1' }))
    await waitFor(() => expect(api.removeLeadPromo).toHaveBeenCalledWith(19, 'MZN10FREE1'))
    await waitFor(() => expect(screen.queryByText('Promo Applied')).not.toBeInTheDocument())
  })

  it('tanpa promo yang dipasang: kartu Promo Applied dan baris Promo Bonus tidak ada', async () => {
    api.getLeadPromos.mockResolvedValue([])
    renderPage()
    await screen.findByText('Totals')
    expect(screen.queryByText('Promo Applied')).not.toBeInTheDocument()
    expect(screen.queryByText('Promo Bonus')).not.toBeInTheDocument()
  })

  it('Sales Dealmaker: pesan, bukan layar order', async () => {
    auth.user = { id: 3, name: 'Rina', role: 'sales', sales_type: 'DEALMAKER', can_order: false }
    renderPage()
    expect(await screen.findByText(/Sales Dealmaker tidak dapat membuat order/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirm Sales Order/ })).not.toBeInTheDocument()
  })

  it('prospek tanpa Quotation: pesan', async () => {
    api.getQuotes.mockResolvedValue({ data: [] })
    renderPage()
    expect(await screen.findByText('Quotation untuk prospek ini belum ada.')).toBeInTheDocument()
  })

  it('dibuka tanpa state (refresh): mengambil data kunjungan dari server', async () => {
    api.getVisit.mockResolvedValue(visitOf())
    renderPage(null)
    expect(await screen.findByText('Confirm Part — required before order')).toBeInTheDocument()
    expect(api.getVisit).toHaveBeenCalledWith('21')
  })

  it('bilah menu bawah disembunyikan selama layar tampil dan kembali setelah ditinggalkan', async () => {
    const { unmount } = renderPage()
    await screen.findByText('Register New Order')
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(true)
    unmount()
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(false)
  })
})

