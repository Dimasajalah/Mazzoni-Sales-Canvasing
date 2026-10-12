import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({ getQuote: vi.fn() }))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import QuoteLines from '../src/pages/QuoteLines.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const CUSTOM_LINE = {
  id: 7, description: 'Tomato Sauce Custom B2B — Batch Trial', qty_kg: '450.000', qty_pcs: 4500, unit_price: '3000.00',
  line_total: '13230000.00',
  product: { part_num: 'CUSTOM-STM-R1247', revision: 'V2', product_group: 'Saus & Condiment', epicor_part_num: null, description: 'Tomato Sauce Custom' },
}
const REGISTERED_LINE = {
  id: 8, description: 'Chili Sauce 200 g', qty_kg: '100.000', qty_pcs: 500, unit_price: '2000.00', line_total: '1000000.00',
  product: { part_num: 'CHL-200', revision: null, product_group: 'Saus & Condiment', epicor_part_num: 'CHL-200-EP', description: 'Chili Sauce' },
}
const quoteOf = (over = {}) => ({
  id: 44, lead_id: 19, status: 'DRAFT', customer: { id: 12, name: 'RM Sari Bahari' }, total: '13230000.00', lines: [CUSTOM_LINE], ...over,
})

const renderPage = (state = { visit: { id: 21 } }) =>
  render(
    <MemoryRouter initialEntries={['/visit/21/quote', { pathname: '/quotes/44/lines', state }]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/quotes/:id/lines" element={<QuoteLines />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  api.getQuote.mockResolvedValue(quoteOf())
})

describe('Quotation — Lines List (dokumen hal. 33)', () => {
  it('menampilkan judul, tombol Add, petunjuk, kartu baris, tombol Add another line, dan footer Total Deal', async () => {
    renderPage()

    expect(await screen.findByText('Quotation Lines')).toBeInTheDocument()
    expect(screen.getByText('Quote 10019 · RM Sari Bahari')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(
      screen.getByText('1 line on this Quotation — tap a line to view or edit its UOM conversion, pricing & discount.'),
    ).toBeInTheDocument()

    const card = screen.getByText('Tomato Sauce Custom B2B — Batch Trial').closest('button')
    expect(within(card).getByText('1')).toBeInTheDocument()
    expect(within(card).getByText('Saus & Condiment · CUSTOM-STM-R1247 / V2')).toBeInTheDocument()
    expect(within(card).getByText('4.500 PCS')).toBeInTheDocument()
    expect(card).toHaveTextContent('450 KG →')
    expect(card).toHaveTextContent('13.500.000') // Gross Value = pcs x harga
    expect(within(card).getByText('Custom B2B — not yet a registered Part')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Add another line — pick from an approved sample' })).toBeInTheDocument()
    expect(screen.getByText(/opens Add Line, where you pick an approved sample to pull from/)).toBeInTheDocument()
    expect(screen.getByText('Total Deal (1 line)')).toBeInTheDocument()
    expect(screen.getByText(/13\.230\.000/)).toBeInTheDocument() // Total Deal setelah diskon
    expect(screen.getByRole('button', { name: 'Done — Back to Quotation' })).toBeInTheDocument()
  })

  it('beberapa baris: bernomor berurutan, badge hanya untuk produk belum teregister, dan footer jamak', async () => {
    api.getQuote.mockResolvedValue(quoteOf({ lines: [CUSTOM_LINE, REGISTERED_LINE], total: '14230000.00' }))
    renderPage()

    expect(await screen.findByText('2 lines on this Quotation — tap a line to view or edit its UOM conversion, pricing & discount.')).toBeInTheDocument()
    expect(screen.getByText('Total Deal (2 lines)')).toBeInTheDocument()

    const second = screen.getByText('Chili Sauce 200 g').closest('button')
    expect(within(second).getByText('2')).toBeInTheDocument()
    expect(within(second).getByText('Saus & Condiment · CHL-200')).toBeInTheDocument() // tanpa revisi
    expect(within(second).queryByText(/not yet a registered Part/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Custom B2B — not yet a registered Part')).toHaveLength(1)
  })

  it('belum ada baris: petunjuk kosong dan ajakan menambah baris pertama', async () => {
    api.getQuote.mockResolvedValue(quoteOf({ lines: [], total: '0.00' }))
    renderPage()

    expect(await screen.findByText('No lines on this Quotation yet — tap Add to pick an approved sample.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add the first line — pick from an approved sample' })).toBeInTheDocument()
    expect(screen.getByText('Total Deal (0 lines)')).toBeInTheDocument()
  })

  it('Add membuka layar Add Line (10f)', async () => {
    const user = userEvent.setup()

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Add' }))
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines/add')
  })

  it('ketukan pada baris membuka Line Detail baris itu', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Tomato Sauce Custom B2B — Batch Trial'))
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines/7')
  })

  it('Add another line menuju tujuan yang sama dengan Add', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Add another line — pick from an approved sample' }))
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines/add')
  })

  it('Done kembali ke halaman Quotation (header) kunjungan yang sama', async () => {
    const user = userEvent.setup()
    renderPage({ visit: { id: 21 } })
    await user.click(await screen.findByRole('button', { name: 'Done — Back to Quotation' }))
    expect((await screen.findByTestId('probe')).textContent).toBe('/visit/21/quote')
  })

  it('Done tanpa data kunjungan: kembali satu langkah', async () => {
    const user = userEvent.setup()
    renderPage(null)
    await user.click(await screen.findByRole('button', { name: 'Done — Back to Quotation' }))
    expect((await screen.findByTestId('probe')).textContent).toBe('/visit/21/quote')
  })

  it('Quotation yang sudah ditutup: Add dan Add another line dinonaktifkan, baris tetap bisa dibuka', async () => {
    api.getQuote.mockResolvedValue(quoteOf({ status: 'WON' }))
    renderPage()

    await screen.findByText('Quotation Lines')
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add another line — pick from an approved sample' })).toBeDisabled()
    expect(screen.getByText('Tomato Sauce Custom B2B — Batch Trial').closest('button')).not.toBeDisabled()
  })

  it('bilah menu bawah disembunyikan selama layar tampil dan kembali setelah ditinggalkan', async () => {
    const { unmount } = renderPage()
    await screen.findByText('Quotation Lines')
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(true)
    unmount()
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(false)
  })

  it('Quotation tidak ditemukan: pesan, bukan daftar', async () => {
    api.getQuote.mockRejectedValue(new Error('Quotation tidak ditemukan'))
    renderPage()
    await waitFor(() => expect(screen.getByText('Quotation tidak ditemukan.')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Done — Back to Quotation' })).not.toBeInTheDocument()
  })
})
