import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getMaterialIssues: vi.fn(), getMaterialIssue: vi.fn(), createMaterialIssue: vi.fn(), updateMaterialIssue: vi.fn(), completeMaterialIssue: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import IssueMaterialDetail from '../src/pages/IssueMaterialDetail.jsx'
import IssueMaterialForm from '../src/pages/IssueMaterialForm.jsx'
import IssueMaterials from '../src/pages/IssueMaterials.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/issues" element={<IssueMaterials />} />
            <Route path="/marketing/issues/new" element={<IssueMaterialForm />} />
            <Route path="/marketing/issues/:id" element={<IssueMaterialDetail />} />
            <Route path="/marketing/issues/:id/edit" element={<IssueMaterialForm />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const TYPES = [{ value: 'SALES', label: 'Sales' }, { value: 'CUSTOMER', label: 'Customer' }]

const issue = (over = {}) => ({
  id: 1, issue_no: 'IS-2026-00001', issue_reference: 'ISS-2026-0001', requester_name: 'Bu Rina (Sales Surabaya)', notes: 'Permintaan lewat WhatsApp', status: 'ISSUED',
  creator: { name: 'Bu Marketing' }, items: [
    { id: 1, part_num: 'P-001', description: 'Sample saus', qty: '12.00' }, { id: 2, part_num: 'P-002', description: null, qty: '2.50' },
  ],
  recipient_type: null, recipient_name: null, purpose: null, remarks: null, completed_at: null,
  awaiting_label: 'Marketing (input nama sales atau customer dan peruntukannya)', flags: { can_edit: true, can_complete: true }, recipient_types: TYPES, ...over,
})

const done = () => issue({
  status: 'DONE', recipient_type: 'SALES', recipient_name: 'Budi Santoso', purpose: 'Dibagikan ke calon pelanggan',
  remarks: 'Budi Santoso (Sales) / Dibagikan ke calon pelanggan', completed_at: '2026-12-23T03:00:00Z', awaiting_label: null, flags: { can_edit: false, can_complete: false },
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Sup', role: 'supervisor' }
  api.getMaterialIssue.mockResolvedValue(issue())
})

describe('Daftar issue', () => {
  const rows = () => [
    { id: 1, issue_no: 'IS-2026-00001', issue_reference: 'ISS-2026-0001', remarks: null, status: 'ISSUED', items_count: 2, awaiting_label: 'Marketing (input nama sales atau customer dan peruntukannya)', can_act: true },
    { id: 2, issue_no: 'IS-2026-00002', issue_reference: 'ISS-2026-0002', remarks: 'Budi Santoso (Sales) / Uji coba', status: 'DONE', items_count: 1, awaiting_label: null, can_act: false },
  ]

  it('menampilkan jumlah yang menunggu Remarks, nomor dokumen, dan Remarks bila sudah selesai', async () => {
    api.getMaterialIssues.mockResolvedValue(rows())
    shell(['/marketing/issues'])

    expect(await screen.findByText('IS-2026-00001')).toBeInTheDocument()
    expect(screen.getByTestId('waiting-count')).toHaveTextContent('1')
    expect(screen.getByText('dari 2 pengeluaran barang (Issue Misc. Material)')).toBeInTheDocument()
    expect(screen.getByText('ISS-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('ISS-2026-0002 · Budi Santoso (Sales) / Uji coba')).toBeInTheDocument()
    expect(screen.getByText('Menunggu Remarks', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Selesai', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getAllByText('Perlu tindakan Anda')).toHaveLength(1)
  })

  it('pencarian memanggil server dengan kata kunci', async () => {
    api.getMaterialIssues.mockResolvedValue(rows())
    const user = userEvent.setup()
    shell(['/marketing/issues'])

    await screen.findByText('IS-2026-00001')
    await user.type(screen.getByLabelText('Cari issue'), 'Budi')
    await waitFor(() => expect(api.getMaterialIssues).toHaveBeenCalledWith({ q: 'Budi' }))
  })

  it('tidak ada issue: tampilan kosong', async () => {
    api.getMaterialIssues.mockResolvedValue([])
    shell(['/marketing/issues'])
    expect(await screen.findByText('Belum ada issue.')).toBeInTheDocument()
  })

  it('Catat Issue membuka form dan mengetuk kartu membuka detailnya', async () => {
    api.getMaterialIssues.mockResolvedValue(rows())
    const user = userEvent.setup()
    const view = shell(['/marketing/issues'])

    await user.click(await screen.findByRole('button', { name: 'Catat Issue' }))
    expect(await screen.findByText('Issue Misc. Material', { selector: '.mb-sec-t' })).toBeInTheDocument()
    view.unmount()

    shell(['/marketing/issues'])
    await user.click(await screen.findByText('IS-2026-00002'))
    await waitFor(() => expect(api.getMaterialIssue).toHaveBeenCalledWith('2'))
  })

  it('hanya admin dan supervisor; warehouse, finance, dan sales tidak memuat data', async () => {
    for (const role of ['warehouse', 'finance', 'sales']) {
      auth.user = { id: 2, name: role, role }
      const view = shell(['/marketing/issues'])
      expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
      view.unmount()
    }
    expect(api.getMaterialIssues).not.toHaveBeenCalled()
  })
})

describe('Form issue (langkah 02)', () => {
  it('validasi berurutan: nomor dokumen, kode part, jumlah, dan kode ganda', async () => {
    const user = userEvent.setup()
    shell(['/marketing/issues/new'])
    const save = () => user.click(screen.getByRole('button', { name: 'Simpan Issue' }))

    await screen.findByLabelText('Nomor Dokumen Issue Misc. Material')
    await save()
    expect(await screen.findByText('Isi nomor dokumen Issue Misc. Material')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nomor Dokumen Issue Misc. Material'), 'ISS-2026-0001')
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
    expect(api.createMaterialIssue).not.toHaveBeenCalled()
  })

  it('menyimpan issue mengirim payload yang benar (peminta opsional) lalu membuka detail', async () => {
    api.createMaterialIssue.mockResolvedValue(issue({ id: 4 }))
    api.getMaterialIssue.mockResolvedValue(issue({ id: 4, issue_no: 'IS-2026-00004' }))
    const user = userEvent.setup()
    shell(['/marketing/issues/new'])

    await user.type(await screen.findByLabelText('Nomor Dokumen Issue Misc. Material'), 'ISS-2026-0004')
    await user.type(screen.getByLabelText('Peminta (opsional)'), 'Bu Rina')
    await user.type(screen.getByLabelText('Kode part 1'), 'P-001')
    await user.type(screen.getByLabelText('Jumlah 1'), '12')
    await user.type(screen.getByLabelText('Keterangan 1'), 'Sample saus')
    await user.click(screen.getByRole('button', { name: 'Simpan Issue' }))

    await waitFor(() => expect(api.createMaterialIssue).toHaveBeenCalledWith({
      issue_reference: 'ISS-2026-0004', requester_name: 'Bu Rina', items: [{ part_num: 'P-001', qty: 12, description: 'Sample saus' }],
    }))
    expect(await screen.findByText('IS-2026-00004')).toBeInTheDocument()
  })

  it('tanpa peminta dan catatan, keduanya tidak ikut dikirim', async () => {
    api.createMaterialIssue.mockResolvedValue(issue({ id: 5 }))
    api.getMaterialIssue.mockResolvedValue(issue({ id: 5 }))
    const user = userEvent.setup()
    shell(['/marketing/issues/new'])

    await user.type(await screen.findByLabelText('Nomor Dokumen Issue Misc. Material'), 'ISS-X')
    await user.type(screen.getByLabelText('Kode part 1'), 'P-001')
    await user.type(screen.getByLabelText('Jumlah 1'), '1')
    await user.click(screen.getByRole('button', { name: 'Simpan Issue' }))

    await waitFor(() => expect(api.createMaterialIssue).toHaveBeenCalledWith({ issue_reference: 'ISS-X', items: [{ part_num: 'P-001', qty: 1 }] }))
  })

  it('galat dari server ditampilkan apa adanya dan pengguna tetap di form', async () => {
    api.createMaterialIssue.mockRejectedValue(new Error('Kode part XYZ tidak ada di Part Master.'))
    const user = userEvent.setup()
    shell(['/marketing/issues/new'])

    await user.type(await screen.findByLabelText('Nomor Dokumen Issue Misc. Material'), 'ISS-X')
    await user.type(screen.getByLabelText('Kode part 1'), 'XYZ')
    await user.type(screen.getByLabelText('Jumlah 1'), '1')
    await user.click(screen.getByRole('button', { name: 'Simpan Issue' }))

    expect(await screen.findByText('Kode part XYZ tidak ada di Part Master.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simpan Issue' })).toBeInTheDocument()
  })

  it('mode ubah: data terisi kembali dan perubahan dikirim lewat update', async () => {
    api.updateMaterialIssue.mockResolvedValue(issue())
    const user = userEvent.setup()
    shell(['/marketing/issues/1/edit'])

    expect(await screen.findByText('Ubah Issue')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Nomor Dokumen Issue Misc. Material')).toHaveValue('ISS-2026-0001'))
    expect(screen.getByLabelText('Peminta (opsional)')).toHaveValue('Bu Rina (Sales Surabaya)')
    expect(screen.getByLabelText('Kode part 2')).toHaveValue('P-002')

    await user.clear(screen.getByLabelText('Nomor Dokumen Issue Misc. Material'))
    await user.type(screen.getByLabelText('Nomor Dokumen Issue Misc. Material'), 'ISS-2026-0099')
    await user.click(screen.getByRole('button', { name: 'Simpan Issue' }))

    await waitFor(() => expect(api.updateMaterialIssue).toHaveBeenCalledTimes(1))
    const [id, payload] = api.updateMaterialIssue.mock.calls[0]
    expect(id).toBe('1')
    expect(payload.issue_reference).toBe('ISS-2026-0099')
    expect(api.createMaterialIssue).not.toHaveBeenCalled()
  })

  it('baris barang bisa ditambah dan dihapus', async () => {
    const user = userEvent.setup()
    shell(['/marketing/issues/new'])

    await screen.findByLabelText('Kode part 1')
    expect(screen.queryByRole('button', { name: 'Hapus barang 1' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Tambah Barang' }))
    await user.type(screen.getByLabelText('Kode part 2'), 'P-002')
    await user.click(screen.getByRole('button', { name: 'Hapus barang 1' }))
    expect(screen.getByLabelText('Kode part 1')).toHaveValue('P-002')
  })
})

describe('Detail issue: Remarks (langkah 03)', () => {
  it('menampilkan issue, barang, peminta, dan form Remarks', async () => {
    shell(['/marketing/issues/1'])

    expect(await screen.findByText('IS-2026-00001')).toBeInTheDocument()
    expect(screen.getByText('Issue Misc. Material ISS-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('Peminta').closest('.mb-kv')).toHaveTextContent('Bu Rina (Sales Surabaya)')
    expect(screen.getByText('1. P-001').closest('span')).toHaveTextContent('1. P-001 · Sample saus')
    expect(screen.getByRole('button', { name: 'Ubah Issue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simpan Remarks' })).toBeInTheDocument()
  })

  it('jenis penerima, nama, dan peruntukan wajib; Remarks berisi ketiganya', async () => {
    api.completeMaterialIssue.mockResolvedValue(done())
    const user = userEvent.setup()
    shell(['/marketing/issues/1'])

    await user.click(await screen.findByRole('button', { name: 'Simpan Remarks' }))
    expect(await screen.findByText('Pilih Sales atau Customer')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Jenis Penerima'), 'SALES')
    await user.click(screen.getByRole('button', { name: 'Simpan Remarks' }))
    expect(await screen.findByText('Isi nama sales')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nama Sales'), 'Budi Santoso')
    await user.click(screen.getByRole('button', { name: 'Simpan Remarks' }))
    expect(await screen.findByText('Isi peruntukan')).toBeInTheDocument()
    expect(api.completeMaterialIssue).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Peruntukan'), 'Dibagikan ke calon pelanggan')
    expect(screen.getByText('Remarks').closest('.cl-res-row')).toHaveTextContent('Budi Santoso (Sales) / Dibagikan ke calon pelanggan')
    await user.click(screen.getByRole('button', { name: 'Simpan Remarks' }))

    await waitFor(() => expect(api.completeMaterialIssue).toHaveBeenCalledWith(1, {
      recipient_type: 'SALES', recipient_name: 'Budi Santoso', purpose: 'Dibagikan ke calon pelanggan',
    }))
    expect(await screen.findByText('Selesai', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Remarks').closest('.mb-kv')).toHaveTextContent('Budi Santoso (Sales) / Dibagikan ke calon pelanggan')
    expect(screen.queryByRole('button', { name: 'Simpan Remarks' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ubah Issue' })).not.toBeInTheDocument()
  })

  it('memilih Customer mengubah label nama dan pesan validasinya', async () => {
    api.completeMaterialIssue.mockResolvedValue(done())
    const user = userEvent.setup()
    shell(['/marketing/issues/1'])

    await user.selectOptions(await screen.findByLabelText('Jenis Penerima'), 'CUSTOMER')
    expect(screen.getByLabelText('Nama Customer')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nama Sales')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simpan Remarks' }))
    expect(await screen.findByText('Isi nama customer')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nama Customer'), 'Toko Maju Jaya')
    await user.type(screen.getByLabelText('Peruntukan'), 'Display di toko')
    expect(screen.getByText('Remarks').closest('.cl-res-row')).toHaveTextContent('Toko Maju Jaya (Customer) / Display di toko')
    await user.click(screen.getByRole('button', { name: 'Simpan Remarks' }))
    await waitFor(() => expect(api.completeMaterialIssue).toHaveBeenCalledWith(1, { recipient_type: 'CUSTOMER', recipient_name: 'Toko Maju Jaya', purpose: 'Display di toko' }))
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.completeMaterialIssue.mockRejectedValue(new Error('Remarks sudah diisi.'))
    const user = userEvent.setup()
    shell(['/marketing/issues/1'])

    await user.selectOptions(await screen.findByLabelText('Jenis Penerima'), 'SALES')
    await user.type(screen.getByLabelText('Nama Sales'), 'Budi')
    await user.type(screen.getByLabelText('Peruntukan'), 'Uji')
    await user.click(screen.getByRole('button', { name: 'Simpan Remarks' }))
    expect(await screen.findByText('Remarks sudah diisi.')).toBeInTheDocument()
  })

  it('issue yang selesai menampilkan Remarks tanpa tombol aksi', async () => {
    api.getMaterialIssue.mockResolvedValue(done())
    shell(['/marketing/issues/1'])

    expect(await screen.findByText('Selesai', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Remarks').closest('.mb-kv')).toHaveTextContent('Budi Santoso (Sales) / Dibagikan ke calon pelanggan')
    expect(screen.queryAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Kembali')).toHaveLength(0)
  })

  it('role di luar admin dan supervisor tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Gudang', role: 'warehouse' }
    shell(['/marketing/issues/1'])
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getMaterialIssue).not.toHaveBeenCalled()
  })
})
