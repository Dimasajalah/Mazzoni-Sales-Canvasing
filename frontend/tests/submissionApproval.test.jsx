import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getClaims: vi.fn(), getClaim: vi.fn(), calculateClaim: vi.fn(), submitClaim: vi.fn(), passClaim: vi.fn(), refuseClaim: vi.fn(),
  confirmClaimDifference: vi.fn(), approveClaimSubmission: vi.fn(), rejectClaimSubmission: vi.fn(), finalizeClaimAmount: vi.fn(),
  getPendingApprovals: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import ClaimDetail from '../src/pages/ClaimDetail.jsx'
import Claims from '../src/pages/Claims.jsx'
import MarketingApprovals from '../src/pages/MarketingApprovals.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/claims" element={<Claims />} />
            <Route path="/marketing/claims/:id" element={<ClaimDetail />} />
            <Route path="/marketing/approvals" element={<MarketingApprovals />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const LEVELS = [
  { stage: 1, label: 'Koordinator Marketing' }, { stage: 2, label: 'Manager Marketing' },
  { stage: 3, label: 'Manager Accounting' }, { stage: 4, label: 'Direktur Sales' },
]

const approvalInfo = (over = {}) => ({
  stage: 1, round: 1, levels: LEVELS, awaiting_label: 'Koordinator Marketing', can_confirm: false, can_act: false, can_adjust: false,
  can_finalize: false, expected_amount: 10000,
  reason_codes: {
    APPROVE: [{ value: 'SESUAI_ANGGARAN', label: 'Sesuai anggaran' }],
    REJECT: [{ value: 'DOKUMEN_KURANG', label: 'Dokumen pendukung kurang' }],
  },
  ...over,
})

const claim = (over = {}, approval = {}) => ({
  id: 1, claim_no: 'CLM-2026-00001', status: 'SUBMITTED', is_late: false, letter_received_date: '2026-12-10', claimed_amount: '12000.00',
  eligible_amount: '10000.00', difference_amount: '2000.00', payout_method: 'TRANSFER', payout_method_label: 'Transfer', submitted_at: '2026-12-11T03:00:00Z',
  customer: { id: 5, customer_code: 'D1', name: 'Distributor D1', city: 'Surabaya' },
  program: { id: 7, event_code: 'BDG-2026-001-K02', claim_type_label: 'Diskon Produk', claim_source_label: 'Sell Out', claim_basis_label: 'Nilai Penjualan', claim_threshold: null, claim_rate: '2.50', claim_rate_type: 'PERCENT', claim_deadline: '2026-12-15' },
  calc_detail: { source: 'SELL_OUT', rows: 1, basis_label: 'Nilai Penjualan', base_value: 400000, formula: '2,5% x Rp 400.000 = Rp 10.000' },
  approvals: [], attachments: [], diff_confirmed_at: null, diff_confirmer: null, diff_confirm_notes: null,
  adjusted_amount: null, adjust_reason: null, adjuster: null, approved_amount: null, finalizer: null, final_confirmed_at: null,
  flags: {
    can_pass: false, pass_label: 'Direktur Sales', can_calculate: false, calculate_blocker: 'Klaim sudah diajukan untuk approval.', can_submit: false,
    payout_methods: [], reason_codes: {}, approval: approvalInfo(approval),
  },
  ...over,
})

const inApproval = (approval = {}, over = {}) => claim({
  status: 'IN_APPROVAL', diff_confirmed_at: '2026-12-12T03:00:00Z', diff_confirmer: { name: 'Bu Koordinator' }, diff_confirm_notes: 'Distributor setuju via telepon', ...over,
}, approval)

const done = (stage, over = {}) => ({
  id: stage, stage, stage_label: LEVELS[stage - 1].label, action: 'APPROVED', reason_label: 'Sesuai anggaran', notes: null, adjusted_amount: null,
  adjust_reason: null, actor: { name: `Approver ${stage}` }, acted_at: '2026-12-13T03:00:00.000000Z', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Mgr', role: 'supervisor' }
})

describe('Konfirmasi selisih ke distributor (langkah 01)', () => {
  it('Koordinator Marketing mencatat persetujuan distributor, lalu approval tahap 1 dimulai', async () => {
    api.getClaim.mockResolvedValue(claim({}, { can_confirm: true }))
    api.confirmClaimDifference.mockResolvedValue(inApproval({ can_act: true }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    expect(await screen.findByText('Konfirmasi Selisih ke Distributor')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Catatan konfirmasi (opsional)'), 'Distributor setuju via telepon')
    await user.click(screen.getByRole('button', { name: 'Distributor Menyetujui Selisih' }))

    await waitFor(() => expect(api.confirmClaimDifference).toHaveBeenCalledWith(1, { notes: 'Distributor setuju via telepon' }))
    expect(await screen.findByText('Tahap 1 · Koordinator Marketing')).toBeInTheDocument()
    expect(screen.getByText(/Perlu keputusan Anda · Tahap 1/)).toBeInTheDocument()
    expect(screen.getByText('Dikonfirmasi oleh').closest('.mb-kv')).toHaveTextContent('Bu Koordinator')
    expect(screen.queryByText('Konfirmasi Selisih ke Distributor')).not.toBeInTheDocument()
  })

  it('pengguna lain hanya melihat keterangan menunggu konfirmasi', async () => {
    api.getClaim.mockResolvedValue(claim())
    shell(['/marketing/claims/1'])

    expect(await screen.findByText('Menunggu konfirmasi selisih ke distributor oleh Koordinator Marketing.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Distributor Menyetujui Selisih' })).not.toBeInTheDocument()
  })

  it('galat konfirmasi dari server ditampilkan apa adanya', async () => {
    api.getClaim.mockResolvedValue(claim({}, { can_confirm: true }))
    api.confirmClaimDifference.mockRejectedValue(new Error('Klaim ini tidak sedang menunggu konfirmasi selisih.'))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await user.click(await screen.findByRole('button', { name: 'Distributor Menyetujui Selisih' }))
    expect(await screen.findByText('Klaim ini tidak sedang menunggu konfirmasi selisih.')).toBeInTheDocument()
  })
})

describe('Approval pengajuan klaim (langkah 02-05)', () => {
  it('menampilkan empat tahap dan formulir bila giliran pengguna; menyetujui dengan kode alasan', async () => {
    api.getClaim.mockResolvedValue(inApproval({ can_act: true }))
    api.approveClaimSubmission.mockResolvedValue(inApproval({ stage: 2, awaiting_label: 'Manager Marketing' }, { approvals: [done(1)] }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    for (const label of ['Koordinator Marketing', 'Manager Marketing', 'Manager Accounting', 'Direktur Sales']) {
      expect(await screen.findByText(new RegExp(`· ${label}$`))).toBeInTheDocument()
    }
    expect(screen.queryByLabelText('Sesuaikan nilai klaim')).not.toBeInTheDocument() // bukan tahap Direktur Sales
    await user.selectOptions(screen.getByLabelText('Kode Alasan'), 'SESUAI_ANGGARAN')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.approveClaimSubmission).toHaveBeenCalledWith(1, { reason_code: 'SESUAI_ANGGARAN' }))
    expect(await screen.findByText(/Disetujui oleh Approver 1/)).toBeInTheDocument()
    expect(screen.getByText('Menunggu keputusan Manager Marketing.')).toBeInTheDocument()
  })

  it('Tolak memakai kode alasan tolak dan menghentikan klaim', async () => {
    api.getClaim.mockResolvedValue(inApproval({ can_act: true }))
    api.rejectClaimSubmission.mockResolvedValue(claim({ status: 'REJECTED', diff_confirmed_at: '2026-12-12T03:00:00Z', approvals: [done(1, { action: 'REJECTED', reason_label: 'Dokumen pendukung kurang' })] }, { can_act: false, awaiting_label: null }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await screen.findByLabelText('Kode Alasan')
    await user.click(screen.getByRole('button', { name: 'Tolak' }))
    expect(screen.queryByRole('option', { name: 'Sesuai anggaran' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Kode Alasan'), 'DOKUMEN_KURANG')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.rejectClaimSubmission).toHaveBeenCalledWith(1, { reason_code: 'DOKUMEN_KURANG' }))
    expect(api.approveClaimSubmission).not.toHaveBeenCalled()
    expect(await screen.findByText('Ditolak', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getAllByText('Tidak dilanjutkan')).toHaveLength(3)
  })

  it('kode alasan wajib dipilih', async () => {
    api.getClaim.mockResolvedValue(inApproval({ can_act: true }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await user.click(await screen.findByRole('button', { name: 'Kirim Keputusan' }))
    expect(await screen.findByText('Pilih kode alasan')).toBeInTheDocument()
    expect(api.approveClaimSubmission).not.toHaveBeenCalled()
  })

  it('pengguna yang bukan pemberi persetujuan tahap berjalan tidak melihat formulir', async () => {
    api.getClaim.mockResolvedValue(inApproval({ stage: 3, awaiting_label: 'Manager Accounting' }, { approvals: [done(1), done(2)] }))
    shell(['/marketing/claims/1'])

    expect(await screen.findByText('Menunggu keputusan Manager Accounting.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kirim Keputusan' })).not.toBeInTheDocument()
  })
})

describe('Penyesuaian nilai oleh Direktur Sales (langkah 06)', () => {
  const lastStage = (over = {}) => inApproval({ stage: 4, awaiting_label: 'Direktur Sales', can_act: true, can_adjust: true }, { approvals: [done(1), done(2), done(3)], ...over })

  it('menyesuaikan nilai wajib beralasan dan terkirim bersama persetujuan', async () => {
    api.getClaim.mockResolvedValue(lastStage())
    api.approveClaimSubmission.mockResolvedValue(claim({ status: 'AWAITING_AMOUNT', diff_confirmed_at: '2026-12-12T03:00:00Z', adjusted_amount: '8000.00', adjust_reason: 'Ada retur', adjuster: { name: 'Pak Direktur' } }, { stage: 4, can_finalize: true, expected_amount: 8000, awaiting_label: 'Marketing (input Nilai Klaim Disetujui)' }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await user.selectOptions(await screen.findByLabelText('Kode Alasan'), 'SESUAI_ANGGARAN')
    await user.click(screen.getByLabelText('Sesuaikan nilai klaim'))

    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))
    expect(await screen.findByText('Isi nilai penyesuaian lebih dari 0')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nilai Penyesuaian (Rp)'), '8000')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))
    expect(await screen.findByText('Isi alasan penyesuaian')).toBeInTheDocument()
    expect(api.approveClaimSubmission).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Alasan Penyesuaian'), 'Ada retur')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.approveClaimSubmission).toHaveBeenCalledWith(1, { reason_code: 'SESUAI_ANGGARAN', adjusted_amount: 8000, adjust_reason: 'Ada retur' }))
    expect(await screen.findByText(/Disesuaikan oleh Pak Direktur/)).toBeInTheDocument()
    expect(screen.getByText(/Alasan penyesuaian: Ada retur/)).toBeInTheDocument()
  })

  it('menolak tidak membawa penyesuaian: kolom penyesuaian hanya muncul saat menyetujui', async () => {
    api.getClaim.mockResolvedValue(lastStage())
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    expect(await screen.findByLabelText('Sesuaikan nilai klaim')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tolak' }))
    expect(screen.queryByLabelText('Sesuaikan nilai klaim')).not.toBeInTheDocument()
  })

  it('tanpa mencentang penyesuaian, persetujuan terkirim tanpa nilai penyesuaian', async () => {
    api.getClaim.mockResolvedValue(lastStage())
    api.approveClaimSubmission.mockResolvedValue(lastStage({ status: 'AWAITING_AMOUNT' }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    await user.selectOptions(await screen.findByLabelText('Kode Alasan'), 'SESUAI_ANGGARAN')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.approveClaimSubmission).toHaveBeenCalledWith(1, { reason_code: 'SESUAI_ANGGARAN' }))
  })

  it('riwayat tahap menampilkan penyesuaian nilai beserta alasannya', async () => {
    api.getClaim.mockResolvedValue(claim({
      status: 'AWAITING_AMOUNT', diff_confirmed_at: '2026-12-12T03:00:00Z',
      approvals: [done(1), done(2), done(3), done(4, { adjusted_amount: '8000.00', adjust_reason: 'Ada retur' })], adjusted_amount: '8000.00', adjust_reason: 'Ada retur',
    }, { stage: 4, expected_amount: 8000 }))
    shell(['/marketing/claims/1'])

    expect(await screen.findByText(/Penyesuaian nilai: Rp 8\.000 · Ada retur/)).toBeInTheDocument()
  })
})

describe('Nilai Klaim Disetujui (langkah 07)', () => {
  const awaiting = (approval = {}, over = {}) => claim({ status: 'AWAITING_AMOUNT', diff_confirmed_at: '2026-12-12T03:00:00Z', approvals: [done(1), done(2), done(3), done(4)], ...over }, { stage: 4, can_finalize: true, awaiting_label: 'Marketing (input Nilai Klaim Disetujui)', ...approval })

  it('terisi otomatis dengan nilai eligible; menyimpannya membuat klaim Disetujui dan diteruskan ke pencairan', async () => {
    api.getClaim.mockResolvedValue(awaiting())
    api.finalizeClaimAmount.mockResolvedValue(claim({ status: 'APPROVED', approved_amount: '10000.00', diff_confirmed_at: '2026-12-12T03:00:00Z', finalizer: { name: 'Mgr' }, final_confirmed_at: '2026-12-14T03:00:00Z', approvals: [done(1), done(2), done(3), done(4)] }, { stage: 4, can_finalize: false }))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    expect(await screen.findByLabelText('Nilai Klaim Disetujui (Rp)')).toHaveValue('10.000')
    await user.click(screen.getByRole('button', { name: 'Simpan Nilai Klaim Disetujui' }))

    await waitFor(() => expect(api.finalizeClaimAmount).toHaveBeenCalledWith(1, { amount: 10000 }))
    expect(await screen.findByText('Disetujui', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Nilai Klaim Disetujui', { selector: 'span' }).closest('.cl-res-row')).toHaveTextContent('Rp 10.000')
    expect(screen.getByText(/Diteruskan ke pencairan dengan metode Transfer/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Nilai Klaim Disetujui' })).not.toBeInTheDocument()
  })

  it('setelah penyesuaian Direktur Sales, isian terisi dengan nilai hasil penyesuaian', async () => {
    api.getClaim.mockResolvedValue(awaiting({ expected_amount: 8000 }, { adjusted_amount: '8000.00', adjust_reason: 'Ada retur', adjuster: { name: 'Pak Direktur' } }))
    shell(['/marketing/claims/1'])

    expect(await screen.findByLabelText('Nilai Klaim Disetujui (Rp)')).toHaveValue('8.000')
    expect(screen.getByText(/Disesuaikan oleh Pak Direktur/)).toBeInTheDocument()
  })

  it('galat dari server (nilai tidak sama dengan hasil approval) ditampilkan apa adanya', async () => {
    api.getClaim.mockResolvedValue(awaiting())
    api.finalizeClaimAmount.mockRejectedValue(new Error('Nilai Klaim Disetujui harus sama dengan nilai hasil approval (Rp 10.000).'))
    const user = userEvent.setup()
    shell(['/marketing/claims/1'])

    const field = await screen.findByLabelText('Nilai Klaim Disetujui (Rp)')
    await user.clear(field)
    await user.type(field, '12000')
    await user.click(screen.getByRole('button', { name: 'Simpan Nilai Klaim Disetujui' }))

    await waitFor(() => expect(api.finalizeClaimAmount).toHaveBeenCalledWith(1, { amount: 12000 }))
    expect(await screen.findByText(/harus sama dengan nilai hasil approval/)).toBeInTheDocument()
  })

  it('pengguna yang tidak boleh menetapkan nilai tidak melihat isiannya', async () => {
    api.getClaim.mockResolvedValue(awaiting({ can_finalize: false }))
    shell(['/marketing/claims/1'])

    await screen.findByText('Nilai Klaim Disetujui', { selector: '.mb-sec-t' })
    expect(screen.queryByLabelText('Nilai Klaim Disetujui (Rp)')).not.toBeInTheDocument()
  })
})

describe('Daftar dan dashboard', () => {
  it('daftar menandai klaim yang perlu tindakan saya dan menyebut siapa yang ditunggu', async () => {
    api.getClaims.mockResolvedValue([
      claim({ can_act: true, awaiting_label: 'Koordinator Marketing (konfirmasi selisih ke distributor)' }),
      claim({ id: 2, claim_no: 'CLM-2026-00002', status: 'IN_APPROVAL', can_act: false, awaiting_label: 'Manager Accounting', customer: { id: 6, customer_code: 'D2', name: 'Distributor D2' } }),
    ])
    const user = userEvent.setup()
    shell(['/marketing/claims'])

    expect(await screen.findByText('Distributor D1')).toBeInTheDocument()
    expect(screen.getByText('Perlu keputusan Anda')).toBeInTheDocument()
    expect(screen.getByText('Menunggu Manager Accounting')).toBeInTheDocument()
    expect(screen.getByText('Dalam Approval')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Perlu Keputusan Saya (1)' }))
    expect(screen.queryByText('Distributor D2')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approval' }))
    expect(screen.getByText('Distributor D2')).toBeInTheDocument()
    expect(screen.queryByText('Distributor D1')).not.toBeInTheDocument()
  })

  it('dashboard persetujuan menampilkan pengajuan klaim dan membuka detailnya', async () => {
    api.getPendingApprovals.mockResolvedValue([{
      id: 9, kind: 'PENGAJUAN', can_act: true, description: 'Pengajuan klaim Distributor D1', event_code: 'CLM-2026-00001', budget_amount: '12000.00',
      letter_received_date: '2026-12-10', awaiting_label: 'Koordinator Marketing (konfirmasi selisih ke distributor)', approval_round: 1,
    }])
    api.getClaim.mockResolvedValue(claim({ id: 9 }))
    const user = userEvent.setup()
    shell(['/marketing/approvals'])

    expect(await screen.findByText('Pengajuan klaim Distributor D1')).toBeInTheDocument()
    expect(screen.getByText('Surat diterima 10 Des 2026')).toBeInTheDocument()
    expect(screen.getByText('Menunggu Koordinator Marketing (konfirmasi selisih ke distributor)')).toBeInTheDocument()
    expect(screen.getByText('CLM-2026-00001 · Pengajuan')).toBeInTheDocument()

    await user.click(screen.getByText('Pengajuan klaim Distributor D1'))
    await waitFor(() => expect(api.getClaim).toHaveBeenCalledWith('9'))
    expect(await screen.findByText('Detail Pengajuan Klaim')).toBeInTheDocument()
  })
})
