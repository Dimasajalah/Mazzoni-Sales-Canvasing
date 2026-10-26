import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getMarketingBudgets: vi.fn(), getClaimPrograms: vi.fn(), getClaimProgram: vi.fn(),
  getClaimProgramOptions: vi.fn(), createClaimProgram: vi.fn(),
  getSellOutPanel: vi.fn(), getSellOutTemplate: vi.fn(), uploadSellOut: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import ClaimProgramDetail from '../src/pages/ClaimProgramDetail.jsx'
import ClaimProgramForm from '../src/pages/ClaimProgramForm.jsx'
import ClaimPrograms from '../src/pages/ClaimPrograms.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/claim-programs" element={<ClaimPrograms />} />
            <Route path="/marketing/claim-programs/new" element={<ClaimProgramForm />} />
            <Route path="/marketing/claim-programs/:id" element={<ClaimProgramDetail />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const program = (over = {}) => ({
  id: 1, event_code: 'BDG-2026-001-K01', description: 'Diskon Saus Q4', activity_type: 'KLAIM', status: 'PENDING_APPROVAL',
  claim_type: 'DISKON_PRODUK', claim_type_label: 'Diskon Produk', claim_source: 'SELL_OUT', claim_source_label: 'Sell Out',
  claim_basis: 'SALES_VALUE', claim_basis_label: 'Nilai Penjualan', claim_threshold: '5000000.00', claim_rate: '2.50',
  claim_rate_type: 'PERCENT', claim_deadline: '2026-12-15', budget_amount: '400000.00', start_date: '2026-11-01',
  end_date: '2026-11-30', target_type: 'NATIONAL', target_territories: null, reference_letter_no: 'SKP/001/2026',
  participants_count: 2, budget: { id: 1, campaign_code: 'BDG-2026-001', name: 'Campaign Ramadan' }, attachments: [],
  participants: [{ id: 1, customer_code: 'C1', name: 'Toko C1', city: 'Jakarta' }, { id: 2, customer_code: 'C2', name: 'Toko C2', city: null }],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Mgr', role: 'supervisor' }
  api.getClaimProgram.mockResolvedValue(program()) // halaman detail terbuka setelah simpan
  api.getSellOutPanel.mockResolvedValue({
    enabled: true, claim_basis_label: 'Nilai Penjualan', period: { start: '2026-11-01', end: '2026-11-30' },
    columns: [{ name: 'tanggal', label: 'Tanggal', required: true }], current: null, latest: null, history: [], calculate_ready: false,
  })
  api.getMarketingBudgets.mockResolvedValue([
    { id: 1, campaign_code: 'BDG-2026-001', name: 'Campaign Ramadan', status: 'ACTIVE', remaining_budget: 1000000 },
    { id: 2, campaign_code: 'BDG-2026-002', name: 'Campaign Lama', status: 'CLOSED', remaining_budget: 5 },
  ])
  api.getClaimProgramOptions.mockResolvedValue({
    claim_types: [{ value: 'DISKON_PRODUK', label: 'Diskon Produk' }, { value: 'REWARD', label: 'Reward' }],
    claim_sources: [{ value: 'SELL_IN', label: 'Sell In' }, { value: 'SELL_OUT', label: 'Sell Out' }],
    claim_bases: [{ value: 'SALES_VALUE', label: 'Nilai Penjualan' }, { value: 'QUANTITY', label: 'Kuantitas' }],
    territories: ['Jakarta'],
    customers: [{ id: 7, customer_code: 'KRM-1', name: 'Toko Karma', city: 'Bandung' }],
  })
})

describe('Daftar Program Klaim', () => {
  it('menampilkan program dengan jenis klaim, besaran, dan memfilter status', async () => {
    api.getClaimPrograms.mockResolvedValue([program(), program({ id: 2, description: 'Reward Toko', status: 'APPROVED', claim_type_label: 'Reward' })])
    const user = userEvent.setup()
    shell(['/marketing/claim-programs'])

    expect(await screen.findByText('Diskon Saus Q4')).toBeInTheDocument()
    expect(screen.getAllByText(/besaran 2,5%/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Disetujui' }))
    expect(screen.queryByText('Diskon Saus Q4')).not.toBeInTheDocument()
    expect(screen.getByText('Reward Toko')).toBeInTheDocument()
  })

  it('pengguna sales tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/claim-programs'])
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getClaimPrograms).not.toHaveBeenCalled()
  })
})

