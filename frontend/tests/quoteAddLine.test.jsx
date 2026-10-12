import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({ getQuote: vi.fn(), getApprovedSamples: vi.fn(), searchQuoteProducts: vi.fn() }))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import QuoteAddLine from '../src/pages/QuoteAddLine.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname + loc.search}</div>
}

const USED = {
  id: 12, followup_number: 2, product_group: 'Saus & Condiment', part: 'CUSTOM-STM-R1247', rev: 'V2',
  description: 'Tomato Sauce Custom B2B — Batch Trial', package_size_gr: 100, qty_given: '2 pcs', used_on_line: 1,
  registered_product_id: null,
}
const REGISTERED = {
  id: 16, followup_number: 1, product_group: 'Saus & Condiment', part: 'SAMBAL-250', rev: null,
  description: 'Sambal Pedas Reguler — 250ml', package_size_gr: 250, qty_given: '2 pcs', used_on_line: null,
  registered_product_id: 77, registered_price: '6000.00',
}
const CUSTOM = {
  id: 15, followup_number: 3, product_group: 'Saus & Condiment', part: 'CUSTOM-STM-R1300', rev: 'V3',
  description: 'Tomato Sauce Custom B2B — Batch 3', package_size_gr: 150, qty_given: '2 pcs', used_on_line: null,
  registered_product_id: null,
}
const PRODUCT = {
  id: 50, part_num: 'KCP-1', description: 'Kecap Manis 135 ml', product_group: 'Kecap', revision: null, epicor_part_num: null, price: '4500.00',
}
const quoteOf = (over = {}) => ({
  id: 44, lead_id: 19, status: 'DRAFT', customer: { id: 12, name: 'RM Sari Bahari' }, lines: [{ id: 1 }], ...over,
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/quotes/44/lines', { pathname: '/quotes/44/lines/add', state: { visit: { id: 21 } } }]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/quotes/:id/lines/add" element={<QuoteAddLine />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  api.getQuote.mockResolvedValue(quoteOf())
  api.getApprovedSamples.mockResolvedValue([USED, REGISTERED])
  api.searchQuoteProducts.mockResolvedValue({ products: [PRODUCT], groups: ['Kecap', 'Saus & Condiment'] })
})

describe('Quotation — Add Line (dokumen hal. 35)', () => {
  it('menampilkan susunan dokumen: petunjuk, jumlah sample, kartu yang dipakai, kartu aktif, dan jalur manual', async () => {
    renderPage()

    expect(await screen.findByText('Add Line')).toBeInTheDocument()
    expect(screen.getByText('Quote QUO-10019 · RM Sari Bahari')).toBeInTheDocument()
    expect(screen.getByText(/Pick an approved sample for this customer to pull its product & qty straight into a new Quotation Line/)).toBeInTheDocument()
    expect(screen.getByText('From Approved Samples (2)')).toBeInTheDocument()

    // sample yang sudah dipakai: pudar, tanda centang, dan pil "Already on Line 1"
    const used = screen.getByText('Tomato Sauce Custom B2B — Batch Trial').closest('button')
    expect(used).toBeDisabled()
    expect(used).toHaveTextContent('✓')
    expect(used).toHaveTextContent('Follow Up Sample 2 · Reason: Sample Cocok')
    expect(used).toHaveTextContent('Already on Line 1')

    // sample aktif: nomor Line berikutnya (sudah ada 1 baris, jadi 2), badge Reguler, dan tanda ›
    const available = screen.getByText('Sambal Pedas Reguler — 250ml').closest('button')
    expect(available).not.toBeDisabled()
    expect(available).toHaveTextContent('2')
    expect(available).toHaveTextContent('Follow Up Sample 1 · Reason: Sample Cocok')
    expect(available).toHaveTextContent('Reguler — already a registered Part')

    expect(screen.getByText(/Tapping a sample above pulls its Product Group, Part\/Rev, Qty & Packaging into a new Line/)).toBeInTheDocument()
    expect(screen.getByText('Or add manually')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Blank Line — search Product Group / Part' })).toBeInTheDocument()
    expect(screen.getByText(/no approved-sample badge will show on that line/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('sample Custom B2B yang tersedia berbadge kuning "not yet a registered Part"', async () => {
    api.getApprovedSamples.mockResolvedValue([CUSTOM])
    renderPage()
    const card = (await screen.findByText('Tomato Sauce Custom B2B — Batch 3')).closest('button')
    expect(card).toHaveTextContent('Custom B2B — not yet a registered Part')
    expect(card).not.toHaveTextContent('Reguler')
    expect(screen.getByText('From Approved Samples (1)')).toBeInTheDocument()
  })

  it('mengetuk sample yang tersedia membuka Line baru di 10c untuk ditinjau', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Sambal Pedas Reguler — 250ml'))
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines/new?sample=16')
  })

  it('sample yang sudah dipakai tidak bisa diketuk', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Tomato Sauce Custom B2B — Batch Trial'))
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument() // tetap di layar Add Line
    expect(screen.getByText('Add Line')).toBeInTheDocument()
  })

  it('Cancel kembali ke daftar baris tanpa membuat apa pun', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines')
  })

  it('belum ada sample yang disetujui: petunjuk kosong, jalur manual tetap ada', async () => {
    api.getApprovedSamples.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/No approved sample for this customer yet/)).toBeInTheDocument()
    expect(screen.getByText('From Approved Samples (0)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add Blank Line/ })).toBeInTheDocument()
  })

  it('Add Blank Line: cari berdasarkan Product Group dan teks, lalu pilih produk membuka Line baru di 10c', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Add Blank Line/ }))

    await waitFor(() => expect(api.searchQuoteProducts).toHaveBeenCalledWith('44', { q: '', product_group: '' }))
    expect(await screen.findByText('Kecap Manis 135 ml')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Part / Description'), 'kecap')
    await waitFor(() => expect(api.searchQuoteProducts).toHaveBeenCalledWith('44', { q: 'kecap', product_group: '' }))

    await user.selectOptions(screen.getByLabelText('Product Group'), 'Kecap')
    await waitFor(() => expect(api.searchQuoteProducts).toHaveBeenCalledWith('44', { q: 'kecap', product_group: 'Kecap' }))

    await user.click(await screen.findByText('Kecap Manis 135 ml'))
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines/new?product=50')
  })

  it('Quotation yang sudah ditutup: sample dan Add Blank Line dinonaktifkan', async () => {
    api.getQuote.mockResolvedValue(quoteOf({ status: 'WON' }))
    renderPage()

    await screen.findByText('Add Line')
    expect(screen.getByText('Sambal Pedas Reguler — 250ml').closest('button')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Add Blank Line/ })).toBeDisabled()
    expect(screen.getByText(/Quotation sudah ditutup \(WON\)/)).toBeInTheDocument()
  })

  it('bilah menu bawah disembunyikan selama layar tampil dan kembali setelah ditinggalkan', async () => {
    const { unmount } = renderPage()
    await screen.findByText('Add Line')
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(true)
    unmount()
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(false)
  })
})
