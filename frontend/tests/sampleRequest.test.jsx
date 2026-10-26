import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
// Hanya fungsi API sample yang disediakan: bila halaman sample keliru memanggil fungsi API display, tesnya gagal.
vi.mock('../src/api/index.js', () => ({
  getSampleRequests: vi.fn(), getSampleRequest: vi.fn(), createSampleRequest: vi.fn(), updateSampleRequest: vi.fn(), checkSampleRequestOnHand: vi.fn(),
  saveSampleRequestMove: vi.fn(), saveSampleRequestTransfer: vi.fn(), saveSampleRequestIssue: vi.fn(), completeSampleRequest: vi.fn(),
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
            <Route path="/marketing/sample-requests" element={<MoveRequests kind="sample" />} />
            <Route path="/marketing/sample-requests/new" element={<MoveRequestForm kind="sample" />} />
            <Route path="/marketing/sample-requests/:id" element={<MoveRequestDetail kind="sample" />} />
            <Route path="/marketing/sample-requests/:id/edit" element={<MoveRequestForm kind="sample" />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const flags = (over = {}) => ({ can_edit: false, can_check: false, can_request: false, can_transfer: false, can_issue: false, can_complete: false, ...over })
const item = (over = {}) => ({ id: 1, part_num: 'P-001', description: 'Sample saus 250 ml', qty: '6.00', onhand_qty: null, ...over })

const req = (over = {}) => ({
  id: 1, req_no: 'SM-2026-00001', marketing_event_id: null, event: null, creator: { name: 'Bu Marketing' }, notes: 'Sample produk baru', status: 'NEW',
  items: [item(), item({ id: 2, part_num: 'P-002', description: null, qty: '3.00' })], onhand_notes: null, onhand_checked_at: null, epicor_request_no: null,
  pra_sj_number: null, transferred_at: null, issue_reference: null, issued_at: null, recipient_name: null, purpose: null, remarks: null, completed_at: null,
  awaiting_label: 'Marketing (cek On-Hand di Inventory Marketing)', flags: flags({ can_edit: true, can_check: true }), ...over,
})

const atChecked = (over = {}) => req({
  status: 'CHECKED', onhand_checked_at: '2026-12-20T03:00:00Z', items: [item({ onhand_qty: '4.00' }), item({ id: 2, part_num: 'P-002', qty: '3.00', onhand_qty: '4.00' })],
  awaiting_label: 'Marketing (buat Move Inventory Request)', flags: flags({ can_request: true }), ...over,
})
const atIssued = (f = {}) => atChecked({
  status: 'ISSUED', epicor_request_no: 'MIR-S1', pra_sj_number: 'PSJ-S1', transferred_at: '2026-12-21T03:00:00Z', issue_reference: 'ISS-S1', issued_at: '2026-12-22T03:00:00Z',
  awaiting_label: 'Marketing (input nama sales dan peruntukannya)', flags: flags(f),
})
const done = () => atChecked({
  status: 'DONE', epicor_request_no: 'MIR-S1', pra_sj_number: 'PSJ-S1', transferred_at: '2026-12-21T03:00:00Z', issue_reference: 'ISS-S1', issued_at: '2026-12-22T03:00:00Z',
  recipient_name: 'Sales Budi', purpose: 'Dibagikan ke calon pelanggan', remarks: 'Sales Budi / Dibagikan ke calon pelanggan', completed_at: '2026-12-23T03:00:00Z', awaiting_label: null, flags: flags(),
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Sup', role: 'supervisor' }
  api.getSampleRequest.mockResolvedValue(req())
})

describe('Daftar sample internal', () => {
  const rows = () => [
    { id: 1, req_no: 'SM-2026-00001', event: null, remarks: null, status: 'NEW', items_count: 2, awaiting_label: 'Marketing (cek On-Hand di Inventory Marketing)', can_act: true },
    { id: 2, req_no: 'SM-2026-00002', event: null, remarks: 'Sales Budi / Dibagikan ke calon pelanggan', status: 'DONE', items_count: 1, awaiting_label: null, can_act: false },
  ]

  it('menampilkan permintaan sample tanpa event, jumlah barang sample, dan Remarks bila sudah selesai', async () => {
    api.getSampleRequests.mockResolvedValue(rows())
    shell(['/marketing/sample-requests'])

    expect(await screen.findByText('SM-2026-00001')).toBeInTheDocument()
    expect(screen.getByText('Sample Internal')).toBeInTheDocument()
    expect(screen.getByText('dari 2 permintaan sample internal')).toBeInTheDocument()
    expect(screen.getByText('2 barang sample')).toBeInTheDocument()
    expect(screen.getByText('Sample internal')).toBeInTheDocument() // kartu tanpa Remarks
    expect(screen.getByText('Sales Budi / Dibagikan ke calon pelanggan')).toBeInTheDocument()
    expect(screen.getByText('Menunggu On-Hand', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Selesai', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByTestId('todo-count')).toHaveTextContent('1')
  })

  it('pencarian memakai API sample', async () => {
    api.getSampleRequests.mockResolvedValue(rows())
    const user = userEvent.setup()
    shell(['/marketing/sample-requests'])

    await screen.findByText('SM-2026-00001')
    await user.type(screen.getByLabelText('Cari permintaan'), 'SM-2026')
    await waitFor(() => expect(api.getSampleRequests).toHaveBeenCalledWith({ q: 'SM-2026' }))
  })

  it('tidak ada permintaan: tampilan kosong menyebut sample', async () => {
    api.getSampleRequests.mockResolvedValue([])
    shell(['/marketing/sample-requests'])
    expect(await screen.findByText('Tidak ada permintaan.')).toBeInTheDocument()
    expect(screen.getByText(/memindahkan sample dari WH FG ke WH Marketing/)).toBeInTheDocument()
  })

  it('Buat Permintaan membuka form sample dan mengetuk kartu membuka detail sample', async () => {
    api.getSampleRequests.mockResolvedValue(rows())
    const user = userEvent.setup()
    const view = shell(['/marketing/sample-requests'])

    await user.click(await screen.findByRole('button', { name: 'Buat Permintaan' }))
    expect(await screen.findByText('Sample Baru')).toBeInTheDocument()
    view.unmount()

    shell(['/marketing/sample-requests'])
    await user.click(await screen.findByText('SM-2026-00002'))
    await waitFor(() => expect(api.getSampleRequest).toHaveBeenCalledWith('2'))
  })

  it('hanya admin, supervisor, dan warehouse; finance tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Keuangan', role: 'finance' }
    shell(['/marketing/sample-requests'])
    expect(await screen.findByText(/hanya untuk admin, supervisor, dan warehouse/)).toBeInTheDocument()
    expect(api.getSampleRequests).not.toHaveBeenCalled()
  })
})

describe('Form sample', () => {
  it('tidak ada pilihan event dan validasi langsung mulai dari kode part', async () => {
    const user = userEvent.setup()
    shell(['/marketing/sample-requests/new'])

    await screen.findByLabelText('Kode part 1')
    expect(screen.queryByLabelText('Event')).not.toBeInTheDocument()
    expect(screen.getByText('Barang Sample')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simpan Permintaan' }))
    expect(await screen.findByText('Isi kode part barang 1')).toBeInTheDocument()
    expect(api.createSampleRequest).not.toHaveBeenCalled()
  })

  it('menyimpan sample mengirim payload tanpa event lalu membuka detail', async () => {
    api.createSampleRequest.mockResolvedValue(req({ id: 5 }))
    api.getSampleRequest.mockResolvedValue(req({ id: 5, req_no: 'SM-2026-00005' }))
    const user = userEvent.setup()
    shell(['/marketing/sample-requests/new'])

    await user.type(await screen.findByLabelText('Catatan (opsional)'), 'Sample produk baru')
    await user.type(screen.getByLabelText('Kode part 1'), 'P-001')
    await user.type(screen.getByLabelText('Jumlah 1'), '6')
    await user.type(screen.getByLabelText('Keterangan 1'), 'Sample saus 250 ml')
    await user.click(screen.getByRole('button', { name: 'Simpan Permintaan' }))

    await waitFor(() => expect(api.createSampleRequest).toHaveBeenCalledWith({
      notes: 'Sample produk baru', items: [{ part_num: 'P-001', qty: 6, description: 'Sample saus 250 ml' }],
    }))
    expect(await screen.findByText('SM-2026-00005')).toBeInTheDocument()
  })

  it('mode ubah memakai API sample', async () => {
    api.updateSampleRequest.mockResolvedValue(req())
    const user = userEvent.setup()
    shell(['/marketing/sample-requests/1/edit'])

    expect(await screen.findByText('Ubah Sample')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Kode part 2')).toHaveValue('P-002'))
    await user.click(screen.getByRole('button', { name: 'Simpan Permintaan' }))

    await waitFor(() => expect(api.updateSampleRequest).toHaveBeenCalledTimes(1))
    const [id, payload] = api.updateSampleRequest.mock.calls[0]
    expect(id).toBe('1')
    expect(payload).not.toHaveProperty('event_id')
    expect(payload.items.map((i) => i.part_num)).toEqual(['P-001', 'P-002'])
  })
})

describe('Detail sample: langkah 01-05', () => {
  it('menampilkan sample tanpa event dan petunjuk Check On-Hand untuk sample', async () => {
    shell(['/marketing/sample-requests/1'])

    expect(await screen.findByText('SM-2026-00001')).toBeInTheDocument()
    expect(screen.getByText('Sample internal')).toBeInTheDocument()
    expect(screen.getByText('Barang Sample (2)')).toBeInTheDocument()
    expect(screen.getByText('Periksa On-Hand tiap sample di Inventory Marketing, lalu catat hasilnya.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ubah Permintaan' })).toBeInTheDocument()
  })

  it('langkah 01 sampai 04 memakai API sample', async () => {
    api.checkSampleRequestOnHand.mockResolvedValue(atChecked())
    const user = userEvent.setup()
    shell(['/marketing/sample-requests/1'])

    await user.type(await screen.findByLabelText('On-Hand barang 1 (P-001)'), '4')
    await user.type(screen.getByLabelText('On-Hand barang 2 (P-002)'), '4')
    await user.click(screen.getByRole('button', { name: 'Simpan Check On-Hand' }))
    await waitFor(() => expect(api.checkSampleRequestOnHand).toHaveBeenCalledWith(1, { onhand: [{ item_id: 1, onhand_qty: 4 }, { item_id: 2, onhand_qty: 4 }] }))
    expect(await screen.findByText('Move Inventory Request (WH FG ke WH Marketing)')).toBeInTheDocument()
  })

  it('Move Inventory Request, Inventory Transfer, dan Issue memakai API sample', async () => {
    api.getSampleRequest.mockResolvedValue(atChecked())
    api.saveSampleRequestMove.mockResolvedValue(atChecked({ status: 'REQUESTED', epicor_request_no: 'MIR-S1', flags: flags({ can_transfer: true }) }))
    api.saveSampleRequestTransfer.mockResolvedValue(atChecked({ status: 'TRANSFERRED', epicor_request_no: 'MIR-S1', pra_sj_number: 'PSJ-S1', flags: flags({ can_issue: true }) }))
    api.saveSampleRequestIssue.mockResolvedValue(atIssued({ can_complete: true }))
    const user = userEvent.setup()
    shell(['/marketing/sample-requests/1'])

    await user.type(await screen.findByLabelText('Nomor Move Inventory Request'), 'MIR-S1')
    await user.click(screen.getByRole('button', { name: 'Simpan Move Inventory Request' }))
    await waitFor(() => expect(api.saveSampleRequestMove).toHaveBeenCalledWith(1, { epicor_request_no: 'MIR-S1' }))

    await user.type(await screen.findByLabelText('Nomor Pra-SJ'), 'PSJ-S1')
    await user.click(screen.getByRole('button', { name: 'Simpan Inventory Transfer' }))
    await waitFor(() => expect(api.saveSampleRequestTransfer).toHaveBeenCalledWith(1, { pra_sj_number: 'PSJ-S1' }))

    await user.type(await screen.findByLabelText('Nomor Dokumen Issue'), 'ISS-S1')
    await user.click(screen.getByRole('button', { name: 'Simpan Issue Misc. Material' }))
    await waitFor(() => expect(api.saveSampleRequestIssue).toHaveBeenCalledWith(1, { issue_reference: 'ISS-S1' }))
    expect(await screen.findByText('Nama Sales dan Peruntukannya (Remarks)')).toBeInTheDocument()
  })

  it('nama sales dan peruntukan wajib; Remarks berisi keduanya; payload menyertakan peruntukan', async () => {
    api.getSampleRequest.mockResolvedValue(atIssued({ can_complete: true }))
    api.completeSampleRequest.mockResolvedValue(done())
    const user = userEvent.setup()
    shell(['/marketing/sample-requests/1'])

    await user.click(await screen.findByRole('button', { name: 'Selesaikan Permintaan' }))
    expect(await screen.findByText('Isi nama sales')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nama Sales'), 'Sales Budi')
    await user.click(screen.getByRole('button', { name: 'Selesaikan Permintaan' }))
    expect(await screen.findByText('Isi peruntukan sample')).toBeInTheDocument()
    expect(api.completeSampleRequest).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Peruntukan'), 'Dibagikan ke calon pelanggan')
    expect(screen.getByText('Remarks').closest('.cl-res-row')).toHaveTextContent('Sales Budi / Dibagikan ke calon pelanggan')
    await user.click(screen.getByRole('button', { name: 'Selesaikan Permintaan' }))

    await waitFor(() => expect(api.completeSampleRequest).toHaveBeenCalledWith(1, { recipient_name: 'Sales Budi', purpose: 'Dibagikan ke calon pelanggan' }))
    expect(await screen.findByText('Selesai', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Remarks').closest('.mb-kv')).toHaveTextContent('Sales Budi / Dibagikan ke calon pelanggan')
    expect(screen.queryByRole('button', { name: 'Selesaikan Permintaan' })).not.toBeInTheDocument()
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.getSampleRequest.mockResolvedValue(atIssued({ can_complete: true }))
    api.completeSampleRequest.mockRejectedValue(new Error('Isi peruntukan sample.'))
    const user = userEvent.setup()
    shell(['/marketing/sample-requests/1'])

    await user.type(await screen.findByLabelText('Nama Sales'), 'Sales Budi')
    await user.type(screen.getByLabelText('Peruntukan'), 'Uji coba')
    await user.click(screen.getByRole('button', { name: 'Selesaikan Permintaan' }))
    expect(await screen.findByText('Isi peruntukan sample.')).toBeInTheDocument()
  })

  it('permintaan yang selesai menampilkan Remarks tanpa tombol aksi', async () => {
    api.getSampleRequest.mockResolvedValue(done())
    shell(['/marketing/sample-requests/1'])

    expect(await screen.findByText('Selesai', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Remarks').closest('.mb-kv')).toHaveTextContent('Sales Budi / Dibagikan ke calon pelanggan')
    expect(screen.queryAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Kembali')).toHaveLength(0)
  })

  it('role di luar admin, supervisor, dan warehouse tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/sample-requests/1'])
    expect(await screen.findByText(/hanya untuk admin, supervisor, dan warehouse/)).toBeInTheDocument()
    expect(api.getSampleRequest).not.toHaveBeenCalled()
  })
})
