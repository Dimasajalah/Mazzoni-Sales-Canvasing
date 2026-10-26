import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({ getExpense: vi.fn(), updateExpenseStatus: vi.fn(), getExpenses: vi.fn() }))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import { fmtRp } from '../src/lib/format.js'
import ExpenseDetail from '../src/pages/ExpenseDetail.jsx'
import Expenses from '../src/pages/Expenses.jsx'

const shell = (entry = '/expenses/1') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/expenses/new" element={<div>form baru</div>} />
            <Route path="/expenses/:id" element={<ExpenseDetail />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const exp = (over = {}) => ({
  id: 1, expense_number: 'EXP-STG-2026-000006', status: 'SUBMITTED', category: 'bensin', amount: '50000.00', note: 'Kunjungan Surabaya',
  expense_date: '2026-10-22', salesperson: { name: 'Budi Santoso' }, customer: { name: 'PT Global Sukses' },
  attachments: [{ id: 1, path: 'expenses/1/nota.jpg', filename: 'nota.jpg', mime: 'image/jpeg' }],
  statusHistories: [{ id: 1, from_status: null, to_status: 'SUBMITTED', notes: 'Expense created', created_at: '2026-10-22T03:00:00Z' }],
  actions: ['APPROVED', 'REJECTED'], ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_API_URL', '/api/v1') // tidak bergantung pada .env komputer yang menjalankan tes
  api.getExpense.mockResolvedValue(exp())
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => vi.unstubAllEnvs())

describe('Detail expense: tampilan', () => {
  it('menampilkan data, foto bukti, dan riwayat', async () => {
    api.getExpense.mockResolvedValue(exp({
      status: 'APPROVED',
      statusHistories: [
        { id: 1, from_status: null, to_status: 'SUBMITTED', notes: 'Expense created', created_at: '2026-10-22T03:00:00Z' },
        { id: 2, from_status: 'SUBMITTED', to_status: 'APPROVED', notes: 'Nota jelas', created_at: '2026-10-22T04:00:00Z' },
      ],
    }))
    shell()

    expect(await screen.findByText('EXP-STG-2026-000006')).toBeInTheDocument()
    expect(api.getExpense).toHaveBeenCalledWith('1')
    expect(screen.getByText(fmtRp('50000.00'))).toBeInTheDocument()
    expect(screen.getByText('bensin')).toBeInTheDocument()
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    expect(screen.getByText('PT Global Sukses')).toBeInTheDocument()
    expect(screen.getByText('Kunjungan Surabaya')).toBeInTheDocument()
    expect(screen.getByAltText('nota.jpg')).toHaveAttribute('src', '/storage/expenses/1/nota.jpg')
    expect(screen.getByText('Menunggu → Disetujui')).toBeInTheDocument()
    expect(screen.getByText(/Nota jelas/)).toBeInTheDocument()
  })

  it('expense lama tanpa foto menampilkan keterangan', async () => {
    api.getExpense.mockResolvedValue(exp({ attachments: [] }))
    shell()
    expect(await screen.findByText('Tidak ada foto terlampir.')).toBeInTheDocument()
  })

  it('kunci status_histories (snake_case) dari server juga terbaca', async () => {
    api.getExpense.mockResolvedValue(exp({
      status: 'PAID', actions: [], statusHistories: undefined,
      status_histories: [{ id: 9, from_status: 'APPROVED', to_status: 'PAID', notes: null, created_at: '2026-10-22T05:00:00Z' }],
    }))
    shell()
    expect(await screen.findByText('Disetujui → Dibayar')).toBeInTheDocument()
  })

  it('expense tidak ditemukan (404) menampilkan pesan', async () => {
    api.getExpense.mockRejectedValue(new Error('Expense tidak ditemukan'))
    shell('/expenses/999')
    expect(await screen.findByText('Expense tidak ditemukan.')).toBeInTheDocument()
  })
})

describe('Detail expense: tindakan (mengikuti actions dari server)', () => {
  it('Menunggu: Setujui memanggil server lalu memperbarui status, riwayat, dan tombol baru', async () => {
    api.updateExpenseStatus.mockResolvedValue(exp({
      status: 'APPROVED', actions: ['PAID', 'REJECTED'],
      statusHistories: [
        { id: 1, from_status: null, to_status: 'SUBMITTED', notes: 'Expense created', created_at: '2026-10-22T03:00:00Z' },
        { id: 2, from_status: 'SUBMITTED', to_status: 'APPROVED', notes: null, created_at: '2026-10-22T04:00:00Z' },
      ],
    }))
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Setujui' }))

    await waitFor(() => expect(api.updateExpenseStatus).toHaveBeenCalledWith(1, { status: 'APPROVED' }))
    expect(await screen.findByText('Menunggu → Disetujui')).toBeInTheDocument()
    expect(screen.getByText('Expense disetujui')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Setujui' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tandai Dibayar' })).toBeInTheDocument()
  })

  it('Tandai Dibayar mengirim status PAID dengan catatan dan menutup semua tombol', async () => {
    api.getExpense.mockResolvedValue(exp({ status: 'APPROVED', actions: ['PAID'] }))
    api.updateExpenseStatus.mockResolvedValue(exp({ status: 'PAID', actions: [] }))
    const user = userEvent.setup()
    shell()

    await user.type(await screen.findByLabelText('Catatan (wajib untuk Tolak)'), 'Transfer 22 Okt')
    await user.click(screen.getByRole('button', { name: 'Tandai Dibayar' }))

    await waitFor(() => expect(api.updateExpenseStatus).toHaveBeenCalledWith(1, { status: 'PAID', notes: 'Transfer 22 Okt' }))
    await waitFor(() => expect(screen.queryByText('Tindakan')).not.toBeInTheDocument())
  })

  it('Tolak mewajibkan catatan; setelah diisi terkirim bersama catatan', async () => {
    api.updateExpenseStatus.mockResolvedValue(exp({ status: 'REJECTED', actions: [] }))
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Tolak' }))
    expect(await screen.findByText('Isi catatan alasan penolakan')).toBeInTheDocument()
    expect(api.updateExpenseStatus).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Catatan (wajib untuk Tolak)'), 'Nota tidak jelas')
    await user.click(screen.getByRole('button', { name: 'Tolak' }))
    await waitFor(() => expect(api.updateExpenseStatus).toHaveBeenCalledWith(1, { status: 'REJECTED', notes: 'Nota tidak jelas' }))
  })

  it('membatalkan konfirmasi tidak memanggil server', async () => {
    window.confirm.mockReturnValue(false)
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Setujui' }))
    expect(window.confirm).toHaveBeenCalledWith('Setujui expense EXP-STG-2026-000006?')
    expect(api.updateExpenseStatus).not.toHaveBeenCalled()
  })

  it('galat dari server ditampilkan apa adanya dan tombol tetap ada', async () => {
    api.updateExpenseStatus.mockRejectedValue(new Error('Status expense tidak dapat diubah dari SUBMITTED ke APPROVED.'))
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Setujui' }))
    expect(await screen.findByText('Status expense tidak dapat diubah dari SUBMITTED ke APPROVED.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Setujui' })).toBeInTheDocument()
  })

  it('tanpa aksi dari server (mis. sales pemilik) tidak ada bagian Tindakan', async () => {
    api.getExpense.mockResolvedValue(exp({ actions: [] }))
    shell()
    await screen.findByText('EXP-STG-2026-000006')
    expect(screen.queryByText('Tindakan')).not.toBeInTheDocument()
  })

  it('server tidak mengirim actions sama sekali: tidak ada tombol', async () => {
    api.getExpense.mockResolvedValue(exp({ actions: undefined }))
    shell()
    await screen.findByText('EXP-STG-2026-000006')
    expect(screen.queryByText('Tindakan')).not.toBeInTheDocument()
  })

  it('status tujuan asing dari server diabaikan, yang dikenal tetap tampil', async () => {
    api.getExpense.mockResolvedValue(exp({ actions: ['APPROVED', 'NGAWUR'] }))
    shell()
    expect(await screen.findByRole('button', { name: 'Setujui' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'NGAWUR' })).not.toBeInTheDocument()
  })
})

