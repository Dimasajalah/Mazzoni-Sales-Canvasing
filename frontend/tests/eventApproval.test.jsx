import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getMarketingBudgets: vi.fn(), getMarketingEvents: vi.fn(), getMarketingEvent: vi.fn(), getMarketingEventOptions: vi.fn(),
  createMarketingEvent: vi.fn(), reviseEvent: vi.fn(), approveEvent: vi.fn(), rejectEvent: vi.fn(), getPendingApprovals: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import MarketingApprovals from '../src/pages/MarketingApprovals.jsx'
import MarketingEventDetail from '../src/pages/MarketingEventDetail.jsx'
import MarketingEventForm from '../src/pages/MarketingEventForm.jsx'
import MarketingEvents from '../src/pages/MarketingEvents.jsx'

function Probe() {
  return <div data-testid="probe">{useLocation().pathname}</div>
}

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/events" element={<MarketingEvents />} />
            <Route path="/marketing/events/:id" element={<MarketingEventDetail />} />
            <Route path="/marketing/events/:id/revise" element={<MarketingEventForm />} />
            <Route path="/marketing/approvals" element={<MarketingApprovals />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const LEVELS = [
  { stage: 1, label: 'Koordinator Marketing' }, { stage: 2, label: 'SPV Per Region' }, { stage: 3, label: 'Manager Marketing' },
  { stage: 4, label: 'Manager Accounting' }, { stage: 5, label: 'Direktur Sales' },
]

const approvalInfo = (over = {}) => ({
  stage: 1, round: 1, levels: LEVELS, awaiting_label: 'Koordinator Marketing', can_act: true,
  reason_codes: {
    APPROVE: [{ value: 'SESUAI_ANGGARAN', label: 'Sesuai anggaran' }],
    REJECT: [{ value: 'DOKUMEN_KURANG', label: 'Dokumen pendukung kurang' }],
  },
  ...over,
})

const event = (over = {}) => ({
  id: 1, marketing_budget_id: 1, event_code: 'BDG-2026-001-E01', description: 'Bazaar Ramadan', activity_type: 'EVENT', activity_type_label: 'Event',
  status: 'PENDING_APPROVAL', budget_amount: '400000.00', start_date: '2026-11-01', end_date: '2026-11-30', target_type: 'NATIONAL',
  target_territories: null, reference_letter_no: 'SK/001/2026', participants_count: 2, budget: { id: 1, campaign_code: 'BDG-2026-001', name: 'Campaign Ramadan' },
  attachments: [], participants: [{ id: 1, customer_code: 'C1', name: 'Toko C1', city: 'Jakarta' }, { id: 2, customer_code: 'C2', name: 'Toko C2', city: null }],
  approvals: [], approval: approvalInfo(), ...over,
})

const rejection = (over = {}) => ({
  id: 1, stage: 1, round: 1, stage_label: 'Koordinator Marketing', action: 'REJECTED', reason_label: 'Dokumen pendukung kurang', notes: 'Lengkapi RAB',
  actor: { name: 'Bu Koordinator' }, acted_at: '2026-10-20T03:00:00.000000Z', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Mgr', role: 'supervisor' }
  api.getMarketingEvent.mockResolvedValue(event())
  api.getMarketingBudgets.mockResolvedValue([{ id: 1, campaign_code: 'BDG-2026-001', name: 'Campaign Ramadan', status: 'ACTIVE', remaining_budget: 1000000 }])
  api.getMarketingEventOptions.mockResolvedValue({
    activity_types: [{ value: 'EVENT', label: 'Event' }, { value: 'BRANDING', label: 'Branding' }],
    territories: ['Jakarta'], customers: [{ id: 7, customer_code: 'KRM-1', name: 'Toko Karma', city: 'Bandung' }],
  })
})

describe('Persetujuan event (detail)', () => {
  it('menampilkan lima tahap, tahap 1 berjalan, dan formulir keputusan bila boleh bertindak', async () => {
    shell(['/marketing/events/1'])

    expect(await screen.findByText('Tahap 1 · Koordinator Marketing')).toBeInTheDocument()
    for (const label of ['SPV Per Region', 'Manager Marketing', 'Manager Accounting', 'Direktur Sales']) {
      expect(screen.getByText(new RegExp(`· ${label}$`))).toBeInTheDocument()
    }
    expect(screen.queryByText(/Direktur Utama/)).not.toBeInTheDocument()
    expect(screen.getByText('Menunggu keputusan')).toBeInTheDocument()
    expect(screen.getAllByText('Belum giliran')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Kirim Keputusan' })).toBeInTheDocument()
  })

  it('RAB di atas 30 juta menampilkan tahap 6 Direktur Utama', async () => {
    api.getMarketingEvent.mockResolvedValue(event({ approval: approvalInfo({ levels: [...LEVELS, { stage: 6, label: 'Direktur Utama' }] }) }))
    shell(['/marketing/events/1'])

    expect(await screen.findByText('Tahap 6 · Direktur Utama')).toBeInTheDocument()
  })

  it('tanpa hak bertindak: tidak ada formulir, hanya keterangan menunggu siapa', async () => {
    api.getMarketingEvent.mockResolvedValue(event({ approval: approvalInfo({ can_act: false, stage: 4, awaiting_label: 'Manager Accounting' }) }))
    shell(['/marketing/events/1'])

    expect(await screen.findByText('Menunggu keputusan Manager Accounting.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kirim Keputusan' })).not.toBeInTheDocument()
  })

  it('menyetujui dengan kode alasan; hasil dari server menjadi Disetujui', async () => {
    api.approveEvent.mockResolvedValue(event({
      status: 'APPROVED', approval: approvalInfo({ stage: 5, can_act: false, awaiting_label: null }),
      approvals: [{ id: 5, stage: 5, round: 1, stage_label: 'Direktur Sales', action: 'APPROVED', reason_label: 'Sesuai anggaran', notes: null, actor: { name: 'Pak Direktur' }, acted_at: '2026-10-21T03:00:00.000000Z' }],
    }))
    const user = userEvent.setup()
    shell(['/marketing/events/1'])

    await user.selectOptions(await screen.findByLabelText('Kode Alasan'), 'SESUAI_ANGGARAN')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.approveEvent).toHaveBeenCalledWith(1, { reason_code: 'SESUAI_ANGGARAN' }))
    expect(await screen.findByText('Disetujui', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText(/siap dipakai sebagai dasar klaim/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kirim Keputusan' })).not.toBeInTheDocument()
  })

  it('menolak memakai daftar kode alasan Tolak', async () => {
    api.rejectEvent.mockResolvedValue(event({ status: 'REJECTED', approval: approvalInfo({ can_act: false, awaiting_label: null }), approvals: [rejection()] }))
    const user = userEvent.setup()
    shell(['/marketing/events/1'])

    await screen.findByLabelText('Kode Alasan')
    await user.click(screen.getByRole('button', { name: 'Tolak' }))
    expect(screen.queryByRole('option', { name: 'Sesuai anggaran' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Kode Alasan'), 'DOKUMEN_KURANG')
    await user.type(screen.getByLabelText('Catatan (opsional)'), 'Lengkapi RAB')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.rejectEvent).toHaveBeenCalledWith(1, { reason_code: 'DOKUMEN_KURANG', notes: 'Lengkapi RAB' }))
    expect(api.approveEvent).not.toHaveBeenCalled()
    expect(await screen.findByText('Ditolak', { selector: '.mb-badge' })).toBeInTheDocument()
  })

  it('kode alasan wajib dipilih', async () => {
    const user = userEvent.setup()
    shell(['/marketing/events/1'])

    await user.click(await screen.findByRole('button', { name: 'Kirim Keputusan' }))
    expect(await screen.findByText('Pilih kode alasan')).toBeInTheDocument()
    expect(api.approveEvent).not.toHaveBeenCalled()
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.approveEvent.mockRejectedValue(new Error('Anda bukan pemberi persetujuan Tahap 1 (Koordinator Marketing).'))
    const user = userEvent.setup()
    shell(['/marketing/events/1'])

    await user.selectOptions(await screen.findByLabelText('Kode Alasan'), 'SESUAI_ANGGARAN')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))
    expect(await screen.findByText(/bukan pemberi persetujuan/)).toBeInTheDocument()
  })
})

describe('Event ditolak: revisi dan ajukan ulang', () => {
  it('event yang ditolak menampilkan tombol revisi, tahap berikutnya "Tidak dilanjutkan", dan membuka form revisi', async () => {
    api.getMarketingEvent.mockResolvedValue(event({ status: 'REJECTED', approval: approvalInfo({ can_act: false, awaiting_label: null }), approvals: [rejection()] }))
    const user = userEvent.setup()
    shell(['/marketing/events/1'])

    expect(await screen.findByText(/Ditolak oleh Bu Koordinator/)).toBeInTheDocument()
    expect(screen.getAllByText('Tidak dilanjutkan')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Revisi & Ajukan Ulang' }))
    expect(await screen.findByText('Revisi Event')).toBeInTheDocument()
  })

  it('event yang masih menunggu tidak punya tombol revisi', async () => {
    shell(['/marketing/events/1'])
    await screen.findByText('Bazaar Ramadan')
    expect(screen.queryByRole('button', { name: 'Revisi & Ajukan Ulang' })).not.toBeInTheDocument()
  })

  it('setelah revisi: putaran 2 dimulai lagi dari tahap 1 dan putaran sebelumnya tetap terlihat', async () => {
    api.getMarketingEvent.mockResolvedValue(event({ approval: approvalInfo({ round: 2 }), approvals: [rejection()] }))
    shell(['/marketing/events/1'])

    expect(await screen.findByText('Persetujuan · Putaran 2')).toBeInTheDocument()
    expect(screen.getByText('Menunggu keputusan')).toBeInTheDocument() // tahap 1 putaran 2 berjalan lagi
    expect(screen.getByText('Riwayat putaran sebelumnya')).toBeInTheDocument()
    expect(screen.getByText(/Putaran 1 · Tahap 1 \(Koordinator Marketing\): ditolak oleh Bu Koordinator/)).toBeInTheDocument()
  })

  it('form revisi terisi dari event, Campaign terkunci, dan mengirim revisi lalu pindah ke detail', async () => {
    api.getMarketingEvent.mockResolvedValue(event({ status: 'REJECTED', approval: approvalInfo({ can_act: false }), approvals: [rejection()] }))
    api.reviseEvent.mockResolvedValue(event({ description: 'Bazaar revisi' }))
    const user = userEvent.setup()
    shell(['/marketing/events/1/revise'])

    const desc = await screen.findByDisplayValue('Bazaar Ramadan')
    expect(screen.getByLabelText('Nomor Surat Komunikasi')).toHaveValue('SK/001/2026')
    expect(screen.getByLabelText('Tanggal Mulai')).toHaveValue('2026-11-01')
    expect(screen.getByLabelText('Campaign')).toBeDisabled()
    await waitFor(() => expect(screen.getByLabelText('Campaign')).toHaveValue('1'))

    await user.clear(desc)
    await user.type(desc, 'Bazaar revisi')
    await user.click(screen.getByRole('button', { name: 'Simpan Revisi & Ajukan Ulang' }))

    await waitFor(() => expect(api.reviseEvent).toHaveBeenCalledTimes(1))
    const [calledId, fd] = api.reviseEvent.mock.calls[0]
    expect(calledId).toBe('1')
    expect(fd.get('description')).toBe('Bazaar revisi')
    expect(fd.get('reference_letter_no')).toBe('SK/001/2026')
    expect(fd.get('budget_amount')).toBe('400000')
    expect(fd.get('target_type')).toBe('NATIONAL')
    expect(api.createMarketingEvent).not.toHaveBeenCalled()
    expect(await screen.findByText('Daftar Peserta (2)')).toBeInTheDocument() // kembali ke detail
  })

  it('form revisi untuk target Customer mengisi ulang customer pilihan dan mengirimnya lagi', async () => {
    api.getMarketingEvent.mockResolvedValue(event({
      status: 'REJECTED', target_type: 'CUSTOMER', target_customers: [{ id: 7, customer_code: 'KRM-1', name: 'Toko Karma', city: 'Bandung' }],
    }))
    api.reviseEvent.mockResolvedValue(event())
    const user = userEvent.setup()
    shell(['/marketing/events/1/revise'])

    expect(await screen.findByText('1 customer dipilih')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simpan Revisi & Ajukan Ulang' }))

    await waitFor(() => expect(api.reviseEvent).toHaveBeenCalled())
    expect(api.reviseEvent.mock.calls[0][1].getAll('customer_ids[]')).toEqual(['7'])
  })

  it('validasi form tetap berlaku di mode revisi', async () => {
    const user = userEvent.setup()
    shell(['/marketing/events/1/revise'])

    const desc = await screen.findByDisplayValue('Bazaar Ramadan')
    await user.clear(desc)
    await user.click(screen.getByRole('button', { name: 'Simpan Revisi & Ajukan Ulang' }))
    expect(await screen.findByText('Isi deskripsi event')).toBeInTheDocument()
    expect(api.reviseEvent).not.toHaveBeenCalled()
  })

  it('galat revisi dari server ditampilkan apa adanya', async () => {
    api.reviseEvent.mockRejectedValue(new Error('Hanya event yang ditolak yang bisa direvisi.'))
    const user = userEvent.setup()
    shell(['/marketing/events/1/revise'])

    await screen.findByDisplayValue('Bazaar Ramadan')
    fireEvent.change(screen.getByLabelText('Tanggal Selesai'), { target: { value: '2026-12-05' } })
    await user.click(screen.getByRole('button', { name: 'Simpan Revisi & Ajukan Ulang' }))
    expect(await screen.findByText(/Hanya event yang ditolak/)).toBeInTheDocument()
  })
})

describe('Daftar event: perlu persetujuan saya', () => {
  it('chip menghitung dan hanya menampilkan event yang perlu keputusan saya', async () => {
    api.getMarketingEvents.mockResolvedValue([
      event({ can_act: true, awaiting_label: 'Koordinator Marketing' }),
      event({ id: 2, description: 'Branding Toko', can_act: false, awaiting_label: 'Manager Accounting' }),
    ])
    const user = userEvent.setup()
    shell(['/marketing/events'])

    expect(await screen.findByText('Bazaar Ramadan')).toBeInTheDocument()
    expect(screen.getByText('Perlu keputusan Anda')).toBeInTheDocument()
    expect(screen.getByText('Menunggu Manager Accounting')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Perlu Persetujuan Saya (1)' }))
    expect(screen.queryByText('Branding Toko')).not.toBeInTheDocument()
    expect(screen.getByText('Bazaar Ramadan')).toBeInTheDocument()
  })
})

describe('Program Approval Dashboard', () => {
  it('menampilkan event dan program klaim yang menunggu saya, lalu membuka detailnya', async () => {
    api.getPendingApprovals.mockResolvedValue([
      event({ kind: 'EVENT', awaiting_label: 'Manager Accounting', can_act: true }),
      event({ id: 8, kind: 'KLAIM', event_code: 'BDG-2026-001-K02', description: 'Diskon Saus Q4', awaiting_label: 'Manager Marketing', can_act: true }),
    ])
    const user = userEvent.setup()
    shell(['/marketing/approvals'])

    expect(await screen.findByText('Bazaar Ramadan')).toBeInTheDocument()
    expect(screen.getByTestId('pending-count')).toHaveTextContent('2')
    expect(screen.getByText('Menunggu Manager Accounting')).toBeInTheDocument()
    expect(screen.getByText('Menunggu Manager Marketing')).toBeInTheDocument()

    await user.click(screen.getByText('Diskon Saus Q4'))
    expect(await screen.findByTestId('probe')).toHaveTextContent('/marketing/claim-programs/8') // jalur program klaim
  })

  it('event diajukan ulang menampilkan putaran', async () => {
    api.getPendingApprovals.mockResolvedValue([event({ kind: 'EVENT', awaiting_label: 'Koordinator Marketing', approval_round: 2 })])
    shell(['/marketing/approvals'])
    expect(await screen.findByText(/diajukan ulang \(putaran 2\)/)).toBeInTheDocument()
  })

  it('tidak ada yang menunggu: tampilan kosong', async () => {
    api.getPendingApprovals.mockResolvedValue([])
    shell(['/marketing/approvals'])
    expect(await screen.findByText('Tidak ada program yang menunggu persetujuan Anda.')).toBeInTheDocument()
    expect(screen.getByTestId('pending-count')).toHaveTextContent('0')
  })

  it('pengguna sales tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/approvals'])
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getPendingApprovals).not.toHaveBeenCalled()
  })
})
