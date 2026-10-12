import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({
  getVisit: vi.fn(), createSample: vi.fn(), concludeLeadTask: vi.fn(), updateLeadTask: vi.fn(), getTaskTemplates: vi.fn(),
}))
// Dropdown Product Group memuat daftar dari server; di tes diganti pilihan tetap.
vi.mock('../src/components/ProductGroupField.jsx', async () => {
  const React = await import('react')
  return {
    ProductGroupField: ({ value, onChange }) =>
      React.createElement(
        'select',
        { 'aria-label': 'Product Group *', value, onChange: (e) => onChange(e.target.value) },
        React.createElement('option', { value: '' }, '—'),
        React.createElement('option', { value: 'SAUS' }, 'SAUS'),
      ),
  }
})

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import TaskSample from '../src/pages/TaskSample.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const TEMPLATES = [
  { id: 10, seq: 30, code: 'CREATEQ', name: 'Quotation', stage: 'QUOTE' },
  { id: 11, seq: 40, code: 'QRSLT', name: 'Order', stage: 'QUOTE' },
]
const sampleTask = (code = 'GIVESMPL1') => ({
  id: 9, seq: 20, code, name: 'Sample', task_type: 'Sampling', stage: 'OPPORTUNITY', is_closing: false,
  status: 'OPEN', actions: ['sample', 'feedback'], remark: '', assignee: { id: 2, name: 'Budi Santoso' },
})
const visitOf = (task = sampleTask()) => ({
  id: 21,
  lead: { id: 5, business_name: 'RM Sari Bahari', customer_id: 12, task_set_id: 1, status_customer: 'SAMPLING', current_task: task },
})

