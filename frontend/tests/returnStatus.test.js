import { describe, expect, it } from 'vitest'
import { canChangeReturn, returnActions, returnStatusMeta } from '../src/lib/returnStatus.js'
import { storageUrl } from '../src/lib/storageUrl.js'

// Salinan urutan status di backend (config/access.php). Bila backend berubah, tes ini mengingatkan bahwa tombol layar harus ikut berubah.
const BACKEND = {
  SUBMITTED: ['VERIFIED', 'APPROVED', 'REJECTED'],
  VERIFIED: ['APPROVED', 'REJECTED'],
  APPROVED: ['RMA_ISSUED'],
  RMA_ISSUED: [],
  REJECTED: [],
}

describe('returnActions', () => {
  it('tombol per status sesuai urutan yang diizinkan backend', () => {
    expect(returnActions('SUBMITTED').map((a) => a.to)).toEqual(['VERIFIED', 'APPROVED', 'REJECTED'])
    expect(returnActions('VERIFIED').map((a) => a.to)).toEqual(['APPROVED', 'REJECTED'])
    expect(returnActions('APPROVED').map((a) => a.to)).toEqual(['RMA_ISSUED'])
  })

  it('status akhir dan status tidak dikenal tidak punya tombol', () => {
    for (const s of ['RMA_ISSUED', 'REJECTED', 'NGAWUR', undefined]) expect(returnActions(s)).toEqual([])
  })

  it('setiap tombol hanya menuju status yang diizinkan backend (tidak melenceng)', () => {
    for (const [from, allowed] of Object.entries(BACKEND)) {
      for (const a of returnActions(from)) expect(allowed).toContain(a.to)
    }
  })

  it('hanya Tolak yang mewajibkan catatan', () => {
    const all = ['SUBMITTED', 'VERIFIED', 'APPROVED'].flatMap(returnActions)
    expect(all.filter((a) => a.requireNote).map((a) => a.to)).toEqual(['REJECTED', 'REJECTED'])
  })
})

describe('returnStatusMeta dan canChangeReturn', () => {
  it('label sesuai layar daftar dan status tak dikenal tetap tampil', () => {
    expect(returnStatusMeta('SUBMITTED').label).toBe('Diajukan')
    expect(returnStatusMeta('RMA_ISSUED').label).toBe('RMA terbit')
    expect(returnStatusMeta('XYZ').label).toBe('XYZ')
  })

  it('cadangan peran: supervisor dan admin saja', () => {
    expect(canChangeReturn({ role: 'supervisor' })).toBe(true)
    expect(canChangeReturn({ role: 'admin' })).toBe(true)
    for (const role of ['sales', 'finance', 'warehouse', undefined]) expect(canChangeReturn({ role })).toBe(false)
    expect(canChangeReturn(null)).toBe(false)
  })
})

describe('storageUrl', () => {
  it('alamat API mutlak: asal server tanpa /api/v1', () => {
    expect(storageUrl('returns/1/a.jpg', 'http://192.168.1.10:8000/api/v1')).toBe('http://192.168.1.10:8000/storage/returns/1/a.jpg')
    expect(storageUrl('returns/1/a.jpg', 'https://mazzoni.example.com/api/v1/')).toBe('https://mazzoni.example.com/storage/returns/1/a.jpg')
  })

  it('alamat API relatif: memakai asal yang sama dengan aplikasi', () => {
    expect(storageUrl('returns/1/a.jpg', '/api/v1')).toBe('/storage/returns/1/a.jpg')
    expect(storageUrl('/returns/1/a.jpg', '')).toBe('/storage/returns/1/a.jpg')
  })

  it('alamat penuh dibiarkan dan jalur kosong menghasilkan teks kosong', () => {
    expect(storageUrl('https://cdn.example.com/x.jpg', '/api/v1')).toBe('https://cdn.example.com/x.jpg')
    expect(storageUrl('', '/api/v1')).toBe('')
    expect(storageUrl(null, '/api/v1')).toBe('')
  })
})