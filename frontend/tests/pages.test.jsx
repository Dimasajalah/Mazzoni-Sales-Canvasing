import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({
  getProducts: vi.fn(), getPromos: vi.fn(), getCustomer: vi.fn(), getOrders: vi.fn(), getOrderTracker: vi.fn(),
  getQuotes: vi.fn(), getProductPackagings: vi.fn(), getDiscountStrata: vi.fn(), getCompetitors: vi.fn(), getSamples: vi.fn(), getQuote: vi.fn(),
  getLeads: vi.fn(), getLead: vi.fn(), getLeadTasks: vi.fn(), getTaskSets: vi.fn(), createLead: vi.fn(), uploadLeadPhoto: vi.fn(),
  getVisit: vi.fn(), checkoutVisit: vi.fn(), getCustomers: vi.fn(), checkinVisit: vi.fn(),
  getDashboard: vi.fn(), createOrder: vi.fn(), createExpense: vi.fn(), createReturn: vi.fn(), globalSearch: vi.fn(),
  concludeLeadTask: vi.fn(), createJourneyEntry: vi.fn(), getTaskTemplates: vi.fn(), updateLead: vi.fn(), updateLeadTask: vi.fn(),
}))
vi.mock('../src/lib/geocode.js', () => ({
  searchAddress: vi.fn().mockResolvedValue([]),
  reverseGeocode: vi.fn().mockResolvedValue({ label: 'Jl. Uji', city: '', province: '', postal_code: '', country: 'Indonesia' }),
}))
vi.mock('../src/lib/wilayah.js', async () => {
  const actual = await vi.importActual('../src/lib/wilayah.js')
  return { matchByName: actual.matchByName, getProvinces: vi.fn(), getRegencies: vi.fn() }
})
vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { name: 'Budi Santoso', role: 'sales' }, isAuthenticated: true, logout: vi.fn() }),
}))

import * as api from '../src/api/index.js'
import * as geocode from '../src/lib/geocode.js'
import * as wilayah from '../src/lib/wilayah.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import Activities from '../src/pages/Activities.jsx'
import Checkin from '../src/pages/Checkin.jsx'
import CustomerDetail from '../src/pages/CustomerDetail.jsx'
import Home from '../src/pages/Home.jsx'
import NewOrder from '../src/pages/NewOrder.jsx'
import Tracker from '../src/pages/Tracker.jsx'
import Leads from '../src/pages/Leads.jsx'
import NewLead from '../src/pages/NewLead.jsx'
import VisitMode from '../src/pages/VisitMode.jsx'

const shell = (ui, entries = ['/']) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>{ui}</PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}|{JSON.stringify(loc.state)}</div>
}

const gps = (lat, lng) => {
  const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: lat, longitude: lng, accuracy: 8 } }))
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}

const task = (over = {}) => ({
  id: 1, seq: 30, name: 'Kunjungan perkenalan (canvassing)', task_type: 'Kunjungan', stage: 'OPPORTUNITY',
  is_closing: false, due_date: null, actions: ['brand'], ...over,
})
// status_customer eksplisit (param ke-6) untuk tes Pipeline Customer; default dari win_loss
// menjaga pemanggil lama (mis. describe Activities) tetap jalan tanpa perlu diubah.
const L = (id, name, stage, win_loss, current_task = null, status_customer) => ({
  id, business_name: name, owner_name: 'Pemilik', stage, win_loss, task_set_id: 1, current_task,
  status_customer: status_customer || (win_loss === 'WIN' ? 'WIN' : win_loss === 'LOSE' ? 'LOSE' : 'PROSPEK'),
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
})