const renderPage = (state = { visit: visitOf() }, path = '/visit/21/sample') =>
  render(
    <MemoryRouter initialEntries={['/choose-activity/21', state ? { pathname: path, state } : path]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/visit/:id/sample" element={<TaskSample />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

async function fillRequired(user) {
  await user.selectOptions(screen.getByLabelText('Product Group *'), 'SAUS')
  await user.type(screen.getByLabelText('Part (free text) *'), 'Saus custom')
  await user.type(screen.getByLabelText('Package Size (gram) *'), '250')
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getTaskTemplates.mockResolvedValue(TEMPLATES)
})

describe('Task: Pemberian Sample (dokumen hal. 28)', () => {
  it('menampilkan kartu task, kolom produk dengan Part dan Rev berdampingan, tanpa catatan Epicor, banner revisi, Comment, dan Task Completion', async () => {
    renderPage()

    expect(await screen.findByText('Task: Pemberian Sample 1')).toBeInTheDocument()
    expect(screen.getByText('Pemberian Sample 1')).toBeInTheDocument() // judul topbar
    expect(screen.getByText('RM Sari Bahari · Opportunity #10005')).toBeInTheDocument()
    expect(screen.getByText('Task ID: GIVESMPL1 · Task Type: Sampling')).toBeInTheDocument()
    expect(screen.queryByText(/Task Set:/)).not.toBeInTheDocument()
    expect(screen.getByText('Current Stage: OPPO')).toBeInTheDocument()
    expect(screen.getByText('Sample Given — Product')).toBeInTheDocument()

    expect(screen.getByLabelText('Product Group *')).toBeInTheDocument()
    expect(screen.getByLabelText('Part (free text) *')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
    expect(screen.getByLabelText('Package Size (gram) *')).toHaveAttribute('type', 'number')
    expect(screen.getByLabelText('Qty Given')).toHaveAttribute('placeholder', 'e.g. "2 pcs"')
    const partRow = screen.getByLabelText('Part (free text) *').closest('.tc-grid')
    expect(within(partRow).getByLabelText('Rev (free text)')).toBeInTheDocument() // Part dan Rev berdampingan
    expect(screen.queryByText(/not yet bound to a registered Epicor Part/)).not.toBeInTheDocument()
    expect(screen.getByText('Revision 1 of max 3 — label & batch info goes in Comment below')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Comment')).toHaveLength(1)

    expect(screen.getByText('Task Completion')).toBeInTheDocument()
    expect(
      within(screen.getByLabelText(/Conclusion/)).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Next', 'Lose']) // Win hanya di QRSLT
    expect(screen.queryByLabelText(/Jadwal tugas berikutnya/)).not.toBeInTheDocument()
    expect(screen.getByText(/Checking Complete applies Conclusion\/Reason/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Next Stage')).toHaveValue('QUOTE'))
  })

  it('revisi ke-2: judul, Task ID, dan banner mengikuti nomor (v1 hijau, v2 emas, v3 putus-putus)', async () => {
    const { container } = renderPage({ visit: visitOf(sampleTask('GIVESMPL2')) })

    expect(await screen.findByText('Task: Pemberian Sample 2')).toBeInTheDocument()
    expect(screen.getByText('Pemberian Sample 2')).toBeInTheDocument()
    expect(screen.getByText('Task ID: GIVESMPL2 · Task Type: Sampling')).toBeInTheDocument()
    expect(screen.getByText('Revision 2 of max 3 — label & batch info goes in Comment below')).toBeInTheDocument()
    const chips = [...container.querySelectorAll('.rv-chip')].map((c) => [c.textContent, c.className.replace('rv-chip ', '')])
    expect(chips).toEqual([['v1', 'done'], ['v2', 'now'], ['v3', 'next']])
  })

  it('tugas tanpa nomor revisi (kode kosong): memakai nama tugas dan tanpa banner', async () => {
    const { container } = renderPage({ visit: visitOf(sampleTask(null)) })

    expect(await screen.findByText('Task: Sample')).toBeInTheDocument()
    expect(screen.getByText('Pemberian Sample')).toBeInTheDocument()
    expect(screen.getByText('Task Type: Sampling')).toBeInTheDocument()
    expect(container.querySelector('.rv-banner')).toBeNull()
  })

  it('Save: mencatat sample (dengan Rev) lalu menyelesaikan tugas dan kembali ke Choose Activity', async () => {
    api.createSample.mockResolvedValue({ id: 77 })
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Quotation' } })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    await fillRequired(user)
    await user.type(screen.getByLabelText('Rev (free text)'), 'V2')
    await user.type(screen.getByLabelText('Description'), 'Saus tomat pedas')
    await user.type(screen.getByLabelText('Qty Given'), '2 pcs')
    await user.type(screen.getByLabelText('Comment'), 'Batch B-01')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.createSample).toHaveBeenCalledWith({
        customer_id: 12, lead_id: 5, lead_task_id: 9, product_group: 'SAUS', part: 'Saus custom',
        rev: 'V2', description: 'Saus tomat pedas', qty: 250, qty_given: '2 pcs', notes: 'Batch B-01',
      }),
    )
    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(9, {
        conclusion: 'NEXT', reason_code: 'Tertarik', task_status: 'Process', next_template_id: 10,
        due_date: null, remark: 'Batch B-01',
      }),
    )
    expect((await screen.findByTestId('probe')).textContent).toBe('/choose-activity/21')
  })

  it('kolom wajib kosong: tidak ada yang dikirim', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Isi Product Group, Part, dan Package Size')).toBeInTheDocument()
    expect(api.createSample).not.toHaveBeenCalled()
    expect(api.concludeLeadTask).not.toHaveBeenCalled()
  })

  it('konklusi gagal setelah sample tersimpan: percobaan ulang tidak membuat sample ganda', async () => {
    api.createSample.mockResolvedValue({ id: 77 })
    api.concludeLeadTask
      .mockRejectedValueOnce(new Error('gagal'))
      .mockResolvedValueOnce({ next_task: { name: 'Quotation' } })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Sample sudah tersimpan, tetapi tugas belum selesai: gagal/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.concludeLeadTask).toHaveBeenCalledTimes(2))
    expect(api.createSample).toHaveBeenCalledTimes(1)
  })

  it('Lose: sample tetap tercatat dan tugas ditutup tanpa task berikutnya', async () => {
    api.createSample.mockResolvedValue({ id: 77 })
    api.concludeLeadTask.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    await fillRequired(user)
    await user.selectOptions(screen.getByLabelText(/Conclusion/), 'LOSE')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.createSample).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(
        9,
        expect.objectContaining({ conclusion: 'LOSE', next_template_id: null }),
      ),
    )
  })

  it('Complete tidak dicentang: sample dicatat dan Comment disimpan sebagai catatan tugas', async () => {
    api.createSample.mockResolvedValue({ id: 77 })
    api.updateLeadTask.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('10'))
    await fillRequired(user)
    await user.click(screen.getByLabelText('Complete'))
    await user.type(screen.getByLabelText('Comment'), 'Menunggu hasil R&D')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeadTask).toHaveBeenCalledWith(9, { remark: 'Menunggu hasil R&D' }))
    expect(api.concludeLeadTask).not.toHaveBeenCalled()
  })

  it('tugas aktif bukan Pemberian Sample: pesan, bukan form', async () => {
    const brand = { ...sampleTask('BRANDAW'), id: 7, name: 'Brand Awareness', actions: ['brand'] }
    renderPage({ visit: visitOf(brand) })
    expect(await screen.findByText(/bukan Pemberian Sample/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('form yang gagal dirender menampilkan pesan galat, bukan halaman kosong atau pemuatan ulang', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.getTaskTemplates.mockImplementation(() => {
      throw new Error('galat tiruan dari form')
    })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Form gagal ditampilkan/)
    expect(screen.getByRole('alert')).toHaveTextContent('galat tiruan dari form')
    spy.mockRestore()
  })

  it('dibuka tanpa state (refresh): mengambil data kunjungan dari server', async () => {
    api.getVisit.mockResolvedValue(visitOf())
    renderPage(null)
    expect(await screen.findByText('Task: Pemberian Sample 1')).toBeInTheDocument()
    expect(api.getVisit).toHaveBeenCalledWith('21')
  })
})
