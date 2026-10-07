import { describe, expect, it } from 'vitest'
import { matchByName } from '../src/lib/wilayah.js'

const PROVINCES = [
  { id: '31', name: 'DKI JAKARTA' },
  { id: '32', name: 'JAWA BARAT' },
  { id: '34', name: 'DI YOGYAKARTA' },
  { id: '19', name: 'KEPULAUAN BANGKA BELITUNG' },
  { id: '91', name: 'PAPUA' },
  { id: '92', name: 'PAPUA BARAT' },
]
const JABAR = [
  { id: '3201', name: 'KABUPATEN BOGOR' },
  { id: '3204', name: 'KABUPATEN BANDUNG' },
  { id: '3217', name: 'KABUPATEN BANDUNG BARAT' },
  { id: '3271', name: 'KOTA BOGOR' },
  { id: '3273', name: 'KOTA BANDUNG' },
]
const JAKARTA = [
  { id: '3101', name: 'KABUPATEN KEPULAUAN SERIBU' },
  { id: '3173', name: 'KOTA JAKARTA PUSAT' },
  { id: '3174', name: 'KOTA JAKARTA BARAT' },
]

const BANTEN = [
    { id: '3601', name: 'KABUPATEN PANDEGLANG' },
    { id: '3603', name: 'KABUPATEN TANGERANG' },
    { id: '3671', name: 'KOTA TANGERANG' },
    { id: '3674', name: 'KOTA TANGERANG SELATAN' },
  ]

describe('matchByName: provinsi', () => {
  it('nama resmi panjang dari peta cocok ke daftar wilayah', () => {
    expect(matchByName(PROVINCES, 'Daerah Khusus Ibukota Jakarta')?.id).toBe('31')
    expect(matchByName(PROVINCES, 'Daerah Istimewa Yogyakarta')?.id).toBe('34')
    expect(matchByName(PROVINCES, 'Jakarta')?.id).toBe('31')
    expect(matchByName(PROVINCES, 'Bangka Belitung')?.id).toBe('19')
  })

  it('Papua tidak tertukar dengan Papua Barat', () => {
    expect(matchByName(PROVINCES, 'Papua')?.id).toBe('91')
    expect(matchByName(PROVINCES, 'Papua Barat')?.id).toBe('92')
  })
})

describe('matchByName: kota dan kabupaten', () => {
  it('tanpa awalan memilih Kota, bukan Kabupaten', () => {
    expect(matchByName(JABAR, 'Bandung')?.id).toBe('3273')
    expect(matchByName(JABAR, 'Bogor')?.id).toBe('3271')
  })

  it('awalan Kota/Kabupaten/Kab. diikuti', () => {
    expect(matchByName(JABAR, 'Kota Bandung')?.id).toBe('3273')
    expect(matchByName(JABAR, 'Kabupaten Bandung')?.id).toBe('3204')
    expect(matchByName(JABAR, 'Kab. Bogor')?.id).toBe('3201')
  })

  it('Bandung Barat tidak tertukar dengan Bandung', () => {
    expect(matchByName(JABAR, 'Bandung Barat')?.id).toBe('3217')
  })

  it('kota Jakarta cocok dengan atau tanpa awalan', () => {
    expect(matchByName(JAKARTA, 'Jakarta Pusat')?.id).toBe('3173')
    expect(matchByName(JAKARTA, 'Kota Jakarta Pusat')?.id).toBe('3173')
  })

  it('tidak ada padanan atau masukan kosong: null', () => {
    expect(matchByName(JAKARTA, 'Surabaya')).toBeNull()
    expect(matchByName(JAKARTA, '')).toBeNull()
    expect(matchByName([], 'Bandung')).toBeNull()
  })

  it('Tangerang: awalan menentukan, tanpa awalan memilih Kota, Tangerang Selatan tidak tertukar', () => {
    expect(matchByName(BANTEN, 'Kabupaten Tangerang')?.id).toBe('3603')
    expect(matchByName(BANTEN, 'Tangerang')?.id).toBe('3671')
    expect(matchByName(BANTEN, 'Tangerang Selatan')?.id).toBe('3674')
  })
})