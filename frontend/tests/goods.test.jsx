import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getGoodsClaims: vi.fn(), getGoodsClaim: vi.fn(), saveGoodsItems: vi.fn(), checkGoodsStock: vi.fn(), saveGoodsRequisition: vi.fn(),
  confirmGoodsReceipt: vi.fn(), saveGoodsShipment: vi.fn(), saveGoodsIssue: vi.fn(), handOverGoods: vi.fn(), getClaim: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import ClaimDetail from '../src/pages/ClaimDetail.jsx'
import Goods from '../src/pages/Goods.jsx'
import GoodsDetail from '../src/pages/GoodsDetail.jsx'

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/goods" element={<Goods />} />
            <Route path="/marketing/goods/:id" element={<GoodsDetail />} />
            <Route path="/marketing/claims/:id" element={<ClaimDetail />} />
            <Route path="*" element={<div>lain</div>} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const flags = (over = {}) => ({
  can_items: false, can_stock: false, can_requisition: false, can_receive: false, can_shipment: false, can_issue: false, can_handover: false, max_items: 20, ...over,
})

const goods = (over = {}) => ({
  id: 1, status: 'SET',
  items: [{ id: 1, part_num: 'P-001', description: 'Saus botol', qty: '5.00' }, { id: 2, part_num: 'P-002', description: null, qty: '2.50' }],
  stock_available: null, stock_notes: null, stock_checked_at: null, requisition_number: null, received_at: null, shipment_reason_code: null, shipped_at: null,
  issue_reference: null, issued_at: null, recipient_name: null, reference: null, handed_over_at: null, set_at: '2026-12-20T03:00:00Z',
  actors: { set_by: 'Bu Marketing', stock_checked_by: 'Bu Marketing', requisition_by: 'Bu Marketing', received_by: 'Bu Marketing', shipped_by: 'Bu Marketing', issued_by: 'Bu Marketing', handed_over_by: 'Bu Marketing' },
  ...over,
})

const claim = (over = {}) => ({
  id: 1, claim_no: 'CLM-2026-00001', status: 'APPROVED', approved_amount: '10000.00', goods: null, goods_status: null,
  customer: { id: 5, customer_code: 'D1', name: 'Distributor D1' }, program: { id: 7, event_code: 'BDG-2026-001-K02' }, flags: flags({ can_items: true }), ...over,
})

const atSet = () => claim({ goods: goods(), goods_status: 'SET', flags: flags({ can_items: true, can_stock: true }) })
const atRequisition = (over = {}, f = {}) => claim({
  goods: goods({ status: 'REQUISITION', stock_available: false, stock_checked_at: '2026-12-21T03:00:00Z', ...over }), goods_status: 'REQUISITION', flags: flags({ can_requisition: true, ...f }),
})
const atReady = (over = {}) => claim({
  goods: goods({ status: 'READY', stock_available: true, stock_checked_at: '2026-12-21T03:00:00Z', ...over }), goods_status: 'READY', flags: flags({ can_shipment: true }),
})
const atShipped = () => claim({
  goods: goods({ status: 'SHIPPED', stock_available: true, stock_checked_at: '2026-12-21T03:00:00Z', shipment_reason_code: 'REWARD', shipped_at: '2026-12-22T03:00:00Z' }),
  goods_status: 'SHIPPED', flags: flags({ can_issue: true }),
})
const atIssued = () => claim({
  goods: goods({ status: 'ISSUED', stock_available: true, stock_checked_at: '2026-12-21T03:00:00Z', shipment_reason_code: 'REWARD', shipped_at: '2026-12-22T03:00:00Z', issue_reference: 'ISS-0001', issued_at: '2026-12-23T03:00:00Z' }),
  goods_status: 'ISSUED', flags: flags({ can_handover: true }),
})
const done = () => claim({
  status: 'DISBURSED', goods_status: 'HANDED_OVER',
  goods: goods({
    status: 'HANDED_OVER', stock_available: true, stock_checked_at: '2026-12-21T03:00:00Z', shipment_reason_code: 'REWARD', shipped_at: '2026-12-22T03:00:00Z',
    issue_reference: 'ISS-0001', issued_at: '2026-12-23T03:00:00Z', recipient_name: 'Pak Budi', reference: 'CLM-2026-00001 / Pak Budi', handed_over_at: '2026-12-24T03:00:00Z',
  }),
  flags: flags(),
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Mgr', role: 'supervisor' }
  api.getGoodsClaim.mockResolvedValue(claim())
})