describe('Form Program Klaim', () => {
  const fillBasics = async (user, over = {}) => {
    await screen.findByRole('option', { name: /BDG-2026-001/ })
    await user.selectOptions(screen.getByLabelText('Campaign'), '1')
    await user.type(screen.getByLabelText('Nomor Surat Komunikasi Program'), 'SKP/001/2026')
    await user.type(screen.getByLabelText('Deskripsi Program Klaim'), 'Diskon Saus Q4')
    await user.selectOptions(screen.getByLabelText('Jenis Klaim'), 'DISKON_PRODUK')
    await user.type(screen.getByLabelText('Besaran'), over.rate || '2.5')
    fireEvent.change(screen.getByLabelText('Tanggal Mulai Program'), { target: { value: over.start || '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Tanggal Selesai Program'), { target: { value: over.end || '2026-11-30' } })
    fireEvent.change(screen.getByLabelText('Batas Pengajuan Klaim'), { target: { value: over.deadline || '2026-12-15' } })
  }

  it('hanya Campaign aktif yang bisa dipilih', async () => {
    shell(['/marketing/claim-programs/new'])
    await screen.findByRole('option', { name: /BDG-2026-001/ })
    expect(screen.queryByRole('option', { name: /BDG-2026-002/ })).not.toBeInTheDocument()
  })

  it('Campaign dari tautan terpilih otomatis dan sisa budget tampil', async () => {
    shell(['/marketing/claim-programs/new?budget=1'])
    expect(await screen.findByText(/Sisa budget Campaign/)).toHaveTextContent('Rp 1.000.000')
  })

  it('menolak nomor surat kosong', async () => {
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/new'])
    await screen.findByRole('option', { name: /BDG-2026-001/ })
    await user.selectOptions(screen.getByLabelText('Campaign'), '1')
    await user.click(screen.getByRole('button', { name: 'Simpan Program Klaim' }))
    expect(await screen.findByText('Isi Nomor Surat Komunikasi Program')).toBeInTheDocument()
    expect(api.createClaimProgram).not.toHaveBeenCalled()
  })

  it('jenis klaim wajib dipilih', async () => {
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/new'])
    await screen.findByRole('option', { name: /BDG-2026-001/ })
    await user.selectOptions(screen.getByLabelText('Campaign'), '1')
    await user.type(screen.getByLabelText('Nomor Surat Komunikasi Program'), 'SKP/1')
    await user.type(screen.getByLabelText('Deskripsi Program Klaim'), 'Coba')
    await user.click(screen.getByRole('button', { name: 'Simpan Program Klaim' }))
    expect(await screen.findByText('Pilih jenis klaim')).toBeInTheDocument()
  })

  it('besaran persen di atas 100 ditolak, tetapi nominal boleh', async () => {
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/new'])
    await fillBasics(user, { rate: '150' })
    await user.type(screen.getByLabelText('Budget (Rp)'), '100000')
    await user.click(screen.getByRole('button', { name: 'Simpan Program Klaim' }))
    expect(await screen.findByText('Persen tidak boleh lebih dari 100')).toBeInTheDocument()
    expect(api.createClaimProgram).not.toHaveBeenCalled()

    api.createClaimProgram.mockResolvedValue({ id: 9 })
    await user.click(screen.getByRole('button', { name: 'Nominal (Rp)' }))
    await user.click(screen.getByRole('button', { name: 'Simpan Program Klaim' }))
    await waitFor(() => expect(api.createClaimProgram).toHaveBeenCalledTimes(1))
    expect(api.createClaimProgram.mock.calls[0][0].get('claim_rate_type')).toBe('AMOUNT')
  })

  it('batas pengajuan klaim sebelum tanggal selesai program ditolak', async () => {
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/new'])
    await fillBasics(user, { deadline: '2026-11-15' })
    await user.type(screen.getByLabelText('Budget (Rp)'), '100000')
    await user.click(screen.getByRole('button', { name: 'Simpan Program Klaim' }))
    expect(await screen.findByText('Batas pengajuan klaim tidak boleh sebelum tanggal selesai program')).toBeInTheDocument()
  })

  it('budget di atas sisa Campaign ditolak sebelum dikirim', async () => {
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/new'])
    await fillBasics(user)
    await user.type(screen.getByLabelText('Budget (Rp)'), '2000000')
    expect(screen.getByText(/Melebihi sisa budget Campaign/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simpan Program Klaim' }))
    expect(await screen.findByText('Budget melebihi sisa budget Campaign')).toBeInTheDocument()
    expect(api.createClaimProgram).not.toHaveBeenCalled()
  })

  it('memilih Sell Out menampilkan petunjuk panel Data Sell Out', async () => {
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/new'])
    await screen.findByRole('option', { name: /BDG-2026-001/ })
    expect(screen.queryByText(/panel Data Sell Out/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sell Out' }))
    expect(screen.getByText(/panel Data Sell Out/)).toBeInTheDocument()
  })

  it('mengirim parameter klaim sebagai form data lalu pindah ke detail', async () => {
    api.createClaimProgram.mockResolvedValue({ id: 9 })
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/new'])
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Sell Out' }))
    await user.type(screen.getByLabelText('Ambang (opsional)'), '5000000')
    await user.type(screen.getByLabelText('Budget (Rp)'), '400000')
    await user.click(screen.getByRole('button', { name: 'Simpan Program Klaim' }))

    await waitFor(() => expect(api.createClaimProgram).toHaveBeenCalledTimes(1))
    const fd = api.createClaimProgram.mock.calls[0][0]
    expect(fd.get('marketing_budget_id')).toBe('1')
    expect(fd.get('reference_letter_no')).toBe('SKP/001/2026')
    expect(fd.get('description')).toBe('Diskon Saus Q4')
    expect(fd.get('claim_type')).toBe('DISKON_PRODUK')
    expect(fd.get('claim_source')).toBe('SELL_OUT')
    expect(fd.get('claim_basis')).toBe('SALES_VALUE')
    expect(fd.get('claim_threshold')).toBe('5000000')
    expect(fd.get('claim_rate')).toBe('2.5')
    expect(fd.get('claim_rate_type')).toBe('PERCENT')
    expect(fd.get('claim_deadline')).toBe('2026-12-15')
    expect(fd.get('target_type')).toBe('NATIONAL')
    expect(fd.get('budget_amount')).toBe('400000')
    expect(await screen.findByText('Daftar Peserta Klaim (2)')).toBeInTheDocument() // pindah ke halaman detail
  })

  it('target Customer mengirim customer_ids[] dari customer yang dipilih', async () => {
    api.createClaimProgram.mockResolvedValue({ id: 10 })
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/new'])
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Customer' }))
    await user.click(await screen.findByRole('button', { name: /Toko Karma/ }))
    await user.type(screen.getByLabelText('Budget (Rp)'), '100000')
    await user.click(screen.getByRole('button', { name: 'Simpan Program Klaim' }))

    await waitFor(() => expect(api.createClaimProgram).toHaveBeenCalled())
    expect(api.createClaimProgram.mock.calls[0][0].getAll('customer_ids[]')).toEqual(['7'])
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.createClaimProgram.mockRejectedValue(new Error('Campaign ini sudah ditutup, tidak bisa menambah event.'))
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/new'])
    await fillBasics(user)
    await user.type(screen.getByLabelText('Budget (Rp)'), '1000')
    await user.click(screen.getByRole('button', { name: 'Simpan Program Klaim' }))
    expect(await screen.findByText(/sudah ditutup/)).toBeInTheDocument()
  })
})

describe('Detail Program Klaim', () => {
  it('menampilkan parameter, peserta, dan lampiran', async () => {
    api.getClaimProgram.mockResolvedValue(program({ attachments: [{ id: 1, filename: 'surat-program.pdf', size: 81920 }] }))
    shell(['/marketing/claim-programs/1'])

    expect(await screen.findByText('Diskon Saus Q4')).toBeInTheDocument()
    expect(screen.getByText('Sell Out')).toBeInTheDocument()
    expect(screen.getByText('Nilai Penjualan')).toBeInTheDocument()
    expect(screen.getByText('2,5%')).toBeInTheDocument()
    expect(screen.getByText('Daftar Peserta Klaim (2)')).toBeInTheDocument()
    expect(screen.getByText('Toko C1')).toBeInTheDocument()
    expect(screen.getByText('surat-program.pdf')).toBeInTheDocument()
    expect(screen.getByText(/menunggu persetujuan/)).toBeInTheDocument()
    expect(await screen.findByText('Data Sell Out')).toBeInTheDocument() // panel upload sell out menyala untuk sumber Sell Out
  })
})
