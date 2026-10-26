import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getClaimOptions: vi.fn(), getClaims: vi.fn(), getClaim: vi.fn(), createClaim: vi.fn(),
  passClaim: vi.fn(), refuseClaim: vi.fn(), calculateClaim: vi.fn(), submitClaim: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import ClaimDetail from '../src/pages/ClaimDetail.jsx'
import ClaimForm from '../src/pages/ClaimForm.jsx'
import Claims from '../src/pages/Claims.jsx'

function Probe() {
  return <div data-testid="probe">{useLocation().pathname}</div>
}

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/claims" element={<Claims />} />
            <Route path="/marketing/claims/new" element={<ClaimForm />} />
            <Route path="/marketing/claims/:id" element={<ClaimDetail />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const program = (over = {}) => ({
  id: 7, event_code: 'BDG-2026-001-K02', description: 'Diskon Saus Q4', claim_type_label: 'Diskon Produk', claim_source: 'SELL_OUT',
  claim_source_label: 'Sell Out', claim_basis_label: 'Nilai Penjualan', claim_threshold: null, claim_rate: '2.50', claim_rate_type: 'PERCENT',
  claim_deadline: '2026-12-15', start_date: '2026-11-01', end_date: '2026-11-30', ...over,
})

const flags = (over = {}) => ({
  can_pass: false, pass_label: 'Direktur Sales', can_calculate: true, calculate_blocker: null, can_submit: false,
  payout_methods: [
    { value: 'POTONG_NOTA', label: 'Potong Nota' }, { value: 'POTONG_TAGIHAN', label: 'Potong Tagihan' },
    { value: 'TRANSFER', label: 'Transfer' }, { value: 'BARANG', label: 'Barang' },
  ],
  reason_codes: {
    APPROVE: [{ value: 'SESUAI_ANGGARAN', label: 'Sesuai anggaran' }],
    REJECT: [{ value: 'DOKUMEN_KURANG', label: 'Dokumen pendukung kurang' }],
  },
  ...over,
})

const claim = (over = {}) => ({
  id: 1, claim_no: 'CLM-2026-00001', status: 'DRAFT', is_late: false, letter_received_date: '2026-12-10', claimed_amount: '12000.00',
  customer: { id: 5, customer_code: 'D1', name: 'Distributor D1', city: 'Surabaya' }, program: program(),
  eligible_amount: null, difference_amount: null, calc_detail: null, payout_method: null, payout_method_label: null,
  pass_decision: null, passer: null, pass_reason_code: null, pass_notes: null, pass_at: null, submitted_at: null,
  attachments: [], flags: flags(), ...over,
})

const calculated = (over = {}) => claim({
  status: 'CALCULATED', eligible_amount: '10000.00', difference_amount: '2000.00',
  calc_detail: { source: 'SELL_OUT', rows: 2, basis_label: 'Nilai Penjualan', base_value: 400000, formula: '2,5% x Rp 400.000 = Rp 10.000', note: 'Seluruh data sell out program dihitung.' },
  flags: flags({ can_submit: true }), ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Mgr', role: 'supervisor' }
  api.getClaim.mockResolvedValue(claim())
  api.getClaimOptions.mockResolvedValue({
    programs: [program(), program({ id: 8, event_code: 'BDG-2026-001-K03', description: 'Reward Toko', claim_source: 'SELL_IN', claim_source_label: 'Sell In', claim_deadline: '2026-11-20' })],
    participants: [{ id: 5, customer_code: 'D1', name: 'Distributor D1', city: 'Surabaya' }],
  })
})

describe('Daftar pengajuan klaim', () => {
  it('menampilkan klaim dengan statusnya dan memfilter', async () => {
    api.getClaims.mockResolvedValue([
      claim({ can_pass: false }),
      claim({ id: 2, claim_no: 'CLM-2026-00002', status: 'PENDING_PASS', is_late: true, can_pass: true, customer: { id: 6, customer_code: 'D2', name: 'Distributor D2' } }),
      claim({ id: 3, claim_no: 'CLM-2026-00003', status: 'SUBMITTED', eligible_amount: '10000.00', customer: { id: 7, customer_code: 'D3', name: 'Distributor D3' } }),
    ])
    const user = userEvent.setup()
    shell(['/marketing/claims'])

    expect(await screen.findByText('Distributor D1')).toBeInTheDocument()
    expect(screen.getByText('Pending (melewati periode)')).toBeInTheDocument()
    expect(screen.getByText('Perlu keputusan Anda')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Perlu Keputusan Saya (1)' }))
    expect(screen.getByText('Distributor D2')).toBeInTheDocument()
    expect(screen.queryByText('Distributor D1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Diajukan' }))
    expect(screen.getByText('Distributor D3')).toBeInTheDocument()
    expect(screen.queryByText('Distributor D2')).not.toBeInTheDocument()
  })

  it('pengguna sales tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/claims'])
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getClaims).not.toHaveBeenCalled()
  })
})

