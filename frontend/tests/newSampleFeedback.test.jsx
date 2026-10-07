// frontend/tests/newSampleFeedback.test.jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({
  createSampleFeedback: vi.fn(),
  concludeLeadTask: vi.fn(),
  getProductGroups: vi.fn(),
  getTaskTemplates: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import NewSampleFeedback from '../src/pages/NewSampleFeedback.jsx'

const TASK = {
  name: 'Sample', task_type: 'Kunjungan', stage: 'OPPORTUNITY', status: 'OPEN',
  remark: 'tes form', assignee: { id: 2, name: 'Budi Santoso' },
}

const shell = (state = {}) =>
  render(
    <MemoryRouter
      initialEntries={[{
        pathname: '/sample-feedbacks/new',
        state: { leadId: 5, leadTaskId: 9, sampleId: 3, taskSetId: 1, taskSeq: 30, task: TASK, ...state },
      }]}
    >
      <UiProvider>
        <PhoneFrame>
          <NewSampleFeedback />
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

// Product Group sekarang dropdown dari master produk (bukan teks bebas).
const pickGroup = async (user, group = 'Kecap') => {
  await screen.findByRole('option', { name: group })
  await user.selectOptions(screen.getByLabelText('Product Group'), group)
}

const fillRequired = async (user) => {
  await pickGroup(user)
  await user.type(screen.getByLabelText('Qty (Gram)'), '200')
  await user.type(screen.getByLabelText('Batch'), 'B-2026-01')
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getProductGroups.mockResolvedValue(['Kecap', 'Saus Sambal'])
  api.getTaskTemplates.mockResolvedValue([
    { id: 3, seq: 30, name: 'Sample', stage: 'OPPORTUNITY' },
    { id: 4, seq: 40, name: 'Quotation', stage: 'QUOTE' },
  ])
  api.createSampleFeedback.mockResolvedValue({})
  api.concludeLeadTask.mockResolvedValue({})
})

describe('Halaman Feedback Sample', () => {
  it('menampilkan Product Group, Qty (Gram), Batch, Jenis Revisi — tanpa Jenis Feedback, Tempat Simpan, dan field lama', async () => {
    shell()
    expect(await screen.findByLabelText('Product Group')).toBeInTheDocument()
    expect(screen.getByLabelText('Qty (Gram)')).toBeInTheDocument()
    expect(screen.getByLabelText('Batch')).toBeInTheDocument()
    expect(screen.queryByLabelText('Jenis Feedback')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rasa' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Tempat Simpan')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Version Sample')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nomor Batch')).not.toBeInTheDocument()
  })

  it('Product Group berupa dropdown dari master produk, bukan teks bebas', async () => {
    shell()
    const field = await screen.findByLabelText('Product Group')
    expect(field.tagName).toBe('SELECT')
    expect(await screen.findByRole('option', { name: 'Kecap' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Saus Sambal' })).toBeInTheDocument()
  })

  it('menampilkan grid field tugas (poin 9) dari state navigasi, dengan Comment yang bisa diisi', async () => {
    shell()
    expect(await screen.findByLabelText('Task Type')).toHaveValue('Kunjungan')
    expect(screen.getByLabelText('Stage')).toHaveValue('Opportunity')
    expect(screen.getByLabelText('Task')).toHaveValue('Sample')
    expect(screen.getByLabelText('Assigned to')).toHaveValue('Budi Santoso')
    expect(screen.getByLabelText('Task Status')).toHaveValue('Berjalan')
    const comment = screen.getByLabelText('Comment')
    expect(comment).toHaveValue('tes form')
    expect(comment).not.toHaveAttribute('readonly')
  })

  it('menolak submit kalau Qty/Batch belum diisi', async () => {
    const user = userEvent.setup()
    shell()
    await pickGroup(user)
    await user.click(screen.getByRole('button', { name: 'Simpan Feedback' }))
    expect(await screen.findByText('Pilih Product Group, lalu isi Qty dan Batch')).toBeInTheDocument()
    expect(api.createSampleFeedback).not.toHaveBeenCalled()
  })

  it('Interest: keterangan opsional; mencatat feedback lalu menyelesaikan tugas dengan pilihan sales', async () => {
    const user = userEvent.setup()
    shell()
    await fillRequired(user)
    await waitFor(() => expect(screen.getByLabelText('Tugas berikutnya')).toHaveValue('4'))
    await user.click(screen.getByRole('button', { name: 'Simpan Feedback' }))

    await waitFor(() => expect(api.createSampleFeedback).toHaveBeenCalledWith({
      product_sample_id: 3, customer_id: null, lead_id: 5, lead_task_id: 9,
      product_group: 'Kecap', qty: 200, batch_number: 'B-2026-01',
      revision_types: null, notes: null, manual_conclude: true,
    }))
    await waitFor(() => expect(api.concludeLeadTask).toHaveBeenCalledWith(9, {
      conclusion: 'NEXT', reason_code: 'Tertarik', next_template_id: 4, due_date: null, remark: 'tes form',
    }))
    expect(await screen.findByText('Feedback sample berhasil dicatat')).toBeInTheDocument()
  })

  it('Conclusion Kalah: menolak submit tanpa keterangan', async () => {
    const user = userEvent.setup()
    shell()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: /Kalah/ }))
    await user.click(screen.getByRole('button', { name: 'Simpan Feedback' }))
    expect(await screen.findByText('Isi keterangan untuk hasil yang tidak oke')).toBeInTheDocument()
    expect(api.createSampleFeedback).not.toHaveBeenCalled()
  })

  it('Jenis Revisi dipilih: keterangan jadi wajib, lalu berhasil dengan keduanya', async () => {
    const user = userEvent.setup()
    shell()
    await fillRequired(user)

    await user.click(screen.getByRole('button', { name: 'Rasa' }))
    await user.click(screen.getByRole('button', { name: 'Warna' }))
    await user.click(screen.getByRole('button', { name: 'Simpan Feedback' }))
    expect(await screen.findByText('Isi keterangan untuk hasil yang tidak oke')).toBeInTheDocument()
    expect(api.createSampleFeedback).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/Keterangan/), 'Kurang pedas dan warna pucat')
    await user.click(screen.getByRole('button', { name: 'Simpan Feedback' }))

    await waitFor(() => expect(api.createSampleFeedback).toHaveBeenCalledWith(expect.objectContaining({
      revision_types: ['rasa', 'warna'], notes: 'Kurang pedas dan warna pucat',
    })))
    expect(api.createSampleFeedback.mock.calls[0][0]).not.toHaveProperty('feedback_type')
  })
})