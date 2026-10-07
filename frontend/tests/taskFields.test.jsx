// frontend/tests/taskFields.test.jsx
// Poin 9: field tugas harus tampil seragam di kartu utama, Form Brand, dan Selesaikan Tugas.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/context/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Toni', role: 'sales', sales_type: 'ORDER', can_order: true, can_delegate: false },
    isAuthenticated: true,
    logout: () => {},
  }),
}))

vi.mock('../src/api/index.js', () => ({
  cancelDelegation: vi.fn(), delegateLead: vi.fn(), getDelegationTargets: vi.fn(), getLeadDelegation: vi.fn(),
  getQuotes: vi.fn(), concludeLeadTask: vi.fn(), createJourneyEntry: vi.fn(), getTaskTemplates: vi.fn(),
  updateLead: vi.fn(), updateLeadTask: vi.fn(), getSamples: vi.fn(), deliverSample: vi.fn(),
}))

import * as api from '../src/api/index.js'
import LeadTaskPanel from '../src/components/LeadTaskPanel.jsx'
import { TaskFields } from '../src/components/TaskFields.jsx'

const lead = { id: 7, business_name: 'UD Uji', stage: 'OPPORTUNITY', win_loss: 'OPEN', task_set_id: 1 }
const task = (over = {}) => ({
  id: 99, seq: 30, name: 'Sample', task_type: 'Kunjungan', stage: 'OPPORTUNITY', status: 'OPEN',
  is_closing: false, due_date: null, actions: ['brand'], assignee: { id: 2, name: 'Budi Santoso' }, remark: null, ...over,
})

function setup(props = {}) {
  render(
    <MemoryRouter>
      <LeadTaskPanel lead={lead} task={task()} showToast={vi.fn()} onChanged={vi.fn()} onClose={vi.fn()} {...props} />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getSamples.mockResolvedValue([])
  api.getTaskTemplates.mockResolvedValue([
    { id: 3, seq: 30, name: 'Sample', stage: 'OPPORTUNITY' },
    { id: 6, seq: 60, name: 'Quotation', stage: 'QUOTE' },
  ])
})

describe('TaskFields', () => {
  it('tidak merender apa-apa kalau tugas tidak ada', () => {
    const { container } = render(<TaskFields task={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('menampilkan Stage, Status, Assigned to; Task dan Task Type hanya kalau diminta', () => {
    const { rerender } = render(<TaskFields task={task()} />)
    expect(screen.getByText('Stage: Opportunity')).toBeInTheDocument()
    expect(screen.getByText('Status: Berjalan')).toBeInTheDocument()
    expect(screen.getByText('Assigned to: Budi Santoso')).toBeInTheDocument()
    expect(screen.queryByText('Kunjungan')).not.toBeInTheDocument()
    expect(screen.queryByText('Sample')).not.toBeInTheDocument()

    rerender(<TaskFields task={task()} showName showType />)
    expect(screen.getByText('Sample')).toBeInTheDocument()
    expect(screen.getByText('Kunjungan')).toBeInTheDocument()
  })

  it('status DONE tampil sebagai Selesai, dan strip kalau assignee kosong', () => {
    render(<TaskFields task={task({ status: 'DONE', assignee: null })} />)
    expect(screen.getByText('Status: Selesai')).toBeInTheDocument()
    expect(screen.getByText('Assigned to: —')).toBeInTheDocument()
  })

  it('Comment hanya tampil kalau ada isinya, dengan label yang bisa diganti', () => {
    const { rerender } = render(<TaskFields task={task({ remark: null })} />)
    expect(screen.queryByText(/Comment/)).not.toBeInTheDocument()

    rerender(<TaskFields task={task({ remark: 'Sudah ditelepon' })} commentLabel="Comment sebelumnya" />)
    expect(screen.getByText('Comment sebelumnya: “Sudah ditelepon”')).toBeInTheDocument()
  })
})

describe('LeadTaskPanel: field tugas seragam di semua layar', () => {
  it('Form Brand menampilkan field tugas dalam grid: Task Type, Stage, Task, Assigned to, Task Status, Comment', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Form Brand/ }))
    expect(screen.getByLabelText('Task Type')).toHaveValue('Kunjungan')
    expect(screen.getByLabelText('Stage')).toHaveValue('Opportunity')
    expect(screen.getByLabelText('Task')).toHaveValue('Sample')
    expect(screen.getByLabelText('Assigned to')).toHaveValue('Budi Santoso')
    expect(screen.getByLabelText('Task Status')).toHaveValue('Berjalan')
    expect(screen.getByLabelText('Comment')).toHaveValue('')
    // field baca-saja tidak bisa diubah
    expect(screen.getByLabelText('Stage')).toHaveAttribute('readonly')
  })

  it('Form Brand: Comment bisa diisi dan terkirim sebagai remark saat tugas diselesaikan', async () => {
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Quotation' } })
    const user = setup({ task: task({ remark: 'lama' }) })
    await user.click(screen.getByRole('button', { name: /Form Brand/ }))

    const field = screen.getByLabelText('Comment')
    expect(field).toHaveValue('lama')
    await user.clear(field)
    await user.type(field, 'baru')
    await waitFor(() => expect(screen.getByLabelText('Tugas berikutnya')).toHaveValue('6'))

    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(api.concludeLeadTask).toHaveBeenCalledWith(99, {
      conclusion: 'NEXT', reason_code: 'Tertarik', next_template_id: 6, due_date: null, remark: 'baru',
    }))
  })

  it('Selesaikan Tugas: grid field tugas; comment lama berlabel "Comment sebelumnya" dan baca-saja', async () => {
    const user = setup({ task: task({ remark: 'catatan lama' }) })
    await user.click(screen.getByRole('button', { name: /Selesaikan Tugas/ }))
    expect(screen.getByLabelText('Task Type')).toHaveValue('Kunjungan')
    expect(screen.getByLabelText('Stage')).toHaveValue('Opportunity')
    expect(screen.getByLabelText('Task')).toHaveValue('Sample')
    expect(screen.getByLabelText('Assigned to')).toHaveValue('Budi Santoso')
    expect(screen.getByLabelText('Task Status')).toHaveValue('Berjalan')
    const previous = screen.getByLabelText('Comment sebelumnya')
    expect(previous).toHaveValue('catatan lama')
    expect(previous).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/Catatan hasil/)).toBeInTheDocument()
  })

  it('Tahap berikutnya berupa field baca-saja yang mengikuti Tugas berikutnya', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: /Form Brand/ }))
    await waitFor(() => expect(screen.getByLabelText('Tugas berikutnya')).toHaveValue('6'))
    const stage = screen.getByLabelText('Tahap berikutnya')
    expect(stage).toHaveAttribute('readonly')
    expect(stage).toHaveValue('Quote')
  })

  it('Comment di kartu tugas aktif disimpan lewat updateLeadTask', async () => {
    api.updateLeadTask.mockResolvedValue({ remark: 'catatan baru' })
    const user = setup()
    await user.type(screen.getByLabelText('Comment (opsional)'), 'catatan baru')
    await user.click(screen.getAllByRole('button', { name: 'Simpan' })[1])
    await waitFor(() => expect(api.updateLeadTask).toHaveBeenCalledWith(99, { remark: 'catatan baru' }))
  })
})