describe('Halaman Leads', () => {
  // Pipeline Customer (hasil meeting Okt 2026, poin 6): status_customer eksplisit per lead.
  const leads = [
    L(1, 'Lead A', 'LEAD', 'OPEN', task({ id: 11, seq: 10, name: 'Identifikasi', actions: [] }), 'PROSPEK'),
    L(2, 'Opp B', 'OPPORTUNITY', 'OPEN', task(), 'BRAND_AWARENESS'),
    L(3, 'Opp C', 'OPPORTUNITY', 'OPEN', task({ id: 13 }), 'SAMPLING'),
    L(4, 'Quote D', 'QUOTE', 'OPEN', task({ id: 14, seq: 60, stage: 'QUOTE', actions: ['quote'] }), 'QUOTATION'),
    L(5, 'Menang E', 'QUOTE', 'WIN', null, 'WIN'),
    L(6, 'Kalah F', 'LEAD', 'LOSE', null, 'LOSE'),
  ]

  it('menampilkan chip 8 status_customer dengan hitungan, memfilter, dan membuka sheet tugas', async () => {
    api.getLeads.mockResolvedValue({ data: leads })
    const user = userEvent.setup()
    shell(<Leads />)

    expect(await screen.findByRole('button', { name: 'Semua (6)' })).toBeInTheDocument()
    for (const label of [
      'Lead (0)', 'Prospek (1)', 'Brand Awareness (1)', 'Sampling (1)',
      'Quotation (1)', 'Win (1)', 'Lose (1)', 'Distribution (0)',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    // filter status_customer hanya menampilkan lead pada status itu
    await user.click(screen.getByRole('button', { name: 'Quotation (1)' }))
    expect(screen.getByText('Quote D')).toBeInTheDocument()
    expect(screen.queryByText('Menang E')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Win (1)' }))
    expect(screen.getByText('Menang E')).toBeInTheDocument()
    expect(screen.queryByText('Quote D')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Brand Awareness (1)' }))
    await user.click(screen.getByText('Opp B'))
    // sheet berisi panel tugas milik lead tsb
    expect(await screen.findByRole('button', { name: /Selesaikan Tugas/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Form Brand/ })).toBeInTheDocument()
  })

  it('kartu menampilkan satu badge status_customer dan tugas aktif', async () => {
    api.getLeads.mockResolvedValue({ data: leads })
    shell(<Leads />)
    const card = (await screen.findByText('Menang E')).closest('.card')
    expect(within(card).getByText('Win')).toBeInTheDocument()
    expect(within(card).queryByText('Quote')).not.toBeInTheDocument()
    expect(within(card).getByText(/Prospek ditutup/)).toBeInTheDocument()
  })
})

describe('Halaman Activities', () => {
  it('menampilkan ringkasan, daftar tugas, dan membuka panel tugas', async () => {
    api.getLeadTasks.mockResolvedValue({
      items: [task({ lead: L(2, 'Opp B', 'OPPORTUNITY', 'OPEN') })],
      summary: { unscheduled: 3, late: 2, scheduled: 1, total: 6 },
    })
    const user = userEvent.setup()
    shell(<Activities />)

    expect(await screen.findByText('Kunjungan perkenalan (canvassing)')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Belum dijadwalkan', { selector: 'div' })).toBeInTheDocument()

    await user.click(screen.getByText('Kunjungan perkenalan (canvassing)'))
    expect(await screen.findByRole('button', { name: /Selesaikan Tugas/ })).toBeInTheDocument()
  })

  it('daftar kosong menampilkan pesan semua tugas selesai', async () => {
    api.getLeadTasks.mockResolvedValue({ items: [], summary: { unscheduled: 0, late: 0, scheduled: 0, total: 0 } })
    shell(<Activities />)
    expect(await screen.findByText('Semua tugas selesai')).toBeInTheDocument()
  })
})

describe('Halaman NewLead', () => {
  const REGENCIES = {
    '31': [{ id: '3171', province_id: '31', name: 'KOTA JAKARTA PUSAT' }],
    '35': [{ id: '3578', province_id: '35', name: 'KOTA SURABAYA' }],
    '36': [{ id: '3671', province_id: '36', name: 'KOTA TANGERANG' }],
  }

  beforeEach(() => {
    api.getTaskSets.mockResolvedValue([{ id: 1, code: 'B2B', name: 'B2B' }, { id: 2, code: 'B2C', name: 'B2C' }])
    wilayah.getProvinces.mockResolvedValue([
      { id: '31', name: 'DKI JAKARTA' }, { id: '35', name: 'JAWA TIMUR' }, { id: '36', name: 'BANTEN' },
    ])
    wilayah.getRegencies.mockImplementation((id) => Promise.resolve(REGENCIES[id] || []))
  })

  it('mengirim task_set_id (default B2B), Store Type sesuai prototype, tanpa field task lama, lalu mengunggah foto toko', async () => {
    api.createLead.mockResolvedValue({ id: 55 })
    api.uploadLeadPhoto.mockResolvedValue({})
    const user = userEvent.setup()
    const { container } = shell(<NewLead />, ['/leads/new'])

    await waitFor(() => expect(screen.getByLabelText('Task Set')).toHaveValue('1'))
    expect(screen.getByLabelText('Store Type')).toHaveValue('Distributor Retail')
    expect(within(screen.getByLabelText('Store Type')).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Distributor Retail', 'Grosir', 'Manufaktur'])
    expect(screen.queryByLabelText('Scoring Lead')).not.toBeInTheDocument() // dihapus (poin 5)
    expect(screen.queryByLabelText('Nama Pemilik')).not.toBeInTheDocument() // poin 3: cuma satu field nama (Nama Customer)
    expect(screen.getByText('Foto Store')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nama Customer'), 'UD Baru')
    await user.type(screen.getByLabelText('KTP'), '3578010101900001')
    const file = new File(['x'], 'toko.jpg', { type: 'image/jpeg' })
    await user.upload(container.querySelectorAll('input[type=file]')[1], file)
    await user.click(screen.getByRole('button', { name: 'Simpan Lead' }))

    await waitFor(() => expect(api.createLead).toHaveBeenCalledTimes(1))
    const payload = api.createLead.mock.calls[0][0]
    expect(payload).toMatchObject({ business_name: 'UD Baru', ktp: '3578010101900001', business_type: 'Distributor Retail', task_set_id: 1 })
    expect(payload).not.toHaveProperty('task_type_id')
    expect(payload).not.toHaveProperty('task_id')
    expect(payload.latitude).toBeNull() // lokasi belum dipilih => tidak menyimpan koordinat palsu
    await waitFor(() => expect(api.uploadLeadPhoto).toHaveBeenCalledWith(55, file))
  })

  it('poin 3: Customer Address terpecah (Alamat/Kota/Provinsi/Postal Code/Country) dan Information Add-on (Potensi/Value) terkirim', async ()=> {
    api.createLead.mockResolvedValue({ id: 56 })
    const user = userEvent.setup()
    shell(<NewLead />, ['/leads/new'])

    await screen.findByLabelText('Nama Customer')
    expect(screen.getByLabelText('Country')).toHaveValue('Indonesia') // default

    await user.type(screen.getByLabelText('Nama Customer'), 'UD Alamat')
    await user.selectOptions(screen.getByLabelText('Provinsi'), '35')
    await user.selectOptions(await screen.findByLabelText('Kota'), '3578')
    await user.type(screen.getByLabelText('Alamat'), 'Jl. Merdeka No. 1')
    await user.type(screen.getByLabelText('Postal Code'), '60111')
    await user.type(screen.getByLabelText('Potensi / Value'), '5000000')
    await user.click(screen.getByRole('button', { name: 'Simpan Lead' }))

    await waitFor(() => expect(api.createLead).toHaveBeenCalledTimes(1))
    expect(api.createLead.mock.calls[0][0]).toMatchObject({
      address: 'Jl. Merdeka No. 1', city: 'KOTA SURABAYA', province: 'JAWA TIMUR',
      postal_code: '60111', country: 'Indonesia',
      estimated_value: 5000000,
    })
    expect(api.createLead.mock.calls[0][0]).not.toHaveProperty('lead_source')
  })

  it('poin 1: mengetik Alamat/Kota memunculkan peta di lokasi itu (geocode otomatis, bukan cari manual)', async () => {
    geocode.searchAddress.mockResolvedValue([{ label: 'Jl. Rungkut, Surabaya', lat: -7.33, lng: 112.75, city: 'Surabaya' }])
    const user = userEvent.setup()
    shell(<NewLead />, ['/leads/new'])

    // tidak ada lagi kotak "Cari" di peta -- alamat yang mendorong peta, bukan sebaliknya
    expect(screen.queryByPlaceholderText(/Cari alamat/)).not.toBeInTheDocument()
    expect(screen.getByText('Belum ada lokasi dipilih')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Alamat'), 'Jl. Rungkut')
    await user.type(screen.getByLabelText('Kota'), 'Surabaya')

    await waitFor(() => expect(geocode.searchAddress).toHaveBeenCalledWith(expect.stringContaining('Jl. Rungkut')), { timeout: 2000 })
    // peta pindah dari "belum ada lokasi" ke titik hasil geocode alamat yang diketik
    await waitFor(() => expect(screen.queryByText('Belum ada lokasi dipilih')).not.toBeInTheDocument(), { timeout: 2000 })
  })

  it('pencarian otomatis hanya pakai teks Alamat, TIDAK digabung Kota/Postal lama (hindari query kontradiktif)', async () => {
    geocode.searchAddress.mockResolvedValue([{ label: 'SMA 10 Tangerang', lat: -6.2, lng: 106.6, city: 'Tangerang' }])
    const user = userEvent.setup()
    shell(<NewLead />, ['/leads/new'])

    // Kota sudah terisi (mis. dari GPS awal) SEBELUM sales mengetik Alamat baru
    await user.type(await screen.findByLabelText('Kota'), 'Daerah Khusus Ibukota Jakarta')
    geocode.searchAddress.mockClear()

    await user.type(screen.getByLabelText('Alamat'), 'sma 10 tangerang')
    await waitFor(() => expect(geocode.searchAddress).toHaveBeenCalledWith('sma 10 tangerang'), { timeout: 2000 })
    // bukan digabung jadi "sma 10 tangerang, Daerah Khusus Ibukota Jakarta, ..."
    expect(geocode.searchAddress).not.toHaveBeenCalledWith(expect.stringContaining('Jakarta'))
  })

  it('Kota/Provinsi/Kode Pos yang BELUM pernah dipilih manual ikut diperbarui saat Alamat diganti ke lokasi lain (tidak "terkunci" di nilai lama)', async () => {
    geocode.reverseGeocode
      .mockResolvedValueOnce({ label: 'Jl. Lama, Jakarta', city: 'Jakarta Pusat', province: 'DKI Jakarta', postal_code: '10160', country: 'Indonesia' })
    geocode.searchAddress.mockResolvedValue([{
      label: 'SMA 10, Tangerang', lat: -6.2, lng: 106.6, city: 'Tangerang', province: 'Banten', postal_code: '15118',
    }])
    const user = userEvent.setup()
    shell(<NewLead />, [{ pathname: '/leads/new', state: { prefill: { coords: { lat: -6.17, lng: 106.82 } } } }])

    // Kota & Provinsi awal terpilih otomatis dari GPS (Jakarta Pusat / DKI Jakarta) -- dropdown,
    // belum pernah dipilih manual oleh sales
    const citySelect = screen.getByLabelText('Kota')
    const provinceSelect = screen.getByLabelText('Provinsi')
    await waitFor(() => expect(provinceSelect).toHaveValue('31'), { timeout: 2000 })
    await waitFor(() => expect(citySelect).toHaveValue('3171'), { timeout: 2000 }) // KOTA JAKARTA PUSAT

    await user.type(screen.getByLabelText('Alamat'), 'sma 10 tangerang')
    await waitFor(() => expect(geocode.searchAddress).toHaveBeenCalled(), { timeout: 2000 })
    // Kota & Provinsi ikut diperbarui ke lokasi baru (Tangerang/Banten), bukan tetap Jakarta yang basi
    await waitFor(() => expect(provinceSelect).toHaveValue('36'), { timeout: 2000 }) // BANTEN
    await waitFor(() => expect(citySelect).toHaveValue('3671'), { timeout: 2000 }) // KOTA TANGERANG
    expect(screen.getByLabelText('Postal Code')).toHaveValue('15118')
  })

  it('Kota nonaktif sampai Provinsi dipilih, lalu daftar kota berganti sesuai Provinsi yang dipilih', async () => {
    const user = userEvent.setup()
    shell(<NewLead />, ['/leads/new'])

    const citySelect = await screen.findByLabelText('Kota')
    expect(citySelect).toBeDisabled()
    expect(screen.getByText('Pilih Provinsi dulu.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Provinsi'), '35')
    await waitFor(() => expect(citySelect).toBeEnabled())
    expect(within(citySelect).getByRole('option', { name: 'KOTA SURABAYA' })).toBeInTheDocument()
    expect(within(citySelect).queryByRole('option', { name: 'KOTA TANGERANG' })).not.toBeInTheDocument()
  })

  it('ganti Provinsi mengosongkan Kota yang sudah dipilih sebelumnya (kota lama sudah tidak relevan)', async () => {
    const user = userEvent.setup()
    shell(<NewLead />, ['/leads/new'])

    await screen.findByRole('option', { name: 'JAWA TIMUR' })
    await user.selectOptions(screen.getByLabelText('Provinsi'), '35')
    await user.selectOptions(await screen.findByLabelText('Kota'), '3578')
    expect(screen.getByLabelText('Kota')).toHaveValue('3578')

    await user.selectOptions(screen.getByLabelText('Provinsi'), '36')
    await waitFor(() => expect(screen.getByLabelText('Kota')).toHaveValue(''))

    // bukan cuma tampilan dropdown yang kosong -- data yang akan terkirim pun harus benar
    // kosong (bukan diam-diam masih menyimpan "KOTA SURABAYA" yang sudah tidak relevan)
    api.createLead.mockResolvedValue({ id: 99 })
    await user.type(screen.getByLabelText('Nama Customer'), 'UD Ganti Provinsi')
    await user.click(screen.getByRole('button', { name: 'Simpan Lead' }))
    await waitFor(() => expect(api.createLead).toHaveBeenCalled())
    expect(api.createLead.mock.calls[0][0].city).toBe('')
  })

  it('Provinsi/Kota yang SUDAH dipilih manual tidak ditimpa lagi oleh hasil geocoding Alamat', async () => {
    geocode.searchAddress.mockResolvedValue([{
      label: 'Jl. Lain, Tangerang', lat: -6.2, lng: 106.6, city: 'Tangerang', province: 'Banten', postal_code: '15118',
    }])
    const user = userEvent.setup()
    shell(<NewLead />, ['/leads/new'])

    await screen.findByRole('option', { name: 'JAWA TIMUR' })
    await user.selectOptions(screen.getByLabelText('Provinsi'), '35')
    await user.selectOptions(await screen.findByLabelText('Kota'), '3578') // pilihan manual sales

    await user.type(screen.getByLabelText('Alamat'), 'alamat lain di tangerang')
    await waitFor(() => expect(geocode.searchAddress).toHaveBeenCalled(), { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 300))

    // tetap JAWA TIMUR / KOTA SURABAYA -- pilihan manual sales tidak boleh ditimpa
    expect(screen.getByLabelText('Provinsi')).toHaveValue('35')
    expect(screen.getByLabelText('Kota')).toHaveValue('3578')
  })

  it('kegagalan simpan menyimpan draft lokal agar data tidak hilang', async () => {
    api.createLead.mockRejectedValue(new Error('Server error'))
    const user = userEvent.setup()
    shell(<NewLead />, ['/leads/new'])
    await user.type(screen.getByLabelText('Nama Customer'), 'UD Draft')
    await user.type(screen.getByLabelText('KTP'), '1')
    await user.click(screen.getByRole('button', { name: 'Simpan Lead' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('sc_draft_lead') || '[]')).toHaveLength(1))
    expect(api.uploadLeadPhoto).not.toHaveBeenCalled()
  })

  it('lokasi dari prefill kunjungan dipakai sebagai koordinat awal', async () => {
    api.createLead.mockResolvedValue({ id: 1 })
    const user = userEvent.setup()
    shell(<NewLead />, [{ pathname: '/leads/new', state: { prefill: { coords: { lat: -7.3, lng: 112.7 } } } }])
    await user.type(screen.getByLabelText('Nama Customer'), 'Dari Kunjungan')
    await user.type(screen.getByLabelText('KTP'), '9')
    await user.click(screen.getByRole('button', { name: 'Simpan Lead' }))
    await waitFor(() => expect(api.createLead).toHaveBeenCalled())
    expect(api.createLead.mock.calls[0][0]).toMatchObject({ latitude: -7.3, longitude: 112.7 })
  })
})

describe('Visit Mode & Check-in', () => {
  const routes = (
    <Routes>
      <Route path="/visit-mode/:id" element={<VisitMode />} />
      <Route path="/leads/new" element={<Probe />} />
      <Route path="/checkin" element={<Checkin />} />
      <Route path="*" element={<Probe />} />
    </Routes>
  )
  // timestamp dibuat per tes (bukan saat file dimuat) agar durasi tidak ikut bertambah oleh tes lain
  const mkState = () => ({ visitId: 12, customer: { id: 1, name: 'PT Uji' }, checkedInAt: new Date().toISOString(), distance: 120 })

  it('regresi: GPS dan interval TIDAK diulang terus setiap render', async () => {
    const getCurrentPosition = gps(-7.2575, 112.7521)
    shell(routes, [{ pathname: '/visit-mode/12', state: mkState() }])
    expect(await screen.findByText('PT Uji')).toBeInTheDocument()
    await act(async () => { await new Promise((r) => setTimeout(r, 2300)) })
    expect(getCurrentPosition.mock.calls.length).toBeLessThanOrEqual(2)
    expect(screen.getByText(/Durasi 00:0[0-3]/)).toBeInTheDocument()
  })

  it('dibuka tanpa state (refresh): mengambil data kunjungan dari server', async () => {
    gps(-7.2575, 112.7521)
    api.getVisit.mockResolvedValue({ id: 12, checkin_at: new Date().toISOString(), customer: { id: 1, name: 'PT Dari Server' } })
    shell(routes, ['/visit-mode/12'])
    expect(await screen.findByText('PT Dari Server')).toBeInTheDocument()
    expect(api.getVisit).toHaveBeenCalledWith('12')
  })

  it('opsi hasil kunjungan mencakup "Tidak ada order"', async () => {
    gps(-7.25, 112.75)
    shell(routes, [{ pathname: '/visit-mode/12', state: mkState() }])
    await screen.findByText('PT Uji')
    expect(within(screen.getByLabelText('Hasil kunjungan')).getAllByRole('option').map((o) => o.textContent)).toContain('Tidak ada order')
  })

  it('regresi: setelah check-in berhasil pengguna masuk ke /visit-mode/:id (bukan terlempar ke Home)', async () => {
    gps(-7.2575, 112.7521)
    api.getCustomers.mockResolvedValue({ data: [{ id: 1, name: 'PT Uji', latitude: '-7.2575000', longitude: '112.7521000' }] })
    api.checkinVisit.mockResolvedValue({ id: 12, checkin_distance: 0 })
    const user = userEvent.setup()
    shell(routes, ['/checkin'])

    await user.click(await screen.findByRole('button', { name: 'Check-in' }))
    await waitFor(() => expect(api.checkinVisit).toHaveBeenCalledWith(expect.objectContaining({ customer_id: '1' })))
    // VisitMode tampil dengan nama customer dan tombol Checkout
    expect(await screen.findByRole('button', { name: 'Checkout' })).toBeInTheDocument()
    expect(screen.getByText('PT Uji', { selector: 'div' })).toBeInTheDocument()
  })

  it('check-in langsung ke Lead (belum punya Customer): dropdown Customer disembunyikan, kirim lead_id bukan customer_id', async () => {
    gps(-7.2575, 112.7521)
    api.getLead.mockResolvedValue({ id: 5, business_name: 'UD Lead Checkin', latitude: '-7.2575000', longitude: '112.7521000' })
    api.checkinVisit.mockResolvedValue({ id: 20, lead: { id: 5, business_name: 'UD Lead Checkin', current_task: null } })
    const user = userEvent.setup()
    shell(routes, [{ pathname: '/checkin', state: { leadId: 5 } }])

    await screen.findByDisplayValue('UD Lead Checkin')
    expect(screen.queryByLabelText('Customer')).not.toBeInTheDocument()
    expect(api.getCustomers).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: 'Check-in' }))
    await waitFor(() => expect(api.checkinVisit).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 5 })))
    expect(api.checkinVisit.mock.calls[0][0]).not.toHaveProperty('customer_id')
  })

  it('kunjungan milik Lead: panel tugas Canvassing tampil langsung di Visit Mode, tanpa tombol Check-in berulang', async () => {
    const leadState = {
      visitId: 21,
      lead: {
        id: 5, business_name: 'UD Lead Checkin', win_loss: 'OPEN',
        current_task: { id: 9, name: 'Brand Awareness', task_type: 'Kunjungan', stage: 'LEAD', actions: ['brand'], status: 'OPEN' },
      },
      checkedInAt: new Date().toISOString(),
    }
    gps(-7.2575, 112.7521)
    shell(routes, [{ pathname: '/visit-mode/21', state: leadState }])

    expect(await screen.findByText('UD Lead Checkin')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Form Brand/ })).toBeInTheDocument()
    // bukan "ganda" -- sudah di dalam Visit Mode (sudah check-in), tombol Check-in tidak perlu muncul lagi
    expect(screen.queryByRole('button', { name: /Check-in di lokasi ini/ })).not.toBeInTheDocument()
  })
})

