// frontend/src/components/ActivityTimeline.jsx
// Daftar kronologis aktivitas customer (dokumen hal. 18): ikon berwarna, judul, keterangan, waktu.
import '../styles/activity.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n) => String(n).padStart(2, '0')

/** "01 Oct 2026, 15:34" (format contoh di dokumen) */
export function fmtStamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${two(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`
}

const KIND = {
  checkin: {
    tone: 'red',
    icon: (<><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  },
  checkout: { tone: 'sand', icon: <path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6M3 21h18" /> },
  task: { tone: 'green', icon: <path d="M5 12l5 5L20 7" /> },
  pipeline: { tone: 'blue', icon: <path d="M4 7h12M12 3l4 4-4 4M20 17H8M12 13l-4 4 4 4" /> },
  sample: { tone: 'gold', icon: <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" /> },
}

export default function ActivityTimeline({ items = [], loading = false }) {
  if (loading) return <div className="loading-center">Memuat…</div>
  if (!items.length) {
    return (
      <div className="muted" style={{ fontSize: 12.5, padding: '4px 2px' }}>
        Belum ada aktivitas tercatat
      </div>
    )
  }
  return (
    <div>
      {items.map((e, i) => {
        const k = KIND[e.kind] || KIND.task
        return (
          <div className="ac-item" key={`${e.kind}-${e.at}-${i}`}>
            <span className={`ac-ic ${k.tone}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {k.icon}
              </svg>
            </span>
            <div className="ac-body">
              <div className="ac-t">{e.title}</div>
              {e.subtitle ? <div className="ac-s">{e.subtitle}</div> : null}
              <div className="ac-d">{fmtStamp(e.at)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
