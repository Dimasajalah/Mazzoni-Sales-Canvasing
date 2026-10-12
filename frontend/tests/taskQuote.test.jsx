import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/index.js', () => ({
  getVisit: vi.fn(), getQuotes: vi.fn(), getQuote: vi.fn(), saveQuoteHeader: vi.fn(), getQuotePdf: vi.fn(),
  concludeLeadTask: vi.fn(), updateLeadTask: vi.fn(), getTaskTemplates: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import TaskQuote from '../src/pages/TaskQuote.jsx'

function Probe() {
  const loc = useLocation()
  return <div data-testid="probe">{loc.pathname}</div>
}

const TEMPLATES = [
  { id: 13, seq: 35, code: 'SENDQ', name: 'Send Quote', stage: 'QUOTE' },
  { id: 11, seq: 40, code: 'QRSLT', name: 'Order', stage: 'QUOTE' },
]
const QUOTE_TASK = {
  id: 41, seq: 30, code: 'CREATEQ', name: 'Quotation', task_type: 'Create Quote', stage: 'QUOTE', is_closing: false,
  status: 'OPEN', actions: ['quote'], remark: '', created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  assignee: { id: 2, name: 'Budi Santoso' },
}
const visitOf = (task = QUOTE_TASK) => ({
  id: 21,
  lead: { id: 5, business_name: "Trader Joe's", task_set_id: 1, register_date: '2026-10-02T00:00:00.000000Z', current_task: task },
})
const quoteOf = (over = {}) => ({
  id: 44, quote_number: 'QT-STG-2026-000007', status: 'DRAFT', customer_po: null, payment_term: null, due_date: null,
  expected_close_date: null, expires_at: null, quoted: false, quoted_at: null, notes: null,
  subtotal: '1500000.00', discount_total: '100000.00', total: '1400000.00',
  customer: { id: 12, name: "Trader Joe's" }, salesperson: { id: 2, name: 'Budi Santoso' },
  lines: [
    { id: 1, description: 'Tomato Sauce Custom B2B', qty_pcs: 1000, unit_price: '1000.00', line_total: '900000.00' }, // diskon 10%
    { id: 2, description: 'Chili Sauce', qty_pcs: 500, unit_price: '1000.00', line_total: '500000.00' }, // tanpa diskon
  ],
  ...over,
})

