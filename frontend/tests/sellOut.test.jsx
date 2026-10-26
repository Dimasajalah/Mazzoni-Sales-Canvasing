import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({ getSellOutPanel: vi.fn(), getSellOutTemplate: vi.fn(), uploadSellOut: vi.fn() }))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { SellOutPanel } from '../src/components/SellOutPanel.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'

const PROGRAM = { id: 4, claim_source: 'SELL_OUT' }

const COLUMNS = [
  { name: 'tanggal', label: 'Tanggal transaksi (YYYY-MM-DD atau DD/MM/YYYY)', required: true },
  { name: 'kode_outlet', label: 'Kode outlet (kode customer)', required: true },
  { name: 'qty', label: 'Kuantitas', required: false },
  { name: 'nilai', label: 'Nilai penjualan (Rp)', required: true },
]

const panelData = (over = {}) => ({
  enabled: true, claim_basis: 'SALES_VALUE', claim_basis_label: 'Nilai Penjualan', period: { start: '2026-11-01', end: '2026-11-30' },
  columns: COLUMNS, current: null, latest: null, history: [], calculate_ready: false, ...over,
})

const upload = (over = {}) => ({
  id: 1, filename: 'sellout.csv', status: 'VALID', total_rows: 2, error_count: 0, total_qty: 5, total_amount: 350000, uploaded_by: 'Mgr', errors: [], ...over,
})

const csvFile = (name = 'sellout.csv') => new File(['tanggal,kode_outlet\n'], name, { type: 'text/csv' })

const mount = (program = PROGRAM) =>
  render(
    <UiProvider>
      <PhoneFrame>
        <SellOutPanel program={program} />
      </PhoneFrame>
    </UiProvider>,
  )

const choose = (container, file) => fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } })

beforeEach(() => {
  vi.clearAllMocks()
  api.getSellOutPanel.mockResolvedValue(panelData())
})

