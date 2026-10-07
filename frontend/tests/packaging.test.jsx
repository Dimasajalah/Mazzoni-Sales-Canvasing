import { describe, expect, it } from 'vitest'
import { effectivePercent, kgToPcs, lineCalc, strataFor } from '../src/lib/packaging.js'

describe('kgToPcs (cermin aturan server)', () => {
  it('menghitung pcs = Kg x 1000 / gramasi, dibulatkan ke atas', () => {
    expect(kgToPcs(1, 20)).toBe(50)
    expect(kgToPcs(100, 500)).toBe(200)
    expect(kgToPcs(1.05, 500)).toBe(3)
    expect(kgToPcs(0.1, 500)).toBe(1) // minimal 1 pcs
  })

  it('tidak meleset satu pcs akibat presisi floating point (kasus nyata)', () => {
    expect(Math.ceil((4.03 * 1000) / 10)).toBe(404) // perhitungan naif SALAH
    expect(kgToPcs(4.03, 10)).toBe(403)
    expect(kgToPcs(8.05, 50)).toBe(161)
    expect(kgToPcs(8.05, 25)).toBe(322)
  })

  it('sama dengan hitungan bilangan bulat eksak di 55.000 kombinasi (sama seperti pemeriksaan server)', () => {
    const grams = [10, 20, 25, 40, 50, 100, 125, 150, 200, 250, 500]
    let bad = 0
    for (let k = 1; k <= 5000; k++) {
      for (const g of grams) {
        const exact = (k * 10) % g === 0 ? (k * 10) / g : Math.floor((k * 10) / g) + 1
        if (kgToPcs(k / 100, g) !== exact) bad++
      }
    }
    expect(bad).toBe(0)
  })

  it('masukan tidak valid menghasilkan 0', () => {
    expect(kgToPcs(0, 100)).toBe(0)
    expect(kgToPcs(-1, 100)).toBe(0)
    expect(kgToPcs(5, 0)).toBe(0)
    expect(kgToPcs('', 100)).toBe(0)
  })
})

describe('strataFor', () => {
  const tiers = [
    { product_id: null, min_kg: '100', max_kg: '499', discount_percent: '2' },
    { product_id: null, min_kg: '500', max_kg: null, discount_percent: '4' },
    { product_id: 7, min_kg: '500', max_kg: null, discount_percent: '6' },
    { product_id: null, min_kg: '50', max_kg: null, discount_percent: '9', active: false },
  ]

  it('mengikuti batas tier, mendahulukan tier produk, dan mengabaikan yang nonaktif', () => {
    expect(strataFor(tiers, 7, 99)).toBe(0)
    expect(strataFor(tiers, 7, 100)).toBe(2)
    expect(strataFor(tiers, 7, 499)).toBe(2)
    expect(strataFor(tiers, 7, 500)).toBe(6)
    expect(strataFor(tiers, 8, 500)).toBe(4)
    expect(strataFor([], 7, 500)).toBe(0)
    expect(strataFor(tiers, 7, 0)).toBe(0)
  })
})

describe('lineCalc', () => {
  it('hasilnya sama dengan contoh di tes backend — bertingkat, bukan dijumlah (100 Kg, 500 gr, Rp 28.500, strata 2% + Disc1 1%)', () => {
    const tiers = [{ product_id: null, min_kg: '100', max_kg: '499', discount_percent: '2' }]
    // Poin 15: 1 - (0,98 x 0,99) = 2,98% (bukan 3% dijumlah) -> total 5.530.140 (bukan 5.529.000)
    const r = lineCalc({ tiers, productId: 1, qtyKg: 100, gramasi: 500, unitPrice: 28500, discPercents: [1] })
    expect(r).toEqual({ pcs: 200, strata: 2, effective: 2.98, gross: 5700000, total: 5530140 })
  })

  it('diskon efektif bertingkat tetap dibatasi 100% kalau salah satu kolom 100%', () => {
    // 50% lalu 100% -> sisa jadi 0, efektif tetap 100% (bukan 150% dijumlah)
    expect(effectivePercent(100, 50)).toBe(100)
  })
})