describe('Form Claim Entry', () => {
  const fill = async (user, over = {}) => {
    await screen.findByRole('option', { name: /BDG-2026-001-K02/ })
    await user.selectOptions(screen.getByLabelText('Program Klaim'), '7')
    await user.click(await screen.findByRole('button', { name: /Distributor D1/ }))
    fireEvent.change(screen.getByLabelText('Tanggal Terima Surat'), { target: { value: over.date || '2026-12-10' } })
    await user.type(screen.getByLabelText('Nilai Pengajuan (Rp)'), over.amount || '12000')
  }

  it('memilih program menampilkan ringkasan dan batas pengajuan klaim, serta mencari peserta program', async () => {
    const user = userEvent.setup()
    shell(['/marketing/claims/new'])

    await screen.findByRole('option', { name: /BDG-2026-001-K02/ })
    expect(screen.getByLabelText('Cari distributor (peserta program)')).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Program Klaim'), '7')

    expect(await screen.findByText(/Diskon Produk · sumber data Sell Out/)).toBeInTheDocument()
    expect(screen.getByText('15 Des 2026')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Distributor D1/ })).toBeInTheDocument()
    await waitFor(() => expect(api.getClaimOptions).toHaveBeenCalledWith({ program_id: '7', q: '' }))
  })

  it('program dari tautan terpilih otomatis', async () => {
    shell(['/marketing/claims/new?program=7'])
    await waitFor(() => expect(screen.getByLabelText('Program Klaim')).toHaveValue('7'))
    expect(await screen.findByRole('button', { name: /Distributor D1/ })).toBeInTheDocument()
  })

  it('tanggal setelah batas klaim memunculkan peringatan Pending; tepat di batas tidak', async () => {
    const user = userEvent.setup()
    shell(['/marketing/claims/new'])
    await screen.findByRole('option', { name: /BDG-2026-001-K02/ })
    await user.selectOptions(screen.getByLabelText('Program Klaim'), '7')

    fireEvent.change(screen.getByLabelText('Tanggal Terima Surat'), { target: { value: '2026-12-15' } })
    expect(screen.queryByText(/Melewati periode klaim/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tanggal Terima Surat'), { target: { value: '2026-12-16' } })
    expect(screen.getByText(/Melewati periode klaim \(batas 15 Des 2026\)/)).toBeInTheDocument()
    expect(screen.getByText(/persetujuan khusus Direktur Sales/)).toBeInTheDocument()
  })

  it('validasi berurutan: program, distributor, tanggal, nilai', async () => {
    const user = userEvent.setup()
    shell(['/marketing/claims/new'])
    await screen.findByRole('option', { name: /BDG-2026-001-K02/ })

    await user.click(screen.getByRole('button', { name: 'Simpan Pengajuan Klaim' }))
    expect(await screen.findByText('Pilih program klaim')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Program Klaim'), '7')
    await user.click(screen.getByRole('button', { name: 'Simpan Pengajuan Klaim' }))
    expect(await screen.findByText('Pilih distributor')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /Distributor D1/ }))
    await user.click(screen.getByRole('button', { name: 'Simpan Pengajuan Klaim' }))
    expect(await screen.findByText('Isi tanggal terima surat')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tanggal Terima Surat'), { target: { value: '2026-12-10' } })
    await user.click(screen.getByRole('button', { name: 'Simpan Pengajuan Klaim' }))
    expect(await screen.findByText('Isi nilai pengajuan lebih dari 0')).toBeInTheDocument()
    expect(api.createClaim).not.toHaveBeenCalled()
  })

  it('mengirim pengajuan sebagai form data lalu pindah ke detail', async () => {
    api.createClaim.mockResolvedValue({ id: 1, status: 'DRAFT' })
    const user = userEvent.setup()
    shell(['/marketing/claims/new'])
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Simpan Pengajuan Klaim' }))

    await waitFor(() => expect(api.createClaim).toHaveBeenCalledTimes(1))
    const fd = api.createClaim.mock.calls[0][0]
    expect(fd.get('program_id')).toBe('7')
    expect(fd.get('customer_id')).toBe('5')
    expect(fd.get('letter_received_date')).toBe('2026-12-10')
    expect(fd.get('claimed_amount')).toBe('12000')
    expect(await screen.findByText('CLM-2026-00001 · D1')).toBeInTheDocument() // halaman detail terbuka
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.createClaim.mockRejectedValue(new Error('Distributor ini bukan peserta program klaim.'))
    const user = userEvent.setup()
    shell(['/marketing/claims/new'])
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Simpan Pengajuan Klaim' }))
    expect(await screen.findByText('Distributor ini bukan peserta program klaim.')).toBeInTheDocument()
  })
})

