import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({ getTaskTemplates: vi.fn() }))

import * as api from '../src/api/index.js'
import { TaskCompletion, useTaskCompletion } from '../src/components/TaskCompletion.jsx'

const TEMPLATES = [
  { id: 9, seq: 20, code: 'GIVESMPL1', name: 'Sample', stage: 'OPPORTUNITY' },
  { id: 10, seq: 30, code: 'CREATEQ', name: 'Quotation', stage: 'QUOTE' },
]
const TASK = { id: 31, seq: 20, name: 'Sample', is_closing: false, remark: '' }
const LEAD = { id: 5, task_set_id: 1 }

function Harness({ config }) {
  const tc = useTaskCompletion(TASK, LEAD, config)
  return <TaskCompletion tc={tc} />
}

const optionLabels = () => within(screen.getByLabelText('Next Task')).getAllByRole('option').map((o) => o.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  api.getTaskTemplates.mockResolvedValue(TEMPLATES)
})

describe('TaskCompletion: pilihan Next Task', () => {
  it('bawaan: task yang sedang dikerjakan tidak ditawarkan sebagai Next Task', async () => {
    render(<Harness config={{}} />)
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    expect(optionLabels()).toEqual(['CREATEQ — Quotation'])
  })

  it('allowSameTask + templateLabel: revisi (task yang sama) ditawarkan dengan label sendiri, bawaan tetap task berikutnya', async () => {
    render(
      <Harness
        config={{
          allowSameTask: true,
          templateLabel: (t) => (t.code === 'GIVESMPL1' ? 'GIVESMPLn — revisi berikutnya' : `${t.code} — ${t.name}`),
        }}
      />,
    )
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    expect(optionLabels()).toEqual(['GIVESMPLn — revisi berikutnya', 'CREATEQ — Quotation'])
  })
})
