import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({
  getVisit: vi.fn(), concludeLeadTask: vi.fn(), updateLeadTask: vi.fn(), getTaskTemplates: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import TaskComplete from '../src/pages/TaskComplete.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const TEMPLATES = [
  { id: 9, seq: 20, code: 'GIVESMPL1', name: 'Sample', stage: 'OPPORTUNITY' },
  { id: 10, seq: 30, code: 'CREATEQ', name: 'Quotation', stage: 'QUOTE' },
]
const NOO_TASK = {
  id: 11, seq: 15, code: 'VRFKSNOO', name: 'Verifikasi NOO melalui WhatsApp', task_type: 'Lead engagement', stage: 'LEAD',
  is_closing: false, status: 'OPEN', actions: [], remark: '', assignee: { id: 2, name: 'Budi Santoso' },
}
const visitOf = (task = NOO_TASK) => ({
  id: 21,
  lead: { id: 5, business_name: "Trader Joe's", task_set_id: 1, status_customer: 'PROSPEK', current_task: task },
})

const renderPage = (state = { visit: visitOf() }, path = '/visit/21/complete') =>
  render(
    <MemoryRouter initialEntries={['/choose-activity/21', state ? { pathname: path, state } : path]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/visit/:id/complete" element={<TaskComplete />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  api.getTaskTemplates.mockResolvedValue(TEMPLATES)
})

describe('Complete Task (tugas tanpa formulir sendiri)', () => {
  it('menampilkan kartu task dan Task Completion; Win tidak ditawarkan di tugas biasa', async () => {
    renderPage()

    expect(await screen.findByText('Task: Verifikasi NOO melalui WhatsApp')).toBeInTheDocument()
    expect(screen.getByText("Trader Joe's · Lead #L-0005")).toBeInTheDocument()
    expect(screen.getByText('Task ID: VRFKSNOO · Task Type: Lead engagement')).toBeInTheDocument()
    expect(screen.getByText('Current Stage: LEAD')).toBeInTheDocument()
    expect(screen.getByText('Task Completion')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText(/Conclusion/)).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Next', 'Lose'])
    expect(screen.getAllByLabelText('Comment')).toHaveLength(1)
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('9')) // tugas setelahnya: Sample
  })

  it('Save: menyelesaikan tugas dengan Next ke Sample, lalu kembali ke Choose Activity', async () => {
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Sample' } })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('9'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(11, {
        conclusion: 'NEXT', reason_code: 'Tertarik', task_status: 'Process', next_template_id: 9,
        due_date: null, remark: null,
      }),
    )
    expect((await screen.findByTestId('probe')).textContent).toBe('/choose-activity/21')
  })

  it('tugas penutup (QRSLT): hanya Win atau Lose', async () => {
    const closing = { ...NOO_TASK, id: 12, seq: 40, code: 'QRSLT', name: 'Order', is_closing: true }
    renderPage({ visit: visitOf(closing) })
    await screen.findByText('Task: Order')
    expect(
      within(screen.getByLabelText(/Conclusion/)).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Win', 'Lose'])
  })

  it('tanpa tugas aktif: pesan kosong', async () => {
    renderPage({ visit: visitOf(null) })
    expect(await screen.findByText('Tidak ada tugas aktif untuk kunjungan ini.')).toBeInTheDocument()
  })

  it('dibuka tanpa state (refresh): mengambil data kunjungan dari server', async () => {
    api.getVisit.mockResolvedValue(visitOf())
    renderPage(null)
    expect(await screen.findByText('Task: Verifikasi NOO melalui WhatsApp')).toBeInTheDocument()
    expect(api.getVisit).toHaveBeenCalledWith('21')
  })
})
