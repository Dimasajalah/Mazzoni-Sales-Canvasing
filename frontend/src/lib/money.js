// frontend/src/lib/money.js
// Rupiah penuh tanpa singkatan ("Rp 13.500.000"), sesuai dokumen Quotation (hal. 32 sampai 34).
// Sengaja terpisah dari fmtRp bawaan karena format bawaan bisa berbeda (mis. gaya singkat "Rp 13,5jt").
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export function fmtIdr(v) {
  const n = Number(v)
  return `Rp ${nf.format(Number.isFinite(n) ? Math.round(n) : 0)}`
}