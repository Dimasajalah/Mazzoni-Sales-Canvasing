import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({ getDeductionClaims: vi.fn(), getDeductionClaim: vi.fn(), postClaimDeduction: vi.fn() }))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import DeductionDetail from '../src/pages/DeductionDetail.jsx'
import Deductions from '../src/pages/Deductions.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/deductions" element={<Deductions />} />
            <Route path="/marketing/deductions/:id" element={<DeductionDetail />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const claim = (over = {}) => ({
  id: 1, claim_no: 'CLM-2026-00001', approved_amount: '10000.00', used_total: 0, balance: 10000,
  customer: { id: 5, customer_code: 'D1', name: 'Distributor D1' }, program: { id: 7, event_code: 'BDG-2026-001-K02' }, deductions: [], ...over,
})

const deduction = (over = {}) => ({
  id: 1, invoice_number: 'INV-001', invoice_date: '2026-12-20', invoice_total: '15000.00', claim_amount_used: '10000.00', capped_by_invoice: false,
  misc_charge_code: 'KLAIM', misc_charge_amount: '-10000.00', reference: 'CLM-2026-00001', net_invoice: 5000, balance_before: '10000.00',
  balance_after: '0.00', poster: { name: 'Bu Sales' }, posted_at: '2026-12-21T03:00:00.000000Z', ...over,
})

const row = (label) => screen.getByText(label).closest('.cl-res-row')

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Sales', role: 'sales' }
  api.getDeductionClaim.mockResolvedValue(claim())
})

describe('Daftar klaim Potong Nota', () => {
  it('menampilkan total saldo dan tiap klaim dengan saldonya', async () => {
    api.getDeductionClaims.mockResolvedValue([
      claim(),
      claim({ id: 2, claim_no: 'CLM-2026-00002', balance: 5000, used_total: 5000, customer: { id: 6, customer_code: 'D2', name: 'Distributor D2' } }),
    ])
    shell(['/marketing/deductions'])

    expect(await screen.findByText('Distributor D1')).toBeInTheDocument()
    expect(screen.getByTestId('deduction-total')).toHaveTextContent('Rp 15.000')
    expect(screen.getByText('Distributor D2')).toBeInTheDocument()
    expect(screen.getAllByText('Terpakai', { selector: 'span' })).toHaveLength(2) // satu per kartu klaim
  })

  it('pencarian memanggil server dengan kata kunci', async () => {
    api.getDeductionClaims.mockResolvedValue([claim()])
    const user = userEvent.setup()
    shell(['/marketing/deductions'])

    await screen.findByText('Distributor D1')
    await user.type(screen.getByLabelText('Cari klaim'), 'Makmur')
    await waitFor(() => expect(api.getDeductionClaims).toHaveBeenCalledWith({ q: 'Makmur' }))
  })

  it('tidak ada klaim: tampilan kosong', async () => {
    api.getDeductionClaims.mockResolvedValue([])
    shell(['/marketing/deductions'])
    expect(await screen.findByText('Tidak ada klaim Potong Nota yang masih punya saldo.')).toBeInTheDocument()
  })

  it('mengetuk klaim membuka halaman Potong Nota klaim itu', async () => {
    api.getDeductionClaims.mockResolvedValue([claim()])
    const user = userEvent.setup()
    shell(['/marketing/deductions'])

    await user.click(await screen.findByText('Distributor D1'))
    await waitFor(() => expect(api.getDeductionClaim).toHaveBeenCalledWith('1'))
    expect(await screen.findByText('Nota Distributor')).toBeInTheDocument()
  })

  it('role di luar sales, supervisor, dan admin tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Gudang', role: 'warehouse' }
    shell(['/marketing/deductions'])
    expect(await screen.findByText(/hanya untuk sales, supervisor, dan admin/)).toBeInTheDocument()
    expect(api.getDeductionClaims).not.toHaveBeenCalled()
  })

  it('supervisor ikut bisa membukanya', async () => {
    auth.user = { id: 3, name: 'Spv', role: 'supervisor' }
    api.getDeductionClaims.mockResolvedValue([])
    shell(['/marketing/deductions'])
    await waitFor(() => expect(api.getDeductionClaims).toHaveBeenCalled())
  })
})

