// frontend/src/pages/ChooseActivity.jsx
// Dokumen hal. 24 (07 Choose Activity): setelah check-in ulang, sales memilih aktivitas kunjungan ini.
// Satu kartu per jenis tugas yang tersedia di tahap lead (= aksi pada tugas aktifnya).
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getVisit } from '../api'
import { Screen } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { canOrder } from '../lib/roles'
import '../styles/chooseactivity.css'

const ICONS = {
  tag: (<><path d="M20 12l-8 8-9-9V3h8z" /><circle cx="7.5" cy="7.5" r="1.2" /></>),
  box: (<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>),
  sync: (<><path d="M20 11a8 8 0 00-14.5-3.5M4 4v4h4" /><path d="M4 13a8 8 0 0014.5 3.5M20 20v-4h-4" /></>),
  doc: (<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>),
  cart: (<><path d="M3 4h2l2.4 11h10.2l2-8H6.2" /><circle cx="9" cy="19.5" r="1.3" /><circle cx="18" cy="19.5" r="1.3" /></>),
  check: <path d="M5 12l5 5L20 7" />,
  camera: (<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
}

function Ic({ n, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[n]}
    </svg>
  )
}

const OPTIONS = {
  brand: { tone: 'blue', icon: 'tag', title: 'Brand Awareness', sub: "Introduce Mazzoni's brand and product range" },
  sample: { tone: 'red', icon: 'box', title: 'New Sample', sub: 'Offer a new product or quantity' },
  feedback: { tone: 'blue', icon: 'sync', title: 'Follow Up Sample', sub: 'Record the customer feedback on a sample already given' },
  quote: { tone: 'violet', icon: 'doc', title: 'Quotation', sub: 'Create or continue the quotation' },
  order: { tone: 'green', icon: 'cart', title: 'Create Order', sub: 'Turn the won quotation into a sales order' },
  conclude: { tone: 'green', icon: 'check', title: 'Complete Task', sub: 'Record the conclusion and the next task' },
  promo: { tone: 'violet', icon: 'tag', title: 'Promo for This Store', sub: 'Promos valid for this customer — apply to the order' },
}

const two = (n) => String(n).padStart(2, '0')

export default function ChooseActivity() {
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [visit, setVisit] = useState(loc.state?.visit || null)
  const [elapsed, setElapsed] = useState('00:00')

  // Selalu muat ulang dari server: tugas aktif berubah setelah form tugas disimpan lalu pengguna kembali ke sini.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const v = await getVisit(id)
        if (alive && v) setVisit(v)
      } catch (e) {
        if (alive && !loc.state?.visit) showToast(e.message || 'Gagal memuat kunjungan', { warn: true })
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const startedAt = visit?.checkin_at || loc.state?.checkedInAt
  useEffect(() => {
    if (!startedAt) return undefined
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
      setElapsed(`${two(Math.floor(s / 60))}:${two(s % 60)}`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [startedAt])

  const lead = visit?.lead || null
  const customer = visit?.customer || null
  const task = lead?.current_task || null
  const name = lead?.business_name || customer?.name || 'Customer'
  const address = lead?.address || customer?.address || ''
  const distance = visit?.checkin_distance != null ? `${Math.round(Number(visit.checkin_distance))} m from store` : ''
  const visitId = visit?.id || id

  const ordering = canOrder(user)
  const actions = (task?.actions || []).filter((a) => OPTIONS[a] && (a !== 'order' || ordering))
  const keys = task ? (actions.length ? actions : ['conclude']) : []

  const hubState = { visitId, visit, customer, lead, distance: visit?.checkin_distance, checkedInAt: visit?.checkin_at }
  const toState =
    lead && task
      ? {
          leadId: lead.id,
          leadTaskId: task.id,
          customerId: lead.customer_id ?? customer?.id ?? null,
          customerName: lead.business_name,
          taskSetId: lead.task_set_id ?? null,
          taskSeq: task.seq ?? null,
          taskClosing: task.is_closing ?? false,
          task: {
            name: task.name,
            task_type: task.task_type,
            stage: task.stage,
            status: task.status,
            remark: task.remark ?? null,
            assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
          },
        }
      : null

  const go = async (key) => {
    if (key === 'promo') return nav(`/visit/${visitId}/promo`, { state: { visit } })
    if (!toState) return
    if (key === 'brand') {
      nav(`/visit/${visitId}/brand`, { state: { visit } })
      return
    }
    if (key === 'conclude') {
      nav(`/visit/${visitId}/complete`, { state: { visit } })
      return
    }
    if (key === 'sample') return nav(`/visit/${visitId}/sample`, { state: { visit } })
    if (key === 'feedback') return nav(`/visit/${visitId}/followup`, { state: { visit } })
    if (key === 'order') return nav(`/visit/${visitId}/order`, { state: { visit } })
    if (key === 'quote') return nav(`/visit/${visitId}/quote`, { state: { visit } })
    return undefined
  }

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ flex: 1, minWidth: 0 }}>
          <div>{name}</div>
          <div className="tt-sub">{['Checked in', distance].filter(Boolean).join(' · ')}</div>
        </div>
        <span className="ca-chip">
          <Ic n="clock" size={14} />
          {elapsed}
        </span>
      </div>

      {!visit ? (
        <div className="loading-center">Memuat…</div>
      ) : (
        <>
          <div className="ca-hero">
            <div
              className="ca-hero-top"
              style={
                visit.checkin_photo_url
                  ? { backgroundImage: `linear-gradient(rgba(23,32,43,.3), rgba(23,32,43,.3)), url(${visit.checkin_photo_url})` }
                  : undefined
              }
            >
              {visit.checkin_photo_url ? null : <Ic n="camera" size={26} />}
            </div>
            <div className="ca-hero-body">
              <div className="ca-name">{name}</div>
              {address ? <div className="ca-addr">{address}</div> : null}
            </div>
          </div>

          <h2 className="ca-h">Choose Activity</h2>
          <p className="ca-sub">How would you like to continue this visit?</p>

          {keys.length === 0 ? (
            <div className="ca-empty">Tidak ada tugas aktif untuk kunjungan ini.</div>
          ) : (
            keys.map((k, i) => {
              const o = OPTIONS[k]
              return (
                <button key={k} type="button" className={`ca-opt${i === 0 ? ' hot' : ''}`} onClick={() => go(k)}>
                  <span className={`ca-ic ${o.tone}`}>
                    <Ic n={o.icon} />
                  </span>
                  <span>
                    <div className="ca-t">{o.title}</div>
                    <div className="ca-s">{k === 'conclude' && task?.name ? `${task.name} — ${o.sub}` : o.sub}</div>
                  </span>
                  <span className="ca-chev">›</span>
                </button>
              )
            })
          )}

          {lead ? (
            <button type="button" className="ca-opt" onClick={() => go('promo')}>
              <span className={`ca-ic ${OPTIONS.promo.tone}`}>
                <Ic n={OPTIONS.promo.icon} />
              </span>
              <span>
                <div className="ca-t">{OPTIONS.promo.title}</div>
                <div className="ca-s">{OPTIONS.promo.sub}</div>
              </span>
              <span className="ca-chev">›</span>
            </button>
          ) : null}

          <p className="ca-note">Check-in &amp; store photo have been recorded for today's visit.</p>
          <button type="button" className="ca-end" onClick={() => nav(`/visit-mode/${visitId}`, { state: hubState })}>
            Finish visit (Check-out)
          </button>
        </>
      )}
    </Screen>
  )
}
