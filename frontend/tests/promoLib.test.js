import { describe, expect, it } from 'vitest'
import { bonusText, endsIn, isValidNow, KINDS, promoKind, promoRef } from '../src/lib/promo.js'

// 12 Okt 2026 pukul 12:00 waktu lokal
const NOW = new Date('2026-10-12T12:00:00').getTime()

describe('promo: "Ends in …"', () => {
  it('di bawah 7 hari menampilkan hari dan jam', () => {
    expect(endsIn('2026-10-16', NOW)).toBe('4d 11h') // sampai 16 Okt 23:59
  })

  it('7 hari atau lebih menampilkan hari saja', () => {
    expect(endsIn('2026-10-24', NOW)).toBe('12d')
    expect(endsIn('2026-10-19', NOW)).toBe('7d')
  })

  it('hari yang sama menampilkan jam; sudah lewat atau tanpa batas: null', () => {
    expect(endsIn('2026-10-12', NOW)).toBe('11h')
    expect(endsIn('2026-10-11', NOW)).toBeNull()
    expect(endsIn(null, NOW)).toBeNull()
  })
})

describe('promo: masa berlaku', () => {
  it('berlaku bila sudah mulai dan belum berakhir; tanpa tanggal selalu berlaku', () => {
    expect(isValidNow({ end_date: '2026-10-20' }, NOW)).toBe(true)
    expect(isValidNow({ start_date: '2026-10-01', end_date: '2026-10-20' }, NOW)).toBe(true)
    expect(isValidNow({}, NOW)).toBe(true)
  })

  it('belum mulai atau sudah berakhir: tidak berlaku', () => {
    expect(isValidNow({ start_date: '2026-10-13', end_date: '2026-10-20' }, NOW)).toBe(false)
    expect(isValidNow({ end_date: '2026-10-11' }, NOW)).toBe(false)
  })
})

describe('promo: jenis kartu dan kunci', () => {
  it('jenis dari kolom jenis atau dari nama dan kode', () => {
    expect(promoKind({ name: 'Buy 10 ctn, get 1 FREE', promo_code: 'MZN10FREE1' })).toBe(KINDS.active)
    expect(promoKind({ name: 'Extra 5% off first order', promo_code: 'WELCOME5' })).toBe(KINDS.new)
    expect(promoKind({ name: 'Free POSM display pack', promo_code: 'POSMFREE' })).toBe(KINDS.bundle)
    expect(promoKind({ name: 'Apa saja', type: 'Bundle' })).toBe(KINDS.bundle)
  })

  it('kunci promo = kode, atau id bila tanpa kode', () => {
    expect(promoRef({ id: 3, promo_code: 'WELCOME5' })).toBe('WELCOME5')
    expect(promoRef({ id: 3 })).toBe('3')
  })
})

describe('promo: teks Promo Bonus', () => {
  it('dari nama "Buy 10 ctn, get 1 FREE" menjadi "1 ctn free"', () => {
    expect(bonusText({ name: 'Buy 10 ctn, get 1 FREE' })).toBe('1 ctn free')
    expect(bonusText({ name: 'Buy 5 pcs get 2 pcs FREE' })).toBe('2 pcs free')
  })

  it('kolom bonus_text didahulukan; tanpa pola: null', () => {
    expect(bonusText({ name: 'Buy 10 ctn, get 1 FREE', bonus_text: '2 ctn free' })).toBe('2 ctn free')
    expect(bonusText({ name: 'Extra 5% off first order' })).toBeNull()
  })
})