describe('Halaman Home', () => {
  it('grafik pipeline menampilkan 7 langkah dengan jumlahnya, dan tile Activities memberi badge terlambat', async () => {
    api.getDashboard.mockResolvedValue({
      user: { name: 'Budi Santoso' },
      pipeline: [
        { key: 'prospek', label: 'Prospek', color: 'var(--orange2)', count: 4 },
        { key: 'lead', label: 'Lead', color: 'var(--orange)', count: 3 },
        { key: 'brand_awareness', label: 'Brand Awareness', color: 'var(--blue)', count: 2 },
        { key: 'sampling', label: 'Sampling', color: '#7C5CFC', count: 5 },
        { key: 'quote', label: 'Quote', color: 'var(--amber)', count: 1 },
        { key: 'win', label: 'Win', color: 'var(--green)', count: 6 },
        { key: 'lose', label: 'Lose', color: 'var(--pink)', count: 7 },
      ],
      activities: { unscheduled: 1, late: 2, scheduled: 3, total: 6 },
      ar: {},
    })
    const { container } = shell(<Home />, ['/home'])
    await waitFor(() => expect(container.querySelectorAll('.bars .col')).toHaveLength(7))

    const cols = [...container.querySelectorAll('.bars .col')].map((c) => [c.querySelector('.cn').textContent, c.querySelector('.n').textContent])
    expect(cols).toEqual([['Prospek', '4'], ['Lead', '3'], ['Brand', '2'], ['Sampling', '5'], ['Quote', '1'], ['Win', '6'], ['Lose', '7']])

    const tile = screen.getByText('Activities').closest('.gitem')
    expect(within(tile).getByText('2')).toBeInTheDocument() // 2 tugas terlambat
  })
})

