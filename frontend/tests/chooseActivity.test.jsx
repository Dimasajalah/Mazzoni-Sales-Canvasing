import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }),
}))
vi.mock('../src/api/index.js', () => ({
  getVisit: vi.fn(), getQuotes: vi.fn(), checkinVisit: vi.fn(), getCustomers: vi.fn(), getLead: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import Checkin from '../src/pages/Checkin.jsx'
import ChooseActivity from '../src/pages/ChooseActivity.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}|{JSON.stringify(loc.state)}</div>
}

const renderAt = (path, state, serverVisit = state?.visit) => {
  // Layar selalu memuat ulang kunjungan dari server; tes menentukan apa yang dikembalikan server.
  if (serverVisit) api.getVisit.mockResolvedValue(serverVisit)
  return render(
    <MemoryRouter initialEntries={[state ? { pathname: path, state } : path]}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/choose-activity/:id" element={<ChooseActivity />} />
            <Route path="/checkin" element={<Checkin />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )
}

const SAMPLING = { id: 9, seq: 20, name: 'Sample', task_type: 'Sampling', stage: 'OPPORTUNITY', is_closing: false, status: 'OPEN', actions: ['sample', 'feedback'] }
const visitOf = (task, over = {}) => ({
  id: 21,
  checkin_at: new Date(Date.now() - 4 * 60000).toISOString(),
  checkin_distance: '38.00',
  checkin_photo_url: null,
  customer: null,
  lead: { id: 5, business_name: 'RM Sari Bahari', address: 'Jl. Pantai Kartini No. 11, Jepara', task_set_id: 1, win_loss: 'OPEN', current_task: task },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 2, name: 'Budi Santoso', role: 'sales', sales_type: 'ORDER', can_order: true }
})

describe('Choose Activity (dokumen hal. 24)', () => {
  it('menampilkan header, kartu lokasi, dan satu kartu per aksi tugas aktif', async () => {
    renderAt('/choose-activity/21', { visit: visitOf(SAMPLING) })

    expect(await screen.findByRole('heading', { name: 'Choose Activity' })).toBeInTheDocument()
    expect(screen.getByText('Checked in · 38 m from store')).toBeInTheDocument()
    expect(screen.getAllByText('RM Sari Bahari').length).toBeGreaterThanOrEqual(2) // judul header + kartu lokasi
    expect(screen.getByText('Jl. Pantai Kartini No. 11, Jepara')).toBeInTheDocument()
    expect(screen.getByText(/^0[3-5]:\d{2}$/)).toBeInTheDocument() // waktu berjalan sejak check-in
    expect(screen.getByText('How would you like to continue this visit?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New Sample/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Follow Up Sample/ })).toBeInTheDocument()
    expect(screen.getByText(/Check-in & store photo have been recorded/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quotation/ })).not.toBeInTheDocument()
  })

  it('New Sample membuka halaman Task: Pemberian Sample', async () => {
    const user = userEvent.setup()
    renderAt('/choose-activity/21', { visit: visitOf(SAMPLING) })

    await user.click(await screen.findByRole('button', { name: /New Sample/ }))
    const probe = (await screen.findByTestId('probe')).textContent
    expect(probe).toContain('/visit/21/sample')
  })

  it('Follow Up Sample membuka halaman Task: Follow Up Sample', async () => {
    const user = userEvent.setup()
    renderAt('/choose-activity/21', { visit: visitOf(SAMPLING) })

    await user.click(await screen.findByRole('button', { name: /Follow Up Sample/ }))
    expect((await screen.findByTestId('probe')).textContent).toContain('/visit/21/followup')
  })

  it('Brand Awareness membuka halaman Task: Brand Awareness', async () => {
    const brand = { id: 7, seq: 10, name: 'Brand Awareness', task_type: 'Lead engagement', stage: 'LEAD', is_closing: false, status: 'OPEN', actions: ['brand'] }
    const user = userEvent.setup()
    renderAt('/choose-activity/21', { visit: visitOf(brand) })

    await user.click(await screen.findByRole('button', { name: /Brand Awareness/ }))
    const probe = (await screen.findByTestId('probe')).textContent
    expect(probe).toContain('/visit/21/brand')
  })

  it('kartu Promo for This Store selalu ada dan membuka layar promo kunjungan itu', async () => {
    const sample = { id: 9, seq: 20, name: 'Sample', task_type: 'Sampling', stage: 'OPPORTUNITY', is_closing: false, status: 'OPEN', actions: ['sample', 'feedback'] }
    const user = userEvent.setup()
    renderAt('/choose-activity/21', { visit: visitOf(sample) })

    await user.click(await screen.findByRole('button', { name: /Promo for This Store/ }))
    expect((await screen.findByTestId('probe')).textContent).toContain('/visit/21/promo')
  })

  it('Quotation membuka halaman Quotation — Header', async () => {
    const quote = { id: 8, seq: 30, name: 'Quotation', task_type: 'Create Quote', stage: 'QUOTE', is_closing: false, status: 'OPEN', actions: ['quote'] }
    const user = userEvent.setup()
    renderAt('/choose-activity/21', { visit: visitOf(quote) })

    await user.click(await screen.findByRole('button', { name: /Quotation/ }))
    expect((await screen.findByTestId('probe')).textContent).toContain('/visit/21/quote')
  })

  it('tugas tanpa aksi (mis. Verifikasi NOO): satu kartu Complete Task membuka layar konklusi', async () => {
    const noo = { id: 11, seq: 15, name: 'Verifikasi NOO', task_type: 'Lead engagement', stage: 'LEAD', is_closing: false, status: 'OPEN', actions: [] }
    const user = userEvent.setup()
    renderAt('/choose-activity/21', { visit: visitOf(noo) })

    expect(await screen.findByText(/Verifikasi NOO — Record the conclusion/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /Complete Task/ }))
    expect((await screen.findByTestId('probe')).textContent).toContain('/visit/21/complete')
  })

  it('Create Order membuka layar Register New Order (checkout dari Quotation)', async () => {
    const closing = { id: 12, seq: 40, name: 'Order', task_type: 'Follow-up', stage: 'QUOTE', is_closing: true, status: 'OPEN', actions: ['order'] }
    const user = userEvent.setup()
    renderAt('/choose-activity/21', { visit: visitOf(closing) })

    await user.click(await screen.findByRole('button', { name: /Create Order/ }))
    expect((await screen.findByTestId('probe')).textContent).toContain('/visit/21/order')
  })

  it('Create Order tidak ditawarkan ke Sales Dealmaker', async () => {
    auth.user = { id: 2, name: 'Rina', role: 'sales', sales_type: 'DEALMAKER', can_order: false }
    const closing = { id: 12, seq: 40, name: 'Order', task_type: 'Follow-up', stage: 'QUOTE', is_closing: true, status: 'OPEN', actions: ['order'] }
    renderAt('/choose-activity/21', { visit: visitOf(closing) })

    expect(await screen.findByRole('button', { name: /Complete Task/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Order/ })).not.toBeInTheDocument()
  })

  it('tanpa tugas aktif: pesan kosong, tombol Finish visit tetap ada', async () => {
    renderAt('/choose-activity/21', { visit: visitOf(null) })
    expect(await screen.findByText('Tidak ada tugas aktif untuk kunjungan ini.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish visit (Check-out)' })).toBeInTheDocument()
  })

  it('memuat ulang dari server: tugas aktif yang sudah berganti langsung tampil (mis. setelah Brand disimpan)', async () => {
    const noo = { id: 11, seq: 15, name: 'Verifikasi NOO', task_type: 'Lead engagement', stage: 'LEAD', is_closing: false, status: 'OPEN', actions: [] }
    renderAt('/choose-activity/21', { visit: visitOf(SAMPLING) }, visitOf(noo))

    expect(await screen.findByRole('button', { name: /Complete Task/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: /New Sample/ })).not.toBeInTheDocument())
  })

  it('dibuka tanpa state (refresh): mengambil data kunjungan dari server', async () => {
    api.getVisit.mockResolvedValue(visitOf(SAMPLING))
    renderAt('/choose-activity/21')
    expect(await screen.findByRole('button', { name: /New Sample/ })).toBeInTheDocument()
    expect(api.getVisit).toHaveBeenCalledWith('21')
  })
})

describe('Check-in ulang membuka Choose Activity', () => {
  it('lead yang pernah dikunjungi (previous_visits > 0) membuka Choose Activity, bukan Visit Mode', async () => {
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: -7.2575, longitude: 112.7521, accuracy: 8 } }))
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    api.getLead.mockResolvedValue({ id: 5, business_name: 'UD Lead Checkin', latitude: '-7.2575000', longitude: '112.7521000' })
    api.checkinVisit.mockResolvedValue({ id: 30, previous_visits: 2, lead: { id: 5, business_name: 'UD Lead Checkin', current_task: null } })
    const user = userEvent.setup()
    const { container } = renderAt('/checkin', { leadId: 5 })

    await screen.findByText(/UD Lead Checkin/)
    await user.upload(container.querySelector('input[type=file]'), new File(['x'], 'toko.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check In' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Check In' }))

    await waitFor(() => expect(api.checkinVisit).toHaveBeenCalled())
    // ChooseActivity memuat kunjungan dari state check-in; tanpa tugas aktif ia menampilkan pesan kosong.
    expect(await screen.findByRole('heading', { name: 'Choose Activity' })).toBeInTheDocument()
  })
})
