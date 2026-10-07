//frontend/tests/quotes.test.jsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))

const ORDER_USER = { id: 1, name: 'Toni', role: 'sales', sales_type: 'ORDER', can_order: true, can_delegate: false }

vi.mock('../src/api/index.js', () => ({
  getQuotes: vi.fn(), getQuote: vi.fn(), createQuote: vi.fn(), updateQuote: vi.fn(), replaceQuoteLines: vi.fn(),
  markQuoteQuoted: vi.fn(), attachQuoteCompetitor: vi.fn(), detachQuoteCompetitor: vi.fn(), convertQuoteToOrder: vi.fn(),
  getProducts: vi.fn(), getCustomers: vi.fn(), getDiscountStrata: vi.fn(), getCompetitors: vi.fn(),
  getProductPackagings: vi.fn(), getSamples: vi.fn(),
  updateLeadTask: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import QuoteForm from '../src/pages/QuoteForm.jsx'
import Quotes from '../src/pages/Quotes.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const routes = (
  <Routes>
    <Route path="/quotes" element={<Quotes />} />
    <Route path="/quotes/new" element={<QuoteForm />} />
    <Route path="/quotes/:id" element={<QuoteForm />} />
    <Route path="*" element={<Probe />} />
  </Routes>
)

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>{routes}</PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const serverQuote = (over = {}) => ({
  id: 5, quote_number: 'QT-STG-2026-000005', status: 'DRAFT', lead_id: 3, salesperson_id: 1, order: null, customer_id: null, customer_po: null,
  product_sample_id: null, due_date: null, expected_close_date: null, follow_up_date: null, expires_at: null,
  terms: 'Pembayaran: 14 hari', total: '5529000.00', lead: { business_name: 'UD Prospek' }, competitors: [],
  lines: [{
    product_id: 1, description: 'Saus Tomat 1kg', packaging_id: 10, packaging: { name: 'Pouch 500 gr' },
    gramasi_gr: '500.00', qty_kg: '100.000', disc_percent: '1.00', unit_price: '28500.00',
  }],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = ORDER_USER
  api.getProducts.mockResolvedValue({ data: [{ id: 1, part_num: 'STM-1000', description: 'Saus Tomat 1kg', price: '28500.00', uom: 'DUS' }] })
  api.getCustomers.mockResolvedValue({ data: [{ id: 1, name: 'PT Pembeli' }, { id: 2, name: 'PT Distributor' }] })
  api.getDiscountStrata.mockResolvedValue([{ product_id: null, min_kg: '100.000', max_kg: '499.000', discount_percent: '2.00', active: true }])
  api.getCompetitors.mockResolvedValue([{ id: 9, name: 'CV Pesaing' }])
  api.getProductPackagings.mockResolvedValue([{ id: 10, name: 'Pouch 500 gr', gramasi_gr: '500.00' }])
  api.getSamples.mockResolvedValue({ data: [] })
})

describe('Daftar Quotation', () => {
  it('menampilkan hitungan per status dan memfilter', async () => {
    api.getQuotes.mockResolvedValue({ data: [
      { id: 1, quote_number: 'QT-1', status: 'DRAFT', total: '0', lines_count: 0, lead: { business_name: 'A' } },
      { id: 2, quote_number: 'QT-2', status: 'QUOTED', total: '1500000', lines_count: 2, customer: { name: 'B' } },
      { id: 3, quote_number: 'QT-3', status: 'WON', total: '2000000', lines_count: 1, lead: { business_name: 'C' } },
    ] })
    const user = userEvent.setup()
    shell(['/quotes'])
    expect(await screen.findByRole('button', { name: 'Semua (3)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Quoted (1)' }))
    expect(screen.getByText('QT-2')).toBeInTheDocument()
    expect(screen.queryByText('QT-1')).not.toBeInTheDocument()
  })
})

describe('Form Quotation baru', () => {
  const fill = async (user, kg = '100') => {
    await user.selectOptions(await screen.findByLabelText('Produk'), '1')
    await screen.findByRole('option', { name: /Pouch 500 gr/ })
    await user.selectOptions(screen.getByLabelText(/Kemasan/), '10')
    await user.type(screen.getByLabelText('Jumlah order (Kg)'), kg)
  }

  it('pratinjau: Kg -> pcs, strata otomatis, dan total; lalu menyimpan dengan payload yang benar', async () => {
    api.createQuote.mockResolvedValue({ id: 55, quote_number: 'QT-STG-2026-000055' })
    api.getQuote.mockResolvedValue(serverQuote({ id: 55, quote_number: 'QT-STG-2026-000055' }))
    const user = userEvent.setup()
    shell([{ pathname: '/quotes/new', state: { leadId: 3, customerName: 'UD Prospek' } }])

    await fill(user)
    await user.type(screen.getByLabelText('Disc 1 (%)'), '1')
    const preview = await screen.findByTestId('draft-preview')
    expect(preview).toHaveTextContent('200 pcs')
    expect(preview).toHaveTextContent('strata 2%')
    expect(preview).toHaveTextContent(/Rp 5,5jt/)

    await user.click(screen.getByRole('button', { name: '+ Tambah baris' }))
    expect(screen.getByText(/100 Kg → 200 pcs \(500 gr · Pouch 500 gr\)/)).toBeInTheDocument()
    // Poin 15: bertingkat -> 1 - (0,98 x 0,99) = 2,98% (bukan 3% dijumlah)
    expect(screen.getByText(/Diskon 2\.98% bertingkat \(strata 2%, Disc 1\/0\/0\/0%\)/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Syarat & ketentuan'), 'COD')
    await user.click(screen.getByRole('button', { name: 'Simpan Quotation' }))

    await waitFor(() => expect(api.createQuote).toHaveBeenCalledTimes(1))
    expect(api.createQuote.mock.calls[0][0]).toMatchObject({
      lead_id: 3, terms: 'COD', customer_id: null,
      lines: [{ product_id: 1, packaging_id: 10, qty_kg: 100, disc1_percent: 1, disc2_percent: 0, disc3_percent: 0, disc4_percent: 0, unit_price: 28500 }],
    })
    expect(api.createQuote.mock.calls[0][0].lines[0]).not.toHaveProperty('gramasi_gr') // dari kemasan
    // setelah simpan, halaman pindah ke penawaran yang tersimpan dan memuatnya dari server
    await waitFor(() => expect(api.getQuote).toHaveBeenCalledWith('55'))
    expect(await screen.findByText('QT-STG-2026-000055')).toBeInTheDocument()
  })

  it('gramasi manual dikirim bila tidak memilih kemasan', async () => {
    api.createQuote.mockResolvedValue({ id: 56, quote_number: 'QT-56' })
    const user = userEvent.setup()
    shell(['/quotes/new'])
    await user.selectOptions(await screen.findByLabelText('Produk'), '1')
    await screen.findByRole('option', { name: /Pouch 500 gr/ })
    await user.type(screen.getByLabelText('Gramasi (gr per pcs)'), '20')
    await user.type(screen.getByLabelText('Jumlah order (Kg)'), '2')
    expect(await screen.findByTestId('draft-preview')).toHaveTextContent('100 pcs')
    await user.click(screen.getByRole('button', { name: '+ Tambah baris' }))
    await user.click(screen.getByRole('button', { name: 'Simpan Quotation' }))
    await waitFor(() => expect(api.createQuote).toHaveBeenCalled())
    expect(api.createQuote.mock.calls[0][0].lines[0]).toMatchObject({ packaging_id: null, gramasi_gr: 20, qty_kg: 2 })
  })

  it('menolak baris tanpa Kg dan tanpa gramasi', async () => {
    const user = userEvent.setup()
    shell(['/quotes/new'])
    await user.selectOptions(await screen.findByLabelText('Produk'), '1')
    await screen.findByRole('option', { name: /Pouch 500 gr/ })
    await user.click(screen.getByRole('button', { name: '+ Tambah baris' }))
    expect(await screen.findByText('Isi jumlah Kg')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Jumlah order (Kg)'), '5')
    await user.click(screen.getByRole('button', { name: '+ Tambah baris' }))
    expect(await screen.findByText('Pilih kemasan atau isi gramasi')).toBeInTheDocument()
    expect(screen.getByText('Belum ada baris.')).toBeInTheDocument()
  })

  it('kompetitor baru menunggu Quotation tersimpan', async () => {
    shell(['/quotes/new'])
    expect(await screen.findByText(/Simpan Quotation terlebih dahulu untuk mencatat kompetitor/)).toBeInTheDocument()
  })
})

describe('Quotation: pencarian produk difilter ke product group sample (poin 21)', () => {
  it('quote dengan sample: daftar produk dimuat ulang dengan filter product_group, dan hint tampil', async () => {
    api.getQuote.mockResolvedValue(serverQuote({ sample_product_group: 'Saus Sambal Custom' }))
    shell(['/quotes/5'])

    await waitFor(() => expect(api.getProducts).toHaveBeenCalledWith({ product_group: 'Saus Sambal Custom' }))
    expect(await screen.findByText(/Difilter ke product group sample: Saus Sambal Custom/)).toBeInTheDocument()
  })

  it('quote tanpa sample: tetap pakai pencarian produk bebas (tanpa filter), tanpa hint', async () => {
    api.getQuote.mockResolvedValue(serverQuote({ sample: null }))
    shell(['/quotes/5'])

    await waitFor(() => expect(api.getProducts).toHaveBeenCalledWith({}))
    expect(screen.queryByText(/Difilter ke product group/)).not.toBeInTheDocument()
  })
})

describe('Quotation tersimpan: flag produk belum teregister (poin 18/20/21)', () => {
  it('baris dengan produk belum teregister menampilkan badge peringatan + product group', async () => {
    api.getQuote.mockResolvedValue(serverQuote({
      lines: [{
        product_id: 1, description: 'Saus Sambal Custom', packaging_id: null, gramasi_gr: '1000.00',
        qty_kg: '10.000', disc_percent: '0', unit_price: '50000.00',
        product: { id: 1, description: 'Saus Sambal Custom', epicor_part_num: null, product_group: 'Saus Sambal Custom' },
      }],
    }))
    shell(['/quotes/5'])

    expect(await screen.findByText(/Belum teregister/)).toBeInTheDocument()
    expect(screen.getByText(/Belum teregister · Saus Sambal Custom/)).toBeInTheDocument()
  })

  it('baris dengan produk yang sudah teregister TIDAK menampilkan badge apa pun', async () => {
    api.getQuote.mockResolvedValue(serverQuote({
      lines: [{
        product_id: 1, description: 'Saus Tomat 1kg', packaging_id: null, gramasi_gr: '1000.00',
        qty_kg: '10.000', disc_percent: '0', unit_price: '28500.00',
        product: { id: 1, description: 'Saus Tomat 1kg', epicor_part_num: 'EP-123', product_group: null },
      }],
    }))
    shell(['/quotes/5'])

    await screen.findByText('Saus Tomat 1kg')
    expect(screen.queryByText(/Belum teregister/)).not.toBeInTheDocument()
  })

  it('galat 422 dari server saat Jadikan Order (produk belum teregister) ditampilkan apa adanya', async () => {
    api.getQuote.mockResolvedValue(serverQuote({ customer_id: 2 }))
    api.convertQuoteToOrder.mockRejectedValue(
      new Error('Produk berikut belum teregister, pilih produk pengganti dulu: Saus Sambal Custom.'),
    )
    const user = userEvent.setup()
    shell(['/quotes/5'])

    await user.click(await screen.findByRole('button', { name: /Jadikan Order/ }))
    await user.click(await screen.findByRole('button', { name: 'Buat Order' }))

    await waitFor(() => expect(api.convertQuoteToOrder).toHaveBeenCalled())
    expect(await screen.findByText(/Produk berikut belum teregister/)).toBeInTheDocument()
  })
})

describe('Quotation tersimpan: nomor revisi produk (poin 22)', () => {
  it('produk yang sudah direformula (revision > 1) menampilkan badge "Rev N"', async () => {
    api.getQuote.mockResolvedValue(serverQuote({
      lines: [{
        product_id: 1, description: 'Kecap Asin 600ml', packaging_id: null, gramasi_gr: '1000.00',
        qty_kg: '1.000', disc_percent: '0', unit_price: '19500.00',
        product: { id: 1, description: 'Kecap Asin 600ml', epicor_part_num: 'EP-1', product_group: null, revision: 2 },
      }],
    }))
    shell(['/quotes/5'])

    expect(await screen.findByText('Rev 2')).toBeInTheDocument()
  })

  it('produk revisi pertama (revision 1, belum pernah direformula) TIDAK menampilkan badge apa pun', async () => {
    api.getQuote.mockResolvedValue(serverQuote({
      lines: [{
        product_id: 1, description: 'Saus Tomat 1kg', packaging_id: null, gramasi_gr: '1000.00',
        qty_kg: '1.000', disc_percent: '0', unit_price: '28500.00',
        product: { id: 1, description: 'Saus Tomat 1kg', epicor_part_num: 'EP-1', product_group: null, revision: 1 },
      }],
    }))
    shell(['/quotes/5'])

    await screen.findByText('Saus Tomat 1kg')
    expect(screen.queryByText(/^Rev /)).not.toBeInTheDocument()
  })
})

describe('Form Quotation baru: MOQ (poin 17)', () => {
  beforeEach(() => {
    api.getProducts.mockResolvedValue({ data: [
      { id: 1, part_num: 'STM-1000', description: 'Saus Tomat 1kg', price: '28500.00', uom: 'DUS' },
      { id: 2, part_num: 'SKJ-1000', description: 'Saus Keju 1kg (Custom B2B)', price: '52000.00', uom: 'DUS', moq_kg: '50.000' },
    ] })
  })

  it('qty di bawah MOQ: tombol Tambah baris nonaktif dan muncul peringatan', async () => {
    const user = userEvent.setup()
    shell(['/quotes/new'])
    await user.selectOptions(await screen.findByLabelText('Produk'), '2')
    await user.type(screen.getByLabelText('Gramasi (gr per pcs)'), '1000')
    await user.type(screen.getByLabelText('Jumlah order (Kg)'), '20')

    expect(screen.getByText(/minimal/)).toHaveTextContent('50 Kg')
    expect(screen.getByRole('button', { name: '+ Tambah baris' })).toBeDisabled()
  })

  it('qty mencapai MOQ: peringatan hilang dan baris bisa ditambahkan', async () => {
    const user = userEvent.setup()
    shell(['/quotes/new'])
    await user.selectOptions(await screen.findByLabelText('Produk'), '2')
    await user.type(screen.getByLabelText('Gramasi (gr per pcs)'), '1000')
    await user.type(screen.getByLabelText('Jumlah order (Kg)'), '50')

    expect(screen.queryByText(/MOQ/)).not.toBeInTheDocument()
    const btn = screen.getByRole('button', { name: '+ Tambah baris' })
    expect(btn).toBeEnabled()
    await user.click(btn)
    expect(screen.getByText(/50 Kg → 50 pcs/)).toBeInTheDocument()
  })

  it('produk tanpa MOQ tetap bebas seperti biasa', async () => {
    const user = userEvent.setup()
    shell(['/quotes/new'])
    await user.selectOptions(await screen.findByLabelText('Produk'), '1')
    await screen.findByRole('option', { name: /Pouch 500 gr/ })
    await user.selectOptions(screen.getByLabelText(/Kemasan/), '10')
    await user.type(screen.getByLabelText('Jumlah order (Kg)'), '1')

    expect(screen.queryByText(/MOQ/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Tambah baris' })).toBeEnabled()
  })
})

describe('Quotation tersimpan', () => {
  it('perubahan belum disimpan menonaktifkan Quoted / Jadikan Order; simpan mengirim header lalu baris', async () => {
    api.getQuote.mockResolvedValue(serverQuote())
    api.updateQuote.mockResolvedValue({})
    api.replaceQuoteLines.mockResolvedValue(serverQuote({ terms: 'COD' }))
    const user = userEvent.setup()
    shell(['/quotes/5'])

    const quoted = await screen.findByRole('button', { name: 'Tandai Quoted' })
    expect(quoted).toBeEnabled()

    await user.clear(screen.getByLabelText('Syarat & ketentuan'))
    await user.type(screen.getByLabelText('Syarat & ketentuan'), 'COD')
    expect(screen.getByText(/belum disimpan/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tandai Quoted' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Jadikan Order/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Simpan Perubahan' }))
    await waitFor(() => expect(api.replaceQuoteLines).toHaveBeenCalledTimes(1))
    expect(api.updateQuote).toHaveBeenCalledWith(5, expect.objectContaining({ terms: 'COD' }))
    // harga tersimpan tidak diganti diam-diam saat baris disimpan ulang
    expect(api.replaceQuoteLines.mock.calls[0][1][0]).toMatchObject({ unit_price: 28500, packaging_id: 10, qty_kg: 100 })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tandai Quoted' })).toBeEnabled())
  })

  it('Tandai Quoted memanggil API dan menampilkan status', async () => {
    api.getQuote.mockResolvedValue(serverQuote())
    api.markQuoteQuoted.mockResolvedValue(serverQuote({ status: 'QUOTED' }))
    const user = userEvent.setup()
    shell(['/quotes/5'])
    await user.click(await screen.findByRole('button', { name: 'Tandai Quoted' }))
    await waitFor(() => expect(api.markQuoteQuoted).toHaveBeenCalledWith(5))
    expect(await screen.findByRole('button', { name: /Sudah Quoted/ })).toBeDisabled()
  })

  it('Quotation WON (dari Win prospek) baca-saja tetapi tetap bisa dijadikan order', async () => {
    api.getQuote.mockResolvedValue(serverQuote({ status: 'WON' }))
    shell(['/quotes/5'])
    expect(await screen.findByText(/sudah ditutup \(Won\)/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Perubahan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tandai Quoted' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Syarat & ketentuan')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Jadikan Order/ })).toBeEnabled()
  })

  it('Quotation LOST tidak bisa dijadikan order', async () => {
    api.getQuote.mockResolvedValue(serverQuote({ status: 'LOST' }))
    shell(['/quotes/5'])
    expect(await screen.findByText(/sudah ditutup \(Lost\)/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Jadikan Order/ })).not.toBeInTheDocument()
  })

  it('Quotation yang sudah menjadi order menampilkan nomor order dan tidak bisa dikonversi lagi', async () => {
    api.getQuote.mockResolvedValue(serverQuote({ status: 'WON', order: { id: 9, order_number: 'SO-STG-2026-000009' } }))
    shell(['/quotes/5'])
    expect(await screen.findByText('SO-STG-2026-000009')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Jadikan Order/ })).not.toBeInTheDocument()
  })

  it('Sales Dealmaker tidak melihat Jadikan Order pada Quotation terbuka', async () => {
    auth.user = { id: 1, name: 'Rina', role: 'sales', sales_type: 'DEALMAKER', can_order: false, can_delegate: true }
    api.getQuote.mockResolvedValue(serverQuote())
    shell(['/quotes/5'])
    expect(await screen.findByRole('button', { name: 'Tandai Quoted' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Jadikan Order/ })).not.toBeInTheDocument()
  })

  it('penerima delegasi (bukan pemilik) hanya membaca, tetapi bisa menjadikannya order', async () => {
    auth.user = { id: 99, name: 'Sari', role: 'sales', sales_type: 'ORDER', can_order: true, can_delegate: false }
    api.getQuote.mockResolvedValue(serverQuote({ status: 'WON', salesperson_id: 1 }))
    shell(['/quotes/5'])
    expect(await screen.findByText(/penerima delegasi \(hanya baca\)/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Perubahan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Tambah baris' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Syarat & ketentuan')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Jadikan Order/ })).toBeEnabled()
  })

  it('mencatat kompetitor dari daftar dan kompetitor baru', async () => {
    api.getQuote.mockResolvedValue(serverQuote())
    api.attachQuoteCompetitor.mockResolvedValue(serverQuote({ competitors: [{ id: 1, competitor_id: 9, comment: 'Lebih murah', competitor: { name: 'CV Pesaing' } }] }))
    const user = userEvent.setup()
    shell(['/quotes/5'])

    await user.selectOptions(await screen.findByLabelText('Pilih kompetitor'), '9')
    await user.type(screen.getByLabelText('Catatan (tanpa harga)'), 'Lebih murah')
    await user.click(screen.getByRole('button', { name: '+ Catat kompetitor' }))
    await waitFor(() => expect(api.attachQuoteCompetitor).toHaveBeenCalledWith(5, { competitor_id: 9, comment: 'Lebih murah' }))
    expect(await screen.findByText('Lebih murah')).toBeInTheDocument() // catatan tampil di daftar kompetitor penawaran

    await user.click(screen.getByRole('button', { name: 'Kompetitor baru' }))
    await user.type(screen.getByLabelText('Nama kompetitor'), 'PT Baru')
    await user.click(screen.getByRole('button', { name: '+ Catat kompetitor' }))
    await waitFor(() => expect(api.attachQuoteCompetitor).toHaveBeenLastCalledWith(5, expect.objectContaining({ name: 'PT Baru' })))
  })

  it('Jadikan Order: customer wajib, distributor wajib bila tujuan Distributor, lalu pindah ke Orders', async () => {
    api.getQuote.mockResolvedValue(serverQuote())
    api.convertQuoteToOrder.mockResolvedValue({ order: { order_number: 'SO-STG-2026-000010' }, quote: {} })
    const user = userEvent.setup()
    shell(['/quotes/5'])

    await user.click(await screen.findByRole('button', { name: /Jadikan Order/ }))
    await user.click(await screen.findByRole('button', { name: 'Buat Order' }))
    expect(await screen.findByText('Pilih customer untuk order ini')).toBeInTheDocument()
    expect(api.convertQuoteToOrder).not.toHaveBeenCalled()

    const sheet = screen.getByRole('button', { name: 'Buat Order' }).closest('form')
    await user.selectOptions(within(sheet).getByLabelText('Customer'), '1')
    await user.selectOptions(within(sheet).getByLabelText('Tujuan order'), 'DISTRIBUTOR')
    await user.click(within(sheet).getByRole('button', { name: 'Buat Order' }))
    expect(await screen.findByText('Pilih distributor')).toBeInTheDocument()

    // distributor tidak boleh sama dengan customer
    expect(within(within(sheet).getByLabelText('Distributor')).queryByRole('option', { name: 'PT Pembeli' })).not.toBeInTheDocument()
    await user.selectOptions(within(sheet).getByLabelText('Distributor'), '2')
    await user.click(within(sheet).getByRole('button', { name: 'Buat Order' }))

    await waitFor(() => expect(api.convertQuoteToOrder).toHaveBeenCalledWith(5, {
      customer_id: 1, customer_po: null, destination: 'DISTRIBUTOR', distributor_customer_id: 2,
    }))
    expect(await screen.findByTestId('probe')).toHaveTextContent('/orders')
  })
})