describe('Panel Data Sell Out', () => {
  it('tidak muncul dan tidak memanggil server bila sumber data bukan Sell Out', () => {
    mount({ id: 4, claim_source: 'SELL_IN' })
    expect(screen.queryByText('Data Sell Out')).not.toBeInTheDocument()
    expect(api.getSellOutPanel).not.toHaveBeenCalled()
  })

  it('menampilkan periode, kolom template (wajib bertanda *), dan belum ada data valid', async () => {
    mount()

    expect(await screen.findByText(/1 Nov 2026 – 30 Nov 2026/)).toBeInTheDocument()
    expect(screen.getByText('tanggal *')).toBeInTheDocument()
    expect(screen.getByText('nilai *')).toBeInTheDocument()
    expect(screen.getByText('qty')).toBeInTheDocument() // tidak wajib pada basis Nilai Penjualan
    expect(screen.getByText(/basis perhitungan program \(Nilai Penjualan\)/)).toBeInTheDocument()
    expect(screen.getByText(/Belum ada data valid/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload & Validasi' })).toBeDisabled()
  })

  it('mengunduh template baku dengan nama berkas dari server', async () => {
    api.getSellOutTemplate.mockResolvedValue({ filename: 'template-sellout-BDG-2026-001-K02.csv', content: 'tanggal,kode_outlet\r\n' })
    const createUrl = vi.fn(() => 'blob:contoh')
    URL.createObjectURL = createUrl
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    mount()

    await user.click(await screen.findByRole('button', { name: 'Unduh Template' }))

    await waitFor(() => expect(api.getSellOutTemplate).toHaveBeenCalledWith(4))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    const blob = createUrl.mock.calls[0][0]
    expect(blob).toBeInstanceOf(Blob)
    expect(await blob.text()).toBe('tanggal,kode_outlet\r\n')
    click.mockRestore()
  })

  it('memilih berkas menampilkan namanya dan mengaktifkan tombol upload', async () => {
    const { container } = mount()
    await screen.findByText('tanggal *')

    choose(container, csvFile('data-distributor.csv'))

    expect(await screen.findByText('data-distributor.csv')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload & Validasi' })).toBeEnabled()
  })

  it('berkas valid: tampil ringkasan dan status siap untuk Pengajuan Klaim', async () => {
    api.uploadSellOut.mockResolvedValue(upload())
    api.getSellOutPanel
      .mockResolvedValueOnce(panelData())
      .mockResolvedValue(panelData({ current: upload(), latest: upload(), history: [upload()], calculate_ready: true }))
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText('tanggal *')

    choose(container, csvFile())
    await user.click(screen.getByRole('button', { name: 'Upload & Validasi' }))

    await waitFor(() => expect(api.uploadSellOut).toHaveBeenCalledTimes(1))
    const [id, fd] = api.uploadSellOut.mock.calls[0]
    expect(id).toBe(4)
    expect(fd.get('file').name).toBe('sellout.csv')
    expect(await screen.findByText('Data valid: 2 baris')).toBeInTheDocument()
    expect(screen.getByText(/total kuantitas 5 · total nilai Rp 350\.000/)).toBeInTheDocument()
    expect(screen.getByText(/Program siap untuk Pengajuan Klaim/)).toBeInTheDocument()
    expect(screen.queryByText(/Data ditolak/)).not.toBeInTheDocument()
  })

  it('berkas ditolak: setiap baris bermasalah tampil dengan alasannya dan ada petunjuk upload ulang', async () => {
    const rejected = upload({
      status: 'REJECTED', total_rows: 3, error_count: 2,
      errors: [
        { row: 3, field: 'kode_outlet', value: 'NOPE', message: 'Kode outlet tidak terdaftar.' },
        { row: 5, field: 'tanggal', value: '2026-10-31', message: 'Tanggal di luar periode program (2026-11-01 sampai 2026-11-30).' },
      ],
    })
    api.uploadSellOut.mockResolvedValue(rejected)
    api.getSellOutPanel.mockResolvedValueOnce(panelData()).mockResolvedValue(panelData({ latest: rejected, history: [rejected] }))
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText('tanggal *')

    choose(container, csvFile())
    await user.click(screen.getByRole('button', { name: 'Upload & Validasi' }))

    expect(await screen.findByText('Data ditolak: 2 masalah ditemukan')).toBeInTheDocument()
    expect(screen.getByText('Baris 3 · kode_outlet')).toBeInTheDocument()
    expect(screen.getByText(/Kode outlet tidak terdaftar\. \(isi: NOPE\)/)).toBeInTheDocument()
    expect(screen.getByText('Baris 5 · tanggal')).toBeInTheDocument()
    expect(screen.getByText(/Tidak ada baris yang disimpan\. Perbaiki berkas/)).toBeInTheDocument()
    expect(screen.getByText(/Belum ada data valid/)).toBeInTheDocument()
  })

  it('bila masalah lebih banyak dari yang ditampilkan, jumlah sisanya disebutkan', async () => {
    const rejected = upload({
      status: 'REJECTED', total_rows: 9, error_count: 5,
      errors: [{ row: 2, field: 'kode_part', value: 'X', message: 'Kode part tidak ada di Part Master.' }],
    })
    api.getSellOutPanel.mockResolvedValue(panelData({ latest: rejected, history: [rejected] }))
    mount()

    expect(await screen.findByText('dan 4 masalah lainnya')).toBeInTheDocument()
  })

  it('berkas ditolak setelah ada data valid: data valid sebelumnya tetap dipakai', async () => {
    const valid = upload({ id: 1, filename: 'lama.csv' })
    const rejected = upload({ id: 2, filename: 'baru.csv', status: 'REJECTED', error_count: 1, errors: [{ row: 2, field: 'kode_outlet', value: 'X', message: 'Kode outlet tidak terdaftar.' }] })
    api.getSellOutPanel.mockResolvedValue(panelData({ current: valid, latest: rejected, history: [rejected, valid], calculate_ready: true }))
    mount()

    expect(await screen.findByText(/Data valid sebelumnya \(lama\.csv\) tetap dipakai/)).toBeInTheDocument()
    expect(screen.getByText('Data valid: 2 baris')).toBeInTheDocument()
    expect(screen.getByText(/Program siap untuk Pengajuan Klaim/)).toBeInTheDocument()
  })

  it('riwayat berkas menampilkan status tiap berkas', async () => {
    api.getSellOutPanel.mockResolvedValue(panelData({
      history: [upload({ id: 3, filename: 'c.csv', status: 'VALID' }), upload({ id: 2, filename: 'b.csv', status: 'SUPERSEDED' }), upload({ id: 1, filename: 'a.csv', status: 'REJECTED', error_count: 1, errors: [] })],
    }))
    mount()

    expect(await screen.findByText(/c\.csv · Mgr/)).toBeInTheDocument()
    expect(screen.getByText('Digantikan')).toBeInTheDocument()
    expect(screen.getAllByText('Valid').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ditolak').length).toBeGreaterThan(0)
  })

  it('galat dari server saat upload ditampilkan apa adanya', async () => {
    api.uploadSellOut.mockRejectedValue(new Error('Maksimal 5.000 baris per berkas.'))
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText('tanggal *')

    choose(container, csvFile())
    await user.click(screen.getByRole('button', { name: 'Upload & Validasi' }))

    expect(await screen.findByText('Maksimal 5.000 baris per berkas.')).toBeInTheDocument()
  })
})
