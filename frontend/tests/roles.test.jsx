import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }),
}))

vi.mock('../src/api/index.js', () => ({
  getDelegations: vi.fn(), cancelDelegation: vi.fn(), getNooReport: vi.fn(),
  getUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(),
  getProducts: vi.fn(), getCustomers: vi.fn(), getCustomer: vi.fn(), getPromos: vi.fn(),
  getProductPackagings: vi.fn(), createProductPackaging: vi.fn(), updateProductPackaging: vi.fn(), deleteProductPackaging: vi.fn(),
  getDiscountStrata: vi.fn(), createDiscountStratum: vi.fn(), updateDiscountStratum: vi.fn(), deleteDiscountStratum: vi.fn(),
  getCodeMappings: vi.fn(), saveCodeMapping: vi.fn(), deleteCodeMapping: vi.fn(),
  getDashboard: vi.fn(), createOrder: vi.fn(), createExpense: vi.fn(), createReturn: vi.fn(), globalSearch: vi.fn(),
  checkoutVisit: vi.fn(), getVisit: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import CustomerDetail from '../src/pages/CustomerDetail.jsx'
import Delegations from '../src/pages/Delegations.jsx'
import Home from '../src/pages/Home.jsx'
import MasterData from '../src/pages/MasterData.jsx'
import NewOrder from '../src/pages/NewOrder.jsx'
import NooReport, { rangeFor } from '../src/pages/NooReport.jsx'
import VisitMode from '../src/pages/VisitMode.jsx'

const U = {
  order: { id: 1, name: 'Toni', role: 'sales', sales_type: 'ORDER', can_order: true, can_delegate: false, territory: 'Surabaya' },
  dealmaker: { id: 2, name: 'Rina', role: 'sales', sales_type: 'DEALMAKER', can_order: false, can_delegate: true, territory: 'Surabaya' },
  supervisor: { id: 3, name: 'Sup', role: 'supervisor', sales_type: 'ORDER', can_order: true, can_delegate: true, territory: 'All' },
  admin: { id: 4, name: 'Adm', role: 'admin', sales_type: 'ORDER', can_order: true, can_delegate: true, territory: 'All' },
}

function Probe() {
  const l = useLocation()
  return <div data-testid="probe">{l.pathname}|{JSON.stringify(l.state)}</div>
}

const shell = (ui, entries = ['/']) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/" element={ui} />
            <Route path="/customers/:id" element={ui} />
            <Route path="/visit-mode/:id" element={ui} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const PRODUCTS = { data: [
  { id: 1, part_num: 'STM-1000', description: 'Saus Tomat 1kg', price: '28500', uom: 'DUS' },
  { id: 2, part_num: 'SBL-1000', description: 'Saus Sambal 1kg', price: '30000', uom: 'DUS' },
] }
const CUSTOMERS = { data: [{ id: 10, name: 'PT Pembeli' }, { id: 11, name: 'PT Distributor' }] }

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = U.order
  api.getProducts.mockResolvedValue(PRODUCTS)
  api.getCustomers.mockResolvedValue(CUSTOMERS)
  api.getPromos.mockResolvedValue({ data: [] })
})

// ------------------------------------------------------------------ Delegasi

describe('Halaman Delegasi', () => {
  const pending = (over = {}) => ({
    id: 1, status: 'PENDING', note: 'Tolong diorder', delegated_at: '2026-09-20T03:00:00Z',
    lead: { id: 5, business_name: 'CV Harmoni Rasa' }, from: { id: 2, name: 'Rina' }, to: { id: 1, name: 'Toni' },
    quote: { id: 8, quote_number: 'QT-STG-2026-000008', total: '5529000', status: 'WON' }, order: null, ...over,
  })

  it('Sales Order: daftar masuk, Buat Order membuka Quotation yang dibawa delegasi', async () => {
    api.getDelegations.mockResolvedValue([pending()])
    const user = userEvent.setup()
    shell(<Delegations />)

    expect(await screen.findByText('CV Harmoni Rasa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Masuk (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keluar (0)' })).toBeInTheDocument()
    expect(screen.getByText(/Rina → Toni/)).toBeInTheDocument()
    expect(screen.getByText(/QT-STG-2026-000008/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Semua (1)' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Buat Order/ }))
    expect((await screen.findByTestId('probe')).textContent).toContain('/quotes/8')
  })

  it('tanpa Quotation, Buat Order membuka form order dengan prospek terisi', async () => {
    api.getDelegations.mockResolvedValue([pending({ quote: null })])
    const user = userEvent.setup()
    shell(<Delegations />)
    await user.click(await screen.findByRole('button', { name: /Buat Order/ }))
    const probe = (await screen.findByTestId('probe')).textContent
    expect(probe).toContain('/orders/new')
    expect(probe).toContain('"leadId":5')
    expect(probe).toContain('CV Harmoni Rasa')
  })

  it('Dealmaker: tab Keluar, bisa membatalkan, tidak ada Buat Order', async () => {
    auth.user = U.dealmaker
    api.getDelegations.mockResolvedValue([pending()])
    api.cancelDelegation.mockResolvedValue({})
    const user = userEvent.setup()
    shell(<Delegations />)

    expect(await screen.findByText('CV Harmoni Rasa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Buat Order/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Batalkan' }))
    await waitFor(() => expect(api.cancelDelegation).toHaveBeenCalledWith(1))
    await waitFor(() => expect(api.getDelegations).toHaveBeenCalledTimes(2)) // daftar dimuat ulang
  })

  it('delegasi yang sudah jadi order menampilkan nomor order tanpa aksi', async () => {
    api.getDelegations.mockResolvedValue([pending({ status: 'ORDERED', order: { order_number: 'SO-STG-2026-000042' } })])
    shell(<Delegations />)
    expect(await screen.findByText('Order SO-STG-2026-000042')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Buat Order/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Batalkan' })).not.toBeInTheDocument()
  })

  it('supervisor melihat semua delegasi dan bisa membatalkan milik siapa pun', async () => {
    auth.user = U.supervisor
    api.getDelegations.mockResolvedValue([pending()])
    shell(<Delegations />)
    expect(await screen.findByRole('button', { name: 'Semua (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Batalkan' })).toBeInTheDocument()
  })

  it('daftar kosong menampilkan petunjuk', async () => {
    api.getDelegations.mockResolvedValue([])
    shell(<Delegations />)
    expect(await screen.findByText('Belum ada delegasi masuk.')).toBeInTheDocument()
  })
})

// ------------------------------------------------------------------ Laporan NOO

describe('rangeFor (periode laporan)', () => {
  const now = new Date(2026, 2, 15) // 15 Maret 2026
  it('menghitung batas periode', () => {
    expect(rangeFor('month', now)).toEqual({ from: '2026-03-01', to: '2026-03-15' })
    expect(rangeFor('lastmonth', now)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(rangeFor('90d', now)).toEqual({ from: '2025-12-16', to: '2026-03-15' })
    expect(rangeFor('year', now)).toEqual({ from: '2026-01-01', to: '2026-03-15' })
  })
})

describe('Halaman Laporan NOO', () => {
  const report = (rows, totals) => ({
    period: { from: '2026-09-01', to: '2026-09-28' }, group_by: 'sales', rows, totals,
  })
  const rowA = { key: '1', label: 'Andi', registered: 4, won: 2, lost: 1, ordered: 1, win_rate: 66.7 }
  const rowB = { key: '2', label: 'Bella', registered: 2, won: 1, lost: 2, ordered: 0, win_rate: 33.3 }

  it('menampilkan ringkasan dan baris per sales, lalu memuat ulang saat periode / pengelompokan berubah', async () => {
    api.getNooReport.mockResolvedValue(report([rowA, rowB], { registered: 6, won: 3, lost: 3, ordered: 1, win_rate: 50 }))
    const user = userEvent.setup()
    shell(<NooReport />)

    expect(await screen.findByText('Andi')).toBeInTheDocument()
    expect(screen.getByText('2 NOO')).toBeInTheDocument()
    expect(screen.getByText(/Sudah order 1 dari 2 NOO · Win rate 66.7%/)).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(api.getNooReport).toHaveBeenLastCalledWith(expect.objectContaining({ group_by: 'sales', from: expect.stringMatching(/-01$/) }))

    await user.click(screen.getByRole('button', { name: 'Per Territory' }))
    await waitFor(() => expect(api.getNooReport).toHaveBeenLastCalledWith(expect.objectContaining({ group_by: 'territory' })))

    await user.click(screen.getByRole('button', { name: 'Tahun ini' }))
    await waitFor(() => expect(api.getNooReport).toHaveBeenLastCalledWith(expect.objectContaining({ from: `${new Date().getFullYear()}-01-01` })))
  })

  it('tanpa data menampilkan pesan dan win rate strip', async () => {
    api.getNooReport.mockResolvedValue(report([], { registered: 0, won: 0, lost: 0, ordered: 0, win_rate: null }))
    shell(<NooReport />)
    expect(await screen.findByText('Belum ada data pada periode ini.')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

// ------------------------------------------------------------------ Master data

describe('Master Data', () => {
  beforeEach(() => {
    auth.user = U.admin
    api.getProductPackagings.mockResolvedValue([
      { id: 5, product_id: 1, name: 'Pouch 500 gr', gramasi_gr: '500.00', active: true },
      { id: 6, product_id: 1, name: 'Sachet 20 gr', gramasi_gr: '20.00', active: false },
    ])
    api.getDiscountStrata.mockResolvedValue([
      { id: 1, product_id: null, min_kg: '100.000', max_kg: '499.000', discount_percent: '2.00', active: true },
      { id: 2, product_id: 2, min_kg: '500.000', max_kg: null, discount_percent: '6.00', active: true },
    ])
    api.getCodeMappings.mockResolvedValue([{ id: 3, entity_type: 'product', local_id: 1, external_system: 'epicor', external_code: 'FG-001' }])
    api.getUsers.mockResolvedValue([
      { id: 1, name: 'Toni', username: 'toni', role: 'sales', sales_type: 'ORDER', territory: 'Sidoarjo', active: true },
      { id: 2, name: 'Rina', username: 'rina', role: 'sales', sales_type: 'DEALMAKER', territory: 'Surabaya', active: true },
      { id: 4, name: 'Adm', username: 'admin', role: 'admin', sales_type: 'ORDER', territory: 'All', active: true },
    ])
  })

  it('hanya untuk admin / supervisor', async () => {
    auth.user = U.order
    shell(<MasterData />)
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getProducts).not.toHaveBeenCalled()
  })

  it('Kemasan: daftar per produk, tambah, nonaktifkan, hapus, dan galat server', async () => {
    api.createProductPackaging.mockResolvedValue({})
    api.updateProductPackaging.mockResolvedValue({})
    api.deleteProductPackaging.mockResolvedValue({})
    const user = userEvent.setup()
    shell(<MasterData />)

    expect(await screen.findByText('Pouch 500 gr')).toBeInTheDocument()
    expect(api.getProductPackagings).toHaveBeenCalledWith({ product_id: '1', include_inactive: 1 })
    expect(screen.getByText(/20 gr per pcs · nonaktif/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nama kemasan'), 'Sachet 10 gr')
    await user.type(screen.getByLabelText('Gramasi (gr per pcs)'), '10')
    await user.click(screen.getByRole('button', { name: 'Tambah' }))
    await waitFor(() => expect(api.createProductPackaging).toHaveBeenCalledWith({ product_id: 1, name: 'Sachet 10 gr', gramasi_gr: 10 }))

    await user.click(screen.getAllByText('nonaktifkan')[0])
    await waitFor(() => expect(api.updateProductPackaging).toHaveBeenCalledWith(5, { active: false }))
    await user.click(screen.getAllByText('hapus')[1])
    await waitFor(() => expect(api.deleteProductPackaging).toHaveBeenCalledWith(6))

    api.createProductPackaging.mockRejectedValue(new Error('The gramasi gr has already been taken.'))
    await user.type(screen.getByLabelText('Nama kemasan'), 'Ganda')
    await user.type(screen.getByLabelText('Gramasi (gr per pcs)'), '500')
    await user.click(screen.getByRole('button', { name: 'Tambah' }))
    expect(await screen.findByText('The gramasi gr has already been taken.')).toBeInTheDocument()
  })

  it('Kemasan: input tidak lengkap ditolak sebelum dikirim', async () => {
    const user = userEvent.setup()
    shell(<MasterData />)
    await screen.findByText('Pouch 500 gr')
    await user.click(screen.getByRole('button', { name: 'Tambah' }))
    expect(await screen.findByText(/Isi nama kemasan dan gramasi/)).toBeInTheDocument()
    expect(api.createProductPackaging).not.toHaveBeenCalled()
  })

  it('Strata: menampilkan tier, menambah tier umum, dan menghapus', async () => {
    api.createDiscountStratum.mockResolvedValue({})
    api.deleteDiscountStratum.mockResolvedValue({})
    const user = userEvent.setup()
    shell(<MasterData />)
    await user.click(await screen.findByRole('button', { name: 'Strata' }))

    expect(await screen.findByText(/100 Kg – 499 Kg · 2%/)).toBeInTheDocument()
    const specific = screen.getByText(/500 Kg ke atas · 6%/).closest('.card')
    expect(within(specific).getByText('Saus Sambal 1kg')).toBeInTheDocument() // tier khusus produk memakai nama produk
    expect(within(screen.getByText(/100 Kg – 499 Kg · 2%/).closest('.card')).getByText('Semua produk')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Minimal (Kg)'), '1000')
    await user.type(screen.getByLabelText('Diskon (%)'), '5')
    await user.click(screen.getByRole('button', { name: 'Tambah tier' }))
    await waitFor(() => expect(api.createDiscountStratum).toHaveBeenCalledWith({ product_id: null, min_kg: 1000, max_kg: null, discount_percent: 5 }))

    await user.click(screen.getAllByText('hapus')[0])
    await waitFor(() => expect(api.deleteDiscountStratum).toHaveBeenCalledWith(1))
  })

  it('Kode: daftar mapping bernama, simpan (menimpa), dan pindah ke Customer', async () => {
    api.saveCodeMapping.mockResolvedValue({})
    const user = userEvent.setup()
    shell(<MasterData />)
    await user.click(await screen.findByRole('button', { name: 'Kode' }))

    expect(await screen.findByText('Saus Tomat 1kg')).toBeInTheDocument()
    expect(screen.getByText('FG-001')).toBeInTheDocument()
    expect(api.getCodeMappings).toHaveBeenCalledWith({ entity_type: 'product' })

    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText(/Pilih data lokal dan isi kode tujuan/)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Produk'), '2')
    await user.type(screen.getByLabelText('Kode di sistem tujuan'), 'FG-777')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(api.saveCodeMapping).toHaveBeenCalledWith({ entity_type: 'product', local_id: 2, external_system: 'epicor', external_code: 'FG-777' }))

    await user.click(screen.getByRole('button', { name: 'Customer' }))
    await waitFor(() => expect(api.getCodeMappings).toHaveBeenLastCalledWith({ entity_type: 'customer' }))
    expect(within(screen.getByLabelText('Customer')).getByRole('option', { name: 'PT Distributor' })).toBeInTheDocument()
  })

  it('Tim Sales: admin mengubah tipe dan membuat user (tipe hanya untuk sales)', async () => {
    api.updateUser.mockResolvedValue({})
    api.createUser.mockResolvedValue({})
    const user = userEvent.setup()
    shell(<MasterData />)
    await user.click(await screen.findByRole('button', { name: 'Tim Sales' }))

    expect(await screen.findByText('Sales Dealmaker', { selector: 'span' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Peran Toni'), 'DEALMAKER')
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(1, { sales_type: 'DEALMAKER' }))

    // admin tidak bisa menonaktifkan dirinya sendiri (tombol tidak ditawarkan)
    const adminCard = screen.getByText('Adm').closest('.card')
    expect(within(adminCard).queryByRole('button', { name: 'Nonaktifkan' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Tambah user' }))
    await user.type(screen.getByLabelText('Nama'), 'Sales Baru')
    await user.type(screen.getByLabelText('Username'), 'sales.baru')
    await user.type(screen.getByLabelText('Email'), 'baru@x.local')
    await user.type(screen.getByLabelText(/Password/), 'rahasia123')
    await user.selectOptions(screen.getByLabelText('Tipe sales'), 'DEALMAKER')
    await user.type(screen.getByLabelText('Territory'), 'Gresik')
    await user.click(screen.getByRole('button', { name: 'Simpan user' }))
    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Sales Baru', username: 'sales.baru', role: 'sales', sales_type: 'DEALMAKER', territory: 'Gresik',
    })))
  })

  it('Tim Sales: supervisor hanya membaca', async () => {
    auth.user = U.supervisor
    const user = userEvent.setup()
    shell(<MasterData />)
    await user.click(await screen.findByRole('button', { name: 'Tim Sales' }))
    expect(await screen.findByText('Rina')).toBeInTheDocument()
    expect(screen.queryByLabelText('Peran Toni')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Tambah user' })).not.toBeInTheDocument()
    expect(screen.getByText(/Hanya admin yang dapat menambah atau mengubah user/)).toBeInTheDocument()
  })
})

// ------------------------------------------------------------------ Penjagaan peran di seluruh aplikasi

describe('Penjagaan peran: Sales Dealmaker tidak membuat order', () => {
  const dash = (delegations) => ({ user: { name: 'X' }, pipeline: [], activities: {}, ar: {}, delegations })

  it('halaman Catat Order tertutup untuk Dealmaker dan terbuka untuk Sales Order', async () => {
    auth.user = U.dealmaker
    const { unmount } = shell(<NewOrder />)
    expect(await screen.findByText('Sales Dealmaker tidak membuat order')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buat Order' })).not.toBeInTheDocument()
    unmount()

    auth.user = U.order
    api.getProductPackagings.mockResolvedValue([])
    shell(<NewOrder />)
    expect(await screen.findByRole('button', { name: 'Buat Order' })).toBeInTheDocument()
  })

  it('Home Dealmaker: tanpa tile New Order, tile Delegasi berbadge (keluar), label peran tampil', async () => {
    auth.user = U.dealmaker
    api.getDashboard.mockResolvedValue(dash({ incoming_pending: 0, outgoing_pending: 3 }))
    const { container } = shell(<Home />)
    expect(await screen.findByText('Delegasi')).toBeInTheDocument()
    expect(screen.queryByText('New Order')).not.toBeInTheDocument()
    expect(screen.queryByText('Master Data')).not.toBeInTheDocument()
    expect(screen.getByText('Laporan NOO')).toBeInTheDocument()
    expect(screen.getByText(/Sales Dealmaker · Surabaya/)).toBeInTheDocument()
    expect(within(screen.getByText('Delegasi').closest('.gitem')).getByText('3')).toBeInTheDocument()
    expect(container.querySelector('.gitem')).not.toBeNull()
  })

  it('Home Sales Order: tile New Order ada, badge Delegasi memakai jumlah masuk', async () => {
    auth.user = U.order
    api.getDashboard.mockResolvedValue(dash({ incoming_pending: 2, outgoing_pending: 9 }))
    shell(<Home />)
    expect(await screen.findByText('New Order')).toBeInTheDocument()
    const tile = screen.getByText('Delegasi').closest('.gitem')
    expect(within(tile).getByText('2')).toBeInTheDocument()
    expect(within(tile).queryByText('9')).not.toBeInTheDocument()
    expect(screen.queryByText('Master Data')).not.toBeInTheDocument()
  })

  it('Home admin / supervisor: ada tile Master Data', async () => {
    for (const who of [U.admin, U.supervisor]) {
      auth.user = who
      api.getDashboard.mockResolvedValue(dash({ incoming_pending: 0, outgoing_pending: 0 }))
      const { unmount } = shell(<Home />)
      expect(await screen.findByText('Master Data')).toBeInTheDocument()
      unmount()
    }
  })

  it('detail customer: aksi Order disembunyikan untuk Dealmaker', async () => {
    api.getCustomer.mockResolvedValue({ id: 10, name: 'PT Pembeli', customer_code: 'C-10' })
    auth.user = U.dealmaker
    const { unmount } = shell(<CustomerDetail />, ['/customers/10'])
    await screen.findByText('Lacak Order')
    expect(screen.queryByText('Order', { selector: '.t' })).not.toBeInTheDocument()
    unmount()

    auth.user = U.order
    shell(<CustomerDetail />, ['/customers/10'])
    await screen.findByText('Lacak Order')
    expect(screen.getByText('Order', { selector: '.t' })).toBeInTheDocument()
  })

  it('Visit Mode: tile Order disembunyikan untuk Dealmaker, New Lead tetap ada', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    const state = { visitId: 12, customer: { id: 10, name: 'PT Pembeli' }, checkedInAt: new Date().toISOString() }
    auth.user = U.dealmaker
    render(
      <MemoryRouter initialEntries={[{ pathname: '/visit-mode/12', state }]}>
        <UiProvider>
          <Routes>
            <Route path="/visit-mode/:id" element={<VisitMode />} />
          </Routes>
        </UiProvider>
      </MemoryRouter>,
    )
    // Quick actions sudah dihapus dari Visit Mode (revisi functional): tidak ada tile aksi sama sekali.
    expect(await screen.findByText('Checkout')).toBeInTheDocument()
    expect(screen.queryByText('New Lead')).not.toBeInTheDocument()
    expect(screen.queryByText('Bayar')).not.toBeInTheDocument()
    expect(screen.queryByText('Order', { selector: '.t' })).not.toBeInTheDocument()
  })
})
