import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getRequisitions: vi.fn(), getRequisition: vi.fn(), createRequisition: vi.fn(), updateRequisition: vi.fn(), uploadRequisitionFiles: vi.fn(),
  submitRequisition: vi.fn(), registerRequisitionPart: vi.fn(), saveRequisitionPrices: vi.fn(), approveRequisition: vi.fn(), rejectRequisition: vi.fn(),
  resubmitRequisition: vi.fn(), dispatchRequisition: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import RequisitionDetail from '../src/pages/RequisitionDetail.jsx'
import RequisitionForm from '../src/pages/RequisitionForm.jsx'
import Requisitions from '../src/pages/Requisitions.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/purchasing/requisitions" element={<Requisitions />} />
            <Route path="/purchasing/requisitions/new" element={<RequisitionForm />} />
            <Route path="/purchasing/requisitions/:id" element={<RequisitionDetail />} />
            <Route path="/purchasing/requisitions/:id/edit" element={<RequisitionForm />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const OPTIONS = {
  categories: [{ value: 'REWARD', label: 'Reward' }, { value: 'DESIGN', label: 'Design' }],
  dispatch_targets: [{ value: 'PO_BOP_SUPPLIER', label: 'PO BOP Supplier' }, { value: 'PO_BOP_LAPANGAN', label: 'PO BOP Lapangan' }, { value: 'PO_RMPM_LAPANGAN', label: 'PO RMPM Lapangan' }],
  asset_threshold: 30000000, max_lines: 50,
}

const flags = (over = {}) => ({ can_edit: false, can_submit: false, can_register: false, can_price: false, can_decide: false, can_resubmit: false, can_dispatch: false, ...over })

const approvalInfo = (over = {}) => ({
  stage: 1, round: 1, levels: [{ stage: 1, label: 'Manager Dept' }], awaiting_label: null, can_act: false,
  reason_codes: {
    APPROVE: [{ value: 'SESUAI_ANGGARAN', label: 'Sesuai anggaran' }],
    REJECT: [{ value: 'DOKUMEN_KURANG', label: 'Dokumen pendukung kurang' }],
  },
  ...over,
})

const line = (over = {}) => ({
  id: 1, line_no: 1, part_num: 'P-001', requested_part_num: null, description: null, qty: '10.00', unit_price: '1000.00', is_asset: false, part_registered: true, ...over,
})

const pr = (over = {}) => ({
  id: 1, pr_no: 'PR-2026-00001', category: 'REWARD', category_label: 'Reward', needed_date: '2026-12-20', is_rab: false, notes: 'Reward Q4', status: 'DRAFT',
  approval_stage: 1, approval_round: 1, requires_director: false, total_amount: '10000.00', requested_by: 1, requester: { name: 'Bu User' },
  lines: [line(), line({ id: 2, line_no: 2, part_num: 'P-002', description: 'Poster', qty: '5.00', unit_price: null })],
  attachments: [], approvals: [], unregistered_count: 0, awaiting_label: 'User (menyiapkan PR)', flags: flags({ can_edit: true, can_submit: true }),
  approval: approvalInfo(), options: OPTIONS, dispatch_target: null, dispatch_target_label: null, dispatched_at: null, ...over,
})

const history = (over = {}) => ({
  id: 1, round: 1, stage: 1, stage_label: 'Manager Dept', action: 'APPROVED', reason_label: 'Sesuai anggaran', notes: null, actor: { name: 'Pak Manager' }, acted_at: '2026-12-21T03:00:00.000000Z', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Sup', role: 'supervisor' }
  api.getRequisition.mockResolvedValue(pr())
})

describe('Daftar requisition', () => {
  const items = () => [
    { id: 1, pr_no: 'PR-2026-00001', category_label: 'Reward', requester: { name: 'Bu User' }, requested_by: 1, needed_date: '2026-12-20', status: 'MANAGER', lines_count: 2, total_amount: '10000.00', awaiting_label: 'Manager Dept', unregistered_count: 0, can_act: true },
    { id: 2, pr_no: 'PR-2026-00002', category_label: 'Design', requester: { name: 'Pak Lain' }, requested_by: 9, needed_date: '2026-12-25', status: 'DRAFT', lines_count: 1, total_amount: '0.00', awaiting_label: 'IT (Register New Part)', unregistered_count: 1, can_act: false },
  ]

  it('menampilkan jumlah tindakan dan tiap requisition dengan status, penunggu, dan part yang menunggu IT', async () => {
    api.getRequisitions.mockResolvedValue(items())
    shell(['/purchasing/requisitions'])

    expect(await screen.findByText('PR-2026-00001')).toBeInTheDocument()
    expect(screen.getByTestId('todo-count')).toHaveTextContent('1')
    expect(screen.getByText('Menunggu Manager', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Draft', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Menunggu Manager Dept')).toBeInTheDocument()
    expect(screen.getByText('1 part menunggu didaftarkan IT')).toBeInTheDocument()
    expect(screen.getByText('harga belum diisi')).toBeInTheDocument()
    expect(screen.getAllByText('Perlu tindakan Anda')).toHaveLength(1)
  })

  it('filter Perlu Tindakan Saya dan PR Saya', async () => {
    api.getRequisitions.mockResolvedValue(items())
    const user = userEvent.setup()
    shell(['/purchasing/requisitions'])
    await screen.findByText('PR-2026-00001')

    await user.click(screen.getByRole('button', { name: 'Perlu Tindakan Saya (1)' }))
    expect(screen.getByText('PR-2026-00001')).toBeInTheDocument()
    expect(screen.queryByText('PR-2026-00002')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'PR Saya' }))
    expect(screen.getByText('PR-2026-00001')).toBeInTheDocument() // dibuat pengguna ini (id 1)
    expect(screen.queryByText('PR-2026-00002')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Semua' }))
    expect(screen.getByText('PR-2026-00002')).toBeInTheDocument()
  })

  it('pencarian memanggil server dengan kata kunci', async () => {
    api.getRequisitions.mockResolvedValue(items())
    const user = userEvent.setup()
    shell(['/purchasing/requisitions'])

    await screen.findByText('PR-2026-00001')
    await user.type(screen.getByLabelText('Cari requisition'), 'Reward')
    await waitFor(() => expect(api.getRequisitions).toHaveBeenCalledWith({ q: 'Reward' }))
  })

  it('tidak ada requisition: tampilan kosong', async () => {
    api.getRequisitions.mockResolvedValue([])
    shell(['/purchasing/requisitions'])
    expect(await screen.findByText('Tidak ada requisition.')).toBeInTheDocument()
  })

  it('Buat Requisition membuka form baru dan mengetuk kartu membuka detailnya', async () => {
    api.getRequisitions.mockResolvedValue(items())
    const user = userEvent.setup()
    const view = shell(['/purchasing/requisitions'])

    await user.click(await screen.findByRole('button', { name: 'Buat Requisition' }))
    expect(await screen.findByText('Requisition Baru')).toBeInTheDocument()
    expect(api.getRequisition).not.toHaveBeenCalled()
    view.unmount()

    shell(['/purchasing/requisitions'])
    await user.click(await screen.findByText('PR-2026-00002'))
    await waitFor(() => expect(api.getRequisition).toHaveBeenCalledWith('2'))
  })

  it('hanya admin dan supervisor; finance dan sales tidak memuat data', async () => {
    for (const role of ['finance', 'sales']) {
      auth.user = { id: 2, name: role, role }
      const view = shell(['/purchasing/requisitions'])
      expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
      view.unmount()
    }
    expect(api.getRequisitions).not.toHaveBeenCalled()
  })
})