describe('Daftar expense', () => {
  const rows = () => [
    { id: 7, expense_number: 'EXP-STG-2026-000007', status: 'SUBMITTED', category: 'tol', amount: '25000', note: 'Tol Waru' },
    { id: 8, expense_number: 'EXP-STG-2026-000008', status: 'APPROVED', category: 'makan', amount: '40000', note: '' },
    { id: 9, expense_number: 'EXP-STG-2026-000009', status: 'PAID', category: 'hotel', amount: '300000', note: '' },
  ]

  it('mengetuk item membuka halaman detail yang benar', async () => {
    api.getExpenses.mockResolvedValue(rows())
    api.getExpense.mockResolvedValue(exp({ id: 8, expense_number: 'EXP-STG-2026-000008' }))
    const user = userEvent.setup()
    shell('/expenses')

    await user.click(await screen.findByText('EXP-STG-2026-000008'))
    await waitFor(() => expect(api.getExpense).toHaveBeenCalledWith('8'))
    expect(await screen.findByText('Detail Expense')).toBeInTheDocument()
  })

  it('filter Belum dibayar hanya menampilkan yang berstatus APPROVED (PAID tidak ikut)', async () => {
    api.getExpenses.mockResolvedValue(rows())
    const user = userEvent.setup()
    shell('/expenses')

    await screen.findByText('EXP-STG-2026-000007')
    await user.click(screen.getByText('Belum dibayar'))
    await waitFor(() => expect(screen.queryByText('EXP-STG-2026-000007')).not.toBeInTheDocument())
    expect(screen.getByText('EXP-STG-2026-000008')).toBeInTheDocument()
    expect(screen.queryByText('EXP-STG-2026-000009')).not.toBeInTheDocument()
  })

  it('filter Menunggu meminta status SUBMITTED ke server', async () => {
    api.getExpenses.mockResolvedValue(rows())
    const user = userEvent.setup()
    shell('/expenses')

    await screen.findByText('EXP-STG-2026-000007')
    await user.click(screen.getByText('Menunggu'))
    await waitFor(() => expect(api.getExpenses).toHaveBeenCalledWith({ status: 'SUBMITTED' }))
  })

  it('tombol Laporkan Expense tetap membuka form', async () => {
    api.getExpenses.mockResolvedValue(rows())
    const user = userEvent.setup()
    shell('/expenses')

    await user.click(await screen.findByRole('button', { name: 'Laporkan Expense' }))
    expect(await screen.findByText('form baru')).toBeInTheDocument()
  })
})
