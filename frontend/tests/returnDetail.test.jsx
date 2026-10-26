import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({ getReturn: vi.fn(), updateReturnStatus: vi.fn(), getReturns: vi.fn() }))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import ReturnDetail from '../src/pages/ReturnDetail.jsx'
import Returns from '../src/pages/Returns.jsx'

const shell = (entry = '/returns/1') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/returns" element={<Returns />} />
            <Route path="/returns/new" element={<div>form baru</div>} />
            <Route path="/returns/:id" element={<ReturnDetail />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const ret = (over = {}) => ({
  id: 1, return_number: 'RET-STG-2026-000005', status: 'SUBMITTED', rma_number: null, so_reference: 'SO-STG-2026-000010',
  reason: 'Kemasan rusak saat pengiriman', condition_notes: 'Dus penyok', created_at: '2026-10-22T03:00:00Z',
  customer: { name: 'Adi Wiryono' }, salesperson: { name: 'Budi Santoso' },
  lines: [{ id: 1, qty: '1.00', product: { part_num: 'BBQ-1000', description: 'Saus BBQ 1kg' } }],
  attachments: [{ id: 1, path: 'returns/1/abc.jpg', filename: 'foto.jpg', mime: 'image/jpeg' }],
  statusHistories: [{ id: 1, from_status: null, to_status: 'SUBMITTED', notes: 'Return submitted', created_at: '2026-10-22T03:00:00Z' }],
  can_change_status: true, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_API_URL', '/api/v1') // supaya tes tidak bergantung pada .env komputer yang menjalankannya
  auth.user = { id: 1, name: 'Sup', role: 'supervisor' }
  api.getReturn.mockResolvedValue(ret())
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Detail retur: tampilan', () => {
  it('menampilkan data retur, foto, dan riwayat', async () => {
    api.getReturn.mockResolvedValue(ret({
      status: 'VERIFIED',
      statusHistories: [
        { id: 1, from_status: null, to_status: 'SUBMITTED', notes: 'Return submitted', created_at: '2026-10-22T03:00:00Z' },
        { id: 2, from_status: 'SUBMITTED', to_status: 'VERIFIED', notes: 'Foto jelas', created_at: '2026-10-22T04:00:00Z' },
      ],
    }))
    shell()

    expect(await screen.findByText('RET-STG-2026-000005')).toBeInTheDocument()
    expect(api.getReturn).toHaveBeenCalledWith('1')
    expect(screen.getByText('Adi Wiryono')).toBeInTheDocument()
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    expect(screen.getByText('SO-STG-2026-000010')).toBeInTheDocument()
    expect(screen.getByText('Kemasan rusak saat pengiriman')).toBeInTheDocument()
    expect(screen.getByText('Dus penyok')).toBeInTheDocument()
    expect(screen.getByText('BBQ-1000 Saus BBQ 1kg')).toBeInTheDocument()
    expect(screen.getByAltText('foto.jpg')).toHaveAttribute('src', '/storage/returns/1/abc.jpg')
    expect(screen.getByText('Diajukan → Diverifikasi')).toBeInTheDocument()
    expect(screen.getByText(/Foto jelas/)).toBeInTheDocument()
  })

  it('memakai alamat foto dari server bila ada, dan tautan untuk PDF', async () => {
    api.getReturn.mockResolvedValue(ret({
      attachments: [
        { id: 1, url: 'https://cdn.example.com/a.jpg', path: 'returns/1/a.jpg', filename: 'a.jpg', mime: 'image/jpeg' },
        { id: 2, path: 'returns/1/surat.pdf', filename: 'surat.pdf', mime: 'application/pdf' },
      ],
    }))
    shell()

    expect(await screen.findByAltText('a.jpg')).toHaveAttribute('src', 'https://cdn.example.com/a.jpg')
    expect(screen.getByText('surat.pdf').closest('a')).toHaveAttribute('href', '/storage/returns/1/surat.pdf')
    expect(screen.queryByAltText('surat.pdf')).not.toBeInTheDocument()
  })

  it('alamat foto memakai asal server dari VITE_API_URL bila API ada di alamat lain', async () => {
    vi.stubEnv('VITE_API_URL', 'http://192.168.2.27:8000/api/v1')
    shell()
    expect(await screen.findByAltText('foto.jpg')).toHaveAttribute('src', 'http://192.168.2.27:8000/storage/returns/1/abc.jpg')
  })

  it('retur lama tanpa foto menampilkan keterangan', async () => {
    api.getReturn.mockResolvedValue(ret({ attachments: [] }))
    shell()
    expect(await screen.findByText('Tidak ada foto terlampir.')).toBeInTheDocument()
  })

  it('nomor RMA tampil bila sudah ada dan kunci status_histories (snake_case) juga terbaca', async () => {
    api.getReturn.mockResolvedValue(ret({
      status: 'RMA_ISSUED', rma_number: 'RMA-STG-2026-000001', statusHistories: undefined,
      status_histories: [{ id: 9, from_status: 'APPROVED', to_status: 'RMA_ISSUED', notes: null, created_at: '2026-10-22T05:00:00Z' }],
    }))
    shell()

    expect(await screen.findByText('RMA-STG-2026-000001')).toBeInTheDocument()
    expect(screen.getByText('Disetujui → RMA terbit')).toBeInTheDocument()
  })

  it('retur tidak ditemukan (404) menampilkan pesan', async () => {
    api.getReturn.mockRejectedValue(new Error('Retur tidak ditemukan'))
    shell('/returns/999')
    expect(await screen.findByText('Retur tidak ditemukan.')).toBeInTheDocument()
  })
})

describe('Detail retur: tindakan', () => {
  it('Diajukan: tiga tombol; Verifikasi memanggil server lalu memperbarui status dan riwayat', async () => {
    api.updateReturnStatus.mockResolvedValue(ret({
      status: 'VERIFIED',
      statusHistories: [
        { id: 1, from_status: null, to_status: 'SUBMITTED', notes: 'Return submitted', created_at: '2026-10-22T03:00:00Z' },
        { id: 2, from_status: 'SUBMITTED', to_status: 'VERIFIED', notes: null, created_at: '2026-10-22T04:00:00Z' },
      ],
    }))
    const user = userEvent.setup()
    shell()

    await screen.findByText('RET-STG-2026-000005')
    expect(['Verifikasi', 'Setujui', 'Tolak'].every((n) => screen.getByRole('button', { name: n }))).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Verifikasi' }))

    await waitFor(() => expect(api.updateReturnStatus).toHaveBeenCalledWith(1, { status: 'VERIFIED' }))
    expect(await screen.findByText('Diajukan → Diverifikasi')).toBeInTheDocument()
    expect(screen.getByText('Retur diverifikasi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verifikasi' })).not.toBeInTheDocument() // sudah lewat
    expect(screen.getByRole('button', { name: 'Setujui' })).toBeInTheDocument()
  })

  it('catatan ikut terkirim bila diisi', async () => {
    api.updateReturnStatus.mockResolvedValue(ret({ status: 'APPROVED', rma_number: 'RMA-STG-2026-000002' }))
    const user = userEvent.setup()
    shell()

    await user.type(await screen.findByLabelText('Catatan (wajib untuk Tolak)'), 'Foto sesuai')
    await user.click(screen.getByRole('button', { name: 'Setujui' }))

    await waitFor(() => expect(api.updateReturnStatus).toHaveBeenCalledWith(1, { status: 'APPROVED', notes: 'Foto sesuai' }))
    expect(await screen.findByText('RMA-STG-2026-000002')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terbitkan RMA' })).toBeInTheDocument()
  })

  it('Tolak mewajibkan catatan; setelah diisi terkirim bersama catatan', async () => {
    api.updateReturnStatus.mockResolvedValue(ret({ status: 'REJECTED' }))
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Tolak' }))
    expect(await screen.findByText('Isi catatan alasan penolakan')).toBeInTheDocument()
    expect(api.updateReturnStatus).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Catatan (wajib untuk Tolak)'), 'Foto tidak jelas')
    await user.click(screen.getByRole('button', { name: 'Tolak' }))
    await waitFor(() => expect(api.updateReturnStatus).toHaveBeenCalledWith(1, { status: 'REJECTED', notes: 'Foto tidak jelas' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tolak' })).not.toBeInTheDocument()) // ditolak = selesai
  })

  it('membatalkan konfirmasi tidak memanggil server', async () => {
    window.confirm.mockReturnValue(false)
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Setujui' }))
    expect(window.confirm).toHaveBeenCalledWith('Setujui retur RET-STG-2026-000005?')
    expect(api.updateReturnStatus).not.toHaveBeenCalled()
  })

  it('galat dari server ditampilkan apa adanya dan status tidak berubah', async () => {
    api.updateReturnStatus.mockRejectedValue(new Error('Status retur tidak dapat diubah dari SUBMITTED ke VERIFIED.'))
    const user = userEvent.setup()
    shell()

    await user.click(await screen.findByRole('button', { name: 'Verifikasi' }))
    expect(await screen.findByText('Status retur tidak dapat diubah dari SUBMITTED ke VERIFIED.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verifikasi' })).toBeInTheDocument()
  })

  it('status akhir (Ditolak dan RMA terbit) tidak punya tombol', async () => {
    for (const status of ['REJECTED', 'RMA_ISSUED']) {
      api.getReturn.mockResolvedValue(ret({ status }))
      const view = shell()
      await screen.findByText('RET-STG-2026-000005')
      expect(screen.queryByText('Tindakan')).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it('Disetujui: hanya tombol Terbitkan RMA', async () => {
    api.getReturn.mockResolvedValue(ret({ status: 'APPROVED', rma_number: 'RMA-STG-2026-000003' }))
    shell()

    expect(await screen.findByRole('button', { name: 'Terbitkan RMA' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tolak' })).not.toBeInTheDocument()
  })
})

describe('Detail retur: siapa yang melihat tombol', () => {
  it('penanda dari server menang atas peran: sales dengan penanda false tidak melihat tombol', async () => {
    auth.user = { id: 5, name: 'Budi', role: 'sales' }
    api.getReturn.mockResolvedValue(ret({ can_change_status: false }))
    shell()

    await screen.findByText('RET-STG-2026-000005')
    expect(screen.queryByText('Tindakan')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Setujui' })).not.toBeInTheDocument()
  })

  it('peran yang diberi izin lewat konfigurasi server (mis. finance) melihat tombol walau bukan supervisor', async () => {
    auth.user = { id: 3, name: 'Fin', role: 'finance' }
    api.getReturn.mockResolvedValue(ret({ can_change_status: true }))
    shell()
    expect(await screen.findByRole('button', { name: 'Setujui' })).toBeInTheDocument()
  })

  it('supervisor dengan penanda false (izin dicabut di server) tidak melihat tombol', async () => {
    api.getReturn.mockResolvedValue(ret({ can_change_status: false }))
    shell()
    await screen.findByText('RET-STG-2026-000005')
    expect(screen.queryByRole('button', { name: 'Setujui' })).not.toBeInTheDocument()
  })

  it('tanpa penanda dari server, cadangannya memakai peran', async () => {
    api.getReturn.mockResolvedValue(ret({ can_change_status: undefined }))
    const view = shell()
    expect(await screen.findByRole('button', { name: 'Setujui' })).toBeInTheDocument() // supervisor
    view.unmount()

    auth.user = { id: 5, name: 'Budi', role: 'sales' }
    shell()
    await screen.findByText('RET-STG-2026-000005')
    expect(screen.queryByRole('button', { name: 'Setujui' })).not.toBeInTheDocument() // sales
  })
})

describe('Daftar retur: kartu bisa diklik', () => {
  const rows = () => [
    { id: 7, return_number: 'RET-STG-2026-000007', status: 'SUBMITTED', customer: { name: 'Adi Wiryono' }, lines: [{ qty: '1.00', product: { part_num: 'BBQ-1000', description: 'Saus BBQ 1kg' } }] },
    { id: 8, return_number: 'RET-STG-2026-000008', status: 'RMA_ISSUED', rma_number: 'RMA-STG-2026-000001', customer: { name: 'PT Global Sukses' }, lines: [{ qty: '2.00', product: { part_num: 'STM-1000', description: 'Saus Tomat 1kg' } }] },
  ]

  it('mengetuk kartu membuka detail retur yang benar', async () => {
    api.getReturns.mockResolvedValue(rows())
    api.getReturn.mockResolvedValue(ret({ id: 8, return_number: 'RET-STG-2026-000008', status: 'RMA_ISSUED', rma_number: 'RMA-STG-2026-000001' }))
    const user = userEvent.setup()
    shell('/returns')

    await user.click(await screen.findByText('Saus Tomat 1kg'))
    await waitFor(() => expect(api.getReturn).toHaveBeenCalledWith('8'))
    expect(await screen.findByText('RET-STG-2026-000008')).toBeInTheDocument()
  })

  it('kartu bisa dibuka dengan keyboard (Enter) dan punya peran tombol', async () => {
    api.getReturns.mockResolvedValue(rows())
    const user = userEvent.setup()
    shell('/returns')

    const card = (await screen.findByText('Saus BBQ 1kg')).closest('[role="button"]')
    expect(card).toHaveAttribute('tabindex', '0')
    card.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(api.getReturn).toHaveBeenCalledWith('7'))
  })

  it('tombol Ajukan Retur Baru tetap membuka form', async () => {
    api.getReturns.mockResolvedValue(rows())
    const user = userEvent.setup()
    shell('/returns')

    await user.click(await screen.findByRole('button', { name: /Ajukan Retur Baru/ }))
    expect(await screen.findByText('form baru')).toBeInTheDocument()
  })

  it('hitungan Total, Diproses, dan RMA tidak berubah', async () => {
    api.getReturns.mockResolvedValue(rows())
    shell('/returns')

    await screen.findByText('Saus BBQ 1kg')
    const kpi = (label) => screen.getByText(label).closest('.kpi')
    expect(within(kpi('Total')).getByText('2')).toBeInTheDocument()
    expect(within(kpi('Diproses')).getByText('1')).toBeInTheDocument()
    expect(within(kpi('RMA')).getByText('1')).toBeInTheDocument()
  })
})
