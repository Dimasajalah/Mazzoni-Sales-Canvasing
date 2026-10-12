import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({
  getVisit: vi.fn(), getTaskSets: vi.fn(), concludeLeadTask: vi.fn(), updateLead: vi.fn(),
  updateLeadTask: vi.fn(), getTaskTemplates: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import TaskBrand from '../src/pages/TaskBrand.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const NEXT_LABEL = 'VRFKSNOO — Verifikasi NOO melalui WhatsApp'
const TEMPLATES = [
  { id: 15, seq: 15, code: 'VRFKSNOO', name: 'Verifikasi NOO melalui WhatsApp', stage: 'LEAD' },
  { id: 9, seq: 20, code: null, name: 'Sample', stage: 'OPPORTUNITY' },
]
const BRAND_TASK = {
  id: 7, seq: 10, code: 'BRANDAW', name: 'Brand Awareness', task_type: 'Lead engagement', stage: 'LEAD',
  is_closing: false, status: 'OPEN', actions: ['brand'], remark: '', assignee: { id: 2, name: 'Budi Santoso' },
}
const visitOf = (task = BRAND_TASK) => ({
  id: 21,
  lead: { id: 5, business_name: 'RM Sari Bahari', owner_name: '', task_set_id: 1, status_customer: 'PROSPEK', current_task: task },
})

// Riwayat dua halaman supaya tombol kembali (setelah Save) punya tujuan: /choose-activity/21
const renderPage = (state = { visit: visitOf() }, path = '/visit/21/brand') =>
  render(
    <MemoryRouter
      initialEntries={['/choose-activity/21', state ? { pathname: path, state } : path]}
      initialIndex={1}
    >
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/visit/:id/brand" element={<TaskBrand />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  api.getTaskTemplates.mockResolvedValue(TEMPLATES)
  api.getTaskSets.mockResolvedValue([{ id: 1, code: 'B2B', name: 'B2B' }])
})

describe('Task: Brand Awareness (dokumen hal. 26)', () => {
  it('kartu header seperti dokumen: judul Task + MILESTONE, Task ID / Task Set / Seq, Current Stage, Assigned', async () => {
    renderPage()

    expect(await screen.findByText('Task: Brand Awareness')).toBeInTheDocument()
    expect(screen.getByText('MILESTONE')).toBeInTheDocument()
    expect(await screen.findByText('Task ID: BRANDAW · Task Set: B2B · Seq 10')).toBeInTheDocument()
    expect(screen.getByText('Current Stage: LEAD')).toBeInTheDocument()
    expect(screen.getByText('Assigned: Budi Santoso')).toBeInTheDocument()
    expect(screen.queryByText(/Task Type:/)).not.toBeInTheDocument()
    expect(screen.getByText(/First task after a Lead is registered/)).toBeInTheDocument()
    expect(screen.getByText(/that only starts once this prospect is marked Tertarik/)).toBeInTheDocument()
    expect(screen.getByText('RM Sari Bahari · Lead #L-0005')).toBeInTheDocument()
    // judul kartu adalah Task, bukan status pipeline lead ("Prospek")
    expect(screen.queryByText('Prospek')).not.toBeInTheDocument()
  })

  it('Visit Notes: Contact Person dan Comment di bawahnya; Task Completion tanpa kotak Comment kedua', async () => {
    renderPage()
    await screen.findByText('Task: Brand Awareness')

    const notes = screen.getByText('Visit Notes').closest('.th')
    expect(within(notes).getByLabelText('Contact Person')).toBeInTheDocument()
    expect(within(notes).getByLabelText('Comment')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Comment')).toHaveLength(1)
    expect(screen.getByText('Task Completion')).toBeInTheDocument()
    expect(screen.getByText(/no separate Submit\/Draft step/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('Task Completion: Next Task read-only (VRFKSNOO — Verifikasi NOO melalui WhatsApp), tanpa Jadwal tugas berikutnya', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue(NEXT_LABEL))
    expect(screen.getByLabelText('Next Task')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Next Stage')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Jadwal tugas berikutnya/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Comment')).toHaveAttribute('placeholder', "What was introduced, prospect's initial reaction")
  })

  it('Next: menyimpan konklusi dengan Next Task bawaan VRFKSNOO lalu kembali ke Choose Activity', async () => {
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Verifikasi NOO' } })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue(NEXT_LABEL))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(7, {
        conclusion: 'NEXT', reason_code: 'TRTK', task_status: 'Process', next_template_id: 15, due_date: null, remark: null,
      }),
    )
    expect(api.updateLead).not.toHaveBeenCalled() // Contact Person tidak berubah
    expect((await screen.findByTestId('probe')).textContent).toBe('/choose-activity/21')
  })

  it('Lose: kode alasan berganti, Comment dari Visit Notes ikut terkirim sebagai remark', async () => {
    api.concludeLeadTask.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue(NEXT_LABEL))
    await user.selectOptions(screen.getByLabelText(/Conclusion/), 'LOSE')
    await user.selectOptions(screen.getByLabelText(/Reason Code/), 'TKTTP')
    await user.type(screen.getByLabelText('Comment'), 'Toko sudah tutup')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(7, {
        conclusion: 'LOSE', reason_code: 'TKTTP', task_status: 'Process', next_template_id: null, due_date: null, remark: 'Toko sudah tutup',
      }),
    )
  })

  it('Contact Person yang diubah disimpan ke lead sebelum konklusi', async () => {
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Verifikasi NOO' } })
    api.updateLead.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue(NEXT_LABEL))
    await user.type(screen.getByLabelText('Contact Person'), 'Pak Budi')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLead).toHaveBeenCalledWith(5, { owner_name: 'Pak Budi' }))
    await waitFor(() => expect(api.concludeLeadTask).toHaveBeenCalled())
  })

  it('Complete tidak dicentang: hanya Comment yang disimpan ke tugas', async () => {
    api.updateLeadTask.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue(NEXT_LABEL))
    await user.click(screen.getByLabelText('Complete'))
    await user.type(screen.getByLabelText('Comment'), 'Pemilik belum di toko')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeadTask).toHaveBeenCalledWith(7, { remark: 'Pemilik belum di toko' }))
    expect(api.concludeLeadTask).not.toHaveBeenCalled()
  })

  it('tugas aktif bukan Brand Awareness: pesan, bukan form', async () => {
    const sample = { ...BRAND_TASK, id: 9, name: 'Sample', actions: ['sample', 'feedback'] }
    renderPage({ visit: visitOf(sample) })
    expect(await screen.findByText(/bukan Brand Awareness/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('gagal memuat Task Set: kartu tetap tampil tanpa Task Set', async () => {
    api.getTaskSets.mockRejectedValue(new Error('offline'))
    renderPage()
    expect(await screen.findByText('Task ID: BRANDAW · Seq 10')).toBeInTheDocument()
  })

  it('dibuka tanpa state (refresh): mengambil data kunjungan dari server', async () => {
    api.getVisit.mockResolvedValue(visitOf())
    renderPage(null)
    expect(await screen.findByText('Task: Brand Awareness')).toBeInTheDocument()
    expect(api.getVisit).toHaveBeenCalledWith('21')
  })
})
