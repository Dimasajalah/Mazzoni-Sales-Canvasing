// frontend/src/lib/wilayah.js
// Data wilayah administratif Indonesia (Provinsi + Kabupaten/Kota) — sumber resmi publik, gratis,
// tanpa API key: api-wilayah-indonesia oleh emsifa (https://github.com/emsifa/api-wilayah-indonesia).
// Dipakai supaya dropdown Provinsi/Kota di New Lead konsisten dengan data administratif resmi,
// bukan teks bebas yang gampang typo/tidak seragam.
const BASE = 'https://raw.githubusercontent.com/emsifa/api-wilayah-indonesia/gh-pages/api'

let provincesCache = null
const regenciesCache = new Map()

async function fetchJson(url, what) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Gagal memuat ${what} (HTTP ${res.status})`)
  return res.json()
}

/** @returns {Promise<{id:string,name:string}[]>} 34 provinsi, terurut sesuai kode wilayah resmi. */
export async function getProvinces() {
  if (provincesCache) return provincesCache
  provincesCache = await fetchJson(`${BASE}/provinces.json`, 'daftar provinsi')
  return provincesCache
}

/** @returns {Promise<{id:string,province_id:string,name:string}[]>} Kab/Kota dalam satu provinsi. */
export async function getRegencies(provinceId) {
  if (!provinceId) return []
  if (regenciesCache.has(provinceId)) return regenciesCache.get(provinceId)
  const rows = await fetchJson(`${BASE}/regencies/${provinceId}.json`, 'daftar kota')
  regenciesCache.set(provinceId, rows)
  return rows
}

const clean = (s) => String(s || '').toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()

// Nama resmi panjang yang penulisannya beda dari daftar wilayah
const ALIAS = {
  'DAERAH KHUSUS IBUKOTA JAKARTA': 'DKI JAKARTA',
  'DAERAH ISTIMEWA YOGYAKARTA': 'DI YOGYAKARTA',
}

// Pisahkan awalan administratif: "KOTA SURABAYA" -> { kind: 'KOTA', base: 'SURABAYA' }
function parts(name) {
  let text = clean(name).replace(/^PROVINSI\s+/, '')
  let kind = null
  const m = text.match(/^(KOTA|KABUPATEN|KAB)\s+/)
  if (m) {
    kind = m[1] === 'KOTA' ? 'KOTA' : 'KABUPATEN'
    text = text.slice(m[0].length)
  }
  return { base: text.replace(/^(ADMINISTRASI|ADM)\s+/, ''), kind }
}

/**
 * Cocokkan nama bebas (hasil peta: "Surabaya", "Kota Surabaya", "Daerah Khusus Ibukota Jakarta")
 * ke entri resmi {id,name} (mis. "KOTA SURABAYA", "DKI JAKARTA").
 * Kota dan Kabupaten dengan nama sama (Bandung, Bogor, Malang…): ikuti awalan kalau ada,
 * kalau tidak ada awalan pilih Kota.
 */
export function matchByName(list, name) {
  if (!name || !Array.isArray(list) || list.length === 0) return null
  const cleaned = clean(name)
  const wanted = parts(ALIAS[cleaned] || cleaned)
  if (!wanted.base) return null

  const rows = list.map((r) => ({ r, ...parts(r.name) }))

  const same = rows.filter((x) => x.base === wanted.base)
  if (same.length === 1) return same[0].r
  if (same.length > 1) {
    const kind = wanted.kind || 'KOTA'
    return (same.find((x) => x.kind === kind) || same[0]).r
  }

  // Salah satu mengandung yang lain ("BANGKA BELITUNG" ⊂ "KEPULAUAN BANGKA BELITUNG"):
  // pilih yang panjangnya paling dekat.
  const near = rows
    .filter((x) => x.base.length >= 4 && (x.base.includes(wanted.base) || wanted.base.includes(x.base)))
    .sort((a, b) => Math.abs(a.base.length - wanted.base.length) - Math.abs(b.base.length - wanted.base.length))
  return near[0]?.r || null
}