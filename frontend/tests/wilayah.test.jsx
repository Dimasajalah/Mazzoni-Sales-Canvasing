import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProvinces, getRegencies, matchByName } from '../src/lib/wilayah.js'

beforeEach(() => {
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getProvinces / getRegencies', () => {
  it('mengambil daftar provinsi dan meng-cache hasilnya (panggilan kedua tidak fetch lagi)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => [{ id: '35', name: 'JAWA TIMUR' }] })

    const first = await getProvinces()
    const second = await getProvinces()

    expect(first).toEqual([{ id: '35', name: 'JAWA TIMUR' }])
    expect(second).toBe(first) // instance sama persis -> dari cache, bukan fetch ulang
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('kota kosong (tanpa provinceId) tidak memanggil layanan', async () => {
    const rows = await getRegencies('')
    expect(rows).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('HTTP gagal melempar error dengan status code-nya', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(getRegencies('99')).rejects.toThrow('500')
  })
})

describe('matchByName', () => {
  const list = [
    { id: '3171', name: 'KOTA JAKARTA PUSAT' },
    { id: '3578', name: 'KOTA SURABAYA' },
  ]

  it('cocok persis (case-insensitive)', () => {
    expect(matchByName(list, 'kota surabaya')).toEqual(list[1])
  })

  it('cocok sebagian — nama hasil geocoding sering lebih pendek dari nama resmi', () => {
    expect(matchByName(list, 'Jakarta Pusat')).toEqual(list[0])
    expect(matchByName(list, 'Surabaya')).toEqual(list[1])
  })

  it('tidak ada yang cocok -> null, bukan error', () => {
    expect(matchByName(list, 'Bandung')).toBeNull()
  })

  it('input kosong/daftar kosong -> null', () => {
    expect(matchByName(list, '')).toBeNull()
    expect(matchByName([], 'Surabaya')).toBeNull()
  })
})