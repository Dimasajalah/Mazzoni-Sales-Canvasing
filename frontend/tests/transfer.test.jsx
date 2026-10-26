import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getTransferClaims: vi.fn(), getTransferClaim: vi.fn(), saveTransferEntry: vi.fn(), markTransferred: vi.fn(), getClaim: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import ClaimDetail from '../src/pages/ClaimDetail.jsx'
import TransferDetail from '../src/pages/TransferDetail.jsx'
import Transfers from '../src/pages/Transfers.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/transfers" element={<Transfers />} />
            <Route path="/marketing/transfers/:id" element={<TransferDetail />} />
            <Route path="/marketing/claims/:id" element={<ClaimDetail />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const flags = (over = {}) => ({
  can_entry: true, can_transfer: false, rates: { pph21: 2.5, pph23_pkp: 2, pph23_non_pkp: 4 },
  tax_id_types: [{ value: 'NPWP', label: 'NPWP' }, { value: 'KTP', label: 'KTP' }], ...over,
})

const transfer = (over = {}) => ({
  id: 1, bank_name: 'BCA', account_number: '123-456-7890', account_name: 'PT Distributor Makmur', is_individual: false, is_pkp: false,
  tax_type: 'PPH_23', tax_type_label: 'PPh 23', tax_rate: '4.00', tax_id_type: null, tax_id_number: null, gross_amount: '10000.00', tax_amount: '400.00',
  net_amount: '9600.00', status: 'ENTERED', transfer_reference: null, transferred_on: null, enterer: { name: 'Bu Finance' }, transferer: null,
  entered_at: '2026-12-20T03:00:00Z', transferred_at: null, ...over,
})

const claim = (over = {}) => ({
  id: 1, claim_no: 'CLM-2026-00001', status: 'APPROVED', approved_amount: '10000.00', transfer_status: null, transfer: null,
  customer: { id: 5, customer_code: 'D1', name: 'Distributor D1' }, program: { id: 7, event_code: 'BDG-2026-001-K02' }, flags: flags(), ...over,
})

const entered = (over = {}) => claim({ transfer_status: 'ENTERED', transfer: transfer(), flags: flags({ can_transfer: true }), ...over })
const row = (label) => screen.getByText(label).closest('.cl-res-row')

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Finance', role: 'finance' }
  api.getTransferClaim.mockResolvedValue(claim())
})

describe('Daftar klaim Transfer', () => {
  it('menampilkan total nilai dan tiap klaim dengan status entry-nya', async () => {
    api.getTransferClaims.mockResolvedValue([
      claim(),
      claim({ id: 2, claim_no: 'CLM-2026-00002', transfer_status: 'ENTERED', approved_amount: '5000.00', customer: { id: 6, customer_code: 'D2', name: 'Distributor D2' } }),
    ])
    shell(['/marketing/transfers'])

    expect(await screen.findByText('Distributor D1')).toBeInTheDocument()
    expect(screen.getByTestId('transfer-total')).toHaveTextContent('Rp 15.000')
    expect(screen.getByText('Belum dientri')).toBeInTheDocument()
    expect(screen.getByText('Sudah dientri')).toBeInTheDocument()
  })

  it('pencarian memanggil server dengan kata kunci', async () => {
    api.getTransferClaims.mockResolvedValue([claim()])
    const user = userEvent.setup()
    shell(['/marketing/transfers'])

    await screen.findByText('Distributor D1')
    await user.type(screen.getByLabelText('Cari klaim'), 'Makmur')
    await waitFor(() => expect(api.getTransferClaims).toHaveBeenCalledWith({ q: 'Makmur' }))
  })

  it('tidak ada klaim: tampilan kosong', async () => {
    api.getTransferClaims.mockResolvedValue([])
    shell(['/marketing/transfers'])
    expect(await screen.findByText('Tidak ada klaim Transfer yang menunggu pencairan.')).toBeInTheDocument()
  })

  it('mengetuk klaim membuka halaman pencairannya', async () => {
    api.getTransferClaims.mockResolvedValue([claim()])
    const user = userEvent.setup()
    shell(['/marketing/transfers'])

    await user.click(await screen.findByText('Distributor D1'))
    await waitFor(() => expect(api.getTransferClaim).toHaveBeenCalledWith('1'))
    expect(await screen.findByText('Misc. Payment Entry')).toBeInTheDocument()
  })

  it('hanya finance dan admin; sales dan supervisor tidak memuat data', async () => {
    for (const role of ['sales', 'supervisor']) {
      auth.user = { id: 2, name: role, role }
      const view = shell(['/marketing/transfers'])
      expect(await screen.findByText(/hanya untuk finance dan admin/)).toBeInTheDocument()
      view.unmount()
    }
    expect(api.getTransferClaims).not.toHaveBeenCalled()

    auth.user = { id: 3, name: 'Admin', role: 'admin' }
    api.getTransferClaims.mockResolvedValue([])
    shell(['/marketing/transfers'])
    await waitFor(() => expect(api.getTransferClaims).toHaveBeenCalled())
  })
})

