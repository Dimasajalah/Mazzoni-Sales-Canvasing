import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({ getAging: vi.fn() }))
vi.mock('../src/lib/format.js', () => ({
  fmtRp: (v) => `Rp ${v}`,
  listOf: (r) => (Array.isArray(r) ? r : r?.data || []),
}))
vi.mock('../src/components/ui.jsx', () => ({
  Screen: ({ children }) => <div>{children}</div>,
  TopBar: ({ title }) => <h1>{title}</h1>,
  AgingBuckets: ({ buckets }) => <div data-testid="buckets">{buckets.join('|')}</div>,
  Chips: ({ options, value, onChange }) => (
    <div>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
  ListItem: ({ title, subtitle, right, barColor, onClick }) => (
    <button type="button" data-color={barColor} onClick={onClick}>
      <span data-testid="row-title">{title}</span>
      <span>{subtitle}</span>
      <span>{right}</span>
    </button>
  ),
}))

import * as api from '../src/api/index.js'
import ArReport from '../src/pages/ArReport.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/ar']}>
      <Routes>
        <Route path="/ar" element={<ArReport />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )

const cust = (id, code, name) => ({ id, customer_code: code, name })
const inv = (id, customer, balance, days, bucket) => ({
  id, invoice_number: `INV-${id}`, customer_id: customer.id, balance, days_overdue: days, aging_bucket: bucket, customer,
})
const SUMBER = cust(7, 'C-10466', 'UD Sumber Makmur')
const BERKAH = cust(12, 'C-10508', 'Toko Berkah')
const CAHAYA = cust(4, 'C-10482', 'PT Cahaya Abadi')

// bentuk asli respons /ar/aging: { summary, invoices }
const BACKEND = {
  summary: { CURRENT: 0, '1-30': 684600, '31-60': 438300, '60+': 376350, total: 1499250, overdue_count: 4, customers_with_ar: 3 },
  invoices: [
    inv(3, SUMBER, '438300.00', 46, '31-60'),
    inv(10, SUMBER, '684600.00', 11, '1-30'),
    inv(8, CAHAYA, '124750.00', 121, '60+'),
    inv(6, BERKAH, '251600.00', 81, '60+'),
  ],
}