describe('Quotation: grid field tugas (poin 9)', () => {
  const TASK = {
    name: 'Quotation', task_type: 'Quote', stage: 'QUOTE', status: 'OPEN',
    remark: 'lama', assignee: { id: 2, name: 'Budi Santoso' },
  }
  const open = () => shell([{ pathname: '/quotes/5', state: { leadId: 3, leadTaskId: 9, task: TASK } }])

  it('menampilkan grid field tugas dengan Comment yang bisa diisi', async () => {
    api.getQuote.mockResolvedValue(serverQuote())
    open()
    expect(await screen.findByLabelText('Task Type')).toHaveValue('Quote')
    expect(screen.getByLabelText('Stage')).toHaveValue('Quote')
    expect(screen.getByLabelText('Task')).toHaveValue('Quotation')
    expect(screen.getByLabelText('Assigned to')).toHaveValue('Budi Santoso')
    expect(screen.getByLabelText('Task Status')).toHaveValue('Berjalan')
    expect(screen.getByLabelText('Stage')).toHaveAttribute('readonly')
    const comment = screen.getByLabelText('Comment')
    expect(comment).toHaveValue('lama')
    expect(comment).not.toHaveAttribute('readonly')
  })

  it('Comment yang diubah disimpan ke tugas saat Simpan Perubahan', async () => {
    api.getQuote.mockResolvedValue(serverQuote())
    api.updateQuote.mockResolvedValue({})
    api.replaceQuoteLines.mockResolvedValue(serverQuote())
    api.updateLeadTask.mockResolvedValue({})
    const user = userEvent.setup()
    open()
    const comment = await screen.findByLabelText('Comment')
    await user.clear(comment)
    await user.type(comment, 'baru')
    await user.click(screen.getByRole('button', { name: 'Simpan Perubahan' }))
    await waitFor(() => expect(api.updateLeadTask).toHaveBeenCalledWith(9, { remark: 'baru' }))
  })

  it('Comment tidak diubah: tidak ada permintaan simpan Comment', async () => {
    api.getQuote.mockResolvedValue(serverQuote())
    api.updateQuote.mockResolvedValue({})
    api.replaceQuoteLines.mockResolvedValue(serverQuote())
    const user = userEvent.setup()
    open()
    await screen.findByLabelText('Comment')
    await user.click(screen.getByRole('button', { name: 'Simpan Perubahan' }))
    await waitFor(() => expect(api.replaceQuoteLines).toHaveBeenCalled())
    expect(api.updateLeadTask).not.toHaveBeenCalled()
  })

  it('Quotation sudah ditutup: Comment hanya tampil, tidak bisa diisi', async () => {
    api.getQuote.mockResolvedValue(serverQuote({ status: 'WON' }))
    open()
    expect(await screen.findByLabelText('Comment')).toHaveAttribute('readonly')
  })

  it('Comment gagal disimpan: Quotation tetap tersimpan dan sales diberi peringatan', async () => {
    api.getQuote.mockResolvedValue(serverQuote())
    api.updateQuote.mockResolvedValue({})
    api.replaceQuoteLines.mockResolvedValue(serverQuote())
    api.updateLeadTask.mockRejectedValue(new Error('gagal'))
    const user = userEvent.setup()
    open()
    await user.type(await screen.findByLabelText('Comment'), ' tambahan')
    await user.click(screen.getByRole('button', { name: 'Simpan Perubahan' }))
    expect(await screen.findByText('Quotation disimpan, tetapi Comment gagal disimpan')).toBeInTheDocument()
  })
})