describe('Detail pengajuan klaim: Calculate dan hasilnya', () => {
  it('Calculate menampilkan nilai eligible, nilai pengajuan, selisih, dan rumusnya', async () => {
    api.calculateClaim.mockResolvedValue(calculated())
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await user.click(await screen.findByRole('button', { name: 'Calculate' }))

    await waitFor(() => expect(api.calculateClaim).toHaveBeenCalledWith(1))
    const eligible = (await screen.findByText('Nilai Eligible Klaim')).closest('.cl-res-row')
    expect(eligible).toHaveTextContent('Rp 10.000')
    expect(screen.getByText('Selisih').closest('.cl-res-row')).toHaveTextContent('Rp 2.000')
    expect(screen.getByText(/2,5% x Rp 400\.000 = Rp 10\.000/)).toBeInTheDocument()
    expect(screen.getByText(/2 baris data sell out/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculate Ulang' })).toBeInTheDocument()
    expect(screen.getByText('Metode Pencairan', { selector: '.mb-sec-t' })).toBeInTheDocument()
  })

  it('Calculate nonaktif dengan alasannya bila data sell out belum valid', async () => {
    api.getClaim.mockResolvedValue(claim({ flags: flags({ can_calculate: false, calculate_blocker: 'Data sell out belum divalidasi. Tombol Calculate aktif setelah data valid diunggah pada program klaim.' }) }))
    shell(['/marketing/claims/1'])

    expect(await screen.findByRole('button', { name: 'Calculate' })).toBeDisabled()
    expect(screen.getByText(/Data sell out belum divalidasi/)).toBeInTheDocument()
  })

  it('galat perhitungan dari server ditampilkan apa adanya', async () => {
    api.calculateClaim.mockRejectedValue(new Error('Kolom AR Invoice tidak dikenali di tabel "invoices".'))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await user.click(await screen.findByRole('button', { name: 'Calculate' }))
    expect(await screen.findByText(/Kolom AR Invoice tidak dikenali/)).toBeInTheDocument()
  })

  it('selisih negatif (klaim lebih kecil dari eligible) tetap ditampilkan', async () => {
    api.getClaim.mockResolvedValue(calculated({ difference_amount: '-3000.00' }))
    shell(['/marketing/claims/1'])

    expect((await screen.findByText('Selisih')).closest('.cl-res-row')).toHaveTextContent('Rp -3.000')
  })
})

describe('Detail pengajuan klaim: melewati periode (Direktur Sales)', () => {
  const late = (over = {}) => claim({ status: 'PENDING_PASS', is_late: true, flags: flags({ can_pass: true, can_calculate: false, calculate_blocker: 'Klaim melewati periode klaim dan menunggu persetujuan khusus Direktur Sales.' }), ...over })

  it('pemberi keputusan melihat formulir; Pass memakai kode alasan setuju', async () => {
    api.getClaim.mockResolvedValue(late())
    api.passClaim.mockResolvedValue(claim({ is_late: true, pass_decision: 'PASSED', pass_reason_code: 'SESUAI_ANGGARAN', passer: { name: 'Pak Direktur' }, pass_at: '2026-12-21T03:00:00Z' }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await screen.findByText('Perlu keputusan Anda')
    await user.selectOptions(screen.getByLabelText('Kode Alasan'), 'SESUAI_ANGGARAN')
    await user.type(screen.getByLabelText('Catatan (opsional)'), 'Kendala kirim')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.passClaim).toHaveBeenCalledWith(1, { reason_code: 'SESUAI_ANGGARAN', notes: 'Kendala kirim' }))
    expect(await screen.findByText('Di-pass oleh Pak Direktur')).toBeInTheDocument()
    expect(screen.getByText(/Alasan: Sesuai anggaran/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kirim Keputusan' })).not.toBeInTheDocument()
  })

  it('Tolak memakai kode alasan tolak dan menghentikan proses', async () => {
    api.getClaim.mockResolvedValue(late())
    api.refuseClaim.mockResolvedValue(claim({ status: 'STOPPED', is_late: true, pass_decision: 'REFUSED', pass_reason_code: 'DOKUMEN_KURANG', passer: { name: 'Pak Direktur' }, flags: flags({ can_calculate: false }) }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await screen.findByLabelText('Kode Alasan')
    await user.click(screen.getByRole('button', { name: 'Tolak' }))
    expect(screen.queryByRole('option', { name: 'Sesuai anggaran' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Kode Alasan'), 'DOKUMEN_KURANG')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.refuseClaim).toHaveBeenCalledWith(1, { reason_code: 'DOKUMEN_KURANG' }))
    expect(api.passClaim).not.toHaveBeenCalled()
    expect(await screen.findByText('Tidak di-pass oleh Pak Direktur')).toBeInTheDocument()
    expect(screen.getByText('Dihentikan', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Calculate' })).not.toBeInTheDocument()
  })

  it('kode alasan wajib dipilih', async () => {
    api.getClaim.mockResolvedValue(late())
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await user.click(await screen.findByRole('button', { name: 'Kirim Keputusan' }))
    expect(await screen.findByText('Pilih kode alasan')).toBeInTheDocument()
    expect(api.passClaim).not.toHaveBeenCalled()
  })

  it('pengguna lain hanya melihat keterangan menunggu, tanpa formulir dan tanpa Calculate aktif', async () => {
    api.getClaim.mockResolvedValue(late({ flags: flags({ can_pass: false, can_calculate: false, calculate_blocker: 'Klaim melewati periode klaim dan menunggu persetujuan khusus Direktur Sales.' }) }))
    shell(['/marketing/claims/1'])

    expect(await screen.findByText(/Menunggu keputusan Direktur Sales\. Klaim hanya lanjut bila di-pass\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kirim Keputusan' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculate' })).toBeDisabled()
  })
})

describe('Detail pengajuan klaim: metode pencairan dan pengajuan', () => {
  it('metode pencairan wajib dipilih sebelum diajukan', async () => {
    api.getClaim.mockResolvedValue(calculated())
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await user.click(await screen.findByRole('button', { name: 'Ajukan untuk Approval' }))
    expect(await screen.findByText('Pilih metode pencairan')).toBeInTheDocument()
    expect(api.submitClaim).not.toHaveBeenCalled()
  })

  it('memilih metode lalu mengajukan: status menjadi Diajukan dan tidak bisa dihitung ulang', async () => {
    api.getClaim.mockResolvedValue(calculated())
    api.submitClaim.mockResolvedValue(calculated({ status: 'SUBMITTED', payout_method: 'TRANSFER', payout_method_label: 'Transfer', submitted_at: '2026-12-22T03:00:00Z', flags: flags({ can_calculate: false }) }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    expect(screen.queryByRole('option', { name: 'Transfer' })).not.toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText('Metode Pencairan'), 'TRANSFER')
    await user.click(screen.getByRole('button', { name: 'Ajukan untuk Approval' }))

    await waitFor(() => expect(api.submitClaim).toHaveBeenCalledWith(1, { payout_method: 'TRANSFER' }))
    expect(await screen.findByText(/Klaim sudah diajukan untuk approval/)).toBeInTheDocument()
    expect(screen.getByText('Diajukan', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Transfer', { selector: 'b' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Calculate/ })).not.toBeInTheDocument()
  })

  it('klaim yang belum dihitung belum menampilkan metode pencairan', async () => {
    shell(['/marketing/claims/1'])
    await screen.findByRole('button', { name: 'Calculate' })
    expect(screen.queryByText('Metode Pencairan', { selector: '.mb-sec-t' })).not.toBeInTheDocument()
  })

  it('dokumen distributor tampil dengan jenisnya', async () => {
    api.getClaim.mockResolvedValue(claim({ attachments: [{ id: 1, kind: 'LETTER', filename: 'surat.pdf', size: 51200 }, { id: 2, kind: 'WORKSHEET', filename: 'kertas-kerja.pdf', size: 20480 }] }))
    shell(['/marketing/claims/1'])

    const surat = (await screen.findByText('surat.pdf')).closest('.me-file')
    expect(within(surat).getByText(/Surat Klaim/)).toBeInTheDocument()
    expect(screen.getByText('kertas-kerja.pdf').closest('.me-file')).toHaveTextContent('Kertas Kerja')
  })

  it('pengguna sales tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/claims/1'])
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getClaim).not.toHaveBeenCalled()
  })
})