describe('Daftar klaim Barang', () => {
  it('menampilkan jumlah klaim dan tiap klaim dengan status dan jumlah jenis barangnya', async () => {
    api.getGoodsClaims.mockResolvedValue([
      claim(),
      claim({ id: 2, claim_no: 'CLM-2026-00002', goods_status: 'REQUISITION', items_count: 2, customer: { id: 6, customer_code: 'D2', name: 'Distributor D2' } }),
    ])
    shell(['/marketing/goods'])

    expect(await screen.findByText('Distributor D1')).toBeInTheDocument()
    expect(screen.getByTestId('goods-count')).toHaveTextContent('2')
    expect(screen.getByText('Reward belum diatur')).toBeInTheDocument()
    expect(screen.getByText('2 jenis barang')).toBeInTheDocument()
    expect(screen.getByText('Menunggu Requisition')).toBeInTheDocument()
  })

  it('pencarian memanggil server dengan kata kunci', async () => {
    api.getGoodsClaims.mockResolvedValue([claim()])
    const user = userEvent.setup()
    shell(['/marketing/goods'])

    await screen.findByText('Distributor D1')
    await user.type(screen.getByLabelText('Cari klaim'), 'Makmur')
    await waitFor(() => expect(api.getGoodsClaims).toHaveBeenCalledWith({ q: 'Makmur' }))
  })

  it('tidak ada klaim: tampilan kosong', async () => {
    api.getGoodsClaims.mockResolvedValue([])
    shell(['/marketing/goods'])
    expect(await screen.findByText('Tidak ada klaim Barang yang menunggu pencairan.')).toBeInTheDocument()
  })

  it('mengetuk klaim membuka halaman pencairannya', async () => {
    api.getGoodsClaims.mockResolvedValue([claim()])
    const user = userEvent.setup()
    shell(['/marketing/goods'])

    await user.click(await screen.findByText('Distributor D1'))
    await waitFor(() => expect(api.getGoodsClaim).toHaveBeenCalledWith('1'))
    expect(await screen.findByText('Reward: Jenis dan Jumlah Barang')).toBeInTheDocument()
  })

  it('hanya admin dan supervisor; finance dan sales tidak memuat data', async () => {
    for (const role of ['finance', 'sales']) {
      auth.user = { id: 2, name: role, role }
      const view = shell(['/marketing/goods'])
      expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
      view.unmount()
    }
    expect(api.getGoodsClaims).not.toHaveBeenCalled()

    auth.user = { id: 3, name: 'Admin', role: 'admin' }
    api.getGoodsClaims.mockResolvedValue([])
    shell(['/marketing/goods'])
    await waitFor(() => expect(api.getGoodsClaims).toHaveBeenCalled())
  })
})

