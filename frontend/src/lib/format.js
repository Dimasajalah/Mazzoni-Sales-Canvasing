//frontend/src/lib/format.js
export function money(n) {
  const v = Number(n) || 0
  return 'Rp ' + v.toLocaleString('id-ID')
}

export function fmtRp(n) {
  const v = Number(n) || 0
  if (v >= 1e9)
    return (
      'Rp ' +
      (v / 1e9).toLocaleString('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) +
      ' M'
    )
  if (v >= 1e7) return 'Rp ' + Math.round(v / 1e6) + 'jt'
  if (v >= 1e6)
    return (
      'Rp ' +
      (v / 1e6).toLocaleString('id-ID', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) +
      'jt'
    )
  return 'Rp ' + Math.round(v).toLocaleString('id-ID')
}

export function fmtShort(n) {
  const v = Number(n) || 0
  if (!v) return '0'
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'M'
  if (v >= 1e6) return Math.round(v / 1e6) + 'jt'
  return Math.round(v / 1e3) + 'rb'
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
}

export function bucketOf(days) {
  const d = Number(days) || 0
  if (d <= 0) return 0
  if (d <= 30) return 1
  if (d <= 60) return 2
  return 3
}

export const STAGE_LABEL = { LEAD: 'Lead', OPPORTUNITY: 'Opportunity', QUOTE: 'Quote' }

// Warna mengikuti prototype tim functional: Lead oranye, Opportunity biru, Quote kuning
export function stageColor(stage) {
  const s = String(stage || '').toUpperCase()
  if (s === 'LEAD') return 'var(--orange)'
  if (s === 'OPPORTUNITY') return 'var(--blue)'
  if (s === 'QUOTE') return 'var(--amber)'
  return 'var(--mut)'
}

export function winLossMeta(winLoss) {
  const s = String(winLoss || 'OPEN').toUpperCase()
  if (s === 'WIN') return { label: 'Win', color: 'var(--green)' }
  if (s === 'LOSE') return { label: 'Lose', color: 'var(--pink)' }
  return { label: 'Open', color: 'var(--mut)' }
}

/**
 * Pipeline Customer (hasil meeting Okt 2026, poin 6): 8 status linear, menggantikan Stage+Status
 * lama sebagai acuan utama. Warna & label persis sama dengan LeadTaskService::STATUS_CUSTOMER_STEPS
 * di backend, supaya badge di sini dan bar dashboard konsisten.
 */
export const STATUS_CUSTOMER_STEPS = [
  ['LEAD', 'Lead', 'var(--mut)'],
  ['PROSPEK', 'Prospek', 'var(--orange2)'],
  ['BRAND_AWARENESS', 'Brand Awareness', 'var(--blue)'],
  ['SAMPLING', 'Sampling', '#7C5CFC'],
  ['QUOTATION', 'Quotation', 'var(--amber)'],
  ['WIN', 'Win', 'var(--green)'],
  ['LOSE', 'Lose', 'var(--pink)'],
  ['DISTRIBUTION', 'Distribution', '#0B7A46'],
]

export const STATUS_CUSTOMER_LABEL = Object.fromEntries(STATUS_CUSTOMER_STEPS.map(([k, label]) => [k, label]))

export function statusCustomerMeta(status) {
  const s = String(status || 'PROSPEK').toUpperCase()
  const found = STATUS_CUSTOMER_STEPS.find(([k]) => k === s)
  return { label: found ? found[1] : s, color: found ? found[2] : 'var(--mut)' }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return String(iso)
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}

/** Selisih hari dari hari ini (lokal) ke tanggal YYYY-MM-DD. Negatif = sudah lewat. */
export function daysFromToday(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86400000)
}

/** Label jadwal tugas: Belum dijadwalkan / Jadwal: dd Mmm / Terlambat n hari */
export function dueMeta(iso) {
  if (!iso) return { label: 'Belum dijadwalkan', color: 'var(--mut)' }
  const d = daysFromToday(iso)
  if (d < 0) return { label: `Terlambat ${-d} hari`, color: 'var(--pink)' }
  if (d === 0) return { label: 'Jadwal hari ini', color: 'var(--amber)' }
  if (d === 1) return { label: 'Jadwal besok', color: 'var(--green)' }
  return { label: `Jadwal: ${fmtDate(iso)}`, color: 'var(--green)' }
}

export function listOf(data) {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.data)) return data.data
  if (Array.isArray(data.items)) return data.items
  return []
}

/** Samakan shape inventory/product agar UI tidak tampil undefined */
export function normalizeProduct(row = {}) {
  const nested = row.product || {}
  const part = row.part_num || row.sku || nested.part_num || ''
  const desc = row.description || row.name || nested.description || nested.name || ''
  const productId = row.product_id || nested.id || (row.part_num || row.sku ? row.id : null) || row.id
  return {
    ...row,
    id: productId,
    inventory_id: row.id,
    product_id: productId,
    part_num: part,
    sku: part,
    description: desc,
    name: desc,
    uom: row.uom || nested.uom || 'DUS',
    price: Number(row.price ?? nested.price ?? 0),
    warehouse: row.warehouse || '',
    bin: row.bin || '',
    loc: row.loc || [row.warehouse, row.bin ? `Bin ${row.bin}` : ''].filter(Boolean).join(' · '),
    on_hand_qty: Number(row.on_hand_qty ?? 0),
    available_qty: Number(row.available_qty ?? row.on_hand_qty ?? row.q ?? 0),
    q: Number(row.available_qty ?? row.on_hand_qty ?? row.q ?? 0),
  }
}

export function listProducts(data) {
  return listOf(data).map(normalizeProduct)
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function hhmm(d = new Date()) {
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

export function haversineMeters(a, b) {
  const R = 6371000
  const r = (x) => (x * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
