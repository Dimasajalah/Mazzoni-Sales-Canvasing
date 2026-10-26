import { describe, expect, it } from 'vitest'
import { EXPENSE_ACTIONS, expenseButtons, expenseStatusMeta } from '../src/lib/expenseStatus.js'

// Salinan siklus di backend (config/access.php). Bila backend berubah, tes ini mengingatkan bahwa nama tombol harus ikut berubah.
const BACKEND = { SUBMITTED: ['APPROVED', 'REJECTED'], APPROVED: ['PAID', 'REJECTED'], PAID: [], REJECTED: [] }

describe('expenseButtons', () => {
  it('mengubah daftar aksi dari server menjadi tombol berurutan', () => {
    expect(expenseButtons(['APPROVED', 'REJECTED']).map((b) => b.label)).toEqual(['Setujui', 'Tolak'])
    expect(expenseButtons(['PAID', 'REJECTED']).map((b) => b.label)).toEqual(['Tandai Dibayar', 'Tolak'])
  })

  it('tanpa aksi atau data tidak valid menghasilkan daftar kosong', () => {
    for (const v of [[], undefined, null, 'APPROVED', {}]) expect(expenseButtons(v)).toEqual([])
  })

  it('status tujuan yang tidak dikenal layar diabaikan', () => {
    expect(expenseButtons(['APPROVED', 'NGAWUR']).map((b) => b.to)).toEqual(['APPROVED'])
  })

  it('setiap status tujuan di backend punya nama tombol (tidak ada yang terlewat)', () => {
    const targets = new Set(Object.values(BACKEND).flat())
    for (const to of targets) expect(EXPENSE_ACTIONS[to], to).toBeTruthy()
  })

  it('hanya Tolak yang mewajibkan catatan', () => {
    expect(Object.entries(EXPENSE_ACTIONS).filter(([, a]) => a.requireNote).map(([k]) => k)).toEqual(['REJECTED'])
  })
})

describe('expenseStatusMeta', () => {
  it('label sesuai filter di daftar dan status tak dikenal tetap tampil', () => {
    expect(expenseStatusMeta('SUBMITTED').label).toBe('Menunggu')
    expect(expenseStatusMeta('APPROVED').label).toBe('Disetujui')
    expect(expenseStatusMeta('PAID').label).toBe('Dibayar')
    expect(expenseStatusMeta('REJECTED').label).toBe('Ditolak')
    expect(expenseStatusMeta('LEGACY').label).toBe('LEGACY')
    expect(expenseStatusMeta(undefined).label).toBe('—')
  })
})