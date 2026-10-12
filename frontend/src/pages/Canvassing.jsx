// frontend/src/pages/Canvassing.jsx
// Dokumen hal. 10 (01b Canvassing: Today's Route). Rute hari ini = lead/customer tahap Prospect dan
// Sampling, diurutkan menurut jarak dari GPS. Bukan jadwal tetap: boleh check-in ke yang mana saja.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLeads, getVisits } from '../api'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { useGeolocation } from '../hooks/useGeolocation'
import { haversineMeters, hhmm, initials, listOf, statusCustomerMeta } from '../lib/format'
import '../styles/canvassing.css'

const ROUTE_STAGES = ['PROSPEK', 'SAMPLING']
const FILTERS = [
  ['ALL', 'All'],
  ['NOT', 'Not Visited'],
  ['VIS', 'Visited'],
]

const sameDay = (iso) => {
  if (!iso) return false
  const d = new Date(iso)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

export default function Canvassing() {
  const nav = useNavigate()
  const { showToast } = useUi()
  const { coords, refresh } = useGeolocation()
  const [leads, setLeads] = useState([])
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    let alive = true
    const safe = (p) =>
      p.catch((e) => {
        if (alive) showToast(e.message || 'Gagal memuat data', { warn: true })
        return null
      })
    Promise.all([safe(getLeads({ per_page: 100 })), safe(getVisits({ per_page: 100 }))])
      .then(([l, v]) => {
        if (!alive) return
        setLeads(listOf(l))
        setVisits(listOf(v))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [showToast])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const items = useMemo(() => {
    const today = visits.filter((v) => sameDay(v.checkin_at))
    return leads
      .map((l) => {
        const stage = !l.status_customer || l.status_customer === 'LEAD' ? 'PROSPEK' : l.status_customer
        const visit = today.find((v) => v.lead_id === l.id || (l.customer_id && v.customer_id === l.customer_id))
        const dist =
          coords && l.latitude != null && l.longitude != null
            ? haversineMeters(coords, { lat: Number(l.latitude), lng: Number(l.longitude) })
            : null
        return {
          id: l.id,
          stage,
          name: l.business_name || '',
          meta: [l.business_type, l.city].filter(Boolean).join(' · '),
          dist,
          visitedAt: visit ? hhmm(new Date(visit.checkin_at)) : null,
        }
      })
      .filter((i) => ROUTE_STAGES.includes(i.stage))
      .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity) || a.name.localeCompare(b.name))
  }, [leads, visits, coords])

  const visitedCount = items.filter((i) => i.visitedAt).length
  const remaining = items.length - visitedCount
  const nearestId = items.find((i) => !i.visitedAt && i.dist != null)?.id
  const shown = items.filter((i) => (filter === 'ALL' ? true : filter === 'VIS' ? i.visitedAt : !i.visitedAt))
  const counts = { ALL: items.length, NOT: remaining, VIS: visitedCount }
  const dateText = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <Screen>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav('/home')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ flex: 1 }}>
          <div>Canvassing</div>
          <div className="tt-sub">Today's planned route · {dateText}</div>
        </div>
        <button
          type="button"
          className="cv-loc"
          aria-label="Refresh GPS"
          onClick={() => refresh().catch(() => showToast('GPS tidak tersedia', { warn: true }))}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </button>
      </div>

      <div className="cv-stats">
        <div className="cv-s">
          <b>{items.length}</b>
          <span>PLANNED</span>
        </div>
        <div className="cv-s">
          <b style={{ color: 'var(--green)' }}>{visitedCount}</b>
          <span>VISITED</span>
        </div>
        <div className="cv-s">
          <b style={{ color: 'var(--primary)' }}>{remaining}</b>
          <span>REMAINING</span>
        </div>
      </div>

      <div className="cv-seg">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {label} · {counts[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-center">Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: '8px 2px' }}>
          Tidak ada customer pada rute ini.
        </div>
      ) : (
        shown.map((i) => {
          const st = statusCustomerMeta(i.stage)
          const near = i.id === nearestId
          const meta = [i.meta, i.dist != null ? `${(i.dist / 1000).toFixed(1)} km` : null].filter(Boolean).join(' · ')
          return (
            <div key={i.id} className={`cv-card${i.visitedAt ? ' vis' : ''}${near ? ' near' : ''}`}>
              <div className="cv-row">
                <span className="cv-av" style={{ background: `${st.color}26`, color: st.ink }}>
                  {initials(i.name)}
                </span>
                <div className="cv-main">
                  <div className="cv-name">{i.name}</div>
                  <div className="cv-meta">{meta || '—'}</div>
                </div>
                {i.visitedAt ? (
                  <span className="cv-pill vis">Visited · {i.visitedAt}</span>
                ) : (
                  <span className="cv-pill">Not Visited</span>
                )}
              </div>
              {!i.visitedAt && (
                <button
                  type="button"
                  className={`cv-go${near ? ' red' : ''}`}
                  onClick={() => nav('/checkin', { state: { leadId: i.id } })}
                >
                  Check In →
                </button>
              )}
            </div>
          )
        })
      )}

      <p className="cv-note">
        Route is today's Prospect / Sampling-stage customers sorted by distance from your current location — not a
        fixed schedule, you can check in to any of them in any order.
      </p>
    </Screen>
  )
}
