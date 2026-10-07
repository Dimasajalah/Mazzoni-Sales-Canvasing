import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDrafts, saveDraft } from '../src/lib/drafts.js'

vi.mock('../src/api/index.js', () => ({
  createLead: vi.fn(), createOrder: vi.fn(), createExpense: vi.fn(), createReturn: vi.fn(),
}))

import * as api from '../src/api/index.js'
import { offlineSaveMessage, syncPendingDrafts } from '../src/lib/draftSync.js'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  ;['lead', 'order', 'expense', 'return'].forEach((t) => clearDrafts(t))
})

describe('syncPendingDrafts (poin 19)', () => {
  it('mengirim ulang draft lead & order (payload JSON) yang berhasil, lalu menghapusnya', async () => {
    saveDraft('lead', { client_uuid: 'l1', payload: { business_name: 'UD Offline' } })
    saveDraft('order', { client_uuid: 'o1', payload: { customer_id: 1 } })
    api.createLead.mockResolvedValue({ id: 1 })
    api.createOrder.mockResolvedValue({ id: 2 })

    const count = await syncPendingDrafts()

    expect(count).toBe(2)
    expect(api.createLead).toHaveBeenCalledWith({ business_name: 'UD Offline' })
    expect(api.createOrder).toHaveBeenCalledWith({ customer_id: 1 })
    expect(JSON.parse(localStorage.getItem('sc_draft_lead') || '[]')).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('sc_draft_order') || '[]')).toHaveLength(0)
  })

  it('draft yang masih gagal (mis. belum benar-benar online) TETAP tersimpan, tidak terhapus', async () => {
    saveDraft('lead', { client_uuid: 'l2', payload: { business_name: 'UD Gagal' } })
    api.createLead.mockRejectedValue(new Error('Network error'))

    const count = await syncPendingDrafts()

    expect(count).toBe(0)
    expect(JSON.parse(localStorage.getItem('sc_draft_lead') || '[]')).toHaveLength(1)
  })

  it('draft expense/retur (FormData) ikut dikirim ulang lewat formFields', async () => {
    saveDraft('expense', { client_uuid: 'e1', formFields: { category: 'bensin', amount: '50000' } })
    api.createExpense.mockResolvedValue({ id: 3 })

    const count = await syncPendingDrafts()

    expect(count).toBe(1)
    const fd = api.createExpense.mock.calls[0][0]
    expect(fd instanceof FormData).toBe(true)
    expect(fd.get('category')).toBe('bensin')
    expect(JSON.parse(localStorage.getItem('sc_draft_expense') || '[]')).toHaveLength(0)
  })

  it('tidak ada draft sama sekali -> mengembalikan 0 tanpa memanggil API apa pun', async () => {
    const count = await syncPendingDrafts()
    expect(count).toBe(0)
    expect(api.createLead).not.toHaveBeenCalled()
  })
})

describe('offlineSaveMessage (poin 19)', () => {
  it('tidak ada sinyal (status 0): menegaskan DUA hal sekaligus — tidak ada sinyal DAN tersimpan + akan terkirim otomatis', () => {
    const msg = offlineSaveMessage({ status: 0, message: 'Tidak ada koneksi internet — periksa sinyal Anda' }, 'Order')
    expect(msg).toMatch(/tidak ada sinyal/i)
    expect(msg).toContain('Order')
    expect(msg).toContain('tersimpan sebagai draft')
    expect(msg).toContain('otomatis')
    expect(msg).not.toBe('Tidak ada koneksi internet — periksa sinyal Anda') // bukan cuma pesan network mentah
  })

  it('galat lain (mis. server menolak): tetap pakai pesan asli server, bukan pesan sinyal', () => {
    const msg = offlineSaveMessage({ status: 422, message: 'Stok tidak cukup' }, 'Order')
    expect(msg).toBe('Stok tidak cukup')
  })

  it('tanpa pesan error sama sekali: pakai fallback generik', () => {
    expect(offlineSaveMessage(undefined, 'Lead')).toBe('Gagal menyimpan Lead — tersimpan sebagai draft.')
  })
})