describe('Misc. Payment Entry: pajak (langkah 01-03)', () => {
  it('bukan perorangan dan Non-PKP: PPh 23 sebesar 4 persen', async () => {
    shell(['/marketing/transfers/1'])

    expect(await screen.findByTestId('approved')).toHaveTextContent('Rp 10.000')
    expect(row('Tax Type')).toHaveTextContent('PPh 23')
    expect(row('Tarif')).toHaveTextContent('4%')
    expect(row('Potongan Pajak')).toHaveTextContent('-Rp 400')
    expect(row('Nilai Transfer Bersih')).toHaveTextContent('Rp 9.600')
    expect(screen.queryByLabelText('Dasar PPh 21')).not.toBeInTheDocument()
  })

  it('bukan perorangan dan PKP: PPh 23 sebesar 2 persen', async () => {
    const user = userEvent.setup()
    shell(['/marketing/transfers/1'])

    await user.click(await screen.findByLabelText('Distributor berstatus PKP'))

    expect(row('Tax Type')).toHaveTextContent('PPh 23')
    expect(row('Tarif')).toHaveTextContent('2%')
    expect(row('Potongan Pajak')).toHaveTextContent('-Rp 200')
    expect(row('Nilai Transfer Bersih')).toHaveTextContent('Rp 9.800')
  })

  it('rekening perorangan: PPh 21 sebesar 2,5 persen dengan dasar NPWP atau KTP, apa pun status PKP-nya', async () => {
    const user = userEvent.setup()
    shell(['/marketing/transfers/1'])

    await user.click(await screen.findByLabelText('Rekening perorangan'))
    await user.click(screen.getByLabelText('Distributor berstatus PKP'))

    expect(row('Tax Type')).toHaveTextContent('PPh 21')
    expect(row('Tarif')).toHaveTextContent('2.5%')
    expect(row('Potongan Pajak')).toHaveTextContent('-Rp 250')
    expect(row('Nilai Transfer Bersih')).toHaveTextContent('Rp 9.750')
    expect(screen.getByRole('option', { name: 'NPWP' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'KTP' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nomor NPWP / KTP Penerima')).toBeInTheDocument()
  })

  it('validasi berurutan: bank, nomor rekening, nama pemilik, dasar PPh 21, dan nomornya', async () => {
    const user = userEvent.setup()
    shell(['/marketing/transfers/1'])
    const save = () => user.click(screen.getByRole('button', { name: 'Simpan Misc. Payment Entry' }))

    await screen.findByLabelText('Bank Tujuan')
    await save()
    expect(await screen.findByText('Isi bank tujuan')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Bank Tujuan'), 'BCA')
    await save()
    expect(await screen.findByText('Isi nomor rekening')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nomor Rekening'), 'abc')
    await save()
    expect(await screen.findByText('Nomor rekening hanya boleh berisi angka, spasi, dan tanda hubung')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Nomor Rekening'))
    await user.type(screen.getByLabelText('Nomor Rekening'), '123-456')
    await save()
    expect(await screen.findByText('Isi nama pemilik rekening')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nama Pemilik Rekening'), 'PT Distributor Makmur')
    await user.click(screen.getByLabelText('Rekening perorangan'))
    await save()
    expect(await screen.findByText('Pilih dasar PPh 21: NPWP atau KTP penerima')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Dasar PPh 21'), 'NPWP')
    await save()
    expect(await screen.findByText('Isi nomor NPWP penerima')).toBeInTheDocument()
    expect(api.saveTransferEntry).not.toHaveBeenCalled()
  })

  it('menyimpan rekening perusahaan mengirim payload tanpa dasar NPWP/KTP dan membuka konfirmasi transfer', async () => {
    api.saveTransferEntry.mockResolvedValue(entered({ transfer: transfer({ is_pkp: true, tax_rate: '2.00', tax_amount: '200.00', net_amount: '9800.00' }) }))
    const user = userEvent.setup()
    shell(['/marketing/transfers/1'])

    await user.type(await screen.findByLabelText('Bank Tujuan'), 'BCA')
    await user.type(screen.getByLabelText('Nomor Rekening'), '123-456-7890')
    await user.type(screen.getByLabelText('Nama Pemilik Rekening'), 'PT Distributor Makmur')
    await user.click(screen.getByLabelText('Distributor berstatus PKP'))
    await user.click(screen.getByRole('button', { name: 'Simpan Misc. Payment Entry' }))

    await waitFor(() => expect(api.saveTransferEntry).toHaveBeenCalledWith(1, {
      bank_name: 'BCA', account_number: '123-456-7890', account_name: 'PT Distributor Makmur', is_individual: false, is_pkp: true,
    }))
    expect(await screen.findByText('Konfirmasi Transfer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ubah Misc. Payment Entry' })).toBeInTheDocument()
  })

  it('menyimpan rekening perorangan mengirim dasar NPWP/KTP beserta nomornya', async () => {
    api.saveTransferEntry.mockResolvedValue(entered())
    const user = userEvent.setup()
    shell(['/marketing/transfers/1'])

    await user.type(await screen.findByLabelText('Bank Tujuan'), 'BCA')
    await user.type(screen.getByLabelText('Nomor Rekening'), '123456')
    await user.type(screen.getByLabelText('Nama Pemilik Rekening'), 'Budi Santoso')
    await user.click(screen.getByLabelText('Rekening perorangan'))
    await user.selectOptions(screen.getByLabelText('Dasar PPh 21'), 'KTP')
    await user.type(screen.getByLabelText('Nomor NPWP / KTP Penerima'), '3578010101900001')
    await user.click(screen.getByRole('button', { name: 'Simpan Misc. Payment Entry' }))

    await waitFor(() => expect(api.saveTransferEntry).toHaveBeenCalledWith(1, {
      bank_name: 'BCA', account_number: '123456', account_name: 'Budi Santoso', is_individual: true, is_pkp: false,
      tax_id_type: 'KTP', tax_id_number: '3578010101900001',
    }))
  })

  it('entry yang sudah ada terisi kembali di form dan masih bisa diubah sebelum dicairkan', async () => {
    api.getTransferClaim.mockResolvedValue(entered({ transfer: transfer({ is_individual: true, tax_type: 'PPH_21', tax_rate: '2.50', tax_id_type: 'NPWP', tax_id_number: '09.254.294.3-407.000', bank_name: 'Mandiri' }) }))
    shell(['/marketing/transfers/1'])

    expect(await screen.findByLabelText('Bank Tujuan')).toHaveValue('Mandiri')
    expect(screen.getByLabelText('Rekening perorangan')).toBeChecked()
    expect(screen.getByLabelText('Dasar PPh 21')).toHaveValue('NPWP')
    expect(screen.getByLabelText('Nomor NPWP / KTP Penerima')).toHaveValue('09.254.294.3-407.000')
    expect(screen.getByRole('button', { name: 'Ubah Misc. Payment Entry' })).toBeInTheDocument()
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.saveTransferEntry.mockRejectedValue(new Error('Klaim ini tidak berstatus Disetujui dengan metode pencairan Transfer.'))
    const user = userEvent.setup()
    shell(['/marketing/transfers/1'])

    await user.type(await screen.findByLabelText('Bank Tujuan'), 'BCA')
    await user.type(screen.getByLabelText('Nomor Rekening'), '123')
    await user.type(screen.getByLabelText('Nama Pemilik Rekening'), 'PT X')
    await user.click(screen.getByRole('button', { name: 'Simpan Misc. Payment Entry' }))
    expect(await screen.findByText(/tidak berstatus Disetujui dengan metode pencairan Transfer/)).toBeInTheDocument()
  })
})

describe('Konfirmasi transfer: klaim Dicairkan', () => {
  it('nomor referensi wajib; menandai dicairkan mengirim nomor dan tanggal, lalu klaim berstatus Dicairkan', async () => {
    api.getTransferClaim.mockResolvedValue(entered())
    api.markTransferred.mockResolvedValue(claim({
      status: 'DISBURSED', transfer_status: 'TRANSFERRED', flags: flags({ can_entry: false }),
      transfer: transfer({ status: 'TRANSFERRED', transfer_reference: 'TRF-001', transferred_on: '2026-12-22', transferer: { name: 'Bu Finance' }, transferred_at: '2026-12-22T03:00:00Z' }),
    }))
    const user = userEvent.setup()
    shell(['/marketing/transfers/1'])

    await user.click(await screen.findByRole('button', { name: 'Tandai Dicairkan' }))
    expect(await screen.findByText('Isi nomor referensi transfer')).toBeInTheDocument()
    expect(api.markTransferred).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Nomor Referensi Transfer'), 'TRF-001')
    fireEvent.change(screen.getByLabelText('Tanggal Transfer'), { target: { value: '2026-12-22' } })
    await user.click(screen.getByRole('button', { name: 'Tandai Dicairkan' }))

    await waitFor(() => expect(api.markTransferred).toHaveBeenCalledWith(1, { transfer_reference: 'TRF-001', transferred_on: '2026-12-22' }))
    expect(await screen.findByText('Dicairkan', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Nomor referensi').closest('.mb-kv')).toHaveTextContent('TRF-001')
    expect(screen.getByText(/Klaim sudah dicairkan oleh Bu Finance/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tandai Dicairkan' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Bank Tujuan')).not.toBeInTheDocument() // entry terkunci setelah dicairkan
    expect(screen.getByText('Rekening tujuan').closest('.mb-kv')).toHaveTextContent('BCA · 123-456-7890')
  })

  it('galat dari server (nomor referensi dipakai klaim lain) ditampilkan apa adanya', async () => {
    api.getTransferClaim.mockResolvedValue(entered())
    api.markTransferred.mockRejectedValue(new Error('Nomor referensi TRF-001 sudah dipakai klaim lain.'))
    const user = userEvent.setup()
    shell(['/marketing/transfers/1'])

    await user.type(await screen.findByLabelText('Nomor Referensi Transfer'), 'TRF-001')
    await user.click(screen.getByRole('button', { name: 'Tandai Dicairkan' }))
    expect(await screen.findByText('Nomor referensi TRF-001 sudah dipakai klaim lain.')).toBeInTheDocument()
  })

  it('role di luar finance dan admin tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/transfers/1'])
    expect(await screen.findByText(/hanya untuk finance dan admin/)).toBeInTheDocument()
    expect(api.getTransferClaim).not.toHaveBeenCalled()
  })
})

describe('Detail pengajuan klaim', () => {
  const approvedClaim = (status) => ({
    id: 1, claim_no: 'CLM-2026-00001', status, is_late: false, letter_received_date: '2026-12-10', claimed_amount: '12000.00', eligible_amount: '10000.00',
    difference_amount: '2000.00', approved_amount: '10000.00', payout_method: 'TRANSFER', payout_method_label: 'Transfer', final_confirmed_at: '2026-12-23T03:00:00Z',
    customer: { id: 5, customer_code: 'D1', name: 'Distributor D1' },
    program: { id: 7, event_code: 'BDG-2026-001-K02', claim_type_label: 'Diskon Produk', claim_source_label: 'Sell Out', claim_basis_label: 'Nilai Penjualan', claim_rate: '2.50', claim_rate_type: 'PERCENT', claim_deadline: '2026-12-15' },
    calc_detail: null, approvals: [], attachments: [], diff_confirmed_at: '2026-12-12T03:00:00Z', flags: { reason_codes: {}, payout_methods: [], approval: { levels: [], can_finalize: false } },
  })

  beforeEach(() => {
    auth.user = { id: 9, name: 'Mgr', role: 'supervisor' } // halaman detail pengajuan klaim hanya untuk admin dan supervisor
  })

  it('klaim Disetujui bermetode Transfer menampilkan tombol menuju pencairan transfer', async () => {
    api.getClaim.mockResolvedValue(approvedClaim('APPROVED'))
    shell(['/marketing/claims/1'])

    expect(await screen.findByRole('button', { name: 'Buka Pencairan Transfer' })).toBeInTheDocument()
    expect(screen.getByText('Disetujui', { selector: '.mb-badge' })).toBeInTheDocument()
  })

  it('klaim yang sudah Dicairkan berstatus Dicairkan dan nilai disetujuinya tetap terlihat', async () => {
    api.getClaim.mockResolvedValue(approvedClaim('DISBURSED'))
    shell(['/marketing/claims/1'])

    expect(await screen.findByText('Dicairkan', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Nilai Klaim Disetujui', { selector: 'span' }).closest('.cl-res-row')).toHaveTextContent('Rp 10.000')
    expect(screen.getByRole('button', { name: 'Buka Pencairan Transfer' })).toBeInTheDocument()
  })
})
