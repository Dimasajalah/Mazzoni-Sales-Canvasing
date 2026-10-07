//frontend/tests/leadTaskPanel.test.jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))

const ORDER_USER = { id: 1, name: 'Toni', role: 'sales', sales_type: 'ORDER', can_order: true, can_delegate: false }
const DEALMAKER = { id: 2, name: 'Rina', role: 'sales', sales_type: 'DEALMAKER', can_order: false, can_delegate: true }

vi.mock('../src/api/index.js', () => ({
  cancelDelegation: vi.fn(), delegateLead: vi.fn(), getDelegationTargets: vi.fn(), getLeadDelegation: vi.fn(),
  getQuotes: vi.fn(),
  concludeLeadTask: vi.fn(),
  createJourneyEntry: vi.fn(),
  getTaskTemplates: vi.fn(),
  updateLead: vi.fn(),
  updateLeadTask: vi.fn(),
  getSamples: vi.fn(),
  deliverSample: vi.fn(),
}))

import * as api from '../src/api/index.js'
import LeadTaskPanel from '../src/components/LeadTaskPanel.jsx'

function Loc() {
  const l = useLocation()
  return <div data-testid="loc">{l.pathname}|{JSON.stringify(l.state)}</div>
}

const lead = { id: 7, business_name: 'UD Uji', stage: 'OPPORTUNITY', win_loss: 'OPEN', task_set_id: 1 }
const task = (over = {}) => ({
  id: 99, seq: 30, name: 'Kunjungan perkenalan (canvassing)', task_type: 'Kunjungan',
  stage: 'OPPORTUNITY', is_closing: false, due_date: null, actions: ['brand'], ...over,
})
const templates = [
  { id: 1, seq: 10, name: 'Identifikasi', stage: 'LEAD' },
  { id: 3, seq: 30, name: 'Kunjungan perkenalan', stage: 'OPPORTUNITY' },
  { id: 4, seq: 40, name: 'Pengajuan Sample', stage: 'OPPORTUNITY' },
  { id: 6, seq: 60, name: 'Susun Quotation', stage: 'QUOTE' },
]

function setup(props = {}) {
  const showToast = vi.fn()
  const onChanged = vi.fn()
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <LeadTaskPanel lead={lead} task={task()} showToast={showToast} onChanged={onChanged} onClose={onClose} {...props} />
      <Loc />
    </MemoryRouter>,
  )
  return { showToast, onChanged, onClose, user: userEvent.setup() }
}

beforeEach(() => {
  api.getSamples.mockResolvedValue([])
  vi.clearAllMocks()
  auth.user = ORDER_USER
  api.getLeadDelegation.mockResolvedValue(null)
  api.getDelegationTargets.mockResolvedValue([{ id: 7, name: 'Sari', territory: 'Surabaya' }, { id: 8, name: 'Tono', territory: 'Malang' }])
  api.getTaskTemplates.mockResolvedValue(templates)
})