describe('NewOrder: mode Kg dan tujuan order', () => {
  beforeEach(() => {
    api.getCustomers.mockResolvedValue({ data: [{ id: 1, name: 'PT Pembeli' }, { id: 2, name: 'PT Distributor' }] })
    api.getProducts.mockResolvedValue({ data: [{ id: 1, part_num: 'STM-1000', description: 'Saus Tomat 1kg', price: '1000', uom: 'DUS' }] })
    api.getPromos.mockResolvedValue({ data: [] })
    api.getProductPackagings.mockResolvedValue([{ id: 10, name: 'Sachet 250 gr', gramasi_gr: '250.00' }])
    api.createOrder.mockResolvedValue({ id: 1, status: 'CONFIRMED' })
  })

  it('baris Kg dikonversi ke pcs (pratinjau) dan dikirim sebagai qty_kg + gramasi + kemasan, bersama tujuan Distributor', async () => {
    const user = userEvent.setup()
    shell(<NewOrder />, ['/orders/new'])

    await user.click(await screen.findByRole('button', { name: 'Berdasarkan Kg' }))
    await screen.findByRole('option', { name: /Sachet 250 gr/ })
    await user.clear(screen.getByLabelText('Jumlah (Kg)'))
    await user.type(screen.getByLabelText('Jumlah (Kg)'), '10')
    await user.click(screen.getByRole('button', { name: '+ Line' }))
    expect(screen.getByText(/10 Kg → 40 pcs \(250 gr\)/)).toBeInTheDocument()

    // tujuan Distributor wajib memilih distributor
    await user.selectOptions(screen.getByLabelText('Tujuan order'), 'DISTRIBUTOR')
    await user.click(screen.getByRole('button', { name: 'Buat Order' }))
    expect(await screen.findByText('Pilih distributor tujuan order')).toBeInTheDocument()
    expect(api.createOrder).not.toHaveBeenCalled()

    // distributor tidak boleh sama dengan customer
    expect(within(screen.getByLabelText('Distributor')).queryByRole('option', { name: 'PT Pembeli' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Distributor'), '2')
    await user.click(screen.getByRole('button', { name: 'Buat Order' }))

    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(1))
    const payload = api.createOrder.mock.calls[0][0]
    expect(payload).toMatchObject({ destination: 'DISTRIBUTOR', distributor_customer_id: 2 })
    expect(payload.lines[0]).toMatchObject({ product_id: 1, qty_kg: 10, gramasi_gr: 250, packaging_id: 10, unit_price: 1000 })
    expect(payload.lines[0]).not.toHaveProperty('qty') // pcs dihitung ulang oleh server
  })

  it('mode qty biasa tetap mengirim qty + uom dan tujuan default HO', async () => {
    const user = userEvent.setup()
    shell(<NewOrder />, ['/orders/new'])
    await screen.findByRole('option', { name: /STM-1000/ })
    await user.click(screen.getByRole('button', { name: '+ Line' }))
    await user.click(screen.getByRole('button', { name: 'Buat Order' }))

    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(1))
    const payload = api.createOrder.mock.calls[0][0]
    expect(payload).toMatchObject({ destination: 'HO', distributor_customer_id: null })
    expect(payload.lines[0]).toMatchObject({ product_id: 1, qty: 1, uom: 'DUS' })
    expect(payload.lines[0]).not.toHaveProperty('qty_kg')
  })

  it('mode Kg tanpa kemasan ditolak dengan pesan jelas', async () => {
    api.getProductPackagings.mockResolvedValue([])
    const user = userEvent.setup()
    shell(<NewOrder />, ['/orders/new'])
    await user.click(await screen.findByRole('button', { name: 'Berdasarkan Kg' }))
    await screen.findByRole('option', { name: /Belum ada kemasan/ })
    await user.click(screen.getByRole('button', { name: '+ Line' }))
    expect(await screen.findByText('Pilih kemasan produk ini')).toBeInTheDocument()
  })
})

describe('Lacak order per customer', () => {
  it('Tracker memuat hanya order milik customer yang dipilih', async () => {
    api.getOrders.mockResolvedValue({ data: [{ id: 1, order_number: 'SO-1', customer: { name: 'PT Xenon' } }] })
    api.getOrderTracker.mockResolvedValue({ steps: [] })
    shell(<Tracker />, [{ pathname: '/track', state: { customerId: 4 } }])
    await waitFor(() => expect(api.getOrders).toHaveBeenCalledWith({ customer_id: 4, per_page: 100 }))
    expect(await screen.findByText(/PT Xenon/, { selector: 'p' })).toBeInTheDocument()
  })

  it('Tracker tanpa customer memuat semua order (perilaku lama)', async () => {
    api.getOrders.mockResolvedValue({ data: [] })
    shell(<Tracker />, ['/track'])
    await waitFor(() => expect(api.getOrders).toHaveBeenCalledWith({}))
  })

  it('detail customer punya aksi Lacak Order yang membawa customerId', async () => {
    api.getCustomer.mockResolvedValue({ id: 4, name: 'PT Xenon', customer_code: 'C-4' })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/customers/4']}>
        <UiProvider>
          <PhoneFrame>
            <Routes>
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="*" element={<Probe />} />
            </Routes>
          </PhoneFrame>
        </UiProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByText('Lacak Order'))
    const probe = await screen.findByTestId('probe')
    expect(probe.textContent).toContain('/track')
    expect(probe.textContent).toContain('"customerId":4')
  })
})