import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPost, ApiError } from '../src/api/client.js'

beforeEach(() => {
  global.fetch = vi.fn()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('api/client.js — penanganan galat (poin 19)', () => {
  it('fetch gagal total (tidak ada koneksi) -> pesan jelas, bukan pesan mentah browser', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch')) // persis perilaku Chrome saat offline

    await expect(apiGet('/leads')).rejects.toMatchObject({
      message: 'Tidak ada koneksi internet — periksa sinyal Anda',
      status: 0,
    })
  })

  it('error dari server (mis. 422) TETAP memakai pesan asli server, tidak ditimpa', async () => {
    global.fetch.mockResolvedValue({
      ok: false, status: 422,
      text: async () => JSON.stringify({ message: 'Validasi gagal', errors: { business_name: ['wajib diisi'] } }),
    })

    await expect(apiPost('/leads', {})).rejects.toMatchObject({
      message: 'Validasi gagal', status: 422, errors: { business_name: ['wajib diisi'] },
    })
  })

  it('error jaringan tetap berupa ApiError (instanceof), supaya penanganan di halaman tidak perlu berubah', async () => {
    global.fetch.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'))

    try {
      await apiGet('/leads')
      throw new Error('seharusnya melempar error')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
    }
  })

  it('respons sukses tetap berjalan normal (bukan false positive dari perbaikan ini)', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ data: [1, 2] }) })
    const result = await apiGet('/leads')
    expect(result).toEqual({ data: [1, 2] })
  })
})