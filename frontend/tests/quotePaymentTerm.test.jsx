//frontend/tests/quotePaymentTerm.test.jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: { id: 1, role: 'sales', sales_type: 'ORDER', can_order: true } }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))

vi.mock('../src/api/index.js', () => ({
  attachQuoteCompetitor: vi.fn(), convertQuoteToOrder: vi.fn(), createQuote: vi.fn(),
  detachQuoteCompetitor: vi.fn(), getCompetitors: vi.fn(), getCustomers: vi.fn(),
  getDiscountStrata: vi.fn(), getProductPackagings: vi.fn(), getProducts: vi.fn(),
  getQuote: vi.fn(), getSamples: vi.fn(), markQuoteQuoted: vi.fn(),
  replaceQuoteLines: vi.fn(), updateQuote: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { UiProvider } from '../src/context/UiContext.jsx'
import QuoteForm from '../src/pages/QuoteForm.jsx'

const shell = (entry = '/quotes/new') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <UiProvider>
        <Routes>
          <Route path="/quotes/new" element={<QuoteForm />} />
          <Route path="/quotes/:id" element={<QuoteForm />} />
        </Routes>
      </UiProvider>
    </MemoryRouter>,
  )

const existingQuote = {
  id: 8, quote_number: 'QT-STG-2026-000008', status: 'DRAFT', salesperson_id: 1,
  customer_id: null, product_sample_id: null, customer_po: '', due_date: null,
  expected_close_date: null, follow_up_date: null, expires_at: null, terms: '',
  payment_term: '30D', lines: [], competitors: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getProducts.mockResolvedValue([])
  api.getCustomers.mockResolvedValue([])
  api.getDiscountStrata.mockResolvedValue([])
  api.getCompetitors.mockResolvedValue([])
  api.getSamples.mockResolvedValue([])
})

describe('QuoteForm: Termin Pembayaran (poin 14)', () => {
  it('menampilkan pilihan 15D/30D/45D dengan default belum ditentukan', async () => {
    shell()
    const select = await screen.findByLabelText('Termin Pembayaran')
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: '15D' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '30D' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '45D' })).toBeInTheDocument()
  })

  it('memuat payment_term dari Quotation yang sudah ada', async () => {
    api.getQuote.mockResolvedValue(existingQuote)
    shell('/quotes/8')
    expect(await screen.findByLabelText('Termin Pembayaran')).toHaveValue('30D')
  })

  it('mengirim payment_term saat membuat Quotation baru', async () => {
    api.createQuote.mockResolvedValue({ id: 9, quote_number: 'QT-STG-2026-000009' })
    const user = userEvent.setup()
    shell()

    await user.selectOptions(await screen.findByLabelText('Termin Pembayaran'), '15D')
    await user.click(screen.getByRole('button', { name: 'Simpan Quotation' }))

    await waitFor(() => expect(api.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({ payment_term: '15D' })
    ))
  })

  it('mengirim payment_term saat menyimpan perubahan Quotation yang sudah ada', async () => {
    api.getQuote.mockResolvedValue(existingQuote)
    api.updateQuote.mockResolvedValue({})
    api.replaceQuoteLines.mockResolvedValue(existingQuote)
    const user = userEvent.setup()
    shell('/quotes/8')

    await user.selectOptions(await screen.findByLabelText('Termin Pembayaran'), '45D')
    await user.click(screen.getByRole('button', { name: 'Simpan Perubahan' }))

    await waitFor(() => expect(api.updateQuote).toHaveBeenCalledWith(8,
      expect.objectContaining({ payment_term: '45D' })
    ))
  })
})