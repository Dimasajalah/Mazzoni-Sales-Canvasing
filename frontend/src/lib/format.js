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

export function stageColor(stage) {
  const s = String(stage || '').toUpperCase()
  if (s === 'NEW') return 'var(--orange2)'
  if (s === 'CONTACTED' || s === 'CONTACT') return 'var(--blue)'
  if (s === 'QUALIFIED') return 'var(--orange)'
  if (s === 'QUOTE') return 'var(--amber)'
  if (s === 'WON') return 'var(--green)'
  if (s === 'LOST') return 'var(--pink)'
  return 'var(--mut)'
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
