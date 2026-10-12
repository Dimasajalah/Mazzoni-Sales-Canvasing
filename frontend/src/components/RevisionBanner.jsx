// frontend/src/components/RevisionBanner.jsx
// Banner revisi sample (dokumen hal. 28): v1 v2 v3 + "Revision n of max 3 — label & batch info goes in Comment below".
// Revisi yang sudah lewat hijau, yang sedang berjalan emas, yang belum bergaris putus-putus.
import '../styles/taskpage.css'

export function RevisionBanner({ revision, max = 3 }) {
  if (!revision) return null
  return (
    <div className="rv-banner">
      <div className="rv-chips">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <span key={n} className={`rv-chip ${n < revision ? 'done' : n === revision ? 'now' : 'next'}`}>
            v{n}
          </span>
        ))}
      </div>
      <div className="rv-text">
        Revision {revision} of max {max} — label &amp; batch info goes in Comment below
      </div>
    </div>
  )
}
