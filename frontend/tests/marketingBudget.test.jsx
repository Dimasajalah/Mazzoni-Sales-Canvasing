import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: auth.user, isAuthenticated: true, logout: () => {} }) }))
vi.mock('../src/api/index.js', () => ({
  getMarketingBudgets: vi.fn(), getMarketingBudget: vi.fn(), createMarketingBudget: vi.fn(), updateMarketingBudget: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { PhoneFrame } from '../src/components/PhoneFrame.jsx'
import { UiProvider } from '../src/context/UiContext.jsx'
import MarketingBudgetForm from '../src/pages/MarketingBudgetForm.jsx'
import MarketingBudgets from '../src/pages/MarketingBudgets.jsx'

function Probe() {
  return <div data-testid="probe">{useLocation().pathname}</div>
}

const shell = (entries) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <UiProvider>
        <PhoneFrame>
          <Routes>
            <Route path="/marketing/budgets" element={<MarketingBudgets />} />
            <Route path="/marketing/budgets/new" element={<MarketingBudgetForm />} />
            <Route path="/marketing/budgets/:id" element={<MarketingBudgetForm />} />
            <Route path="*" element={<Probe />} />
          </Routes>
        </PhoneFrame>
      </UiProvider>
    </MemoryRouter>,
  )

const row = (over = {}) => ({
  id: 1, campaign_code: 'BDG-2026-001', name: 'Campaign Ramadan', fiscal_year: 2026, status: 'ACTIVE',
  total_budget: '1000000.00', allocated_amount: '200000.00', remaining_budget: 800000, description: null, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, name: 'Mgr', role: 'supervisor' }
})

describe('Daftar Budget Marketing', () => {
  it('menampilkan ringkasan dan memfilter per tahun', async () => {
    api.getMarketingBudgets.mockResolvedValue([
      row(),
      row({ id: 2, campaign_code: 'BDG-2025-001', name: 'Campaign Natal', fiscal_year: 2025, total_budget: '500000.00', allocated_amount: '0.00', remaining_budget: 500000 }),
    ])
    const user = userEvent.setup()
    shell(['/marketing/budgets'])

    expect(await screen.findByText('Campaign Ramadan')).toBeInTheDocument()
    expect(screen.getByTestId('sum-total')).toHaveTextContent('Rp 1.500.000')

    await user.click(screen.getByRole('button', { name: '2025' }))
    expect(screen.queryByText('Campaign Ramadan')).not.toBeInTheDocument()
    expect(screen.getByText('Campaign Natal')).toBeInTheDocument()
    expect(screen.getByTestId('sum-total')).toHaveTextContent('Rp 500.000')
  })

  it('pengguna sales tidak memuat data dan melihat pesan akses', async () => {
    auth.user = { id: 2, name: 'Sales', role: 'sales' }
    shell(['/marketing/budgets'])

    expect(await screen.findByText(/hanya untuk admin dan supervisor/)).toBeInTheDocument()
    expect(api.getMarketingBudgets).not.toHaveBeenCalled()
  })
})

describe('Form Budget Marketing', () => {
  it('menolak total budget kosong', async () => {
    const user = userEvent.setup()
    shell(['/marketing/budgets/new'])
    await user.type(await screen.findByLabelText('Nama Campaign'), 'Campaign Baru')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByText('Isi total budget lebih dari 0')).toBeInTheDocument()
    expect(api.createMarketingBudget).not.toHaveBeenCalled()
  })

  it('menyimpan budget baru dengan payload yang benar lalu kembali ke daftar', async () => {
    api.createMarketingBudget.mockResolvedValue({ id: 9 })
    api.getMarketingBudgets.mockResolvedValue([])
    const user = userEvent.setup()
    shell(['/marketing/budgets/new'])
    await user.type(await screen.findByLabelText('Nama Campaign'), 'Campaign Ramadan')
    await user.type(screen.getByLabelText('Total Budget (Rp)'), '1500000')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() => expect(api.createMarketingBudget).toHaveBeenCalledTimes(1))
    expect(api.createMarketingBudget.mock.calls[0][0]).toMatchObject({ name: 'Campaign Ramadan', total_budget: 1500000 })
    expect(api.createMarketingBudget.mock.calls[0][0]).not.toHaveProperty('campaign_code') // kosong -> dibuat server
    expect(await screen.findByText('Belum ada budget marketing.')).toBeInTheDocument()
  })

  it('mode ubah: kode dan tahun hanya baca, sisa budget tampil, perubahan dikirim', async () => {
    api.getMarketingBudget.mockResolvedValue(row())
    api.updateMarketingBudget.mockResolvedValue(row({ status: 'CLOSED' }))
    api.getMarketingBudgets.mockResolvedValue([])
    const user = userEvent.setup()
    shell(['/marketing/budgets/1'])

    expect(await screen.findByLabelText('Kode Campaign')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Tahun Anggaran')).toHaveAttribute('readonly')
    expect(screen.getByText(/Sisa budget/)).toHaveTextContent('Rp 800.000')

    await user.click(screen.getByRole('button', { name: 'Ditutup' }))
    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(api.updateMarketingBudget).toHaveBeenCalledWith('1', expect.objectContaining({ status: 'CLOSED', total_budget: 1000000 })))
  })

  it('galat dari server (mis. total di bawah alokasi) ditampilkan apa adanya', async () => {
    api.getMarketingBudget.mockResolvedValue(row())
    api.updateMarketingBudget.mockRejectedValue(new Error('Total budget tidak boleh lebih kecil dari budget yang sudah dialokasikan.'))
    const user = userEvent.setup()
    shell(['/marketing/budgets/1'])
    await screen.findByLabelText('Kode Campaign')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByText(/tidak boleh lebih kecil/)).toBeInTheDocument()
  })
})
