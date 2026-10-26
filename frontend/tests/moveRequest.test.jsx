import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getMoveRequests: vi.fn(), getMoveRequestEvents: vi.fn(), getMoveRequest: vi.fn(), createMoveRequest: vi.fn(), updateMoveRequest: vi.fn(),
  checkMoveRequestOnHand: vi.fn(), saveMoveRequestMove: vi.fn(), saveMoveRequestTransfer: vi.fn(), saveMoveRequestIssue: vi.fn(), completeMoveRequest: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import MoveRequestDetail from '../src/pages/MoveRequestDetail.jsx'
import MoveRequestForm from '../src/pages/MoveRequestForm.jsx'
import MoveRequests from '../src/pages/MoveRequests.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/move-requests" element={<MoveRequests />} />
            <Route path="/marketing/move-requests/new" element={<MoveRequestForm />} />
            <Route path="/marketing/move-requests/:id" element={<MoveRequestDetail />} />
            <Route path="/marketing/move-requests/:id/edit" element={<MoveRequestForm />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const flags = (over = {}) => ({ can_edit: false, can_check: false, can_request: false, can_transfer: false, can_issue: false, can_complete: false, ...over })
const item = (over = {}) => ({ id: 1, part_num: 'P-001', description: 'Standing banner', qty: '10.00', onhand_qty: null, ...over })

const req = (over = {}) => ({
  id: 1, req_no: 'MV-2026-00001', marketing_event_id: 3, event: { id: 3, event_code: 'BDG-2026-001-E01', description: 'Bazaar Ramadan' }, creator: { name: 'Bu Marketing' },
  notes: 'Display booth utama', status: 'NEW', items: [item(), item({ id: 2, part_num: 'P-002', description: null, qty: '2.50' })],
  onhand_notes: null, onhand_checked_at: null, epicor_request_no: null, pra_sj_number: null, transferred_at: null, issue_reference: null, issued_at: null,
  recipient_name: null, remarks: null, completed_at: null, awaiting_label: 'Marketing (cek On-Hand di Inventory Marketing)', flags: flags({ can_edit: true, can_check: true }), ...over,
})

const atChecked = (over = {}) => req({
  status: 'CHECKED', onhand_notes: 'Banner tinggal 3', onhand_checked_at: '2026-12-20T03:00:00Z', items: [item({ onhand_qty: '3.00' }), item({ id: 2, part_num: 'P-002', qty: '2.50', onhand_qty: '0.00' })],
  awaiting_label: 'Marketing (buat Move Inventory Request)', flags: flags({ can_request: true }), ...over,
})
const atRequested = (f = {}) => atChecked({ status: 'REQUESTED', epicor_request_no: 'MIR-0001', awaiting_label: 'Warehouse (Inventory Transfer)', flags: flags(f) })
const atTransferred = (f = {}) => atChecked({ status: 'TRANSFERRED', epicor_request_no: 'MIR-0001', pra_sj_number: 'PSJ-0001', transferred_at: '2026-12-21T03:00:00Z', awaiting_label: 'Marketing (Issue Misc. Material)', flags: flags(f) })
const atIssued = (f = {}) => atChecked({
  status: 'ISSUED', epicor_request_no: 'MIR-0001', pra_sj_number: 'PSJ-0001', transferred_at: '2026-12-21T03:00:00Z', issue_reference: 'ISS-0001', issued_at: '2026-12-22T03:00:00Z',
  awaiting_label: 'Marketing (input penerima dan nama event)', flags: flags(f),
})
const done = () => atChecked({
  status: 'DONE', epicor_request_no: 'MIR-0001', pra_sj_number: 'PSJ-0001', transferred_at: '2026-12-21T03:00:00Z', issue_reference: 'ISS-0001', issued_at: '2026-12-22T03:00:00Z',
  recipient_name: 'Pak Budi', remarks: 'Pak Budi / Bazaar Ramadan', completed_at: '2026-12-23T03:00:00Z', awaiting_label: null, flags: flags(),
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Sup', role: 'supervisor' }
  api.getMoveRequest.mockResolvedValue(req())
  api.getMoveRequestEvents.mockResolvedValue([
    { id: 3, event_code: 'BDG-2026-001-E01', description: 'Bazaar Ramadan', start_date: '2026-11-01', end_date: '2026-11-30' },
    { id: 4, event_code: 'BDG-2026-001-E02', description: 'Pameran Produk', start_date: '2026-12-01', end_date: '2026-12-05' },
  ])
})

describe('Daftar permintaan', () => {
  const rows = () => [
    { id: 1, req_no: 'MV-2026-00001', event: { event_code: 'BDG-2026-001-E01', description: 'Bazaar Ramadan' }, status: 'NEW', items_count: 2, awaiting_label: 'Marketing (cek On-Hand di Inventory Marketing)', can_act: true },
    { id: 2, req_no: 'MV-2026-00002', event: { event_code: 'BDG-2026-001-E02', description: 'Pameran Produk' }, status: 'REQUESTED', items_count: 1, awaiting_label: 'Warehouse (Inventory Transfer)', can_act: false },
  ]

  it('menampilkan jumlah tindakan dan tiap permintaan dengan status serta siapa yang ditunggu', async () => {
    api.getMoveRequests.mockResolvedValue(rows())
    shell(['/marketing/move-requests'])

    expect(await screen.findByText('MV-2026-00001')).toBeInTheDocument()
    expect(screen.getByTestId('todo-count')).toHaveTextContent('1')
    expect(screen.getByText('BDG-2026-001-E01 · Bazaar Ramadan')).toBeInTheDocument()
    expect(screen.getByText('Menunggu On-Hand', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Menunggu Warehouse', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Menunggu Warehouse (Inventory Transfer)')).toBeInTheDocument()
    expect(screen.getAllByText('Perlu tindakan Anda')).toHaveLength(1)
  })

  it('filter Perlu Tindakan Saya hanya menampilkan yang menunggu pengguna', async () => {
    api.getMoveRequests.mockResolvedValue(rows())
    const user = userEvent.setup()
    shell(['/marketing/move-requests'])
    await screen.findByText('MV-2026-00001')

    await user.click(screen.getByRole('button', { name: 'Perlu Tindakan Saya (1)' }))
    expect(screen.getByText('MV-2026-00001')).toBeInTheDocument()
    expect(screen.queryByText('MV-2026-00002')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Semua' }))
    expect(screen.getByText('MV-2026-00002')).toBeInTheDocument()
  })

  it('pencarian memanggil server dengan kata kunci', async () => {
    api.getMoveRequests.mockResolvedValue(rows())
    const user = userEvent.setup()
    shell(['/marketing/move-requests'])

    await screen.findByText('MV-2026-00001')
    await user.type(screen.getByLabelText('Cari permintaan'), 'Bazaar')
    await waitFor(() => expect(api.getMoveRequests).toHaveBeenCalledWith({ q: 'Bazaar' }))
  })

  it('tidak ada permintaan: tampilan kosong', async () => {
    api.getMoveRequests.mockResolvedValue([])
    shell(['/marketing/move-requests'])
    expect(await screen.findByText('Tidak ada permintaan.')).toBeInTheDocument()
  })

  it('Marketing melihat tombol Buat Permintaan dan mengetuk kartu membuka detailnya', async () => {
    api.getMoveRequests.mockResolvedValue(rows())
    const user = userEvent.setup()
    const view = shell(['/marketing/move-requests'])

    await user.click(await screen.findByRole('button', { name: 'Buat Permintaan' }))
    expect(await screen.findByText('Permintaan Baru')).toBeInTheDocument()
    view.unmount()

    shell(['/marketing/move-requests'])
    await user.click(await screen.findByText('MV-2026-00002'))
    await waitFor(() => expect(api.getMoveRequest).toHaveBeenCalledWith('2'))
  })

  it('Warehouse bisa melihat daftar tetapi tidak melihat tombol Buat Permintaan', async () => {
    auth.user = { id: 7, name: 'Gudang', role: 'warehouse' }
    api.getMoveRequests.mockResolvedValue(rows())
    shell(['/marketing/move-requests'])

    expect(await screen.findByText('MV-2026-00001')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buat Permintaan' })).not.toBeInTheDocument()
  })

  it('hanya admin, supervisor, dan warehouse; sales dan finance tidak memuat data', async () => {
    for (const role of ['sales', 'finance']) {
      auth.user = { id: 2, name: role, role }
      const view = shell(['/marketing/move-requests'])
      expect(await screen.findByText(/hanya untuk admin, supervisor, dan warehouse/)).toBeInTheDocument()
      view.unmount()
    }
    expect(api.getMoveRequests).not.toHaveBeenCalled()
  })
})

describe('Form permintaan', () => {
  it('validasi berurutan: event, kode part, jumlah, dan kode ganda', async () => {
    const user = userEvent.setup()
    shell(['/marketing/move-requests/new'])
    const save = () => user.click(screen.getByRole('button', { name: 'Simpan Permintaan' }))

    await screen.findByLabelText('Event')
    await save()
    expect(await screen.findByText('Pilih event')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Event'), '3')
    await save()
    expect(await screen.findByText('Isi kode part barang 1')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Kode part 1'), 'P-001')
    await save()
    expect(await screen.findByText('Isi jumlah barang 1 lebih dari 0')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Jumlah 1'), '5')
    await user.click(screen.getByRole('button', { name: '+ Tambah Barang' }))
    await user.type(screen.getByLabelText('Kode part 2'), 'p-001')
    await user.type(screen.getByLabelText('Jumlah 2'), '1')
    await save()
    expect(await screen.findByText('Kode part p-001 diisi lebih dari sekali')).toBeInTheDocument()
    expect(api.createMoveRequest).not.toHaveBeenCalled()
  })

  it('daftar event hanya berisi event yang disetujui dari server', async () => {
    shell(['/marketing/move-requests/new'])

    expect(await screen.findByRole('option', { name: 'BDG-2026-001-E01 · Bazaar Ramadan' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'BDG-2026-001-E02 · Pameran Produk' })).toBeInTheDocument()
  })

  it('menyimpan permintaan mengirim payload yang benar lalu membuka detail', async () => {
    api.createMoveRequest.mockResolvedValue(req({ id: 9 }))
    api.getMoveRequest.mockResolvedValue(req({ id: 9, req_no: 'MV-2026-00009' }))
    const user = userEvent.setup()
    shell(['/marketing/move-requests/new'])

    await user.selectOptions(await screen.findByLabelText('Event'), '4')
    await user.type(screen.getByLabelText('Catatan (opsional)'), 'Display booth utama')
    await user.type(screen.getByLabelText('Kode part 1'), 'P-001')
    await user.type(screen.getByLabelText('Jumlah 1'), '10')
    await user.type(screen.getByLabelText('Keterangan 1'), 'Standing banner')
    await user.click(screen.getByRole('button', { name: '+ Tambah Barang' }))
    await user.type(screen.getByLabelText('Kode part 2'), 'P-002')
    await user.type(screen.getByLabelText('Jumlah 2'), '2,5')
    await user.click(screen.getByRole('button', { name: 'Simpan Permintaan' }))

    await waitFor(() => expect(api.createMoveRequest).toHaveBeenCalledWith({
      event_id: 4, notes: 'Display booth utama',
      items: [{ part_num: 'P-001', qty: 10, description: 'Standing banner' }, { part_num: 'P-002', qty: 2.5 }],
    }))
    expect(await screen.findByText('MV-2026-00009')).toBeInTheDocument()
  })

  it('galat dari server ditampilkan apa adanya dan pengguna tetap di form', async () => {
    api.createMoveRequest.mockRejectedValue(new Error('Kode part XYZ tidak ada di Part Master.'))
    const user = userEvent.setup()
    shell(['/marketing/move-requests/new'])

    await user.selectOptions(await screen.findByLabelText('Event'), '3')
    await user.type(screen.getByLabelText('Kode part 1'), 'XYZ')
    await user.type(screen.getByLabelText('Jumlah 1'), '1')
    await user.click(screen.getByRole('button', { name: 'Simpan Permintaan' }))

    expect(await screen.findByText('Kode part XYZ tidak ada di Part Master.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simpan Permintaan' })).toBeInTheDocument()
  })

  it('baris barang bisa ditambah dan dihapus', async () => {
    const user = userEvent.setup()
    shell(['/marketing/move-requests/new'])

    await screen.findByLabelText('Kode part 1')
    expect(screen.queryByRole('button', { name: 'Hapus barang 1' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Tambah Barang' }))
    await user.type(screen.getByLabelText('Kode part 2'), 'P-002')
    await user.click(screen.getByRole('button', { name: 'Hapus barang 1' }))
    expect(screen.getByLabelText('Kode part 1')).toHaveValue('P-002')
    expect(screen.queryByLabelText('Kode part 2')).not.toBeInTheDocument()
  })

  it('mode ubah: data terisi kembali dan perubahan dikirim lewat update', async () => {
    api.updateMoveRequest.mockResolvedValue(req())
    const user = userEvent.setup()
    shell(['/marketing/move-requests/1/edit'])

    expect(await screen.findByText('Ubah Permintaan')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Event')).toHaveValue('3'))
    expect(screen.getByLabelText('Kode part 2')).toHaveValue('P-002')
    expect(screen.getByLabelText('Keterangan 1')).toHaveValue('Standing banner')

    await user.clear(screen.getByLabelText('Jumlah 1'))
    await user.type(screen.getByLabelText('Jumlah 1'), '12')
    await user.click(screen.getByRole('button', { name: 'Simpan Permintaan' }))

    await waitFor(() => expect(api.updateMoveRequest).toHaveBeenCalledTimes(1))
    const [id, payload] = api.updateMoveRequest.mock.calls[0]
    expect(id).toBe('1')
    expect(payload.items[0]).toMatchObject({ part_num: 'P-001', qty: 12 })
    expect(api.createMoveRequest).not.toHaveBeenCalled()
  })

  it('Warehouse tidak bisa membuat permintaan', async () => {
    auth.user = { id: 7, name: 'Gudang', role: 'warehouse' }
    shell(['/marketing/move-requests/new'])
    expect(await screen.findByText(/dibuat oleh Marketing/)).toBeInTheDocument()
    expect(api.getMoveRequestEvents).not.toHaveBeenCalled()
  })
})

describe('Detail permintaan: langkah 01-05', () => {
  it('permintaan baru menampilkan barang, asal dan tujuan gudang, serta form Check On-Hand', async () => {
    shell(['/marketing/move-requests/1'])

    expect(await screen.findByText('MV-2026-00001')).toBeInTheDocument()
    expect(screen.getByText('BDG-2026-001-E01 · Bazaar Ramadan')).toBeInTheDocument()
    expect(screen.getByText('WH FG').closest('.mb-kv')).toHaveTextContent('Dari WH FG ke WH Marketing')
    expect(screen.getByText('1. P-001').closest('span')).toHaveTextContent('1. P-001 · Standing banner')
    expect(screen.getByRole('button', { name: 'Ubah Permintaan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simpan Check On-Hand' })).toBeInTheDocument()
    expect(screen.queryByText('Move Inventory Request (WH FG ke WH Marketing)')).not.toBeInTheDocument() // belum waktunya
  })

  it('Check On-Hand: semua barang wajib diisi (0 boleh), lalu terkirim dengan catatan', async () => {
    api.checkMoveRequestOnHand.mockResolvedValue(atChecked())
    const user = userEvent.setup()
    shell(['/marketing/move-requests/1'])

    await user.click(await screen.findByRole('button', { name: 'Simpan Check On-Hand' }))
    expect(await screen.findByText('Isi On-Hand barang 1 (boleh 0)')).toBeInTheDocument()
    expect(api.checkMoveRequestOnHand).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('On-Hand barang 1 (P-001)'), '3')
    await user.click(screen.getByRole('button', { name: 'Simpan Check On-Hand' }))
    expect(await screen.findByText('Isi On-Hand barang 2 (boleh 0)')).toBeInTheDocument()

    await user.type(screen.getByLabelText('On-Hand barang 2 (P-002)'), '0')
    await user.type(screen.getByLabelText('Catatan (opsional)'), 'Banner tinggal 3')
    await user.click(screen.getByRole('button', { name: 'Simpan Check On-Hand' }))

    await waitFor(() => expect(api.checkMoveRequestOnHand).toHaveBeenCalledWith(1, {
      onhand: [{ item_id: 1, onhand_qty: 3 }, { item_id: 2, onhand_qty: 0 }], notes: 'Banner tinggal 3',
    }))
    expect(await screen.findByText('Move Inventory Request (WH FG ke WH Marketing)')).toBeInTheDocument()
    expect(screen.getByText(/On-Hand Marketing 3/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ubah Permintaan' })).not.toBeInTheDocument() // terkunci setelah On-Hand diperiksa
  })

  it('Move Inventory Request: nomor wajib, lalu terkirim dan menunggu Warehouse', async () => {
    api.getMoveRequest.mockResolvedValue(atChecked())
    api.saveMoveRequestMove.mockResolvedValue(atRequested())
    const user = userEvent.setup()
    shell(['/marketing/move-requests/1'])

    await user.click(await screen.findByRole('button', { name: 'Simpan Move Inventory Request' }))
    expect(await screen.findByText('Isi nomor Move Inventory Request')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nomor Move Inventory Request'), 'MIR-0001')
    await user.click(screen.getByRole('button', { name: 'Simpan Move Inventory Request' }))

    await waitFor(() => expect(api.saveMoveRequestMove).toHaveBeenCalledWith(1, { epicor_request_no: 'MIR-0001' }))
    expect(await screen.findByText('Menunggu Warehouse', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Nomor request').closest('.mb-kv')).toHaveTextContent('MIR-0001')
    expect(screen.getByText('Menunggu Warehouse menjalankan Inventory Transfer.')).toBeInTheDocument()
  })

  it('Inventory Transfer: Warehouse mengisi nomor Pra-SJ; Marketing hanya melihat keterangan menunggu', async () => {
    api.getMoveRequest.mockResolvedValue(atRequested({ can_transfer: true }))
    api.saveMoveRequestTransfer.mockResolvedValue(atTransferred())
    auth.user = { id: 7, name: 'Gudang', role: 'warehouse' }
    const user = userEvent.setup()
    const view = shell(['/marketing/move-requests/1'])

    await user.click(await screen.findByRole('button', { name: 'Simpan Inventory Transfer' }))
    expect(await screen.findByText('Isi nomor Pra-SJ')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nomor Pra-SJ'), 'PSJ-0001')
    await user.click(screen.getByRole('button', { name: 'Simpan Inventory Transfer' }))

    await waitFor(() => expect(api.saveMoveRequestTransfer).toHaveBeenCalledWith(1, { pra_sj_number: 'PSJ-0001' }))
    expect(await screen.findByText('Pra-SJ').then((el) => el.closest('.mb-kv'))).toHaveTextContent('PSJ-0001')
    view.unmount()

    auth.user = { id: 1, name: 'Sup', role: 'supervisor' }
    api.getMoveRequest.mockResolvedValue(atRequested())
    shell(['/marketing/move-requests/1'])
    expect(await screen.findByText('Menunggu Warehouse menjalankan Inventory Transfer.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan Inventory Transfer' })).not.toBeInTheDocument()
  })

  it('Issue Misc. Material: nomor dokumen wajib, lalu terkirim dan membuka langkah penerima', async () => {
    api.getMoveRequest.mockResolvedValue(atTransferred({ can_issue: true }))
    api.saveMoveRequestIssue.mockResolvedValue(atIssued({ can_complete: true }))
    const user = userEvent.setup()
    shell(['/marketing/move-requests/1'])

    await user.click(await screen.findByRole('button', { name: 'Simpan Issue Misc. Material' }))
    expect(await screen.findByText('Isi nomor dokumen Issue Misc. Material')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nomor Dokumen Issue'), 'ISS-0001')
    await user.click(screen.getByRole('button', { name: 'Simpan Issue Misc. Material' }))

    await waitFor(() => expect(api.saveMoveRequestIssue).toHaveBeenCalledWith(1, { issue_reference: 'ISS-0001' }))
    expect(await screen.findByText('Penerima dan Nama Event (Remarks)')).toBeInTheDocument()
  })

  it('penerima wajib; Remarks berisi penerima dan nama event; setelah selesai Remarks tampil', async () => {
    api.getMoveRequest.mockResolvedValue(atIssued({ can_complete: true }))
    api.completeMoveRequest.mockResolvedValue(done())
    const user = userEvent.setup()
    shell(['/marketing/move-requests/1'])

    await user.click(await screen.findByRole('button', { name: 'Selesaikan Permintaan' }))
    expect(await screen.findByText('Isi nama penerima')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nama Penerima'), 'Pak Budi')
    expect(screen.getByText('Remarks').closest('.cl-res-row')).toHaveTextContent('Pak Budi / Bazaar Ramadan')
    await user.click(screen.getByRole('button', { name: 'Selesaikan Permintaan' }))

    await waitFor(() => expect(api.completeMoveRequest).toHaveBeenCalledWith(1, { recipient_name: 'Pak Budi' }))
    expect(await screen.findByText('Selesai', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Remarks').closest('.mb-kv')).toHaveTextContent('Pak Budi / Bazaar Ramadan')
    expect(screen.queryByRole('button', { name: 'Selesaikan Permintaan' })).not.toBeInTheDocument()
  })

  it('permintaan yang selesai menampilkan semua langkah tanpa tombol aksi', async () => {
    api.getMoveRequest.mockResolvedValue(done())
    shell(['/marketing/move-requests/1'])

    expect(await screen.findByText('Selesai', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Nomor request').closest('.mb-kv')).toHaveTextContent('MIR-0001')
    expect(screen.getByText('Pra-SJ').closest('.mb-kv')).toHaveTextContent('PSJ-0001')
    expect(screen.getByText('Nomor dokumen').closest('.mb-kv')).toHaveTextContent('ISS-0001')
    expect(screen.queryAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Kembali')).toHaveLength(0)
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.getMoveRequest.mockResolvedValue(atChecked())
    api.saveMoveRequestMove.mockRejectedValue(new Error('Nomor Move Inventory Request MIR-0001 sudah dipakai permintaan lain.'))
    const user = userEvent.setup()
    shell(['/marketing/move-requests/1'])

    await user.type(await screen.findByLabelText('Nomor Move Inventory Request'), 'MIR-0001')
    await user.click(screen.getByRole('button', { name: 'Simpan Move Inventory Request' }))
    expect(await screen.findByText(/sudah dipakai permintaan lain/)).toBeInTheDocument()
  })

  it('role di luar admin, supervisor, dan warehouse tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Keuangan', role: 'finance' }
    shell(['/marketing/move-requests/1'])
    expect(await screen.findByText(/hanya untuk admin, supervisor, dan warehouse/)).toBeInTheDocument()
    expect(api.getMoveRequest).not.toHaveBeenCalled()
  })
})
