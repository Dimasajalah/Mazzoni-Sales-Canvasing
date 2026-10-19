//frontend/src/lib/aging.js
// Pembaca respons Outstanding Report (/ar/aging) dan pembantu aging.
// Bentuk asli dari backend: { summary: { CURRENT, '1-30', '31-60', '60+', total, overdue_count, customers_with_ar }, invoices: [...] }.
// Bentuk lama (buckets larik atau objek, kunci tingkat atas, current/d1_30/..., customers/top/items) tetap dikenali.

export const BUCKETS = ['CURRENT', '1-30', '31-60', '60+']

const KEYS = [
  ['CURRENT', 'current'],
  ['1-30', 'd1_30'],
  ['31-60', 'd31_60'],
  ['60+', 'd60_plus'],
]

const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)
const listOf = (v) => (Array.isArray(v) ? v : v?.data || [])
const cents = (v) => Math.round((Number(v) || 0) * 100)

/** Bucket dari jumlah hari telat: sama dengan Invoice::agingBucket di backend (hari ke-60 masih "31-60"). */
export function bucketOf(days) {
  const d = Number(days) || 0
  if (d <= 0) return 'CURRENT'
  if (d <= 30) return '1-30'
  if (d <= 60) return '31-60'
  return '60+'
}

/** Empat bucket dalam urutan [Current, 1-30, 31-60, 60+]. */
export function agingBuckets(data) {
  if (Array.isArray(data?.buckets)) {
    return KEYS.map((_, i) => Number(data.buckets[i]) || 0)
  }

  const src = asObject(data?.buckets) || asObject(data?.summary) || data
  return KEYS.map((names) => {
    for (const name of names) {
      if (src?.[name] != null) return Number(src[name]) || 0
    }
    return 0
  })
}

/** Total outstanding: dari total yang dikirim, atau dijumlah dari invoice bila tidak ada. */
export function agingTotal(data) {
  const direct = data?.total ?? data?.summary?.total
  if (direct != null) return Number(direct) || 0
  return listOf(data?.invoices).reduce((sum, i) => sum + cents(i.balance), 0) / 100
}

/** Ringkasan jumlah (customer dan invoice telat) bila dikirim backend; null bila tidak ada. */
export function agingCounts(data) {
  const src = asObject(data?.summary) || data
  if (src?.customers_with_ar == null && src?.overdue_count == null) return null
  return {
    customers: Number(src.customers_with_ar) || 0,
    overdue: Number(src.overdue_count) || 0,
  }
}

const worstDays = (c) => {
  const inv = listOf(c.invoices)
  if (!inv.length) return 0
  return Math.max(...inv.map((i) => Number(i.days_overdue ?? i.days ?? 0)))
}

/**
 * Daftar customer berpiutang, diurutkan dari saldo terbesar.
 * Dari invoice dikelompokkan per customer. Bila bucket diberikan, hanya invoice di bucket itu yang dihitung,
 * sehingga saldo dan hari telat yang tampil adalah milik bucket itu, bukan seluruh customer.
 * Bentuk lama (daftar customer sudah jadi) dipakai apa adanya dan disaring menurut hari telat terburuk.
 */
export function agingCustomers(data, bucket = null) {
  const invoices = listOf(data?.invoices)

  if (!invoices.length) {
    const legacy = listOf(data?.customers || data?.top || data?.items)
    if (!bucket) return legacy
    return legacy.filter((c) => bucketOf(c.max_days_overdue ?? c.days ?? worstDays(c)) === bucket)
  }

  const groups = new Map()
  for (const inv of invoices) {
    const days = Number(inv.days_overdue) || 0
    if (bucket && (inv.aging_bucket || bucketOf(days)) !== bucket) continue

    const id = inv.customer_id ?? inv.customer?.id
    if (id == null) continue

    const g = groups.get(id) || {
      id,
      name: inv.customer?.name ?? inv.customer_name ?? `Customer ${id}`,
      customer_code: inv.customer?.customer_code ?? '',
      cents: 0,
      max_days_overdue: 0,
      invoice_count: 0,
      invoices: [],
    }
    g.cents += cents(inv.balance)
    g.max_days_overdue = Math.max(g.max_days_overdue, days)
    g.invoice_count += 1
    g.invoices.push(inv)
    groups.set(id, g)
  }

  return [...groups.values()]
    .map(({ cents: c, ...rest }) => ({ ...rest, balance: c / 100 }))
    .sort((a, b) => b.balance - a.balance)
}