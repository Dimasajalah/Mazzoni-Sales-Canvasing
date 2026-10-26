import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getClaimPrograms: vi.fn(), getClaimProgram: vi.fn(), approveClaimProgram: vi.fn(), rejectClaimProgram: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import ClaimProgramDetail from '../src/pages/ClaimProgramDetail.jsx'
import ClaimPrograms from '../src/pages/ClaimPrograms.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/claim-programs" element={<ClaimPrograms />} />
            <Route path="/marketing/claim-programs/:id" element={<ClaimProgramDetail />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const approvalInfo = (over = {}) => ({
  stage: 1,
  levels: [{ stage: 1, label: 'Manager Marketing' }, { stage: 2, label: 'Direktur Sales' }],
  awaiting_label: 'Manager Marketing',
  can_act: true,
  reason_codes: {
    APPROVE: [{ value: 'SESUAI_ANGGARAN', label: 'Sesuai anggaran' }],
    REJECT: [{ value: 'DOKUMEN_KURANG', label: 'Dokumen pendukung kurang' }],
  },
  ...over,
})

const program = (over = {}) => ({
  id: 1, event_code: 'BDG-2026-001-K01', description: 'Diskon Saus Q4', activity_type: 'KLAIM', status: 'PENDING_APPROVAL',
  claim_type_label: 'Diskon Produk', claim_source: 'SELL_IN', claim_source_label: 'Sell In', claim_basis_label: 'Nilai Penjualan',
  claim_threshold: null, claim_rate: '2.50', claim_rate_type: 'PERCENT', claim_deadline: '2026-12-15', budget_amount: '400000.00',
  start_date: '2026-11-01', end_date: '2026-11-30', target_type: 'NATIONAL', target_territories: null,
  reference_letter_no: 'SKP/001/2026', participants_count: 1, budget: { id: 1, name: 'Campaign Ramadan' }, attachments: [],
  participants: [{ id: 1, customer_code: 'C1', name: 'Toko C1', city: null }], approvals: [], approval: approvalInfo(), ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Mgr', role: 'supervisor' }
})

describe('Persetujuan program klaim (detail)', () => {
  it('menampilkan dua tahap, tahap 1 berjalan, dan formulir keputusan bila boleh bertindak', async () => {
    api.getClaimProgram.mockResolvedValue(program())
    shell(['/marketing/claim-programs/1'])

    expect(await screen.findByText('Tahap 1 · Manager Marketing')).toBeInTheDocument()
    expect(screen.getByText('Tahap 2 · Direktur Sales')).toBeInTheDocument()
    expect(screen.getByText('Menunggu keputusan')).toBeInTheDocument()
    expect(screen.getByText('Belum giliran')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kirim Keputusan' })).toBeInTheDocument()
  })

  it('tanpa hak bertindak: tidak ada formulir, hanya keterangan menunggu siapa', async () => {
    api.getClaimProgram.mockResolvedValue(program({ approval: approvalInfo({ can_act: false }) }))
    shell(['/marketing/claim-programs/1'])

    expect(await screen.findByText('Menunggu keputusan Manager Marketing.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kirim Keputusan' })).not.toBeInTheDocument()
  })

  it('kode alasan wajib dipilih', async () => {
    api.getClaimProgram.mockResolvedValue(program())
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/1'])

    await user.click(await screen.findByRole('button', { name: 'Kirim Keputusan' }))
    expect(await screen.findByText('Pilih kode alasan')).toBeInTheDocument()
    expect(api.approveClaimProgram).not.toHaveBeenCalled()
  })

  it('menyetujui dengan kode alasan dan catatan, lalu tampilan mengikuti hasil dari server', async () => {
    api.getClaimProgram.mockResolvedValue(program())
    api.approveClaimProgram.mockResolvedValue(program({
      status: 'APPROVED',
      approval: approvalInfo({ stage: 2, can_act: false, awaiting_label: null }),
      approvals: [
        { id: 1, stage: 1, action: 'APPROVED', reason_label: 'Sesuai anggaran', notes: 'Aman', actor: { name: 'Bu Manager' }, acted_at: '2026-10-20T03:00:00.000000Z' },
        { id: 2, stage: 2, action: 'APPROVED', reason_label: 'Sesuai anggaran', notes: null, actor: { name: 'Pak Direktur' }, acted_at: '2026-10-21T03:00:00.000000Z' },
      ],
    }))
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/1'])

    await user.selectOptions(await screen.findByLabelText('Kode Alasan'), 'SESUAI_ANGGARAN')
    await user.type(screen.getByLabelText('Catatan (opsional)'), 'Aman')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.approveClaimProgram).toHaveBeenCalledWith(1, { reason_code: 'SESUAI_ANGGARAN', notes: 'Aman' }))
    expect(await screen.findByText('Disetujui', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText(/Disetujui oleh Bu Manager/)).toBeInTheDocument()
    expect(screen.getByText(/Disetujui oleh Pak Direktur/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kirim Keputusan' })).not.toBeInTheDocument()
  })

  it('menolak memakai daftar kode alasan Tolak', async () => {
    api.getClaimProgram.mockResolvedValue(program())
    api.rejectClaimProgram.mockResolvedValue(program({ status: 'REJECTED', approval: approvalInfo({ can_act: false, awaiting_label: null }) }))
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/1'])

    await screen.findByLabelText('Kode Alasan')
    expect(screen.getByRole('option', { name: 'Sesuai anggaran' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tolak' }))
    expect(screen.queryByRole('option', { name: 'Sesuai anggaran' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Kode Alasan'), 'DOKUMEN_KURANG')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.rejectClaimProgram).toHaveBeenCalledWith(1, { reason_code: 'DOKUMEN_KURANG' }))
    expect(api.approveClaimProgram).not.toHaveBeenCalled()
    expect(await screen.findByText('Ditolak', { selector: '.mb-badge' })).toBeInTheDocument()
  })

  it('riwayat keputusan tahap 1 tampil dan tahap 2 menjadi tahap berjalan', async () => {
    api.getClaimProgram.mockResolvedValue(program({
      approval: approvalInfo({ stage: 2, can_act: false, awaiting_label: 'Direktur Sales' }),
      approvals: [{ id: 1, stage: 1, action: 'APPROVED', reason_label: 'Sesuai anggaran', notes: 'Aman', actor: { name: 'Bu Manager' }, acted_at: '2026-10-20T03:00:00.000000Z' }],
    }))
    shell(['/marketing/claim-programs/1'])

    expect(await screen.findByText(/Disetujui oleh Bu Manager/)).toBeInTheDocument()
    expect(screen.getByText(/Alasan: Sesuai anggaran/)).toBeInTheDocument()
    expect(screen.getByText(/Catatan: Aman/)).toBeInTheDocument()
    expect(screen.getByText('Menunggu keputusan')).toBeInTheDocument()
    expect(screen.getByText('Menunggu keputusan Direktur Sales.')).toBeInTheDocument()
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.getClaimProgram.mockResolvedValue(program())
    api.approveClaimProgram.mockRejectedValue(new Error('Anda bukan pemberi persetujuan Tahap 1 (Manager Marketing).'))
    const user = userEvent.setup()
    shell(['/marketing/claim-programs/1'])

    await user.selectOptions(await screen.findByLabelText('Kode Alasan'), 'SESUAI_ANGGARAN')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))
    expect(await screen.findByText(/bukan pemberi persetujuan/)).toBeInTheDocument()
  })
})

describe('Daftar program klaim: perlu persetujuan saya', () => {
  it('chip menghitung dan hanya menampilkan program yang perlu keputusan saya', async () => {
    api.getClaimPrograms.mockResolvedValue([
      program({ can_act: true, awaiting_label: 'Manager Marketing' }),
      program({ id: 2, description: 'Reward Toko', can_act: false, awaiting_label: 'Direktur Sales' }),
    ])
    const user = userEvent.setup()
    shell(['/marketing/claim-programs'])

    expect(await screen.findByText('Diskon Saus Q4')).toBeInTheDocument()
    expect(screen.getByText('Perlu keputusan Anda')).toBeInTheDocument()
    expect(screen.getByText('Menunggu Direktur Sales')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Perlu Persetujuan Saya (1)' }))
    expect(screen.getByText('Diskon Saus Q4')).toBeInTheDocument()
    expect(screen.queryByText('Reward Toko')).not.toBeInTheDocument()
  })
})