describe('LeadTaskPanel', () => {
  it('tombol "Check-in di lokasi ini" membawa leadId yang benar ke layar Checkin', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: /Check-in di lokasi ini/ }))

    expect(onClose).toHaveBeenCalled()
    const loc = screen.getByTestId('loc')
    expect(loc.textContent).toContain('/checkin')
    expect(loc.textContent).toContain('"leadId":7')
  })

  it('hideCheckin menyembunyikan tombol Check-in (dipakai saat panel ini sudah berada di dalam Visit Mode)', () => {
    setup({ hideCheckin: true })
    expect(screen.queryByRole('button', { name: /Check-in di lokasi ini/ })).not.toBeInTheDocument()
  })

  it('menampilkan tugas aktif, badge stage/status, dan tombol aksi sesuai tugas', () => {
    setup()
    expect(screen.getByText('Kunjungan perkenalan (canvassing)')).toBeInTheDocument()
    expect(screen.getByText('Opportunity')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Belum dijadwalkan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Form Brand/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Negosiasi/ })).not.toBeInTheDocument()
  })

  it('Form Brand: menyelesaikan tugas lewat Conclusion + Reason Code, tanpa Tertarik/Tidak tertarik/Alasan/Catatan', async () => {
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Pengajuan Sample' } })
    const { user, showToast, onChanged, onClose } = setup()
    await user.click(screen.getByRole('button', { name: /Form Brand/ }))

    expect(screen.queryByRole('button', { name: /Tertarik/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tidak tertarik/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Alasan/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Catatan/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Tugas berikutnya')).toHaveValue('4'))

    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(api.concludeLeadTask).toHaveBeenCalledWith(99, {
      conclusion: 'NEXT', reason_code: 'Tertarik', next_template_id: 4, due_date: null, remark: null,
    }))
    expect(api.createJourneyEntry).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('Brand Awareness selesai · berikutnya: Pengajuan Sample')
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it('konklusi Lanjut: memilih tugas berikutnya (default = seq setelahnya) dan mengirim next_template_id', async () => {
    api.concludeLeadTask.mockResolvedValue({ task: {}, next_task: { name: 'Pengajuan Sample' }, lead: {} })
    const { user, onChanged, onClose } = setup()
    await user.click(screen.getByRole('button', { name: /Selesaikan Tugas/ }))

    const select = await screen.findByLabelText('Tugas berikutnya')
    await waitFor(() => expect(select).toHaveValue('4')) // seq 40 = tugas setelah seq 30
    // tugas saat ini (seq 30) tidak boleh jadi pilihan
    expect(screen.queryByRole('option', { name: /30 · Kunjungan perkenalan/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Simpan Konklusi' }))
    await waitFor(() => expect(api.concludeLeadTask).toHaveBeenCalledWith(99, {
      conclusion: 'NEXT', reason_code: 'Tertarik', next_template_id: 4, due_date: null, remark: null,
    }))
    expect(onChanged).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(await screen.findByText('Pengajuan Sample')).toBeInTheDocument()
  })

  it('poin 8: daftar Reason Code berganti sesuai konklusi yang dipilih, dan terkirim ke server', async () => {
    api.concludeLeadTask.mockResolvedValue({ task: {}, next_task: null, lead: {} })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Selesaikan Tugas/ }))

    // default konklusi Lanjut -> opsi reason code untuk NEXT
    expect(screen.getByLabelText('Reason Code')).toHaveValue('Tertarik')
    expect(screen.getByRole('option', { name: 'Sample Cocok' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Harga Disepakati' })).not.toBeInTheDocument()

    // pindah ke Kalah -> daftar reason code ikut berganti ke daftar LOSE, dan nilainya ikut
    // di-reset ke default LOSE (bukan tetap nyangkut di nilai NEXT yang sudah tidak valid)
    await user.click(screen.getByRole('button', { name: /Kalah/ }))
    expect(screen.getByLabelText('Reason Code')).toHaveValue('Tidak Tertarik')
    expect(screen.getByRole('option', { name: 'Pilih Kompetitor' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Tertarik' })).not.toBeInTheDocument()

    // submit TANPA memilih ulang manual -> membuktikan nilai yang benar-benar terkirim
    // adalah hasil reset otomatis, bukan nilai lama yang kebetulan tampil di layar
    await user.click(screen.getByRole('button', { name: 'Simpan Konklusi' }))
    await waitFor(() => expect(api.concludeLeadTask).toHaveBeenCalledWith(99, expect.objectContaining({
      conclusion: 'LOSE', reason_code: 'Tidak Tertarik',
    })))
  })

  it('konklusi Menang menampilkan layar sukses dengan tombol Buat Order', async () => {
    api.concludeLeadTask.mockResolvedValue({ task: {}, next_task: null, lead: {} })
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: /Selesaikan Tugas/ }))
    await user.click(await screen.findByRole('button', { name: /Menang/ }))
    await user.type(screen.getByLabelText(/Catatan hasil/), 'Deal')
    await user.click(screen.getByRole('button', { name: 'Simpan Konklusi' }))

    await waitFor(() => expect(api.concludeLeadTask).toHaveBeenCalledWith(99, {
      conclusion: 'WIN', reason_code: 'Harga Disepakati', next_template_id: null, due_date: null, remark: 'Deal',
    }))
    expect(await screen.findByText('Prospek MENANG')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Buat Order/ })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('tugas penutup hanya menawarkan Menang / Kalah', async () => {
    const { user } = setup({ task: task({ seq: 70, is_closing: true, actions: ['order'] }) })
    await user.click(screen.getByRole('button', { name: /Selesaikan Tugas/ }))
    expect(await screen.findByText(/hanya bisa diselesaikan dengan Menang atau Kalah/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lanjut' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Menang/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kalah/ })).toBeInTheDocument()
  })

  it('menyimpan jadwal tugas lewat updateLeadTask', async () => {
    api.updateLeadTask.mockResolvedValue({ due_date: '2026-10-05' })
    const { user } = setup()
    const input = screen.getByLabelText(/Jadwal tugas/)
    await user.type(input, '2026-10-05')
    await user.click(screen.getAllByRole('button', { name: 'Simpan' })[0])
    await waitFor(() => expect(api.updateLeadTask).toHaveBeenCalledWith(99, { due_date: '2026-10-05' }))
  })

  it('prospek tanpa tugas: bisa ditandai Menang/Kalah manual', async () => {
    api.updateLead.mockResolvedValue({})
    const { user, onClose } = setup({ task: null })
    expect(screen.getByText(/Belum ada tugas aktif/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Tandai Menang/ }))
    await waitFor(() => expect(api.updateLead).toHaveBeenCalledWith(7, { win_loss: 'WIN', stage: 'QUOTE' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('prospek yang sudah ditutup tidak menawarkan konklusi', () => {
    setup({ lead: { ...lead, win_loss: 'LOSE' }, task: null })
    expect(screen.getByText(/sudah ditutup \(Lose\)/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Selesaikan Tugas/ })).not.toBeInTheDocument()
  })

  it('menampilkan pesan galat dari server saat konklusi gagal', async () => {
    api.concludeLeadTask.mockRejectedValue(new Error('Tugas ini sudah selesai.'))
    const { user, showToast } = setup()
    await user.click(screen.getByRole('button', { name: /Selesaikan Tugas/ }))
    await screen.findByLabelText('Tugas berikutnya')
    await user.click(screen.getByRole('button', { name: 'Simpan Konklusi' }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tugas ini sudah selesai.', { error: true }))
  })

  it('aksi Quotation membuka Quotation yang sudah ada milik prospek', async () => {
    api.getQuotes.mockResolvedValue({ data: [{ id: 7 }] })
    const { user, onClose } = setup({ task: task({ seq: 60, stage: 'QUOTE', actions: ['quote'] }) })
    await user.click(screen.getByRole('button', { name: /Quotation/ }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('/quotes/7'))
    expect(api.getQuotes).toHaveBeenCalledWith({ lead_id: 7 })
    expect(screen.getByTestId('loc').textContent).toContain('"leadId":7')
    expect(onClose).toHaveBeenCalled()
  })

  it('aksi Quotation membuat Quotation baru bila belum ada', async () => {
    api.getQuotes.mockResolvedValue({ data: [] })
    const { user } = setup({ task: task({ seq: 60, stage: 'QUOTE', actions: ['quote'] }) })
    await user.click(screen.getByRole('button', { name: /Quotation/ }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('/quotes/new'))
  })

  it('gagal memuat Quotation menampilkan pesan galat, bukan berpindah halaman', async () => {
    api.getQuotes.mockRejectedValue(new Error('Server error'))
    const { user, showToast } = setup({ task: task({ seq: 60, stage: 'QUOTE', actions: ['quote'] }) })
    await user.click(screen.getByRole('button', { name: /Quotation/ }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Server error', { error: true }))
    expect(screen.getByTestId('loc').textContent).toBe('/|null')
  })
})

describe('LeadTaskPanel: peran Sales Dealmaker', () => {
  const won = { ...lead, stage: 'QUOTE', win_loss: 'WIN' }

  it('Sales Order pada prospek Win: Buat Order tersedia dan tidak ada delegasi', async () => {
    setup({ lead: won, task: null })
    expect(screen.getByRole('button', { name: /Buat Order/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delegasikan ke Sales Order/ })).not.toBeInTheDocument()
    expect(api.getLeadDelegation).not.toHaveBeenCalled()
  })

  it('Dealmaker tidak melihat tombol order di tugas, tetapi mendapat penjelasan', () => {
    auth.user = DEALMAKER
    setup({ task: task({ seq: 70, is_closing: true, actions: ['order'] }) })
    expect(screen.queryByRole('button', { name: /Buat Order/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Sales Dealmaker tidak membuat order/)).toBeInTheDocument()
  })

  it('Dealmaker pada prospek Win: tanpa Buat Order, dengan tombol Delegasikan', async () => {
    auth.user = DEALMAKER
    setup({ lead: won, task: null })
    expect(screen.queryByRole('button', { name: /Buat Order/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Delegasikan ke Sales Order/ })).toBeInTheDocument()
    expect(api.getLeadDelegation).toHaveBeenCalledWith(7)
  })

  it('mendelegasikan: memilih Sales Order, mengirim catatan, lalu status menunggu tampil', async () => {
    auth.user = DEALMAKER
    api.delegateLead.mockResolvedValue({ id: 3 })
    const { user, showToast } = setup({ lead: won, task: null })

    await user.click(await screen.findByRole('button', { name: /Delegasikan ke Sales Order/ }))
    // belum memilih tujuan: ditolak di sisi tampilan
    await user.click(await screen.findByRole('button', { name: 'Delegasikan' }))
    expect(showToast).toHaveBeenCalledWith('Pilih Sales Order tujuan', { warn: true })
    expect(api.delegateLead).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByLabelText('Sales Order tujuan'), '7')
    await user.type(screen.getByLabelText(/Catatan untuk penerima/), 'Tolong diorder minggu ini')
    api.getLeadDelegation.mockResolvedValue({ id: 3, status: 'PENDING', note: 'Tolong diorder minggu ini', to: { name: 'Sari' } })
    await user.click(screen.getByRole('button', { name: 'Delegasikan' }))

    await waitFor(() => expect(api.delegateLead).toHaveBeenCalledWith(7, { to_user_id: 7, note: 'Tolong diorder minggu ini' }))
    expect(showToast).toHaveBeenCalledWith('Prospek didelegasikan ke Sari')
    expect(await screen.findByText(/menunggu order/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ganti sales' })).toBeInTheDocument()
  })

  it('membatalkan delegasi yang menunggu', async () => {
    auth.user = DEALMAKER
    api.getLeadDelegation.mockResolvedValue({ id: 3, status: 'PENDING', to: { name: 'Sari' } })
    api.cancelDelegation.mockResolvedValue({})
    const { user, showToast } = setup({ lead: won, task: null })

    await user.click(await screen.findByRole('button', { name: 'Batalkan delegasi' }))
    await waitFor(() => expect(api.cancelDelegation).toHaveBeenCalledWith(3))
    expect(showToast).toHaveBeenCalledWith('Delegasi dibatalkan')
  })

  it('setelah dijadikan order menampilkan nomor order dan tidak menawarkan delegasi ulang', async () => {
    auth.user = DEALMAKER
    api.getLeadDelegation.mockResolvedValue({ id: 3, status: 'ORDERED', to: { name: 'Sari' }, order: { order_number: 'SO-STG-2026-000042' } })
    setup({ lead: won, task: null })
    expect(await screen.findByText('SO-STG-2026-000042')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delegasikan ke Sales Order/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ganti sales' })).not.toBeInTheDocument()
  })

  it('menampilkan pesan bila belum ada Sales Order aktif, dan galat dari server', async () => {
    auth.user = DEALMAKER
    api.getDelegationTargets.mockResolvedValue([])
    const { user } = setup({ lead: won, task: null })
    await user.click(await screen.findByRole('button', { name: /Delegasikan ke Sales Order/ }))
    expect(await screen.findByText('Belum ada Sales Order aktif')).toBeInTheDocument()
  })

  it('galat dari server saat mendelegasikan ditampilkan', async () => {
    auth.user = DEALMAKER
    api.delegateLead.mockRejectedValue(new Error('Hanya prospek yang sudah Win yang dapat didelegasikan.'))
    const { user, showToast } = setup({ lead: won, task: null })
    await user.click(await screen.findByRole('button', { name: /Delegasikan ke Sales Order/ }))
    await user.selectOptions(await screen.findByLabelText('Sales Order tujuan'), '8')
    await user.click(screen.getByRole('button', { name: 'Delegasikan' }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Hanya prospek yang sudah Win yang dapat didelegasikan.', { error: true }))
  })

  it('layar sukses Win untuk Dealmaker menawarkan delegasi, bukan order', async () => {
    auth.user = DEALMAKER
    api.concludeLeadTask.mockResolvedValue({ task: {}, next_task: null, lead: {} })
    const { user } = setup({ task: task({ seq: 70, is_closing: true, actions: [] }) })
    await user.click(screen.getByRole('button', { name: /Selesaikan Tugas/ }))
    await user.click(await screen.findByRole('button', { name: /Menang/ }))
    await user.click(screen.getByRole('button', { name: 'Simpan Konklusi' }))

    expect(await screen.findByText('Prospek MENANG')).toBeInTheDocument()
    expect(screen.getByText(/Sales Dealmaker tidak membuat order/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Buat Order/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Delegasikan ke Sales Order/ })).toBeInTheDocument()
  })
})

describe('LeadTaskPanel: status pemberian sample (poin 9)', () => {
  const sampleTask = () => task({ seq: 40, name: 'Pengajuan Sample', actions: ['sample', 'feedback'] })

  it('tidak menampilkan kotak status kalau belum ada sample yang diajukan untuk tugas ini', async () => {
    api.getSamples.mockResolvedValue([])
    setup({ task: sampleTask() })
    await waitFor(() => expect(api.getSamples).toHaveBeenCalledWith({ lead_task_id: 99 }))
    expect(screen.queryByText('Menunggu pemberian sample')).not.toBeInTheDocument()
    expect(screen.queryByText(/Sample sudah diberikan/)).not.toBeInTheDocument()
  })

  it('menampilkan "Menunggu pemberian sample" dan tombol tandai, lalu pindah ke status terkirim', async () => {
    api.getSamples.mockResolvedValue([{ id: 5, status: 'PENDING' }])
    api.deliverSample.mockResolvedValue({ id: 5, status: 'DELIVERED' })
    const { user } = setup({ task: sampleTask() })

    expect(await screen.findByText('⏳ Menunggu pemberian sample')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tandai sudah diberikan' }))

    await waitFor(() => expect(api.deliverSample).toHaveBeenCalledWith(5))
    expect(await screen.findByText(/Sample sudah diberikan/)).toBeInTheDocument()
    expect(screen.queryByText('⏳ Menunggu pemberian sample')).not.toBeInTheDocument()
  })

  it('menampilkan "Sample sudah diberikan" langsung kalau statusnya sudah DELIVERED', async () => {
    api.getSamples.mockResolvedValue([{ id: 6, status: 'DELIVERED' }])
    setup({ task: sampleTask() })
    expect(await screen.findByText(/Sample sudah diberikan/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tandai sudah diberikan' })).not.toBeInTheDocument()
  })

  it('galat saat menandai sample ditampilkan lewat toast', async () => {
    api.getSamples.mockResolvedValue([{ id: 7, status: 'PENDING' }])
    api.deliverSample.mockRejectedValue(new Error('Gagal jaringan'))
    const { user, showToast } = setup({ task: sampleTask() })

    await user.click(await screen.findByRole('button', { name: 'Tandai sudah diberikan' }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Gagal jaringan', { error: true }))
    expect(await screen.findByText('⏳ Menunggu pemberian sample')).toBeInTheDocument()
  })

  it('tidak memanggil getSamples untuk tugas yang tidak punya aksi sample/feedback', () => {
    setup({ task: task({ seq: 30, actions: ['brand'] }) })
    expect(api.getSamples).not.toHaveBeenCalled()
  })

  it('bug ditemukan lewat tes manual: tetap menampilkan Menunggu kalau sample PENDING bukan yang pertama di daftar', async () => {
    // Sample lama (sudah DELIVERED, mis. dari backfill migration) muncul lebih dulu; sample baru
    // (PENDING) ada di belakangnya — sebelum perbaikan ini, kotak status salah menampilkan
    // "sudah diberikan" karena cuma mengambil sample pertama dari daftar.
    api.getSamples.mockResolvedValue([
      { id: 7, status: 'DELIVERED' },
      { id: 8, status: 'PENDING' },
    ])
    setup({ task: sampleTask() })
    expect(await screen.findByText('⏳ Menunggu pemberian sample')).toBeInTheDocument()
    expect(screen.queryByText(/Sample sudah diberikan/)).not.toBeInTheDocument()
  })
})

describe('LeadTaskPanel: field tugas poin 9 (Stage/Status/Assigned to/Comment)', () => {
  it('kartu tugas utama menampilkan Stage, Status, dan Assigned to', () => {
    setup({ task: task({ stage: 'QUOTE', status: 'OPEN', assignee: { id: 2, name: 'Budi Santoso' } }) })
    expect(screen.getByText('Stage: Quote')).toBeInTheDocument()
    expect(screen.getByText('Status: Berjalan')).toBeInTheDocument()
    expect(screen.getByText('Assigned to: Budi Santoso')).toBeInTheDocument()
  })

  it('Assigned to tampil tanda strip kalau assignee belum ada (bukan undefined/kosong)', () => {
    setup({ task: task({ assignee: null }) })
    expect(screen.getByText('Assigned to: —')).toBeInTheDocument()
  })

  it('Comment (remark) tersembunyi kalau belum ada isinya', () => {
    setup({ task: task({ remark: null }) })
    expect(screen.queryByText(/Comment:/)).not.toBeInTheDocument()
  })

  it('Comment (remark) tampil kalau sudah ada isinya', () => {
    setup({ task: task({ remark: 'Sudah dikonfirmasi lewat telepon' }) })
    expect(screen.getByText('Comment: “Sudah dikonfirmasi lewat telepon”')).toBeInTheDocument()
  })

  it('layar Selesaikan Tugas menampilkan grid field tugas', async () => {
    const { user } = setup({ task: task({ task_type: 'Kunjungan', stage: 'OPPORTUNITY', status: 'OPEN', assignee: { id: 2, name: 'Budi Santoso' } }) })
    await user.click(screen.getByRole('button', { name: /Selesaikan Tugas/ }))
    expect(screen.getByLabelText('Task Type')).toHaveValue('Kunjungan')
    expect(screen.getByLabelText('Stage')).toHaveValue('Opportunity')
    expect(screen.getByLabelText('Task Status')).toHaveValue('Berjalan')
    expect(screen.getByLabelText('Assigned to')).toHaveValue('Budi Santoso')
  })
})