describe('Langkah 01: Reward (jenis dan jumlah barang)', () => {
  it('awalnya hanya ada form Reward dengan satu baris kosong', async () => {
    shell(['/marketing/goods/1'])

    expect(await screen.findByTestId('approved')).toHaveTextContent('Rp 10.000')
    expect(screen.getByLabelText('Kode part 1')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Simpan Reward' })).toBeInTheDocument()
    expect(screen.queryByText('Check Stock (warehouse Marketing)')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hapus barang 1' })).not.toBeInTheDocument() // minimal satu baris
  })

  it('validasi: kode part, jumlah, dan kode ganda', async () => {
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])
    const save = () => user.click(screen.getByRole('button', { name: 'Simpan Reward' }))

    await screen.findByLabelText('Kode part 1')
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
    expect(api.saveGoodsItems).not.toHaveBeenCalled()
  })

  it('menyimpan dua barang mengirim payload yang benar dan membuka langkah Check Stock', async () => {
    api.saveGoodsItems.mockResolvedValue(atSet())
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])

    await user.type(await screen.findByLabelText('Kode part 1'), 'P-001')
    await user.type(screen.getByLabelText('Jumlah 1'), '5')
    await user.type(screen.getByLabelText('Keterangan 1'), 'Saus botol')
    await user.click(screen.getByRole('button', { name: '+ Tambah Barang' }))
    await user.type(screen.getByLabelText('Kode part 2'), 'P-002')
    await user.type(screen.getByLabelText('Jumlah 2'), '2,5')
    await user.click(screen.getByRole('button', { name: 'Simpan Reward' }))

    await waitFor(() => expect(api.saveGoodsItems).toHaveBeenCalledWith(1, [
      { part_num: 'P-001', qty: 5, description: 'Saus botol' },
      { part_num: 'P-002', qty: 2.5 },
    ]))
    expect(await screen.findByText('Check Stock (warehouse Marketing)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ubah Reward' })).toBeInTheDocument()
  })

  it('baris barang bisa dihapus dan Reward yang sudah ada terisi kembali', async () => {
    api.getGoodsClaim.mockResolvedValue(atSet())
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])

    expect(await screen.findByLabelText('Kode part 1')).toHaveValue('P-001')
    expect(screen.getByLabelText('Jumlah 1')).toHaveValue('5')
    expect(screen.getByLabelText('Keterangan 1')).toHaveValue('Saus botol')
    expect(screen.getByLabelText('Kode part 2')).toHaveValue('P-002')

    await user.click(screen.getByRole('button', { name: 'Hapus barang 1' }))
    expect(screen.getByLabelText('Kode part 1')).toHaveValue('P-002')
    expect(screen.queryByLabelText('Kode part 2')).not.toBeInTheDocument()
  })

  it('galat dari server (kode part tidak ada di Part Master) ditampilkan apa adanya', async () => {
    api.saveGoodsItems.mockRejectedValue(new Error('Kode part XYZ tidak ada di Part Master.'))
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])

    await user.type(await screen.findByLabelText('Kode part 1'), 'XYZ')
    await user.type(screen.getByLabelText('Jumlah 1'), '1')
    await user.click(screen.getByRole('button', { name: 'Simpan Reward' }))
    expect(await screen.findByText('Kode part XYZ tidak ada di Part Master.')).toBeInTheDocument()
  })

  it('setelah Check Stock, Reward hanya terbaca', async () => {
    api.getGoodsClaim.mockResolvedValue(atReady())
    shell(['/marketing/goods/1'])

    expect(await screen.findByText('P-001 · Saus botol')).toBeInTheDocument()
    expect(screen.queryByLabelText('Kode part 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ubah Reward' })).not.toBeInTheDocument()
  })
})

