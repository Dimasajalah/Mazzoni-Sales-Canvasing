//frontend/tests/returnForm.test.js
import { describe, expect, it } from 'vitest'
import { buildReturnFormData } from '../src/lib/returnForm.js'

const form = {
  customer_id: '7', product_id: '3', qty: '2', so_reference: 'SO-STG-2026-000001',
  reason: 'Kemasan rusak saat pengiriman', condition_notes: '', client_uuid: '0b4f2d8e-6f0a-4c1e-9d55-1a2b3c4d5e6f',
}
const photo = (name) => new File(['x'], name, { type: 'image/png' })
const entries = (fd) => [...fd.entries()]

describe('buildReturnFormData', () => {
  it('product_id dan qty masuk ke lines[0], bukan field biasa', () => {
    const fd = buildReturnFormData(form, 11, [photo('a.png')])
    expect(fd.get('lines[0][product_id]')).toBe('11')
    expect(fd.get('lines[0][qty]')).toBe('2')
    expect(fd.has('product_id')).toBe(false)
    expect(fd.has('qty')).toBe(false)
  })

  it('memakai id produk yang diberikan, bukan product_id mentah dari form', () => {
    expect(buildReturnFormData(form, 99, []).get('lines[0][product_id]')).toBe('99')
  })

  it('foto dikirim sebagai attachments[] (bukan photos[]), satu entri per foto', () => {
    const fd = buildReturnFormData(form, 11, [photo('a.png'), photo('b.png')])
    const att = entries(fd).filter(([k]) => k === 'attachments[]')
    expect(att).toHaveLength(2)
    expect(att.map(([, f]) => f.name)).toEqual(['a.png', 'b.png'])
    expect(fd.has('photos[]')).toBe(false)
  })

  it('field header ikut terkirim dan field kosong dihilangkan', () => {
    const fd = buildReturnFormData(form, 11, [photo('a.png')])
    expect(fd.get('customer_id')).toBe('7')
    expect(fd.get('so_reference')).toBe('SO-STG-2026-000001')
    expect(fd.get('reason')).toBe('Kemasan rusak saat pengiriman')
    expect(fd.get('client_uuid')).toBe(form.client_uuid)
    expect(fd.has('condition_notes')).toBe(false) // kosong
  })

  it('hanya satu baris lines yang dikirim', () => {
    const keys = entries(buildReturnFormData(form, 11, [photo('a.png')])).map(([k]) => k)
    expect(keys.filter((k) => k.startsWith('lines['))).toEqual(['lines[0][product_id]', 'lines[0][qty]'])
  })

  it('tanpa foto tidak ada attachments[]', () => {
    expect(buildReturnFormData(form, 11, []).has('attachments[]')).toBe(false)
  })
})