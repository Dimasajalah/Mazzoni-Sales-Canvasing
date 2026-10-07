import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({
  createSample: vi.fn(),
  getCustomers: vi.fn(),
  getProductGroups: vi.fn(),
  updateLeadTask: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import NewSample from '../src/pages/NewSample.jsx'

const TASK = {
  name: 'Sample', task_type: 'Kunjungan', stage: 'OPPORTUNITY', status: 'OPEN',
  remark: 'lama', assignee: { id: 2, name: 'Budi Santoso' },
}

const FROM_LEAD = { leadId: 5, leadTaskId: 9, customerId: 7, customerName: 'PT Uji', task: TASK }

const shell = (state = FROM_LEAD) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/samples/new', state }]}>
      <UiProvider>
        <PhoneFrame>
          <NewSample />
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

// Product Group dropdown dari master produk, bukan teks bebas.
const pickGroup = async (user, group = 'Kecap') => {
  await screen.findByRole('option', { name: group })
  await user.selectOptions(screen.getByLabelText('Product Group'), group)
}

const SAVE = 'Simpan Pengajuan Sample'

beforeEach(() => {
  vi.clearAllMocks()
  api.getCustomers.mockResolvedValue({ data: [{ id: 1, name: 'PT Uji' }] })
  api.getProductGroups.mockResolvedValue(['Kecap', 'Saus Sambal'])
  api.createSample.mockResolvedValue({})
  api.updateLeadTask.mockResolvedValue({})
})

describe('Halaman Pengajuan Sample', () => {
  it('menampilkan Product Group (dropdown), Qty (Gram), dan Batch — bukan Varian Rasa/Version lama', async () => {
    shell()
    const group = await screen.findByLabelText('Product Group')
    expect(group.tagName).toBe('SELECT')
    expect(screen.getByLabelText('Qty (Gram)')).toBeInTheDocument()
    expect(screen.getByLabelText('Batch')).toBeInTheDocument()
    expect(screen.queryByLabelText('Varian Rasa')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Version')).not.toBeInTheDocument()
  })

  it('dari tugas sebuah lead: Customer terkunci ke customer lead dan daftar customer tidak dimuat', async () => {
    shell()
    const customer = await screen.findByLabelText('Customer')
    expect(customer).toHaveValue('PT Uji')
    expect(customer).toHaveAttribute('readonly')
    expect(api.getCustomers).not.toHaveBeenCalled()
  })

  it('Nama Produk hanya tampil satu kali', async () => {
    shell()
    await screen.findByLabelText('Product Group')
    expect(screen.getAllByLabelText('Nama Produk')).toHaveLength(1)
  })

  it('tanpa lead: Customer berupa dropdown dari daftar customer', async () => {
    shell({})
    expect(await screen.findByRole('option', { name: 'PT Uji' })).toBeInTheDocument()
    expect(api.getCustomers).toHaveBeenCalled()
    expect(screen.queryByLabelText('Task Type')).not.toBeInTheDocument() // tanpa tugas, tanpa grid
  })

  it('menampilkan grid field tugas (poin 9) dengan Comment yang bisa diisi', async () => {
    shell()
    expect(await screen.findByLabelText('Task Type')).toHaveValue('Kunjungan')
    expect(screen.getByLabelText('Stage')).toHaveValue('Opportunity')
    expect(screen.getByLabelText('Task')).toHaveValue('Sample')
    expect(screen.getByLabelText('Assigned to')).toHaveValue('Budi Santoso')
    expect(screen.getByLabelText('Task Status')).toHaveValue('Berjalan')
    expect(screen.getByLabelText('Stage')).toHaveAttribute('readonly')
    const comment = screen.getByLabelText('Comment')
    expect(comment).toHaveValue('lama')
    expect(comment).not.toHaveAttribute('readonly')
  })

  it('Product Group belum dipilih: simpan ditolak dengan pesan dan sample tidak dibuat', async () => {
    const user = userEvent.setup()
    shell()
    await screen.findByLabelText('Product Group')
    await user.type(screen.getByLabelText('Qty (Gram)'), '100')
    await user.type(screen.getByLabelText('Batch'), 'B-1')
    await user.click(screen.getByRole('button', { name: SAVE }))
    expect(await screen.findByText('Pilih Product Group, lalu isi Qty dan Batch')).toBeInTheDocument()
    expect(api.createSample).not.toHaveBeenCalled()
  })

  it('menolak submit kalau Qty/Batch belum diisi', async () => {
    const user = userEvent.setup()
    shell()
    await pickGroup(user)
    await user.click(screen.getByRole('button', { name: SAVE }))
    expect(await screen.findByText('Pilih Product Group, lalu isi Qty dan Batch')).toBeInTheDocument()
    expect(api.createSample).not.toHaveBeenCalled()
  })

  it('mengirim product_group, qty, batch_number, customer, dan lead_id/lead_task_id dari state', async () => {
    const user = userEvent.setup()
    shell()
    await pickGroup(user)
    await user.type(screen.getByLabelText('Qty (Gram)'), '250')
    await user.type(screen.getByLabelText('Batch'), 'B-2026-01')
    await user.click(screen.getByRole('button', { name: SAVE }))

    await waitFor(() => expect(api.createSample).toHaveBeenCalledWith({
      customer_id: '7', lead_id: 5, lead_task_id: 9,
      product_group: 'Kecap', qty: 250, batch_number: 'B-2026-01', notes: null,
    }))
    // Comment tidak diubah -> tidak ada permintaan simpan Comment
    expect(api.updateLeadTask).not.toHaveBeenCalled()
  })

  it('Comment yang diubah disimpan ke tugas lewat updateLeadTask', async () => {
    const user = userEvent.setup()
    shell()
    await pickGroup(user)
    await user.type(screen.getByLabelText('Qty (Gram)'), '100')
    await user.type(screen.getByLabelText('Batch'), 'B-1')
    const comment = screen.getByLabelText('Comment')
    await user.clear(comment)
    await user.type(comment, 'baru')
    await user.click(screen.getByRole('button', { name: SAVE }))

    await waitFor(() => expect(api.createSample).toHaveBeenCalled())
    await waitFor(() => expect(api.updateLeadTask).toHaveBeenCalledWith(9, { remark: 'baru' }))
  })

  it('Comment gagal disimpan: sample tetap tercatat dan sales diberi peringatan', async () => {
    api.updateLeadTask.mockRejectedValue(new Error('gagal'))
    const user = userEvent.setup()
    shell()
    await pickGroup(user)
    await user.type(screen.getByLabelText('Qty (Gram)'), '100')
    await user.type(screen.getByLabelText('Batch'), 'B-1')
    await user.type(screen.getByLabelText('Comment'), ' tambahan')
    await user.click(screen.getByRole('button', { name: SAVE }))

    await waitFor(() => expect(api.createSample).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Sample tersimpan, tetapi Comment gagal disimpan')).toBeInTheDocument()
  })
})