describe('Langkah 02-03: Check Stock dan Requisition', () => {
  it('Stok Tersedia mengirim hasil beserta catatan dan membuka Misc. Shipment', async () => {
    api.getGoodsClaim.mockResolvedValue(atSet())
    api.checkGoodsStock.mockResolvedValue(atReady({ stock_notes: 'Stok cukup' }))
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])

    await user.type(await screen.findByLabelText('Catatan (opsional)'), 'Stok cukup')
    await user.click(screen.getByRole('button', { name: 'Stok Tersedia' }))

    await waitFor(() => expect(api.checkGoodsStock).toHaveBeenCalledWith(1, { available: true, notes: 'Stok cukup' }))
    expect(await screen.findByText('Stok tersedia', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByText('Misc. Shipment', { selector: '.mb-sec-t' })).toBeInTheDocument()
    expect(screen.queryByText('Requisition (PR01)')).not.toBeInTheDocument() // stok ada: tidak perlu Requisition
  })

  it('Stok Tidak Tersedia membuka Requisition (PR01)', async () => {
    api.getGoodsClaim.mockResolvedValue(atSet())
    api.checkGoodsStock.mockResolvedValue(atRequisition())
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])

    await user.click(await screen.findByRole('button', { name: 'Stok Tidak Tersedia' }))

    await waitFor(() => expect(api.checkGoodsStock).toHaveBeenCalledWith(1, { available: false }))
    expect(await screen.findByText('Requisition (PR01)')).toBeInTheDocument()
    expect(screen.getByText('Stok tidak tersedia', { selector: 'b' })).toBeInTheDocument()
    expect(screen.queryByText('Misc. Shipment', { selector: '.mb-sec-t' })).not.toBeInTheDocument() // barang belum siap
  })

  it('nomor Requisition wajib; setelah disimpan barang bisa ditandai di-receipt hingga siap', async () => {
    api.getGoodsClaim.mockResolvedValue(atRequisition())
    api.saveGoodsRequisition.mockResolvedValue(atRequisition({ requisition_number: 'PR-0001' }, { can_receive: true }))
    // stok tetap tercatat "tidak tersedia" setelah barang di-receipt, jadi bagian Requisition tetap tampil sebagai ringkasan
    api.confirmGoodsReceipt.mockResolvedValue(atReady({ stock_available: false, requisition_number: 'PR-0001', received_at: '2026-12-22T03:00:00Z' }))
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])

    expect(screen.queryByRole('button', { name: 'Barang Sudah Di-receipt' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Simpan Requisition' }))
    expect(await screen.findByText('Isi nomor Requisition')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nomor Requisition (PR01)'), 'PR-0001')
    await user.click(screen.getByRole('button', { name: 'Simpan Requisition' }))
    await waitFor(() => expect(api.saveGoodsRequisition).toHaveBeenCalledWith(1, { requisition_number: 'PR-0001' }))

    await user.click(await screen.findByRole('button', { name: 'Barang Sudah Di-receipt' }))
    await waitFor(() => expect(api.confirmGoodsReceipt).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Misc. Shipment', { selector: '.mb-sec-t' })).toBeInTheDocument()
    expect(screen.getByText('Nomor Requisition').closest('.mb-kv')).toHaveTextContent('PR-0001')
  })
})

describe('Langkah 04-05: Misc. Shipment dan Issue Misc. Material', () => {
  it('Reason Code wajib; Misc. Shipment mengirim kode dan membuka Issue Misc. Material', async () => {
    api.getGoodsClaim.mockResolvedValue(atReady())
    api.saveGoodsShipment.mockResolvedValue(atShipped())
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])

    await user.click(await screen.findByRole('button', { name: 'Catat Misc. Shipment' }))
    expect(await screen.findByText('Isi Reason Code')).toBeInTheDocument()
    expect(api.saveGoodsShipment).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Reason Code'), 'REWARD')
    await user.click(screen.getByRole('button', { name: 'Catat Misc. Shipment' }))

    await waitFor(() => expect(api.saveGoodsShipment).toHaveBeenCalledWith(1, { reason_code: 'REWARD' }))
    expect(await screen.findByText('Issue Misc. Material', { selector: '.mb-sec-t' })).toBeInTheDocument()
    expect(screen.getByText('Reason Code').closest('.mb-kv')).toHaveTextContent('REWARD')
  })

  it('nomor dokumen Issue wajib; Issue Misc. Material mengirim nomor dan membuka serah terima', async () => {
    api.getGoodsClaim.mockResolvedValue(atShipped())
    api.saveGoodsIssue.mockResolvedValue(atIssued())
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])

    await user.click(await screen.findByRole('button', { name: 'Catat Issue Misc. Material' }))
    expect(await screen.findByText('Isi nomor dokumen Issue Misc. Material')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nomor Dokumen Issue'), 'ISS-0001')
    await user.click(screen.getByRole('button', { name: 'Catat Issue Misc. Material' }))

    await waitFor(() => expect(api.saveGoodsIssue).toHaveBeenCalledWith(1, { issue_reference: 'ISS-0001' }))
    expect(await screen.findByText('Code Klaim & Penerima')).toBeInTheDocument()
  })
})

