// frontend/src/components/NumInput.jsx
// Isian angka: saat diketik memakai angka mentah (titik atau koma = desimal); saat tidak sedang diedit tampil dengan
// pemisah ribuan ("4.500"). onChange menerima angka, atau null bila kosong.
import { useState } from 'react'

export const fmtNum = (v) =>
  v === null || v === undefined || v === '' || Number.isNaN(Number(v))
    ? ''
    : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 4 })

export function NumInput({ value, onChange, ...rest }) {
  const [raw, setRaw] = useState(null) // null = tidak sedang diedit
  const shown = raw !== null ? raw : fmtNum(value)
  return (
    <input
      {...rest}
      inputMode="decimal"
      value={shown}
      onFocus={() => setRaw(value === null || value === undefined || value === '' ? '' : String(value))}
      onChange={(e) => {
        const text = e.target.value.replace(/[^0-9.,]/g, '')
        setRaw(text)
        const n = text === '' ? null : Number(text.replace(',', '.'))
        onChange(n === null || Number.isNaN(n) ? null : n)
      }}
      onBlur={() => setRaw(null)}
    />
  )
}
