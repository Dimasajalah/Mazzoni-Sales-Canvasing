// frontend/src/components/Field.jsx
// Field form dengan label yang terhubung ke kontrolnya (klik label = fokus, terbaca pembaca layar).
// Tampilan tetap memakai class .field dari stylesheet yang ada.
import { cloneElement, useId } from 'react'

export function Field({ label, children, hint, className = '', style }) {
  const id = useId()
  return (
    <div className={`field ${className}`.trim()} style={style}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
      {hint}
    </div>
  )
}