describe('Potong Nota: Check & Post', () => {
  it('menampilkan saldo klaim dan data klaim', async () => {
    shell(['/marketing/deductions/1'])

    expect(await screen.findByTestId('balance')).toHaveTextContent('Rp 10.000')
    expect(screen.getByText('CLM-2026-00001 · BDG-2026-001-K02')).toBeInTheDocument()
    expect(screen.getByText('Nilai klaim disetujui').closest('.mb-kv')).toHaveTextContent('Rp 10.000')
    expect(screen.queryByText('Misc Charge KLAIM')).not.toBeInTheDocument() // pratinjau baru muncul setelah total invoice diisi
  })

  it('invoice lebih besar dari saldo: nilai dipakai = saldo, Misc Charge KLAIM negatif dengan Reference kode klaim', async () => {
    const user = userEvent.setup()
    shell(['/marketing/deductions/1'])

    await user.type(await screen.findByLabelText('Total Invoice (Rp)'), '15000')

    expect(screen.getByLabelText('Nilai Klaim yang Digunakan (Rp)')).toHaveValue('10.000')
    expect(row('Misc Charge KLAIM')).toHaveTextContent('-Rp 10.000')
    expect(row('Reference')).toHaveTextContent('CLM-2026-00001')
    expect(row('Total Setelah Potongan')).toHaveTextContent('Rp 5.000')
    expect(row('Saldo Klaim Sesudah')).toHaveTextContent('Rp 0')
    expect(screen.queryByText(/disesuaikan agar tidak melebihi nilai invoice/)).not.toBeInTheDocument()
  })

  it('saldo menutup seluruh invoice: nilai dipakai dibatasi sebesar invoice dan ada penjelasannya', async () => {
    const user = userEvent.setup()
    shell(['/marketing/deductions/1'])

    await user.type(await screen.findByLabelText('Total Invoice (Rp)'), '4000')

    expect(screen.getByLabelText('Nilai Klaim yang Digunakan (Rp)')).toHaveValue('4.000')
    expect(screen.getByText(/disesuaikan agar tidak melebihi nilai invoice/)).toBeInTheDocument()
    expect(row('Total Setelah Potongan')).toHaveTextContent('Rp 0')
    expect(row('Saldo Klaim Sesudah')).toHaveTextContent('Rp 6.000')
  })

  it('nilai yang dipakai bisa diedit ke bawah dan pratinjau mengikutinya', async () => {
    const user = userEvent.setup()
    shell(['/marketing/deductions/1'])

    await user.type(await screen.findByLabelText('Total Invoice (Rp)'), '15000')
    const used = screen.getByLabelText('Nilai Klaim yang Digunakan (Rp)')
    await user.clear(used)
    await user.type(used, '3000')

    expect(row('Misc Charge KLAIM')).toHaveTextContent('-Rp 3.000')
    expect(row('Total Setelah Potongan')).toHaveTextContent('Rp 12.000')
    expect(row('Saldo Klaim Sesudah')).toHaveTextContent('Rp 7.000')
  })

  it('validasi: nomor invoice, total, dan batas nilai yang dipakai', async () => {
    const user = userEvent.setup()
    shell(['/marketing/deductions/1'])
    await screen.findByLabelText('Nomor Invoice')

    await user.click(screen.getByRole('button', { name: 'Check & Post' }))
    expect(await screen.findByText('Isi nomor invoice')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nomor Invoice'), 'INV-001')
    await user.click(screen.getByRole('button', { name: 'Check & Post' }))
    expect(await screen.findByText('Isi total invoice lebih dari 0')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Total Invoice (Rp)'), '4000')
    const used = screen.getByLabelText('Nilai Klaim yang Digunakan (Rp)')
    await user.clear(used)
    await user.type(used, '5000')
    await user.click(screen.getByRole('button', { name: 'Check & Post' }))
    expect(await screen.findByText('Nilai klaim yang digunakan tidak boleh melebihi total invoice')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Total Invoice (Rp)'))
    await user.type(screen.getByLabelText('Total Invoice (Rp)'), '50000')
    await user.clear(screen.getByLabelText('Nilai Klaim yang Digunakan (Rp)'))
    await user.type(screen.getByLabelText('Nilai Klaim yang Digunakan (Rp)'), '12000')
    await user.click(screen.getByRole('button', { name: 'Check & Post' }))
    expect(await screen.findByText('Nilai klaim yang digunakan melebihi saldo klaim')).toBeInTheDocument()
    expect(api.postClaimDeduction).not.toHaveBeenCalled()
  })

  it('memposting potongan: payload benar, saldo habis, dan riwayat tampil', async () => {
    api.postClaimDeduction.mockResolvedValue(claim({ used_total: 10000, balance: 0, deductions: [deduction()] }))
    const user = userEvent.setup()
    shell(['/marketing/deductions/1'])

    await user.type(await screen.findByLabelText('Nomor Invoice'), 'INV-001')
    fireEvent.change(screen.getByLabelText('Tanggal Invoice (opsional)'), { target: { value: '2026-12-20' } })
    await user.type(screen.getByLabelText('Total Invoice (Rp)'), '15000')
    await user.click(screen.getByRole('button', { name: 'Check & Post' }))

    await waitFor(() => expect(api.postClaimDeduction).toHaveBeenCalledWith(1, {
      invoice_number: 'INV-001', invoice_total: 15000, used_amount: 10000, invoice_date: '2026-12-20',
    }))
    expect(await screen.findByText('Saldo klaim sudah habis.')).toBeInTheDocument()
    expect(screen.getByTestId('balance')).toHaveTextContent('Rp 0')
    expect(screen.getByText(/Misc Charge KLAIM -Rp 10\.000 · Ref\. CLM-2026-00001/)).toBeInTheDocument()
    expect(screen.getByText(/Nota Rp 15\.000 menjadi Rp 5\.000/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check & Post' })).not.toBeInTheDocument()
  })

  it('setelah memposting, form dikosongkan untuk nota berikutnya selama saldo masih ada', async () => {
    api.postClaimDeduction.mockResolvedValue(claim({ used_total: 4000, balance: 6000, deductions: [deduction({ invoice_total: '4000.00', claim_amount_used: '4000.00', balance_after: '6000.00', net_invoice: 0 })] }))
    const user = userEvent.setup()
    shell(['/marketing/deductions/1'])

    await user.type(await screen.findByLabelText('Nomor Invoice'), 'INV-001')
    await user.type(screen.getByLabelText('Total Invoice (Rp)'), '4000')
    await user.click(screen.getByRole('button', { name: 'Check & Post' }))

    await waitFor(() => expect(screen.getByTestId('balance')).toHaveTextContent('Rp 6.000'))
    expect(screen.getByLabelText('Nomor Invoice')).toHaveValue('')
    expect(screen.getByLabelText('Total Invoice (Rp)')).toHaveValue('')
    expect(screen.getByText('Riwayat Potongan (1)')).toBeInTheDocument()
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.postClaimDeduction.mockRejectedValue(new Error('Nota INV-001 sudah dipotong oleh klaim ini.'))
    const user = userEvent.setup()
    shell(['/marketing/deductions/1'])

    await user.type(await screen.findByLabelText('Nomor Invoice'), 'INV-001')
    await user.type(screen.getByLabelText('Total Invoice (Rp)'), '4000')
    await user.click(screen.getByRole('button', { name: 'Check & Post' }))
    expect(await screen.findByText('Nota INV-001 sudah dipotong oleh klaim ini.')).toBeInTheDocument()
  })

  it('satu klaim dipotong pada banyak nota: semua riwayat tampil berurutan', async () => {
    api.getDeductionClaim.mockResolvedValue(claim({
      used_total: 7000, balance: 3000,
      deductions: [
        deduction({ id: 1, invoice_number: 'INV-001', claim_amount_used: '4000.00', misc_charge_amount: '-4000.00', balance_after: '6000.00' }),
        deduction({ id: 2, invoice_number: 'INV-002', claim_amount_used: '3000.00', misc_charge_amount: '-3000.00', balance_after: '3000.00' }),
      ],
    }))
    shell(['/marketing/deductions/1'])

    expect(await screen.findByText('Riwayat Potongan (2)')).toBeInTheDocument()
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.getByText('INV-002')).toBeInTheDocument()
    expect(screen.getByTestId('balance')).toHaveTextContent('Rp 3.000')
    expect(screen.getAllByText(/Diposting oleh Bu Sales/)).toHaveLength(2)
  })

  it('role di luar sales, supervisor, dan admin tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Keuangan', role: 'finance' }
    shell(['/marketing/deductions/1'])
    expect(await screen.findByText(/hanya untuk sales, supervisor, dan admin/)).toBeInTheDocument()
    expect(api.getDeductionClaim).not.toHaveBeenCalled()
  })
})