const renderPage = (state = { visit: visitOf() }, path = '/visit/21/quote') =>
  render(
    <MemoryRouter initialEntries={['/choose-activity/21', state ? { pathname: path, state } : path]} initialIndex={1}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/visit/:id/quote" element={<TaskQuote />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

/** Nilai tile baca-saja (Quoted/Expires/Open/Days Open) di kartu Task Tracking. */
const tileValue = (label) =>
  screen.getAllByText(label).find((el) => el.parentElement.classList.contains('qh-tile')).nextElementSibling

beforeEach(() => {
  vi.clearAllMocks()
  api.getTaskTemplates.mockResolvedValue(TEMPLATES)
  api.getQuotes.mockResolvedValue({ data: [{ id: 44 }] })
  api.getQuote.mockResolvedValue(quoteOf())
})

describe('Quotation — Header (dokumen hal. 32)', () => {
  it('menampilkan susunan sesuai dokumen: kartu Header, Task Tracking, Lines, total, Task Completion, Comment Quotation', async () => {
    renderPage()

    // judul halaman dan sub-judul "Task: Buat Penawaran (CREATEQ)"; tidak ada kartu task bergaris MILESTONE
    expect(await screen.findByText('Quotation Header')).toBeInTheDocument()
    expect(screen.getByText("Trader Joe's · Task: Buat Penawaran (CREATEQ)")).toBeInTheDocument()
    expect(screen.queryByText('MILESTONE')).not.toBeInTheDocument()
    expect(screen.getByText('HEADER')).toBeInTheDocument()

    // data baca-saja
    expect(screen.getByText('QUO-10005')).toBeInTheDocument()
    expect(screen.getAllByText('Budi Santoso').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Fri, 2 Oct 2026')).toBeInTheDocument() // Opened

    // Customer PO dan TOP (label "15 Days" dst., nilai tersimpan kode)
    expect(screen.getByLabelText('Customer PO Number *')).toHaveAttribute('placeholder', 'Type manually')
    const top = screen.getByLabelText('TOP (Term of Payment) *')
    expect(within(top).getAllByRole('option').map((o) => o.textContent)).toEqual(['— Select —', '15 Days', '30 Days', '45 Days', 'COD'])
    expect(within(top).getByRole('option', { name: '30 Days' })).toHaveValue('30D')

    // Task Tracking (CREATEQ): Open, Due, Days Open, Quoted, Expires, Expected Close
    expect(screen.getByText('Task Tracking (CREATEQ)')).toBeInTheDocument()
    expect(tileValue('Days Open')).toHaveTextContent('3')
    expect(tileValue('Quoted')).toHaveTextContent('—/—/—')
    expect(tileValue('Expires')).toHaveTextContent('—/—/—')
    expect(screen.getByLabelText('Due')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('Expected Close')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('Quoted')).toBeDisabled()
    expect(screen.getByLabelText('Quoted')).not.toBeChecked()
    expect(screen.getByText('(auto)')).toBeInTheDocument()
    expect(screen.getByText(/Blue fields are editable/)).toBeInTheDocument()

    // Lines (N) — produk pertama · total
    expect(screen.getByRole('button', { name: /Lines \(2\) — Tomato Sauce Custom B2B \+1 · / })).toBeInTheDocument()

    // total: satu baris diskon per Line yang diskon
    expect(screen.getByText('Total Gross')).toBeInTheDocument()
    expect(screen.getByText('Line Disc 1 (10%)')).toBeInTheDocument()
    expect(screen.queryByText(/Line Disc 2/)).not.toBeInTheDocument()
    expect(screen.getByText('Total Deal')).toBeInTheDocument()
    expect(screen.getByText(/Rolled up automatically from all Lines/)).toBeInTheDocument()

    // Task Completion — Buat Penawaran (CREATEQ)
    expect(screen.getByText('Task Completion — Buat Penawaran (CREATEQ)')).toBeInTheDocument()
    expect(screen.getByText(/Saving this quotation completes the CREATEQ task directly/)).toBeInTheDocument()
    expect(screen.getByLabelText('Conclusion')).toHaveValue('NEXT')
    expect(screen.getByLabelText('Reason Code')).toHaveValue('SUKSES')
    expect(screen.getByLabelText('Status *')).toHaveValue('In Progress')
    expect(screen.queryByLabelText('Next Stage')).not.toBeInTheDocument() // tidak ada Next Stage di layar ini
    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('SENDQ'))
    expect(screen.getByLabelText('Next Task')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Comment — Task (internal)')).toBeInTheDocument()

    // Comment — Quotation (kartu biru), Save, dan Download PDF
    expect(screen.getByLabelText('Comment — Quotation (prints on PDF)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download PDF — SSRS Quotation Report' })).toBeInTheDocument()
    expect(screen.getByText(/It doesn't touch the Quoted flag above/)).toBeInTheDocument()
  })

  it('Quoted otomatis: tercentang dan terkunci, tanggal Quoted dan Expires terisi, header tidak bisa diubah', async () => {
    api.getQuote.mockResolvedValue(
      quoteOf({ quoted: true, quoted_at: '2026-10-09T05:00:00.000000Z', expires_at: '2026-10-23', status: 'WON' }),
    )
    renderPage()

    await screen.findByText('Quotation Header')
    expect(screen.getByLabelText('Quoted')).toBeChecked()
    expect(screen.getByLabelText('Quoted')).toBeDisabled()
    expect(tileValue('Quoted')).toHaveTextContent('9/10/2026')
    expect(tileValue('Expires')).toHaveTextContent('23/10/2026')
    expect(screen.getByText(/Quotation sudah ditutup \(WON\)/)).toBeInTheDocument()
    expect(screen.getByLabelText('TOP (Term of Payment) *')).toBeDisabled()
  })

  it('Save: menyimpan header lalu menyelesaikan tugas ke SENDQ dan kembali ke Choose Activity', async () => {
    api.saveQuoteHeader.mockResolvedValue({})
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Send Quote' } })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('SENDQ'))
    await user.type(screen.getByLabelText('Customer PO Number *'), 'PO-77')
    await user.selectOptions(screen.getByLabelText('TOP (Term of Payment) *'), '30D')
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-10-20' } })
    fireEvent.change(screen.getByLabelText('Expected Close'), { target: { value: '2026-11-01' } })
    await user.type(screen.getByLabelText('Comment — Quotation (prints on PDF)'), 'Harga sudah termasuk ongkos kirim')
    await user.type(screen.getByLabelText('Comment — Task (internal)'), 'Catatan internal')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.saveQuoteHeader).toHaveBeenCalledWith(44, {
        customer_po: 'PO-77', payment_term: '30D', due_date: '2026-10-20',
        expected_close_date: '2026-11-01', notes: 'Harga sudah termasuk ongkos kirim',
      }),
    )
    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(41, {
        conclusion: 'NEXT', reason_code: 'SUKSES', task_status: 'In Progress', next_template_id: 13,
        due_date: null, remark: 'Catatan internal',
      }),
    )
    expect((await screen.findByTestId('probe')).textContent).toBe('/choose-activity/21')
  })

  it('Lose: tugas ditutup tanpa Next Task, kode alasan dari daftar Lose', async () => {
    api.saveQuoteHeader.mockResolvedValue({})
    api.concludeLeadTask.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('SENDQ'))
    await user.selectOptions(screen.getByLabelText('Conclusion'), 'LOSE')
    expect(screen.queryByLabelText('Next Task')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.concludeLeadTask).toHaveBeenCalledWith(41, expect.objectContaining({ conclusion: 'LOSE', next_template_id: null })),
    )
  })

  it('Quotation yang sudah ditutup: header tidak disimpan ulang, tugas tetap bisa diselesaikan', async () => {
    api.getQuote.mockResolvedValue(quoteOf({ status: 'WON', quoted: true }))
    api.concludeLeadTask.mockResolvedValue({ next_task: { name: 'Send Quote' } })
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => expect(screen.getByLabelText('Next Task')).toHaveValue('SENDQ'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.concludeLeadTask).toHaveBeenCalledTimes(1))
    expect(api.saveQuoteHeader).not.toHaveBeenCalled()
  })

  it('Lines (N) membuka daftar baris Quotation', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Lines \(2\)/ }))
    expect((await screen.findByTestId('probe')).textContent).toBe('/quotes/44/lines')
  })

  it('Quotation tanpa baris: tombol Lines mengajak menambah baris pertama dan total tanpa diskon', async () => {
    api.getQuote.mockResolvedValue(quoteOf({ lines: [], subtotal: '0.00', discount_total: '0.00', total: '0.00' }))
    renderPage()
    expect(await screen.findByRole('button', { name: /Lines \(0\) — Add the first line/ })).toBeInTheDocument()
    expect(screen.getByText('Line Disc')).toBeInTheDocument()
  })

  it('Download PDF: meminta PDF dari server dan menyimpannya sebagai berkas', async () => {
    api.getQuotePdf.mockResolvedValue({
      filename: 'Quotation-QUO-10005.pdf', mime: 'application/pdf', base64: btoa('%PDF-1.4 uji'),
    })
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Download PDF/ }))
    await waitFor(() => expect(api.getQuotePdf).toHaveBeenCalledWith(44))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    click.mockRestore()
  })

  it('prospek belum punya Quotation: pesan dan jalan ke form Quotation', async () => {
    api.getQuotes.mockResolvedValue({ data: [] })
    renderPage()
    expect(await screen.findByText(/Quotation untuk prospek ini belum ada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buka form Quotation' })).toBeInTheDocument()
  })

  it('tugas aktif bukan Quotation: pesan, bukan form', async () => {
    const brand = { ...QUOTE_TASK, id: 7, code: 'BRANDAW', name: 'Brand Awareness', actions: ['brand'] }
    renderPage({ visit: visitOf(brand) })
    expect(await screen.findByText(/bukan Quotation/)).toBeInTheDocument()
    expect(api.getQuotes).not.toHaveBeenCalled()
  })

  it('dibuka tanpa state (refresh): mengambil data kunjungan dari server', async () => {
    api.getVisit.mockResolvedValue(visitOf())
    renderPage(null)
    expect(await screen.findByText('Quotation Header')).toBeInTheDocument()
    expect(api.getVisit).toHaveBeenCalledWith('21')
  })
})
