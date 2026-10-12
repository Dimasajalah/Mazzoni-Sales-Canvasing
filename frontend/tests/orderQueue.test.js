import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clock, getQueued, isAlreadyOrdered, isNetworkError, pendingCount, queueOrder, removeQueued, syncQueuedOrders } from '../src/lib/orderQueue.js'

const entry = (quoteId, over = {}) => ({ quoteId, leadId: 19, payload: { customer_id: 12, destination: 'HO' }, closingTaskId: 55, ...over })

beforeEach(() => {
  localStorage.clear()
})

describe('antrean order offline', () => {
  it('menyimpan, membaca, mengganti, dan menghapus entri per Quotation', () => {
    queueOrder(entry(44), 'draft')
    expect(getQueued(44)).toMatchObject({ quoteId: 44, status: 'draft' })

    queueOrder(entry(44), 'pending') // mengganti entri yang sama, bukan menggandakan
    expect(getQueued(44).status).toBe('pending')
    expect(pendingCount()).toBe(1)

    removeQueued(44)
    expect(getQueued(44)).toBeNull()
  })

  it('jam penyimpanan ditampilkan HH:MM', () => {
    expect(clock(new Date(2026, 9, 12, 14, 52).toISOString())).toBe('14:52')
  })

  it('hanya entri pending yang dikirim; draft dibiarkan', async () => {
    queueOrder(entry(1), 'pending')
    queueOrder(entry(2), 'draft')
    const confirmOrder = vi.fn().mockResolvedValue({})
    const finishTask = vi.fn().mockResolvedValue({})

    const n = await syncQueuedOrders({ confirmOrder, finishTask })

    expect(n).toBe(1)
    expect(confirmOrder).toHaveBeenCalledTimes(1)
    expect(confirmOrder).toHaveBeenCalledWith(1, { customer_id: 12, destination: 'HO' })
    expect(finishTask).toHaveBeenCalledWith(55) // tugas penutup ikut ditutup
    expect(getQueued(1)).toBeNull()
    expect(getQueued(2)).not.toBeNull()
  })

  it('jaringan putus: berhenti dan entri tetap di antrean', async () => {
    queueOrder(entry(1), 'pending')
    queueOrder(entry(2), 'pending')
    const confirmOrder = vi.fn().mockRejectedValue(Object.assign(new Error('Failed to fetch'), { name: 'TypeError' }))

    const n = await syncQueuedOrders({ confirmOrder, finishTask: vi.fn() })

    expect(n).toBe(0)
    expect(confirmOrder).toHaveBeenCalledTimes(1) // berhenti di entri pertama
    expect(pendingCount()).toBe(2)
  })

  it('Quotation yang ternyata sudah dijadikan order: entri dibuang dan dihitung terkirim', async () => {
    queueOrder(entry(1), 'pending')
    const confirmOrder = vi.fn().mockRejectedValue(new Error('Quotation ini sudah dijadikan order.'))

    expect(await syncQueuedOrders({ confirmOrder, finishTask: vi.fn() })).toBe(1)
    expect(getQueued(1)).toBeNull()
  })

  it('galat lain (mis. validasi): entri tetap di antrean dan pengiriman berlanjut ke entri berikutnya', async () => {
    queueOrder(entry(1), 'pending')
    queueOrder(entry(2), 'pending')
    const confirmOrder = vi.fn().mockRejectedValueOnce(new Error('Pilih customer untuk order ini.')).mockResolvedValueOnce({})

    expect(await syncQueuedOrders({ confirmOrder, finishTask: vi.fn() })).toBe(1)
    expect(getQueued(1)).not.toBeNull()
    expect(getQueued(2)).toBeNull()
  })

  it('penutupan tugas gagal setelah order terkirim: entri tetap dibuang dan entri berikutnya tetap dikirim', async () => {
    queueOrder(entry(1), 'pending')
    queueOrder(entry(2), 'pending')
    const confirmOrder = vi.fn().mockResolvedValue({})
    const finishTask = vi.fn().mockRejectedValue(new Error('Gagal menutup tugas'))

    expect(await syncQueuedOrders({ confirmOrder, finishTask })).toBe(2)
    expect(getQueued(1)).toBeNull()
    expect(getQueued(2)).toBeNull()
  })

  it('pengenal galat jaringan dan "sudah dijadikan order"', () => {
    expect(isNetworkError(Object.assign(new Error('x'), { name: 'TypeError' }))).toBe(true)
    expect(isNetworkError(new Error('Network Error'))).toBe(true)
    expect(isNetworkError(new Error('Pilih customer'))).toBe(false)
    expect(isAlreadyOrdered(new Error('Quotation ini sudah dijadikan order.'))).toBe(true)
  })
})