const titles = () => screen.getAllByTestId('row-title').map((n) => n.textContent)
const rowOf = (name) => screen.getByText(name).closest('button')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Outstanding Report', () => {
  it('selama memuat: tidak menampilkan total atau nol, hanya penanda memuat', () => {
    api.getAging.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByText('Memuat…')).toBeInTheDocument()
    expect(screen.queryByText('Total outstanding')).not.toBeInTheDocument()
    expect(screen.queryByText(/Rp 0/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('buckets')).not.toBeInTheDocument()
  })

  it('respons asli (summary dan invoices): total, bucket, dan jumlah customer serta invoice telat terbaca', async () => {
    api.getAging.mockResolvedValue(BACKEND)
    renderPage()

    expect(await screen.findByText('Rp 1.499.250')).toBeInTheDocument()
    expect(screen.getByTestId('buckets').textContent).toBe('0|684600|438300|376350')
    expect(screen.getByText('3 customer · 4 invoice telat')).toBeInTheDocument()
    expect(screen.queryByText('Tidak ada piutang terbuka.')).not.toBeInTheDocument()
  })

  it('invoice dikelompokkan per customer: saldo dijumlah, jumlah invoice dan hari telat terburuk tampil', async () => {
    api.getAging.mockResolvedValue(BACKEND)
    renderPage()

    await screen.findByText('UD Sumber Makmur')
    expect(screen.getByText('C-10466 · 2 invoice · telat 46 hari')).toBeInTheDocument()
    expect(screen.getByText('Rp 1.122.900')).toBeInTheDocument()
    expect(screen.getByText('C-10482 · 1 invoice · telat 121 hari')).toBeInTheDocument()
  })

  it('urutan dari saldo terbesar, dan warna batang mengikuti hari telat', async () => {
    api.getAging.mockResolvedValue(BACKEND)
    renderPage()

    await screen.findByText('UD Sumber Makmur')
    expect(titles()).toEqual(['UD Sumber Makmur', 'Toko Berkah', 'PT Cahaya Abadi'])
    expect(rowOf('UD Sumber Makmur')).toHaveAttribute('data-color', 'var(--amber)') // 46 hari
    expect(rowOf('Toko Berkah')).toHaveAttribute('data-color', 'var(--pink)') // 81 hari
  })

  it('chip 60+: hanya invoice di bucket itu yang dihitung, jadi jumlah per customer sama dengan bucketnya', async () => {
    api.getAging.mockResolvedValue(BACKEND)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('UD Sumber Makmur')

    await user.click(screen.getByRole('button', { name: '60+' }))

    expect(titles()).toEqual(['Toko Berkah', 'PT Cahaya Abadi'])
    expect(screen.getByText('Rp 251.600')).toBeInTheDocument()
    expect(screen.getByText('Rp 124.750')).toBeInTheDocument()
    expect(screen.queryByText('UD Sumber Makmur')).not.toBeInTheDocument()
  })

  it('chip 1-30: customer dengan invoice di dua bucket hanya menampilkan bagian 1-30', async () => {
    api.getAging.mockResolvedValue(BACKEND)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('UD Sumber Makmur')

    await user.click(screen.getByRole('button', { name: '1-30' }))

    expect(titles()).toEqual(['UD Sumber Makmur'])
    expect(screen.getByText('Rp 684.600')).toBeInTheDocument() // bukan 1122900
    expect(screen.getByText('C-10466 · 1 invoice · telat 11 hari')).toBeInTheDocument()
  })

  it('chip Lancar tanpa invoice di bucket itu: pesan, bukan daftar kosong', async () => {
    api.getAging.mockResolvedValue(BACKEND)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('UD Sumber Makmur')

    await user.click(screen.getByRole('button', { name: 'Lancar' }))

    expect(screen.getByText('Tidak ada customer di kelompok ini.')).toBeInTheDocument()
  })

  it('mengetuk customer membuka detailnya', async () => {
    api.getAging.mockResolvedValue(BACKEND)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByText('UD Sumber Makmur'))
    expect((await screen.findByTestId('probe')).textContent).toBe('/customers/7')
  })

  it('bentuk lama (daftar customer jadi, kunci tingkat atas): tetap terbaca dan chip menyaring menurut hari terburuk', async () => {
    api.getAging.mockResolvedValue({
      total: 6500000, CURRENT: 0, '1-30': 1000000, '31-60': 0, '60+': 5500000,
      customers: [
        { id: 12, customer_code: 'CUST-2415', name: 'PT MULYA ADI', balance: 1000000, max_days_overdue: 1 },
        { id: 7, customer_code: 'CUST-0099', name: 'TB SINAR', balance: 5500000, max_days_overdue: 75 },
      ],
    })
    const user = userEvent.setup()
    renderPage()

    expect((await screen.findByTestId('buckets')).textContent).toBe('0|1000000|0|5500000')
    await user.click(screen.getByRole('button', { name: '60+' }))
    expect(titles()).toEqual(['TB SINAR'])
  })

  it('galat: pesan dan tombol Muat ulang, tanpa Rp 0; mencoba lagi berhasil', async () => {
    api.getAging.mockRejectedValueOnce(new Error('Server sibuk')).mockResolvedValue(BACKEND)
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Laporan belum bisa dimuat')
    expect(screen.getByRole('alert')).toHaveTextContent('Server sibuk')
    expect(screen.queryByText(/Rp 0/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Muat ulang' }))

    expect(await screen.findByText('UD Sumber Makmur')).toBeInTheDocument()
    expect(api.getAging).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tanpa piutang: pesan "Tidak ada piutang terbuka" dan tanpa chip', async () => {
    api.getAging.mockResolvedValue({
      summary: { CURRENT: 0, '1-30': 0, '31-60': 0, '60+': 0, total: 0, overdue_count: 0, customers_with_ar: 0 },
      invoices: [],
    })
    renderPage()

    expect(await screen.findByText('Tidak ada piutang terbuka.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Semua' })).not.toBeInTheDocument()
  })

  it('ada total tetapi tanpa invoice maupun customer: jujur bahwa rincian belum tersedia', async () => {
    api.getAging.mockResolvedValue({ total: 1000000, buckets: [0, 1000000, 0, 0] })
    renderPage()

    expect(await screen.findByText('Rincian per customer belum tersedia.')).toBeInTheDocument()
    expect(screen.queryByText('Tidak ada piutang terbuka.')).not.toBeInTheDocument()
  })

  it('penanda "Per tanggal" hanya tampil bila respons memuat as_of', async () => {
    api.getAging.mockResolvedValue({ ...BACKEND, as_of: '2026-10-16T09:12:00+07:00' })
    const { unmount } = renderPage()
    expect(await screen.findByText(/^Per 16 Okt 2026 \d\d:\d\d$/)).toBeInTheDocument()
    unmount()

    api.getAging.mockResolvedValue(BACKEND)
    renderPage()
    await screen.findByText('Total outstanding')
    expect(screen.queryByText(/^Per /)).not.toBeInTheDocument()
  })

  it('Catat Pembayaran membuka layar pembayaran', async () => {
    api.getAging.mockResolvedValue(BACKEND)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Catat Pembayaran' }))
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('/payment'))
  })
})
