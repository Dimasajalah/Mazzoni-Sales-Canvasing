import { describe, expect, it } from 'vitest'
import { agingBuckets, agingCounts, agingCustomers, agingTotal, bucketOf } from '../src/lib/aging.js'

const inv = (id, customerId, name, balance, days, bucket) => ({
  id, customer_id: customerId, balance, days_overdue: days, aging_bucket: bucket, customer: { id: customerId, name, customer_code: `C-${customerId}` },
})

describe('bucketOf', () => {
  it('batas hari sama dengan backend: hari ke-60 masih 31-60, hari ke-61 sudah 60+', () => {
    expect(bucketOf(0)).toBe('CURRENT')
    expect(bucketOf(-3)).toBe('CURRENT')
    expect(bucketOf(1)).toBe('1-30')
    expect(bucketOf(30)).toBe('1-30')
    expect(bucketOf(31)).toBe('31-60')
    expect(bucketOf(60)).toBe('31-60')
    expect(bucketOf(61)).toBe('60+')
  })
})

describe('agingBuckets', () => {
  it('summary dari backend (respons asli)', () => {
    expect(agingBuckets({ summary: { CURRENT: 0, '1-30': 1170030, '31-60': 790200, '60+': 1778400, total: 3738630 } })).toEqual([0, 1170030, 790200, 1778400])
  })

  it('kunci tingkat atas (CURRENT, 1-30, 31-60, 60+)', () => {
    expect(agingBuckets({ CURRENT: 5, '1-30': 10, '31-60': 20, '60+': 30, total: 65 })).toEqual([5, 10, 20, 30])
  })

  it('buckets berupa larik dipakai apa adanya, dilengkapi sampai empat', () => {
    expect(agingBuckets({ buckets: [1, 2, 3, 4] })).toEqual([1, 2, 3, 4])
    expect(agingBuckets({ buckets: [1, 2] })).toEqual([1, 2, 0, 0])
  })

  it('buckets berupa objek', () => {
    expect(agingBuckets({ buckets: { CURRENT: 0, '1-30': 1000000, '31-60': 0, '60+': 5500000 } })).toEqual([0, 1000000, 0, 5500000])
  })

  it('kunci lama (current, d1_30, d31_60, d60_plus)', () => {
    expect(agingBuckets({ current: 1, d1_30: 2, d31_60: 3, d60_plus: 4 })).toEqual([1, 2, 3, 4])
  })

  it('nilai teks dari desimal Laravel diubah menjadi angka', () => {
    expect(agingBuckets({ summary: { CURRENT: '0.00', '1-30': '1000000.00', '31-60': '0', '60+': '5500000.50' } })).toEqual([0, 1000000, 0, 5500000.5])
  })

  it('tanpa data, atau kunci tak dikenal: empat nol, bukan galat', () => {
    expect(agingBuckets(null)).toEqual([0, 0, 0, 0])
    expect(agingBuckets({})).toEqual([0, 0, 0, 0])
    expect(agingBuckets({ foo: 9 })).toEqual([0, 0, 0, 0])
  })
})

describe('agingTotal dan agingCounts', () => {
  it('total dari summary, dari tingkat atas, atau dijumlah dari invoice', () => {
    expect(agingTotal({ summary: { total: 3738630 } })).toBe(3738630)
    expect(agingTotal({ total: '120.50' })).toBe(120.5)
    expect(agingTotal({ invoices: [{ balance: '0.10' }, { balance: '0.20' }] })).toBe(0.3) // tanpa selisih desimal
    expect(agingTotal(null)).toBe(0)
  })

  it('jumlah customer dan invoice telat bila ada, null bila tidak', () => {
    expect(agingCounts({ summary: { customers_with_ar: 8, overdue_count: 11 } })).toEqual({ customers: 8, overdue: 11 })
    expect(agingCounts({ summary: { total: 1 } })).toBeNull()
    expect(agingCounts(null)).toBeNull()
  })
})

describe('agingCustomers', () => {
  const data = {
    invoices: [
      inv(3, 7, 'UD Sumber Makmur', '438300.00', 46, '31-60'),
      inv(10, 7, 'UD Sumber Makmur', '684600.00', 11, '1-30'),
      inv(8, 4, 'PT Cahaya Abadi', '124750.00', 121, '60+'),
    ],
  }

  it('mengelompokkan per customer, menjumlah saldo, mengambil hari telat terburuk, dan mengurutkan dari saldo terbesar', () => {
    const rows = agingCustomers(data)
    expect(rows.map((r) => r.name)).toEqual(['UD Sumber Makmur', 'PT Cahaya Abadi'])
    expect(rows[0]).toMatchObject({ id: 7, balance: 1122900, max_days_overdue: 46, invoice_count: 2, customer_code: 'C-7' })
    expect(rows[0].invoices).toHaveLength(2)
  })

  it('dengan bucket: hanya invoice di bucket itu yang dihitung (saldo dan hari telat milik bucket)', () => {
    const rows = agingCustomers(data, '1-30')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 7, balance: 684600, max_days_overdue: 11, invoice_count: 1 })
    expect(agingCustomers(data, 'CURRENT')).toEqual([])
  })

  it('penjumlahan saldo tanpa selisih desimal', () => {
    const rows = agingCustomers({ invoices: [inv(1, 1, 'A', '0.10', 1, '1-30'), inv(2, 1, 'A', '0.20', 1, '1-30')] })
    expect(rows[0].balance).toBe(0.3)
  })

  it('invoice tanpa aging_bucket: bucket dihitung dari hari telat', () => {
    const rows = agingCustomers({ invoices: [{ id: 1, customer_id: 1, balance: '10', days_overdue: 61, customer: { id: 1, name: 'A' } }] }, '60+')
    expect(rows).toHaveLength(1)
  })

  it('tanpa invoice: bentuk lama (daftar customer) dipakai apa adanya dan disaring menurut hari terburuk', () => {
    const legacy = { customers: [{ id: 1, name: 'A', max_days_overdue: 1 }, { id: 2, name: 'B', max_days_overdue: 75 }] }
    expect(agingCustomers(legacy)).toHaveLength(2)
    expect(agingCustomers(legacy, '60+').map((c) => c.name)).toEqual(['B'])
  })

  it('tanpa data: daftar kosong, bukan galat', () => {
    expect(agingCustomers(null)).toEqual([])
    expect(agingCustomers({})).toEqual([])
  })
})