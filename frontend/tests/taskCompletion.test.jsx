import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({ getTaskTemplates: vi.fn() }))

import * as api from '../src/api/index.js'
import { TaskCompletion, useTaskCompletion } from '../src/components/TaskCompletion.jsx'
import { TaskHeader } from '../src/components/TaskHeader.jsx'

const TEMPLATES = [
  { id: 8, seq: 10, code: 'BRANDAW', name: 'Brand Awareness', stage: 'LEAD' },
  { id: 15, seq: 15, code: 'VRFKSNOO', name: 'Verifikasi NOO', stage: 'LEAD' },
  { id: 9, seq: 20, code: null, name: 'Sample', stage: 'OPPORTUNITY' },
]
const TASK = {
  id: 1, seq: 10, code: 'BRANDAW', name: 'Brand Awareness', task_type: 'Lead engagement', stage: 'LEAD',
  is_closing: false, remark: '', assignee: { id: 2, name: 'Budi Santoso' },
}
const LEAD = { id: 5, task_set_id: 1, business_name: 'Resto Jaya', status_customer: 'BRAND_AWARENESS' }
const BRAND = {
  conclusions: ['NEXT', 'LOSE'],
  reasons: {
    NEXT: [{ value: 'TRTK', label: 'TRTK — Tertarik' }],
    LOSE: [
      { value: 'TDKTRTK', label: 'TDKTRTK — Tidak Tertarik' },
      { value: 'NOCNTC', label: 'NOCNTC — Prospek Tidak Bisa Dihubungi' },
      { value: 'TKTTP', label: 'TKTTP — Toko Tutup Permanen' },
    ],
  },
  statuses: ['Process', 'WaitCust', 'Hold'],
  defaultStatus: 'Process',
  defaultNextCode: 'VRFKSNOO',
}

function Harness({ onPayload, config = BRAND }) {
  const tc = useTaskCompletion(TASK, LEAD, config)
  return (
    <>
      <TaskCompletion tc={tc} />
      <button type="button" onClick={() => onPayload(tc.valid(), tc.toPayload())}>
        payload
      </button>
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getTaskTemplates.mockResolvedValue(TEMPLATES)
})

describe('TaskHeader', () => {
  it('judul = Pipeline dari status_customer, lalu Task Type, Task, Stage, Assigned to', () => {
    render(<TaskHeader task={TASK} lead={LEAD} />)
    expect(screen.getByText('Brand Awareness', { selector: '.th-title' })).toBeInTheDocument()
    expect(screen.getByLabelText('Task Type')).toHaveValue('Lead engagement')
    expect(screen.getByLabelText('Task')).toHaveValue('Brand Awareness')
    expect(screen.getByLabelText('Stage')).toHaveValue('Lead')
    expect(screen.getByLabelText('Assigned to')).toHaveValue('Budi Santoso')
  })
})

describe('TaskCompletion (aturan Brand Awareness)', () => {
  it('Conclusion hanya Next dan Lose, tanpa Win', async () => {
    render(<Harness onPayload={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('15'))
    const opts = within(screen.getByLabelText(/Conclusion/)).getAllByRole('option').map((o) => o.textContent)
    expect(opts).toEqual(['Next', 'Lose'])
  })

  it('nilai awal: TRTK, Next Task = VRFKSNOO (bisa diubah), Next Stage Lead, Status Process', async () => {
    render(<Harness onPayload={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('15'))
    expect(screen.getByLabelText(/Reason Code/)).toHaveValue('TRTK')
    expect(screen.getByLabelText('Next Stage')).toHaveValue('LEAD')
    expect(screen.getByLabelText(/Status/)).toHaveValue('Process')
    expect(
      within(screen.getByLabelText(/Status/)).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Process', 'WaitCust', 'Hold'])
    expect(within(screen.getByLabelText('Next Task')).getByRole('option', { name: 'VRFKSNOO — Verifikasi NOO' })).toBeInTheDocument()
  })

  it('Lose: Next Task dan Next Stage hilang, kode alasan berganti, payload tanpa task berikutnya', async () => {
    const onPayload = vi.fn()
    const user = userEvent.setup()
    render(<Harness onPayload={onPayload} />)
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('15'))

    await user.selectOptions(screen.getByLabelText(/Conclusion/), 'LOSE')
    expect(screen.queryByLabelText('Next Task')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Next Stage')).not.toBeInTheDocument()
    expect(
      within(screen.getByLabelText(/Reason Code/)).getAllByRole('option').map((o) => o.value),
    ).toEqual(['TDKTRTK', 'NOCNTC', 'TKTTP'])

    await user.click(screen.getByRole('button', { name: 'payload' }))
    expect(onPayload).toHaveBeenCalledWith(true, {
      conclusion: 'LOSE', reason_code: 'TDKTRTK', task_status: 'Process',
      next_template_id: null, due_date: null, remark: null,
    })
  })

  it('Next: payload membawa kode alasan, status, task berikutnya, jadwal, dan Comment', async () => {
    const onPayload = vi.fn()
    const user = userEvent.setup()
    render(<Harness onPayload={onPayload} />)
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('15'))

    await user.selectOptions(screen.getByLabelText(/Status/), 'WaitCust')
    await user.type(screen.getByLabelText('Comment'), 'Pemilik tertarik')
    await user.click(screen.getByRole('button', { name: 'payload' }))
    expect(onPayload).toHaveBeenCalledWith(true, {
      conclusion: 'NEXT', reason_code: 'TRTK', task_status: 'WaitCust',
      next_template_id: 15, due_date: null, remark: 'Pemilik tertarik',
    })
  })

  it('Complete tidak dicentang: field konklusi hilang, Comment tetap ada', async () => {
    const user = userEvent.setup()
    render(<Harness onPayload={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('15'))

    await user.click(screen.getByLabelText('Complete'))
    expect(screen.queryByLabelText(/Conclusion/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Comment')).toBeInTheDocument()
  })

  it('tanpa konfigurasi: tugas biasa menawarkan Next, Win, Lose dengan kode alasan lama', async () => {
    render(<Harness onPayload={() => {}} config={{}} />)
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('15'))
    expect(
      within(screen.getByLabelText(/Conclusion/)).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Next', 'Win', 'Lose'])
    expect(screen.getByLabelText(/Reason Code/)).toHaveValue('Tertarik')
  })
})