describe('Langkah 06: Code Klaim, penerima, dan bukti serah terima', () => {
  const proof = () => new File(['bukti'], 'serah-terima.pdf', { type: 'application/pdf' })

  it('penerima dan bukti wajib; Reference berisi kode klaim dan nama penerima', async () => {
    api.getGoodsClaim.mockResolvedValue(atIssued())
    const user = userEvent.setup()
    shell(['/marketing/goods/1'])

    await user.click(await screen.findByRole('button', { name: 'Selesaikan Pencairan' }))
    expect(await screen.findByText('Isi nama penerima')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nama Penerima'), 'Pak Budi')
    expect(screen.getByText('Reference').closest('.cl-res-row')).toHaveTextContent('CLM-2026-00001 / Pak Budi')
    await user.click(screen.getByRole('button', { name: 'Selesaikan Pencairan' }))
    expect(await screen.findByText('Lampirkan bukti serah terima barang')).toBeInTheDocument()
    expect(api.handOverGoods).not.toHaveBeenCalled()
  })

  it('mengirim nama penerima dan berkas bukti, lalu klaim Dicairkan', async () => {
    api.getGoodsClaim.mockResolvedValue(atIssued())
    api.handOverGoods.mockResolvedValue(done())
    const user = userEvent.setup()
    const { container } = shell(['/marketing/goods/1'])

    await user.type(await screen.findByLabelText('Nama Penerima'), 'Pak Budi')
    await user.upload(container.querySelector('input[type="file"]'), proof())
    expect(await screen.findByText('serah-terima.pdf')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Selesaikan Pencairan' }))

    await waitFor(() => expect(api.handOverGoods).toHaveBeenCalledTimes(1))
    const [claimId, fd] = api.handOverGoods.mock.calls[0]
    expect(claimId).toBe(1)
    expect(fd.get('recipient_name')).toBe('Pak Budi')
    expect(fd.getAll('files[]')).toHaveLength(1)
    expect(fd.getAll('files[]')[0].name).toBe('serah-terima.pdf')

    expect(await screen.findByText('Dicairkan', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Reference').closest('.mb-kv')).toHaveTextContent('CLM-2026-00001 / Pak Budi')
    expect(screen.getByText(/Klaim dicairkan oleh Bu Marketing/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Selesaikan Pencairan' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nama Penerima')).not.toBeInTheDocument()
  })

  it('galat dari server ditampilkan apa adanya', async () => {
    api.getGoodsClaim.mockResolvedValue(atIssued())
    api.handOverGoods.mockRejectedValue(new Error('Serah terima hanya dicatat setelah barang dikeluarkan (Issue Misc. Material).'))
    const user = userEvent.setup()
    const { container } = shell(['/marketing/goods/1'])

    await user.type(await screen.findByLabelText('Nama Penerima'), 'Pak Budi')
    await user.upload(container.querySelector('input[type="file"]'), proof())
    await user.click(screen.getByRole('button', { name: 'Selesaikan Pencairan' }))
    expect(await screen.findByText(/hanya dicatat setelah barang dikeluarkan/)).toBeInTheDocument()
  })

  it('klaim yang sudah Dicairkan menampilkan ringkasan semua langkah dan tanpa formulir', async () => {
    api.getGoodsClaim.mockResolvedValue(done())
    shell(['/marketing/goods/1'])

    expect(await screen.findByText('Dicairkan', { selector: '.mb-badge' })).toBeInTheDocument()
    expect(screen.getByText('Hasil').closest('.mb-kv')).toHaveTextContent('Stok tersedia')
    expect(screen.getByText('Reason Code').closest('.mb-kv')).toHaveTextContent('REWARD')
    expect(screen.getByText('Nomor dokumen').closest('.mb-kv')).toHaveTextContent('ISS-0001')
    expect(screen.getByText('Penerima').closest('.mb-kv')).toHaveTextContent('Pak Budi')
    expect(screen.queryAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Kembali')).toHaveLength(0) // tidak ada tombol aksi lagi
  })

  it('role di luar admin dan supervisor tidak memuat data', async () => {
    auth.user = { id: 2, name: 'Keuangan', role: 'finance' }
    shell(['/marketing/goods/1'])
    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getGoodsClaim).not.toHaveBeenCalled()
  })
})

describe('Detail pengajuan klaim', () => {
  const approvedClaim = (status, attachments = []) => ({
    id: 1, claim_no: 'CLM-2026-00001', status, is_late: false, letter_received_date: '2026-12-10', claimed_amount: '12000.00', eligible_amount: '10000.00',
    difference_amount: '2000.00', approved_amount: '10000.00', payout_method: 'BARANG', payout_method_label: 'Barang', final_confirmed_at: '2026-12-23T03:00:00Z',
    customer: { id: 5, customer_code: 'D1', name: 'Distributor D1' },
    program: { id: 7, event_code: 'BDG-2026-001-K02', claim_type_label: 'Reward', claim_source_label: 'Sell Out', claim_basis_label: 'Nilai Penjualan', claim_rate: '2.50', claim_rate_type: 'PERCENT', claim_deadline: '2026-12-15' },
    calc_detail: null, approvals: [], attachments, diff_confirmed_at: '2026-12-12T03:00:00Z', flags: { reason_codes: {}, payout_methods: [], approval: { levels: [], can_finalize: false } },
  })

  it('klaim Disetujui bermetode Barang menampilkan tombol menuju pencairan barang', async () => {
    api.getClaim.mockResolvedValue(approvedClaim('APPROVED'))
    shell(['/marketing/claims/1'])

    expect(await screen.findByRole('button', { name: 'Buka Pencairan Barang' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buka Pencairan Transfer' })).not.toBeInTheDocument()
  })

  it('bukti serah terima terlampir tampil pada daftar dokumen klaim', async () => {
    api.getClaim.mockResolvedValue(approvedClaim('DISBURSED', [{ id: 9, kind: 'HANDOVER', filename: 'serah-terima.pdf', size: 2048 }]))
    shell(['/marketing/claims/1'])

    expect(await screen.findByText('serah-terima.pdf')).toBeInTheDocument()
    expect(screen.getByText(/Serah Terima Barang · 2 KB/)).toBeInTheDocument()
    expect(screen.getByText('Dicairkan', { selector: '.mb-badge' })).toBeInTheDocument()
  })
})
