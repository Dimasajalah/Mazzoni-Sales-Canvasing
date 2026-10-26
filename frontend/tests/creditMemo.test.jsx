import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getCreditMemoClaims: vi.fn(), getCreditMemoClaim: vi.fn(), saveCreditMemoEntry: vi.fn(), postCreditMemo: vi.fn(), applyCreditMemo: vi.fn(),
  getClaim: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import ClaimDetail from '../src/pages/ClaimDetail.jsx'
import CreditMemoDetail from '../src/pages/CreditMemoDetail.jsx'
import CreditMemos from '../src/pages/CreditMemos.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/credit-memos" element={<CreditMemos />} />
            <Route path="/marketing/credit-memos/:id" element={<CreditMemoDetail />} />
            <Route path="/marketing/claims/:id" element={<ClaimDetail />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const flags = (over = {}) => ({
  can_entry: true, can_post: false, can_apply: false,
  tax_types: [{ value: 'PPH_BADAN', label: 'PPh Badan' }, { value: 'PPH_PRIBADI', label: 'PPh Pribadi' }], ...over,
})

const memo = (over = {}) => ({
  id: 1, invoice_number: 'INV-LAMA-001', credit_value: '10000.00', reference: 'CLM-2026-00001', tax_applies: false, tax_type: null, tax_type_label: null,
  credit_memo_number: null, status: 'ENTERED', enterer: { name: 'Bu Finance' }, poster: null, applier: null,
  entered_at: '2026-12-20T03:00:00Z', posted_at: null, applied_at: null, ...over,
})

const claim = (over = {}) => ({
  id: 1, claim_no: 'CLM-2026-00001', approved_amount: '10000.00', balance: 10000, credit_memo_status: null, credit_memo: null,
  customer: { id: 5, customer_code: 'D1', name: 'Distributor D1' }, program: { id: 7, event_code: 'BDG-2026-001-K02' }, flags: flags(), ...over,
})

const entered = (over = {}) => claim({ credit_memo_status: 'ENTERED', credit_memo: memo(), flags: flags({ can_post: true }), ...over })
const posted = () => claim({
  credit_memo_status: 'POSTED', credit_memo: memo({ status: 'POSTED', credit_memo_number: 'CM-001', poster: { name: 'Bu Finance' }, posted_at: '2026-12-21T03:00:00Z' }),
  flags: flags({ can_entry: false, can_apply: true }),
})
const applied = () => claim({
  balance: 0, credit_memo_status: 'APPLIED',
  credit_memo: memo({ status: 'APPLIED', credit_memo_number: 'CM-001', poster: { name: 'Bu Finance' }, applier: { name: 'Pak Finance' }, posted_at: '2026-12-21T03:00:00Z', applied_at: '2026-12-22T03:00:00Z' }),
  flags: flags({ can_entry: false }),
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Finance', role: 'finance' }
  api.getCreditMemoClaim.mockResolvedValue(claim())
})

describe('Daftar klaim Potong Tagihan', () => {
  it('menampilkan total nilai dan tiap klaim dengan status credit memo-nya', async () => {
    api.getCreditMemoClaims.mockResolvedValue([
      claim(),
      claim({ id: 2, claim_no: 'CLM-2026-00002', credit_memo_status: 'POSTED', approved_amount: '5000.00', customer: { id: 6, customer_code: 'D2', name: 'Distributor D2' } }),
    ])
    shell(['/marketing/credit-memos'])

    expect(await screen.findByText('Distributor D1')).toBeInTheDocument()
    expect(screen.getByTestId('credit-total')).toHaveTextContent('Rp 15.000')
    expect(screen.getByText('Belum dientri')).toBeInTheDocument()
    expect(screen.getByText('Terposting')).toBeInTheDocument()
  })

  it('pencarian memanggil server dengan kata kunci', async () => {
    api.getCreditMemoClaims.mockResolvedValue([claim()])
    const user = userEvent.setup()
    shell(['/marketing/credit-memos'])

    await screen.findByText('Distributor D1')
    await user.type(screen.getByLabelText('Cari klaim'), 'Makmur')
    await waitFor(() => expect(api.getCreditMemoClaims).toHaveBeenCalledWith({ q: 'Makmur' }))
  })

  it('tidak ada klaim: tampilan kosong', async () => {
    api.getCreditMemoClaims.mockResolvedValue([])
    shell(['/marketing/credit-memos'])
    expect(await screen.findByText('Tidak ada klaim Potong Tagihan yang menunggu credit memo.')).toBeInTheDocument()
  })

  it('mengetuk klaim membuka halaman credit memo-nya', async () => {
    api.getCreditMemoClaims.mockResolvedValue([claim()])
    const user = userEvent.setup()
    shell(['/marketing/credit-memos'])

    await user.click(await screen.findByText('Distributor D1'))
    await waitFor(() => expect(api.getCreditMemoClaim).toHaveBeenCalledWith('1'))
    expect(await screen.findByText('Credit Memo Entry')).toBeInTheDocument()
  })

  it('hanya finance dan admin; sales dan supervisor tidak memuat data', async () => {
    for (const role of ['sales', 'supervisor']) {
      auth.user = { id: 2, name: role, role }
      const view = shell(['/marketing/credit-memos'])
      expect(await screen.findByText(/hanya untuk finance dan admin/)).toBeInTheDocument()
      view.unmount()
    }
    expect(api.getCreditMemoClaims).not.toHaveBeenCalled()

    auth.user = { id: 3, name: 'Admin', role: 'admin' }
    api.getCreditMemoClaims.mockResolvedValue([])
    shell(['/marketing/credit-memos'])
    await waitFor(() => expect(api.getCreditMemoClaims).toHaveBeenCalled())
  })
})

describe('Credit Memo Entry (langkah 01-02)', () => {
  it('menampilkan nilai klaim dan form dengan nilai credit dan Reference yang tidak bisa diketik', async () => {
    shell(['/marketing/credit-memos/1'])

    expect(await screen.findByTestId('approved')).toHaveTextContent('Rp 10.000')
    expect(screen.getByTestId('balance')).toHaveTextContent('Rp 10.000')
    expect(screen.getByLabelText('Nilai Credit (Rp)')).toHaveValue('Rp 10.000')
    expect(screen.getByLabelText('Nilai Credit (Rp)')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Reference')).toHaveValue('CLM-2026-00001')
    expect(screen.getByLabelText('Reference')).toHaveAttribute('readonly')
    expect(screen.queryByText('Check & Post Credit Memo', { selector: '.mb-sec-t' })).not.toBeInTheDocument() // belum ada entry
  })

  it('nomor invoice lama wajib; menyimpan tanpa PPh mengirim payload yang benar dan membuka langkah Check & Post', async () => {
    api.saveCreditMemoEntry.mockResolvedValue(entered())
    const user = userEvent.setup()
    shell(['/marketing/credit-memos/1'])

    await user.click(await screen.findByRole('button', { name: 'Simpan Credit Memo Entry' }))
    expect(await screen.findByText('Isi nomor invoice lama')).toBeInTheDocument()
    expect(api.saveCreditMemoEntry).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Nomor Invoice Lama (masih terbuka)'), 'INV-LAMA-001')
    await user.click(screen.getByRole('button', { name: 'Simpan Credit Memo Entry' }))

    await waitFor(() => expect(api.saveCreditMemoEntry).toHaveBeenCalledWith(1, { invoice_number: 'INV-LAMA-001', tax_applies: false }))
    expect(await screen.findByText('Check & Post Credit Memo', { selector: '.mb-sec-t' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ubah Credit Memo Entry' })).toBeInTheDocument()
  })

  it('PPh: Tax Type muncul saat dicentang, wajib dipilih, dan terkirim bersama entry', async () => {
    api.saveCreditMemoEntry.mockResolvedValue(entered({ credit_memo: memo({ tax_applies: true, tax_type: 'PPH_BADAN', tax_type_label: 'PPh Badan' }) }))
    const user = userEvent.setup()
    shell(['/marketing/credit-memos/1'])

    await user.type(await screen.findByLabelText('Nomor Invoice Lama (masih terbuka)'), 'INV-LAMA-001')
    expect(screen.queryByLabelText('Tax Type')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Dikenakan PPh'))
    expect(screen.getByRole('option', { name: 'PPh Badan' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'PPh Pribadi' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Simpan Credit Memo Entry' }))
    expect(await screen.findByText('Pilih Tax Type (PPh Badan atau PPh Pribadi)')).toBeInTheDocument()
    expect(api.saveCreditMemoEntry).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByLabelText('Tax Type'), 'PPH_BADAN')
    await user.click(screen.getByRole('button', { name: 'Simpan Credit Memo Entry' }))
    await waitFor(() => expect(api.saveCreditMemoEntry).toHaveBeenCalledWith(1, { invoice_number: 'INV-LAMA-001', tax_applies: true, tax_type: 'PPH_BADAN' }))
  })

  it('mencabut centang PPh menghapus pilihan Tax Type', async () => {
    api.saveCreditMemoEntry.mockResolvedValue(entered())
    const user = userEvent.setup()
    shell(['/marketing/credit-memos/1'])

    await user.type(await screen.findByLabelText('Nomor Invoice Lama (masih terbuka)'), 'INV-LAMA-001')
    await user.click(screen.getByLabelText('Dikenakan PPh'))
    await user.selectOptions(screen.getByLabelText('Tax Type'), 'PPH_PRIBADI')
    await user.click(screen.getByLabelText('Dikenakan PPh'))
    await user.click(screen.getByRole('button', { name: 'Simpan Credit Memo Entry' }))

    await waitFor(() => expect(api.saveCreditMemoEntry).toHaveBeenCalledWith(1, { invoice_number: 'INV-LAMA-001', tax_applies: false }))
  })

  it('entry yang sudah ada terisi kembali di form dan masih bisa diubah sebelum di-Post', async () => {
    api.getCreditMemoClaim.mockResolvedValue(entered({ credit_memo: memo({ invoice_number: 'INV-LAMA-009', tax_applies: true, tax_type: 'PPH_PRIBADI', tax_type_label: 'PPh Pribadi' }) }))
    shell(['/marketing/credit-memos/1'])

    expect(await screen.findByLabelText('Nomor Invoice Lama (masih terbuka)')).toHaveValue('INV-LAMA-009')
    expect(screen.getByLabelText('Dikenakan PPh')).toBeChecked()
    expect(screen.getByLabelText('Tax Type')).toHaveValue('PPH_PRIBADI')
    expect(screen.getByRole('button', { name: 'Ubah Credit Memo Entry' })).toBeInTheDocument()
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.saveCreditMemoEntry.mockRejectedValue(new Error('Klaim ini tidak berstatus Disetujui dengan metode pencairan Potong Tagihan.'))
    const user = userEvent.setup()
    shell(['/marketing/credit-memos/1'])

    await user.type(await screen.findByLabelText('Nomor Invoice Lama (masih terbuka)'), 'INV-LAMA-001')
    await user.click(screen.getByRole('button', { name: 'Simpan Credit Memo Entry' }))
    expect(await screen.findByText(/tidak berstatus Disetujui dengan metode pencairan Potong Tagihan/)).toBeInTheDocument()
  })
})

describe('Check & Post dan Apply (langkah 03-04)', () => {
  it('nomor credit memo wajib; Check & Post mengirim nomor dan membuka langkah Apply', async () => {
    api.getCreditMemoClaim.mockResolvedValue(entered())
    api.postCreditMemo.mockResolvedValue(posted())
    const user = userEvent.setup()
    shell(['/marketing/credit-memos/1'])

    await user.click(await screen.findByRole('button', { name: 'Check & Post Credit Memo' }))
    expect(await screen.findByText('Isi nomor credit memo')).toBeInTheDocument()
    expect(api.postCreditMemo).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Nomor Credit Memo (AR Credit Memo)'), 'CM-001')
    await user.click(screen.getByRole('button', { name: 'Check & Post Credit Memo' }))

    await waitFor(() => expect(api.postCreditMemo).toHaveBeenCalledWith(1, { credit_memo_number: 'CM-001' }))
    expect(await screen.findByText('CM-001', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply Credit Memo' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nomor Invoice Lama (masih terbuka)')).not.toBeInTheDocument() // entry terkunci setelah Post
    expect(screen.getByText('Invoice lama').closest('.mb-kv')).toHaveTextContent('INV-LAMA-001')
  })

  it('Apply mengurangi saldo klaim menjadi Rp 0 dan menutup alurnya', async () => {
    api.getCreditMemoClaim.mockResolvedValue(posted())
    api.applyCreditMemo.mockResolvedValue(applied())
    const user = userEvent.setup()
    shell(['/marketing/credit-memos/1'])

    expect(await screen.findByTestId('balance')).toHaveTextContent('Rp 10.000') // belum di-Apply
    await user.click(screen.getByRole('button', { name: 'Apply Credit Memo' }))

    await waitFor(() => expect(api.applyCreditMemo).toHaveBeenCalledWith(1))
    await waitFor(() => expect(screen.getByTestId('balance')).toHaveTextContent('Rp 0'))
    expect(screen.getByText(/sudah di-Apply oleh Pak Finance/)).toBeInTheDocument()
    expect(screen.getByText('Teraplikasi', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply Credit Memo' })).not.toBeInTheDocument()
  })

  it('galat Apply dari server ditampilkan apa adanya', async () => {
    api.getCreditMemoClaim.mockResolvedValue(posted())
    api.applyCreditMemo.mockRejectedValue(new Error('Credit memo harus di-Post dulu sebelum di-Apply.'))
    const user = userEvent.setup()
    shell(['/marketing/credit-memos/1'])

    await user.click(await screen.findByRole('button', { name: 'Apply Credit Memo' }))
    expect(await screen.findByText('Credit memo harus di-Post dulu sebelum di-Apply.')).toBeInTheDocument()
  })

  it('role di luar finance dan admin tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/credit-memos/1'])
    expect(await screen.findByText(/hanya untuk finance dan admin/)).toBeInTheDocument()
    expect(api.getCreditMemoClaim).not.toHaveBeenCalled()
  })
})

describe('Tombol dari detail pengajuan klaim', () => {
  beforeEach(() => {
    auth.user = { id: 9, name: 'Mgr', role: 'supervisor' } // halaman detail pengajuan klaim hanya untuk admin dan supervisor
  })

  const approvedClaim = (method, label) => ({
    id: 1, claim_no: 'CLM-2026-00001', status: 'APPROVED', is_late: false, letter_received_date: '2026-12-10', claimed_amount: '12000.00', eligible_amount: '10000.00',
    difference_amount: '2000.00', approved_amount: '10000.00', payout_method: method, payout_method_label: label, final_confirmed_at: '2026-12-23T03:00:00Z',
    customer: { id: 5, customer_code: 'D1', name: 'Distributor D1' },
    program: { id: 7, event_code: 'BDG-2026-001-K02', claim_type_label: 'Diskon Produk', claim_source_label: 'Sell Out', claim_basis_label: 'Nilai Penjualan', claim_rate: '2.50', claim_rate_type: 'PERCENT', claim_deadline: '2026-12-15' },
    calc_detail: null, approvals: [], attachments: [], diff_confirmed_at: '2026-12-12T03:00:00Z', flags: { reason_codes: {}, payout_methods: [], approval: { levels: [], can_finalize: false } },
  })

  it('klaim Disetujui bermetode Potong Tagihan menampilkan tombol menuju credit memo', async () => {
    api.getClaim.mockResolvedValue(approvedClaim('POTONG_TAGIHAN', 'Potong Tagihan'))
    shell(['/marketing/claims/1'])

    expect(await screen.findByRole('button', { name: 'Buka Potong Tagihan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buka Potong Nota' })).not.toBeInTheDocument()
  })

  it('klaim bermetode Potong Nota tetap menampilkan tombol Potong Nota saja', async () => {
    api.getClaim.mockResolvedValue(approvedClaim('POTONG_NOTA', 'Potong Nota'))
    shell(['/marketing/claims/1'])

    expect(await screen.findByRole('button', { name: 'Buka Potong Nota' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buka Potong Tagihan' })).not.toBeInTheDocument()
  })
})