describe('Form requisition (langkah 01-02)', () => {
  const fillBasics = async (user) => {
    await user.selectOptions(await screen.findByLabelText('Kategori'), 'REWARD')
    fireEvent.change(screen.getByLabelText('Tanggal Barang Dibutuhkan'), { target: { value: '2026-12-20' } })
  }

  it('validasi berurutan: kategori, tanggal, kode part, jumlah, dan kode ganda', async () => {
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/new'])
    const save = () => user.click(screen.getByRole('button', { name: 'Simpan Requisition' }))

    await screen.findByLabelText('Kategori')
    await save()
    expect(await screen.findByText('Pilih kategori')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Kategori'), 'DESIGN')
    await save()
    expect(await screen.findByText('Isi tanggal barang dibutuhkan')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tanggal Barang Dibutuhkan'), { target: { value: '2026-12-20' } })
    await save()
    expect(await screen.findByText('Isi kode part baris 1')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Kode part 1'), 'P-001')
    await save()
    expect(await screen.findByText('Isi jumlah baris 1 lebih dari 0')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Jumlah 1'), '5')
    await user.click(screen.getByRole('button', { name: '+ Tambah Baris' }))
    await user.type(screen.getByLabelText('Kode part 2'), 'p-001')
    await user.type(screen.getByLabelText('Jumlah 2'), '1')
    await save()
    expect(await screen.findByText('Kode part p-001 diisi lebih dari sekali')).toBeInTheDocument()
    expect(api.createRequisition).not.toHaveBeenCalled()
  })

  it('menyimpan header dan baris, mengunggah RAB, lalu membuka detail', async () => {
    api.createRequisition.mockResolvedValue(pr({ id: 7 }))
    api.uploadRequisitionFiles.mockResolvedValue(pr({ id: 7 }))
    api.getRequisition.mockResolvedValue(pr({ id: 7, pr_no: 'PR-2026-00007' }))
    const user = userEvent.setup()
    const { container } = shell(['/purchasing/requisitions/new'])

    await fillBasics(user)
    await user.click(screen.getByLabelText('Termasuk RAB / Bulanan'))
    await user.type(screen.getByLabelText('Catatan (opsional)'), 'Reward Q4')
    await user.type(screen.getByLabelText('Kode part 1'), 'P-001')
    await user.type(screen.getByLabelText('Jumlah 1'), '10')
    await user.type(screen.getByLabelText('Harga satuan 1'), '1000')
    await user.click(screen.getByLabelText('Barang asset 1'))
    await user.click(screen.getByRole('button', { name: '+ Tambah Baris' }))
    await user.type(screen.getByLabelText('Kode part 2'), 'BARU-1')
    await user.type(screen.getByLabelText('Jumlah 2'), '2,5')
    await user.type(screen.getByLabelText('Keterangan 2'), 'Poster baru')
    await user.upload(container.querySelector('input[type="file"]'), new File(['rab'], 'rab-q4.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Simpan Requisition' }))

    await waitFor(() => expect(api.createRequisition).toHaveBeenCalledWith({
      category: 'REWARD', needed_date: '2026-12-20', is_rab: true, notes: 'Reward Q4',
      lines: [
        { part_num: 'P-001', qty: 10, is_asset: true, unit_price: 1000 },
        { part_num: 'BARU-1', qty: 2.5, is_asset: false, description: 'Poster baru' },
      ],
    }))
    await waitFor(() => expect(api.uploadRequisitionFiles).toHaveBeenCalledTimes(1))
    const [id, fd] = api.uploadRequisitionFiles.mock.calls[0]
    expect(id).toBe(7)
    expect(fd.getAll('files[]')[0].name).toBe('rab-q4.pdf')
    expect(await screen.findByText('PR-2026-00007')).toBeInTheDocument() // pindah ke halaman detail
  })

  it('tanpa lampiran, tidak ada pemanggilan unggah', async () => {
    api.createRequisition.mockResolvedValue(pr({ id: 8 }))
    api.getRequisition.mockResolvedValue(pr({ id: 8 }))
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/new'])

    await fillBasics(user)
    await user.type(screen.getByLabelText('Kode part 1'), 'P-001')
    await user.type(screen.getByLabelText('Jumlah 1'), '1')
    await user.click(screen.getByRole('button', { name: 'Simpan Requisition' }))

    await waitFor(() => expect(api.createRequisition).toHaveBeenCalledTimes(1))
    expect(api.uploadRequisitionFiles).not.toHaveBeenCalled()
    expect(await screen.findByText('Baris Barang (2)')).toBeInTheDocument()
  })

  it('bila unggah lampiran gagal, requisition tetap tersimpan dan pengguna dibawa ke detail', async () => {
    api.createRequisition.mockResolvedValue(pr({ id: 9 }))
    api.uploadRequisitionFiles.mockRejectedValue(new Error('Ukuran berkas terlalu besar'))
    api.getRequisition.mockResolvedValue(pr({ id: 9 }))
    const user = userEvent.setup()
    const { container } = shell(['/purchasing/requisitions/new'])

    await fillBasics(user)
    await user.type(screen.getByLabelText('Kode part 1'), 'P-001')
    await user.type(screen.getByLabelText('Jumlah 1'), '1')
    await user.upload(container.querySelector('input[type="file"]'), new File(['x'], 'besar.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Simpan Requisition' }))

    expect(await screen.findByText(/Requisition tersimpan, tetapi lampiran gagal diunggah: Ukuran berkas terlalu besar/)).toBeInTheDocument()
    expect(await screen.findByText('Baris Barang (2)')).toBeInTheDocument()
  })

  it('galat dari server saat menyimpan ditampilkan apa adanya dan pengguna tetap di form', async () => {
    api.createRequisition.mockRejectedValue(new Error('Kode part BARU-1 belum terdaftar. Isi keterangan barang agar IT dapat mendaftarkannya.'))
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/new'])

    await fillBasics(user)
    await user.type(screen.getByLabelText('Kode part 1'), 'BARU-1')
    await user.type(screen.getByLabelText('Jumlah 1'), '1')
    await user.click(screen.getByRole('button', { name: 'Simpan Requisition' }))

    expect(await screen.findByText(/belum terdaftar. Isi keterangan barang/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simpan Requisition' })).toBeInTheDocument()
    expect(api.uploadRequisitionFiles).not.toHaveBeenCalled()
  })

  it('baris bisa ditambah dan dihapus', async () => {
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/new'])

    await screen.findByLabelText('Kode part 1')
    expect(screen.queryByRole('button', { name: 'Hapus baris 1' })).not.toBeInTheDocument() // minimal satu baris
    await user.click(screen.getByRole('button', { name: '+ Tambah Baris' }))
    await user.type(screen.getByLabelText('Kode part 2'), 'P-002')
    await user.click(screen.getByRole('button', { name: 'Hapus baris 1' }))
    expect(screen.getByLabelText('Kode part 1')).toHaveValue('P-002')
    expect(screen.queryByLabelText('Kode part 2')).not.toBeInTheDocument()
  })

  it('mode ubah: data terisi kembali dan perubahan dikirim lewat update', async () => {
    api.getRequisition.mockResolvedValue(pr({ is_rab: true, attachments: [{ id: 1, filename: 'rab-lama.pdf' }] }))
    api.updateRequisition.mockResolvedValue(pr())
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/1/edit'])

    expect(await screen.findByText('Ubah Requisition')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Kategori')).toHaveValue('REWARD'))
    expect(screen.getByLabelText('Tanggal Barang Dibutuhkan')).toHaveValue('2026-12-20')
    expect(screen.getByLabelText('Termasuk RAB / Bulanan')).toBeChecked()
    expect(screen.getByLabelText('Kode part 2')).toHaveValue('P-002')
    expect(screen.getByLabelText('Keterangan 2')).toHaveValue('Poster')
    expect(screen.getByText('rab-lama.pdf')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Kode part 2'))
    await user.type(screen.getByLabelText('Kode part 2'), 'P-003')
    await user.click(screen.getByRole('button', { name: 'Simpan Requisition' }))

    await waitFor(() => expect(api.updateRequisition).toHaveBeenCalledTimes(1))
    const [id, payload] = api.updateRequisition.mock.calls[0]
    expect(id).toBe('1')
    expect(payload.lines.map((l) => l.part_num)).toEqual(['P-001', 'P-003'])
    expect(api.createRequisition).not.toHaveBeenCalled()
  })
})

describe('Detail requisition', () => {
  it('Draft: menampilkan baris, part yang menunggu IT, dan tombol ajukan', async () => {
    api.getRequisition.mockResolvedValue(pr({
      unregistered_count: 1, awaiting_label: 'IT (Register New Part)',
      lines: [line(), line({ id: 2, line_no: 2, part_num: 'BARU-1', description: 'Poster baru', qty: '5.00', unit_price: null, part_registered: false })],
    }))
    shell(['/purchasing/requisitions/1'])

    expect(await screen.findByText('PR-2026-00001')).toBeInTheDocument()
    expect(screen.getByText('Draft', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Menunggu IT')).toBeInTheDocument()
    expect(screen.getByText('Menunggu IT mendaftarkan part baru ke Part Master sebelum PR bisa diajukan.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ubah Requisition' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajukan Requisition' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Kode part terdaftar baris 2')).not.toBeInTheDocument() // supervisor bukan IT
  })

  it('Ajukan Requisition memanggil server dan menampilkan status Menunggu Manager', async () => {
    api.submitRequisition.mockResolvedValue(pr({ status: 'MANAGER', awaiting_label: 'Manager Dept', flags: flags(), approval: approvalInfo({ awaiting_label: 'Manager Dept' }) }))
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/1'])

    await user.click(await screen.findByRole('button', { name: 'Ajukan Requisition' }))
    await waitFor(() => expect(api.submitRequisition).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Menunggu Manager', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajukan Requisition' })).not.toBeInTheDocument()
  })

  it('galat dari server saat mengajukan ditampilkan apa adanya', async () => {
    api.submitRequisition.mockRejectedValue(new Error('Masih ada part yang belum terdaftar (menunggu IT): BARU-1.'))
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/1'])

    await user.click(await screen.findByRole('button', { name: 'Ajukan Requisition' }))
    expect(await screen.findByText(/Masih ada part yang belum terdaftar/)).toBeInTheDocument()
  })

  it('IT mendaftarkan part baru: kode wajib, lalu terkirim untuk baris itu', async () => {
    const waiting = pr({
      unregistered_count: 1, flags: flags({ can_register: true }),
      lines: [line(), line({ id: 2, line_no: 2, part_num: 'BARU-1', qty: '5.00', unit_price: null, part_registered: false })],
    })
    api.getRequisition.mockResolvedValue(waiting)
    api.registerRequisitionPart.mockResolvedValue(pr({ flags: flags(), lines: [line(), line({ id: 2, line_no: 2, part_num: 'P-002', qty: '5.00', unit_price: null })] }))
    auth.user = { id: 5, name: 'IT', role: 'admin' }
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/1'])

    await user.click(await screen.findByRole('button', { name: 'Register Part baris 2' }))
    expect(await screen.findByText('Isi kode part terdaftar untuk baris 2')).toBeInTheDocument()
    expect(api.registerRequisitionPart).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Kode part terdaftar baris 2'), 'P-002')
    await user.click(screen.getByRole('button', { name: 'Register Part baris 2' }))

    await waitFor(() => expect(api.registerRequisitionPart).toHaveBeenCalledWith(1, 2, { part_num: 'P-002' }))
    expect(await screen.findByText('2. P-002')).toBeInTheDocument()
    expect(screen.queryByText('Menunggu IT')).not.toBeInTheDocument()
  })

  it('lampiran RAB bisa ditambah selama PR bisa diubah', async () => {
    api.uploadRequisitionFiles.mockResolvedValue(pr({ attachments: [{ id: 3, filename: 'rab-q4.pdf' }] }))
    const user = userEvent.setup()
    const { container } = shell(['/purchasing/requisitions/1'])

    expect(await screen.findByText('Tidak ada lampiran.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unggah Lampiran' })).not.toBeInTheDocument() // belum ada berkas dipilih
    await user.upload(container.querySelector('input[type="file"]'), new File(['rab'], 'rab-q4.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: 'Unggah Lampiran' }))

    await waitFor(() => expect(api.uploadRequisitionFiles).toHaveBeenCalledTimes(1))
    expect(api.uploadRequisitionFiles.mock.calls[0][0]).toBe(1)
    expect(api.uploadRequisitionFiles.mock.calls[0][1].getAll('files[]')[0].name).toBe('rab-q4.pdf')
    expect(await screen.findByText('rab-q4.pdf', { selector: '.me-file-n' })).toBeInTheDocument()
  })

  it('RAB/Bulanan: PIC Dept wajib mengisi harga semua baris, lalu PR ke Manager Dept', async () => {
    api.getRequisition.mockResolvedValue(pr({
      is_rab: true, status: 'PRICING', awaiting_label: 'PIC Dept (update harga purchasing)', flags: flags({ can_price: true }),
      lines: [line(), line({ id: 2, line_no: 2, part_num: 'P-002', qty: '5.00', unit_price: null })],
    }))
    api.saveRequisitionPrices.mockResolvedValue(pr({ is_rab: true, status: 'MANAGER', flags: flags(), total_amount: '22000.00', approval: approvalInfo({ awaiting_label: 'Manager Dept' }) }))
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/1'])

    expect(await screen.findByLabelText('Harga satuan baris 1 (P-001)')).toHaveValue('1.000') // terisi dari harga yang sudah ada
    await user.click(screen.getByRole('button', { name: 'Simpan Harga Purchasing' }))
    expect(await screen.findByText('Isi harga satuan baris 2 lebih dari 0')).toBeInTheDocument()
    expect(api.saveRequisitionPrices).not.toHaveBeenCalled()

    const first = screen.getByLabelText('Harga satuan baris 1 (P-001)')
    await user.clear(first)
    await user.type(first, '2000')
    await user.type(screen.getByLabelText('Harga satuan baris 2 (P-002)'), '400')
    await user.click(screen.getByRole('button', { name: 'Simpan Harga Purchasing' }))

    await waitFor(() => expect(api.saveRequisitionPrices).toHaveBeenCalledWith(1, [{ line_id: 1, unit_price: 2000 }, { line_id: 2, unit_price: 400 }]))
    expect(await screen.findByText('Menunggu Manager', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByTestId('total')).toHaveTextContent('Rp 22.000')
  })

  it('Manager Dept menyetujui dengan kode alasan lewat panel persetujuan', async () => {
    api.getRequisition.mockResolvedValue(pr({ status: 'MANAGER', flags: flags(), approval: approvalInfo({ awaiting_label: 'Manager Dept', can_act: true }) }))
    api.approveRequisition.mockResolvedValue(pr({
      status: 'PURCHASING', flags: flags(), approvals: [history()], awaiting_label: 'Purchasing', approval: approvalInfo(),
    }))
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/1'])

    expect(await screen.findByText('Tahap 1 · Manager Dept')).toBeInTheDocument()
    expect(screen.queryByText(/Tahap 2/)).not.toBeInTheDocument() // Direktur tidak ikut
    await user.selectOptions(screen.getByLabelText('Kode Alasan'), 'SESUAI_ANGGARAN')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.approveRequisition).toHaveBeenCalledWith(1, { reason_code: 'SESUAI_ANGGARAN' }))
    expect(await screen.findByText(/Disetujui oleh Pak Manager/)).toBeInTheDocument()
    expect(screen.getByText('Menunggu Purchasing', { selector: '.mb-badge' })).toBeInTheDocument()
  })

  it('barang asset atau lebih dari batas: tahap Direktur ikut tampil dan penjelasannya muncul', async () => {
    api.getRequisition.mockResolvedValue(pr({
      status: 'DIRECTOR', requires_director: true, approval_stage: 2, flags: flags(), approvals: [history()],
      approval: approvalInfo({ stage: 2, levels: [{ stage: 1, label: 'Manager Dept' }, { stage: 2, label: 'Direktur' }], awaiting_label: 'Direktur' }),
    }))
    shell(['/purchasing/requisitions/1'])

    expect(await screen.findByText('Tahap 2 · Direktur')).toBeInTheDocument()
    expect(screen.getByText('Barang asset atau lebih dari Rp 30.000.000: Direktur ikut menyetujui.')).toBeInTheDocument()
    expect(screen.getByText('Menunggu keputusan Direktur.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kirim Keputusan' })).not.toBeInTheDocument() // bukan giliran pengguna ini
  })

  it('menolak mengirim kode tolak dan PR kembali ke revisi', async () => {
    api.getRequisition.mockResolvedValue(pr({ status: 'MANAGER', flags: flags(), approval: approvalInfo({ awaiting_label: 'Manager Dept', can_act: true }) }))
    api.rejectRequisition.mockResolvedValue(pr({
      status: 'REVISION', flags: flags({ can_edit: true, can_resubmit: true }), approvals: [history({ action: 'REJECTED', reason_label: 'Dokumen pendukung kurang' })],
      awaiting_label: 'PIC Dept (revisi PR)',
    }))
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/1'])

    await screen.findByLabelText('Kode Alasan')
    await user.click(screen.getByRole('button', { name: 'Tolak' }))
    await user.selectOptions(screen.getByLabelText('Kode Alasan'), 'DOKUMEN_KURANG')
    await user.click(screen.getByRole('button', { name: 'Kirim Keputusan' }))

    await waitFor(() => expect(api.rejectRequisition).toHaveBeenCalledWith(1, { reason_code: 'DOKUMEN_KURANG' }))
    expect(await screen.findByText('Revisi', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revisi Requisition' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajukan Ulang ke Manager Dept' })).toBeInTheDocument()
  })

  it('revisi: PIC Dept mengajukan ulang dan putaran berikutnya dimulai', async () => {
    api.getRequisition.mockResolvedValue(pr({
      status: 'REVISION', flags: flags({ can_edit: true, can_resubmit: true }), approvals: [history({ action: 'REJECTED', reason_label: 'Dokumen pendukung kurang' })],
      approval: approvalInfo(),
    }))
    api.resubmitRequisition.mockResolvedValue(pr({
      status: 'MANAGER', approval_round: 2, flags: flags(), approvals: [history({ action: 'REJECTED', reason_label: 'Dokumen pendukung kurang' })],
      approval: approvalInfo({ round: 2, awaiting_label: 'Manager Dept' }),
    }))
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/1'])

    await user.click(await screen.findByRole('button', { name: 'Ajukan Ulang ke Manager Dept' }))

    await waitFor(() => expect(api.resubmitRequisition).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Persetujuan · Putaran 2')).toBeInTheDocument()
    expect(screen.getByText('Riwayat putaran sebelumnya')).toBeInTheDocument()
  })

  it('Purchasing memilih tujuan PO lalu meneruskan requisition', async () => {
    api.getRequisition.mockResolvedValue(pr({ status: 'PURCHASING', flags: flags({ can_dispatch: true }), approvals: [history()], awaiting_label: 'Purchasing' }))
    api.dispatchRequisition.mockResolvedValue(pr({
      status: 'DISPATCHED', flags: flags(), approvals: [history()], dispatch_target: 'PO_RMPM_LAPANGAN', dispatch_target_label: 'PO RMPM Lapangan', dispatched_at: '2026-12-22T03:00:00Z',
    }))
    auth.user = { id: 5, name: 'Purchasing', role: 'admin' }
    const user = userEvent.setup()
    shell(['/purchasing/requisitions/1'])

    await user.click(await screen.findByRole('button', { name: 'Dispatch Approval Purchasing' }))
    expect(await screen.findByText('Pilih tujuan PO')).toBeInTheDocument()
    expect(api.dispatchRequisition).not.toHaveBeenCalled()

    expect(screen.getByRole('option', { name: 'PO BOP Supplier' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'PO BOP Lapangan' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Tujuan PO'), 'PO_RMPM_LAPANGAN')
    await user.click(screen.getByRole('button', { name: 'Dispatch Approval Purchasing' }))

    await waitFor(() => expect(api.dispatchRequisition).toHaveBeenCalledWith(1, { target: 'PO_RMPM_LAPANGAN' }))
    expect(await screen.findByText('Diteruskan', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Tujuan PO').closest('.mb-kv')).toHaveTextContent('PO RMPM Lapangan')
    expect(screen.queryByRole('button', { name: 'Dispatch Approval Purchasing' })).not.toBeInTheDocument()
  })

  it('pengguna yang tidak sedang berperan tidak melihat tombol aksi apa pun', async () => {
    api.getRequisition.mockResolvedValue(pr({ status: 'PURCHASING', flags: flags(), approvals: [history()], awaiting_label: 'Purchasing' }))
    shell(['/purchasing/requisitions/1'])

    expect(await screen.findByText('Menunggu Purchasing', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.queryAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Kembali')).toHaveLength(0)
  })

  it('role di luar admin dan supervisor tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Keuangan', role: 'finance' }
    shell(['/purchasing/requisitions/1'])
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getRequisition).not.toHaveBeenCalled()
  })
})
