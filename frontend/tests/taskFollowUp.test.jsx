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
import TaskFollowUp from '../src/pages/TaskFollowUp.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const TEMPLATES = [
  { id: 9, seq: 20, code: 'GIVESMPL1', name: 'Sample', stage: 'OPPORTUNITY' },
  { id: 10, seq: 30, code: 'CREATEQ', name: 'Quotation', stage: 'QUOTE' },
  { id: 11, seq: 40, code: 'QRSLT', name: 'Order', stage: 'QUOTE' },
]
const SAMPLE_TASK = {
  id: 31, seq: 20, code: 'GIVESMPL2', name: 'Sample', task_type: 'Sampling', stage: 'OPPORTUNITY', is_closing: false,
  status: 'OPEN', actions: ['sample', 'feedback'], remark: '', assignee: { id: 2, name: 'Budi Santoso' },
}
const visitOf = (task = SAMPLE_TASK) => ({
  id: 21,
  lead: { id: 5, business_name: 'RM Sari Bahari', customer_id: 12, task_set_id: 1, status_customer: 'SAMPLING', current_task: task },
})

const renderPage = (state = { visit: visitOf() }, path = '/visit/21/followup') =>
  render(
    <MemoryRouter initialEntries={['/choose-activity/21', state ? { pathname: path, state } : path]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/visit/:id/followup" element={<TaskFollowUp />} />
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

describe('Task: Follow Up Sample (dokumen hal. 30)', () => {
  it('menampilkan kartu task Follow Up Sample n, Task Completion dengan Comment, tanpa kolom produk', async () => {
    renderPage()

    expect(await screen.findByText('Task: Follow Up Sample 2')).toBeInTheDocument()
    expect(screen.getByText('Follow Up Sample 2')).toBeInTheDocument() // judul topbar
    expect(screen.getByText('RM Sari Bahari · Opportunity #10005')).toBeInTheDocument()
    expect(screen.getByText('MILESTONE')).toBeInTheDocument()
    expect(screen.getByText('Task ID: FUSMPL2 · Task Type: Sampling follow-up')).toBeInTheDocument()
    expect(screen.getByText('Current Stage: OPPO')).toBeInTheDocument()

    expect(screen.getByText('Task Completion')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText(/Conclusion/)).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Next', 'Lose']) // Win hanya di QRSLT
    expect(screen.getAllByLabelText('Comment')).toHaveLength(1)
    expect(screen.queryByLabelText(/Jadwal tugas berikutnya/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Part (free text) *')).not.toBeInTheDocument() // tidak ada kolom produk
    expect(screen.getByText(/Checking Complete applies Conclusion\/Reason/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    // Next Task bawaan = Quotation; revisi sample ditawarkan sebagai pilihan lain
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    expect(
      within(screen.getByLabelText('Next Task')).getByRole('option', { name: 'GIVESMPLn — Pemberian Sample (revisi berikutnya)' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Next Stage')).toHaveValue('QUOTE'))
  })

  it('sample cocok: Next ke Quotation dengan kode alasan Sample Cocok, lalu kembali ke Choose Activity', async () => {
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Quotation' } })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    await user.selectOptions(screen.getByLabelText(/Reason Code/), 'Sample Cocok')
    await user.type(screen.getByLabelText('Comment'), 'Cocok untuk lini saus')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(31, {
        conclusion: 'NEXT', reason_code: 'Sample Cocok', task_status: 'Process', next_template_id: 10,
        due_date: null, remark: 'Cocok untuk lini saus',
      }),
    )
    expect((await screen.findByTestId('probe')).textContent).toBe('/choose-activity/21')
  })

  it('perlu revisi: Next Task memilih Pemberian Sample (revisi berikutnya)', async () => {
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Sample' } })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    await user.selectOptions(screen.getByLabelText('Next Task'), '9')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(31, expect.objectContaining({ conclusion: 'NEXT', next_template_id: 9 })),
    )
  })

  it('sample ditolak: Lose dengan kode alasan Sample Ditolak, tanpa task berikutnya', async () => {
    api.concludeLeadTask.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    await user.selectOptions(screen.getByLabelText(/Conclusion/), 'LOSE')
    await user.selectOptions(screen.getByLabelText(/Reason Code/), 'Sample Ditolak')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(31, {
        conclusion: 'LOSE', reason_code: 'Sample Ditolak', task_status: 'Process', next_template_id: null,
        due_date: null, remark: null,
      }),
    )
  })

  it('Complete tidak dicentang: hanya Comment yang disimpan ke tugas', async () => {
    api.updateLeadTask.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    await user.click(screen.getByLabelText('Complete'))
    await user.type(screen.getByLabelText('Comment'), 'Menunggu respons customer')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeadTask).toHaveBeenCalledWith(31, { remark: 'Menunggu respons customer' }))
    expect(api.concludeLeadTask).not.toHaveBeenCalled()
  })

  it('tugas aktif bukan Follow Up Sample: pesan, bukan form', async () => {
    const brand = { ...SAMPLE_TASK, id: 7, code: 'BRANDAW', name: 'Brand Awareness', actions: ['brand'] }
    renderPage({ visit: visitOf(brand) })
    expect(await screen.findByText(/bukan Follow Up Sample/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('dibuka tanpa state (refresh): mengambil data kunjungan dari server', async () => {
    api.getVisit.mockResolvedValue(visitOf())
    renderPage(null)
    expect(await screen.findByText('Task: Follow Up Sample 2')).toBeInTheDocument()
    expect(api.getVisit).toHaveBeenCalledWith('21')
  })
})
