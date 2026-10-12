// frontend/src/lib/promo.js
// Pembantu layar 11 Promo (Customer-facing, dokumen hal. 36): masa berlaku, "Ends in …", dan jenis kartu.

/** Akhir hari end_date (tanggal murni YYYY-MM-DD) sebagai penanda waktu lokal. */
const endOf = (endDate) => new Date(`${String(endDate).slice(0, 10)}T23:59:59`).getTime()

/** "3d 12h", "12d", atau "5h"; null bila tidak punya batas atau sudah lewat. Di atas 7 hari jam tidak ditampilkan. */
export function endsIn(endDate, now = Date.now()) {
  if (!endDate) return null
  const ms = endOf(endDate) - now
  if (!(ms > 0)) return null
  const hours = Math.floor(ms / 3600000)
  const d = Math.floor(hours / 24)
  const h = hours % 24
  if (d >= 7) return `${d}d`
  if (d === 0) return `${h}h`
  return h ? `${d}d ${h}h` : `${d}d`
}

/** Promo yang berlaku sekarang: sudah mulai (bila ada start_date) dan belum berakhir (bila ada end_date). */
export function isValidNow(p, now = Date.now()) {
  if (p.start_date && new Date(`${String(p.start_date).slice(0, 10)}T00:00:00`).getTime() > now) return false
  if (p.end_date && endOf(p.end_date) <= now) return false
  return true
}

export const KINDS = {
  active: { cls: 'active', emoji: '🔥', label: 'ACTIVE' },
  new: { cls: 'new', emoji: '🆕', label: 'NEW CUSTOMER' },
  bundle: { cls: 'bundle', emoji: '🎁', label: 'BUNDLE' },
}

/** Jenis kartu: dari kolom jenis/kategori bila ada, jika tidak dari nama dan kode promo. */
export function promoKind(p) {
  const text = [p.badge, p.type, p.category, p.tag, p.name, p.promo_code].filter(Boolean).join(' ').toLowerCase()
  if (/new customer|\bnoo\b|first order|welcome/.test(text)) return KINDS.new
  if (/bundle|posm|display pack/.test(text)) return KINDS.bundle
  return KINDS.active
}

/** Kunci promo yang disimpan saat Apply: kode promo, atau id bila tanpa kode. */
export const promoRef = (p) => String(p.promo_code || p.id)

/** Teks Promo Bonus di Totals ("1 ctn free"): dari kolom bonus_text bila ada, atau dari nama seperti "Buy 10 ctn, get 1 FREE". */
export function bonusText(p) {
  if (p.bonus_text) return String(p.bonus_text)
  const m = /get\s+(\d+)\s*([a-z]+)?\s*free/i.exec(p.name || '')
  if (!m) return null
  const unit = m[2] && m[2].toLowerCase() !== 'free' ? m[2] : 'ctn'
  return `${m[1]} ${unit.toLowerCase()} free`
}