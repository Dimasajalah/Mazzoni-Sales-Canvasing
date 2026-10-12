import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({
  getQuote: vi.fn(), saveQuoteLines: vi.fn(), getApprovedSamples: vi.fn(), searchQuoteProducts: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import QuoteLineDetail from '../src/pages/QuoteLineDetail.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const CUSTOM_LINE = {
  id: 7, product_id: 31, product_sample_id: 12, source_followup: { number: 2, reason: 'Sample Cocok' }, packaging_id: null,
  description: 'Tomato Sauce Custom B2B — Batch Trial',
  qty_kg: '450.000', gramasi_gr: '100.00', qty_pcs: 4500, unit_price: '3000.00', strata_percent: '0.00',
  disc1_percent: '2.00', disc2_percent: '0.00', disc3_percent: '0.00', disc4_percent: '0.00', line_total: '13230000.00',
  product: { part_num: 'CUSTOM-STM-R1247', revision: 'V2', product_group: 'Saus & Condiment', epicor_part_num: null },
}
const REGISTERED_LINE = {
  id: 8, product_id: 40, packaging_id: 5, description: 'Chili Sauce 200 g',
  qty_kg: '100.000', gramasi_gr: '200.00', qty_pcs: 480, unit_price: '2000.00', strata_percent: '0.00', // 480 = Qty Converted yang ditimpa
  disc1_percent: '0.00', disc2_percent: '0.00', disc3_percent: '0.00', disc4_percent: '0.00', line_total: '960000.00',
  product: { part_num: 'CHL-200', revision: null, product_group: 'Saus & Condiment', epicor_part_num: 'CHL-200-EP' },
}
const quoteOf = (over = {}) => ({
  id: 44, lead_id: 19, status: 'DRAFT',
  lines: [CUSTOM_LINE, REGISTERED_LINE], ...over,
})

const renderPage = (lineId = '7') =>
  render(
    <MemoryRouter initialEntries={['/quotes/44/lines', { pathname: `/quotes/44/lines/${lineId}`, state: { visit: { id: 21 } } }]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/quotes/:id/lines/new" element={<QuoteLineDetail />} />
            <Route path="/quotes/:id/lines/:lineId" element={<QuoteLineDetail />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const renderNew = (search) =>
  render(
    <MemoryRouter initialEntries={['/quotes/44/lines/add', { pathname: '/quotes/44/lines/new', search, state: { visit: { id: 21 } } }]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/quotes/:id/lines/new" element={<QuoteLineDetail />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const type = async (user, label, text) => {
  const el = screen.getByLabelText(label)
  await user.clear(el)
  if (text !== '') await user.type(el, text)
  return el
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getQuote.mockResolvedValue(quoteOf())
  window.confirm = vi.fn(() => true)
})

describe('Quotation — Line Detail (dokumen hal. 34)', () => {
  it('menampilkan susunan sesuai dokumen: chip, data produk, qty, konversi, harga, diskon, ringkasan, dan tombol', async () => {
    renderPage()

    expect(await screen.findByText('Line 1')).toBeInTheDocument()
    expect(screen.getAllByText('Tomato Sauce Custom B2B — Batch Trial').length).toBeGreaterThanOrEqual(1) // sub-judul dan deskripsi
    expect(screen.getByText('Pulled from Follow Up Sample 2 · Reason: Sample Cocok')).toBeInTheDocument()
    expect(screen.getByText('Custom B2B — not yet a registered Part')).toBeInTheDocument()

    // data produk baca-saja
    expect(screen.getByText(/Saus & Condiment/)).toBeInTheDocument()
    expect(screen.getByText('Part (free text)')).toBeInTheDocument()
    expect(screen.getByText('CUSTOM-STM-R1247')).toBeInTheDocument()
    expect(screen.getByText('Rev (free text)')).toBeInTheDocument()
    expect(screen.getByText('V2')).toBeInTheDocument()

    // isian
    expect(screen.getByLabelText('Qty Order (KG) *')).toHaveValue('450')
    expect(screen.getByLabelText('Packaging')).toHaveValue('100')
    expect(screen.getByLabelText('Packaging unit')).toHaveValue('GR')
    expect(within(screen.getByLabelText('Packaging unit')).getAllByRole('option').map((o) => o.textContent)).toEqual(['GR', 'KG'])
    expect(screen.getByLabelText('Qty Converted (PCS)')).toHaveValue('4.500')
    expect(screen.getByLabelText('Price / PCS (Rp) *')).toHaveValue('3.000')
    expect(screen.getByText(/auto-calculates — same UOM Class conversion/)).toBeInTheDocument()
    expect(screen.getByText('Gross Value').parentElement).toHaveTextContent('13.500.000')

    // diskon dan ringkasan
    expect(screen.getByText('Line Discount')).toBeInTheDocument()
    expect([1, 2, 3, 4].map((i) => screen.getByLabelText(`Disc ${i} (%)`).value)).toEqual(['2', '0', '0', '0'])
    expect(screen.getByText(/not at the Quote Header/)).toBeInTheDocument()
    expect(screen.getByText('Line Gross').parentElement).toHaveTextContent('13.500.000')
    expect(screen.getByText('Disc 1 (2%)').parentElement).toHaveTextContent('270.000')
    expect(screen.getByText('Line Total').parentElement).toHaveTextContent('13.230.000')

    expect(screen.getByRole('button', { name: 'Save Line — Back to Lines List' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Line' })).toBeInTheDocument()
  })

  it('Qty Converted dihitung otomatis dari Qty Order ÷ Packaging, dan Gross serta Line Total ikut berubah', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Line 1')

    await type(user, 'Qty Order (KG) *', '500')
    expect(screen.getByLabelText('Qty Converted (PCS)')).toHaveValue('5.000') // 500 kg ÷ 100 gr
    expect(screen.getByText('Gross Value').parentElement).toHaveTextContent('15.000.000')
    expect(screen.getByText('Line Total').parentElement).toHaveTextContent('14.700.000') // diskon 2%
  })

  it('satuan Packaging KG: 0,1 KG sama dengan 100 GR', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Line 1')

    await user.selectOptions(screen.getByLabelText('Packaging unit'), 'KG')
    await type(user, 'Packaging', '0,1')
    expect(screen.getByLabelText('Qty Converted (PCS)')).toHaveValue('4.500')
  })

  it('Qty Converted boleh ditimpa; dikosongkan kembali ke hitungan otomatis', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Line 1')

    await type(user, 'Qty Converted (PCS)', '4400')
    expect(screen.getByText('Gross Value').parentElement).toHaveTextContent('13.200.000') // 4.400 x 3.000

    await type(user, 'Qty Converted (PCS)', '')
    expect(screen.getByLabelText('Qty Converted (PCS)')).toHaveValue('') // sedang diedit, kosong
    fireEvent.blur(screen.getByLabelText('Qty Converted (PCS)'))
    expect(screen.getByLabelText('Qty Converted (PCS)')).toHaveValue('4.500')
  })

  it('diskon berjenjang: tiap kolom memotong sisa harga', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Line 1')

    await type(user, 'Disc 2 (%)', '5')
    expect(screen.getByText('Disc 2 (5%)').parentElement).toHaveTextContent('661.500') // 5% x 13.230.000
    expect(screen.getByText('Line Total').parentElement).toHaveTextContent('12.568.500')
  })

  it('diskon strata (dari server) tampil sebagai baris tersendiri sebelum Disc 1', async () => {
    api.getQuote.mockResolvedValue(quoteOf({ lines: [{ ...CUSTOM_LINE, strata_percent: '3.00' }, REGISTERED_LINE] }))
    renderPage()
    await screen.findByText('Line 1')

    expect(screen.getByText('Strata (3%)').parentElement).toHaveTextContent('405.000')
    expect(screen.getByText('Line Total').parentElement).toHaveTextContent('12.833.100')
  })

  it('Save Line: mengirim seluruh baris (baris lain apa adanya, termasuk Qty Converted yang ditimpa) lalu kembali ke daftar', async () => {
    api.saveQuoteLines.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Line 1')

    await type(user, 'Qty Order (KG) *', '500')
    await user.click(screen.getByRole('button', { name: 'Save Line — Back to Lines List' }))

    await waitFor(() =>
      expect(api.saveQuoteLines).toHaveBeenCalledWith(44, [
        {
          product_id: 31, sample_id: 12, qty_kg: 500, packaging_id: null, gramasi_gr: 100, unit_price: 3000,
          disc1_percent: 2, disc2_percent: 0, disc3_percent: 0, disc4_percent: 0,
        },
        {
          product_id: 40, qty_kg: 100, packaging_id: 5, gramasi_gr: 200, unit_price: 2000,
          disc1_percent: 0, disc2_percent: 0, disc3_percent: 0, disc4_percent: 0, qty_pcs: 480,
        },
      ]),
    )
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines')
  })

  it('Save Line dengan Qty Converted yang ditimpa mengirim qty_pcs, dan Packaging yang diubah melepas tautan kemasan', async () => {
    api.saveQuoteLines.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage('8')
    await screen.findByText('Line 2')

    await type(user, 'Packaging', '250')
    await user.click(screen.getByRole('button', { name: 'Save Line — Back to Lines List' }))

    await waitFor(() => expect(api.saveQuoteLines).toHaveBeenCalledTimes(1))
    const sent = api.saveQuoteLines.mock.calls[0][1]
    expect(sent[1]).toMatchObject({ product_id: 40, packaging_id: null, gramasi_gr: 250, qty_pcs: 480 })
  })

  it('Packaging tidak diubah: tautan kemasan (packaging_id) dipertahankan', async () => {
    api.saveQuoteLines.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage('8')
    await screen.findByText('Line 2')

    await user.click(screen.getByRole('button', { name: 'Save Line — Back to Lines List' }))
    await waitFor(() => expect(api.saveQuoteLines).toHaveBeenCalledTimes(1))
    expect(api.saveQuoteLines.mock.calls[0][1][1]).toMatchObject({ product_id: 40, packaging_id: 5, gramasi_gr: 200 })
  })

  it('kolom wajib kosong: tidak disimpan', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Line 1')

    await type(user, 'Qty Order (KG) *', '')
    await user.click(screen.getByRole('button', { name: 'Save Line — Back to Lines List' }))
    expect(api.saveQuoteLines).not.toHaveBeenCalled()
  })

  it('Remove Line: setelah konfirmasi, baris dihapus dan baris lain tetap dikirim', async () => {
    api.saveQuoteLines.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Line 1')

    await user.click(screen.getByRole('button', { name: 'Remove Line' }))
    await waitFor(() => expect(api.saveQuoteLines).toHaveBeenCalledTimes(1))
    const sent = api.saveQuoteLines.mock.calls[0][1]
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ product_id: 40, qty_pcs: 480 })
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines')
  })

  it('Remove Line dibatalkan: tidak ada yang dikirim', async () => {
    window.confirm = vi.fn(() => false)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Line 1')

    await user.click(screen.getByRole('button', { name: 'Remove Line' }))
    expect(api.saveQuoteLines).not.toHaveBeenCalled()
  })

  it('produk teregister (Reguler): tanpa chip, label Part dan Rev tanpa "(free text)"', async () => {
    renderPage('8')

    expect(await screen.findByText('Line 2')).toBeInTheDocument()
    expect(screen.queryByText(/Custom B2B — not yet a registered Part/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Pulled from Follow Up Sample/)).not.toBeInTheDocument()
    expect(screen.getByText('Part')).toBeInTheDocument()
    expect(screen.queryByText('Part (free text)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Qty Converted (PCS)')).toHaveValue('480') // nilai yang pernah ditimpa dipertahankan
  })

  it('Quotation yang sudah ditutup: Save Line dan Remove Line dinonaktifkan', async () => {
    api.getQuote.mockResolvedValue(quoteOf({ status: 'WON' }))
    renderPage()

    await screen.findByText('Line 1')
    expect(screen.getByRole('button', { name: 'Save Line — Back to Lines List' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove Line' })).toBeDisabled()
    expect(screen.getByText(/Quotation sudah ditutup \(WON\)/)).toBeInTheDocument()
  })

  it('bilah menu bawah disembunyikan selama layar tampil dan kembali setelah ditinggalkan', async () => {
    const { unmount } = renderPage()
    await screen.findByText('Line 1')
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(true)
    unmount()
    expect(document.body.classList.contains('hide-bottom-nav')).toBe(false)
  })

  it('Line tidak ditemukan: pesan, bukan form', async () => {
    renderPage('999')
    expect(await screen.findByText('Line tidak ditemukan.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Line' })).not.toBeInTheDocument()
  })
})

const SAMPLE_15 = {
  id: 15, followup_number: 3, product_group: 'Saus & Condiment', part: 'CUSTOM-STM-R1300', rev: 'V3',
  description: 'Tomato Sauce Custom B2B — Batch 3', package_size_gr: 150, qty_given: '2 pcs', used_on_line: null,
}
const PRODUCT_50 = {
  id: 50, part_num: 'KCP-1', description: 'Kecap Manis 135 ml', product_group: 'Kecap', revision: null,
  epicor_part_num: 'KCP-1-EP', price: '4500.00',
}

describe('Quotation — Line baru dari Add Line (10f)', () => {
  it('dari sample yang disetujui: identitas dan Packaging terisi, Qty dan harga kosong, badge sample tampil', async () => {
    api.getApprovedSamples.mockResolvedValue([SAMPLE_15])
    renderNew('?sample=15')

    expect(await screen.findByText('Line 3')).toBeInTheDocument() // sudah ada 2 baris
    expect(screen.getByText('Pulled from Follow Up Sample 3 · Reason: Sample Cocok')).toBeInTheDocument()
    expect(screen.getByText('Custom B2B — not yet a registered Part')).toBeInTheDocument()
    expect(screen.getByText('CUSTOM-STM-R1300')).toBeInTheDocument()
    expect(screen.getByText('V3')).toBeInTheDocument()
    expect(screen.getByLabelText('Packaging')).toHaveValue('150')
    expect(screen.getByLabelText('Qty Order (KG) *')).toHaveValue('')
    expect(screen.getByLabelText('Price / PCS (Rp) *')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Discard Line' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Line' })).not.toBeInTheDocument()
  })

  it('Save Line: Line baru ditambahkan di akhir (tanpa product_id, dengan sample_id) dan kembali ke daftar', async () => {
    api.getApprovedSamples.mockResolvedValue([SAMPLE_15])
    api.saveQuoteLines.mockResolvedValue({})
    const user = userEvent.setup()
    renderNew('?sample=15')
    await screen.findByText('Line 3')

    await type(user, 'Qty Order (KG) *', '300')
    await type(user, 'Price / PCS (Rp) *', '3500')
    expect(screen.getByLabelText('Qty Converted (PCS)')).toHaveValue('2.000') // 300 kg ÷ 150 gr
    await user.click(screen.getByRole('button', { name: 'Save Line — Back to Lines List' }))

    await waitFor(() => expect(api.saveQuoteLines).toHaveBeenCalledTimes(1))
    const sent = api.saveQuoteLines.mock.calls[0][1]
    expect(sent).toHaveLength(3)
    expect(sent[0]).toMatchObject({ product_id: 31, sample_id: 12 }) // baris lama tetap bertautan ke sample-nya
    expect(sent[2]).toEqual({
      sample_id: 15, qty_kg: 300, packaging_id: null, gramasi_gr: 150, unit_price: 3500,
      disc1_percent: 0, disc2_percent: 0, disc3_percent: 0, disc4_percent: 0,
    })
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines')
  })

  it('Discard Line: tidak ada yang dikirim ke server', async () => {
    api.getApprovedSamples.mockResolvedValue([SAMPLE_15])
    const user = userEvent.setup()
    renderNew('?sample=15')
    await screen.findByText('Line 3')

    await user.click(screen.getByRole('button', { name: 'Discard Line' }))
    expect(api.saveQuoteLines).not.toHaveBeenCalled()
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines')
  })

  it('sample yang sudah dipakai: pesan, bukan form', async () => {
    api.getApprovedSamples.mockResolvedValue([{ ...SAMPLE_15, used_on_line: 1 }])
    renderNew('?sample=15')
    expect(await screen.findByText('Sample ini sudah dipakai di Line 1.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Line — Back to Lines List' })).not.toBeInTheDocument()
  })

  it('sample tidak ditemukan atau tanpa pilihan: pesan', async () => {
    api.getApprovedSamples.mockResolvedValue([])
    const { unmount } = renderNew('?sample=999')
    expect(await screen.findByText('Sample yang disetujui tidak ditemukan.')).toBeInTheDocument()
    unmount()

    renderNew('')
    expect(await screen.findByText('Pilih sample atau produk dari layar Add Line.')).toBeInTheDocument()
  })

  it('sample item Reguler: memakai produk terdaftarnya (tanpa chip Custom B2B), product_id dan sample_id dikirim bersama', async () => {
    api.getApprovedSamples.mockResolvedValue([
      { ...SAMPLE_15, id: 16, followup_number: 1, part: 'SAMBAL-250', rev: null, package_size_gr: 250, registered_product_id: 77, registered_price: '6000.00' },
    ])
    api.saveQuoteLines.mockResolvedValue({})
    const user = userEvent.setup()
    renderNew('?sample=16')

    expect(await screen.findByText('Line 3')).toBeInTheDocument()
    expect(screen.getByText('Pulled from Follow Up Sample 1 · Reason: Sample Cocok')).toBeInTheDocument()
    expect(screen.queryByText(/Custom B2B — not yet a registered Part/)).not.toBeInTheDocument()
    expect(screen.getByText('Part')).toBeInTheDocument()
    expect(screen.getByLabelText('Price / PCS (Rp) *')).toHaveValue('6.000')

    await type(user, 'Qty Order (KG) *', '100')
    await user.click(screen.getByRole('button', { name: 'Save Line — Back to Lines List' }))
    await waitFor(() => expect(api.saveQuoteLines).toHaveBeenCalledTimes(1))
    expect(api.saveQuoteLines.mock.calls[0][1][2]).toMatchObject({ product_id: 77, sample_id: 16, qty_kg: 100, gramasi_gr: 250, unit_price: 6000 })
  })

  it('Add Blank Line (produk katalog): tanpa badge sample, harga terisi dari katalog, tanpa sample_id', async () => {
    api.searchQuoteProducts.mockResolvedValue({ products: [PRODUCT_50], groups: ['Kecap'] })
    api.saveQuoteLines.mockResolvedValue({})
    const user = userEvent.setup()
    renderNew('?product=50')

    expect(await screen.findByText('Line 3')).toBeInTheDocument()
    expect(api.searchQuoteProducts).toHaveBeenCalledWith('44', { id: '50' })
    expect(screen.queryByText(/Pulled from Follow Up Sample/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Custom B2B — not yet a registered Part/)).not.toBeInTheDocument() // produk teregister
    expect(screen.getByText('Part')).toBeInTheDocument()
    expect(screen.getByLabelText('Price / PCS (Rp) *')).toHaveValue('4.500')
    expect(screen.getByLabelText('Packaging')).toHaveValue('') // diisi manual

    await type(user, 'Qty Order (KG) *', '100')
    await type(user, 'Packaging', '135')
    await user.click(screen.getByRole('button', { name: 'Save Line — Back to Lines List' }))

    await waitFor(() => expect(api.saveQuoteLines).toHaveBeenCalledTimes(1))
    expect(api.saveQuoteLines.mock.calls[0][1][2]).toEqual({
      product_id: 50, qty_kg: 100, packaging_id: null, gramasi_gr: 135, unit_price: 4500,
      disc1_percent: 0, disc2_percent: 0, disc3_percent: 0, disc4_percent: 0,
    })
  })
})
