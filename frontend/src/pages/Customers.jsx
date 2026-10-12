// frontend/src/pages/Customers.jsx
// Dokumen hal. 14 (03 Customers: Pipeline List). Lead dan customer digabung; customer yang
// tidak berasal dari lead tetap muncul. Kartu membuka Check-in; "Detail ›" membuka Detail Customer.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCustomers, getLeads, getVisits } from '../api'
import { Screen } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useDragScroll } from '../hooks/useDragScroll'
import { useUi } from '../context/UiContext'
import { daysFromToday, initials, listOf, statusCustomerMeta } from '../lib/format'
import '../styles/customers.css'

// [kunci status, judul grup, label chip]. Tidak ada tahap "Lead" (dokumen hal. 8 dan 14).
const STAGES = [
  ['PROSPEK', 'Prospect', 'Prospect'],
  ['BRAND_AWARENESS', 'Brand Awareness', 'Brand Aw.'],
  ['SAMPLING', 'Sampling', 'Sampling'],
  ['QUOTATION', 'Quotation', 'Quotation'],
  ['WIN', 'Win', 'Win'],
  ['LOSE', 'Lose', 'Lose'],
  ['DISTRIBUTION', 'Distribution', 'Distribution'],
]
const CLOSED = ['WIN', 'LOSE', 'DISTRIBUTION']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const two = (n) => String(n).padStart(2, '0')
// "28 Sep 2026" dan "1 Oct, 15.34" (format contoh di dokumen)
const fmtDay = (iso) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
const fmtLast = (iso) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${two(d.getHours())}.${two(d.getMinutes())}`
}
const sameDay = (iso) => {
  if (!iso) return false
  const d = new Date(iso)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
// "Rp 13.2jt potential"
const potential = (v) => {
  if (v >= 1e9) return `Rp ${+(v / 1e9).toFixed(1)}M`
  if (v >= 1e6) return `Rp ${+(v / 1e6).toFixed(1)}jt`
  return `Rp ${Math.round(v / 1e3)}rb`
}

export default function Customers() {
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [leads, setLeads] = useState([])
  const [customers, setCustomers] = useState([])
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState(null)
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const chipsRef = useDragScroll()

  useEffect(() => {
    let alive = true
    const safe = (p) =>
      p.catch((e) => {
        if (alive) showToast(e.message || 'Gagal memuat data', { warn: true })
        return null
      })
    // Daftar tampil lebih dulu; data kunjungan (Last visit, Visits today) menyusul tanpa menahan daftar.
    Promise.all([safe(getLeads({ per_page: 100 })), safe(getCustomers({}))])
      .then(([l, c]) => {
        if (!alive) return null
        setLeads(listOf(l))
        setCustomers(listOf(c))
        setLoading(false)
        return getVisits({ per_page: 100 })
      })
      .then((v) => {
        if (alive && v) setVisits(listOf(v))
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [showToast])

  // Kunjungan terakhir per lead / customer (daftar kunjungan sudah terurut terbaru dulu).
  const lastVisit = useMemo(() => {
    const m = {}
    visits.forEach((v) => {
      if (v.lead_id && !m[`l${v.lead_id}`]) m[`l${v.lead_id}`] = v.checkin_at
      if (v.customer_id && !m[`c${v.customer_id}`]) m[`c${v.customer_id}`] = v.checkin_at
    })
    return m
  }, [visits])

  const items = useMemo(() => {
    const linked = new Set(leads.map((l) => l.customer_id).filter(Boolean))
    const latest = (a, b) => (a && b ? (new Date(a) > new Date(b) ? a : b) : a || b || null)
    const fromLeads = leads.map((l) => ({
      key: `l${l.id}`,
      kind: 'lead',
      id: l.id,
      customerId: l.customer_id || null,
      name: l.business_name || '',
      meta: [l.business_type, [l.city, l.province].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
      stage: !l.status_customer || l.status_customer === 'LEAD' ? 'PROSPEK' : l.status_customer,
      value: Number(l.estimated_value) || 0,
      dueDate: l.current_task?.due_date || null,
      registered: l.register_date || null,
      closedAt: l.closed_at || null,
      lastVisit: latest(lastVisit[`l${l.id}`], l.customer_id ? lastVisit[`c${l.customer_id}`] : null),
    }))
    // Customer tanpa lead (mis. dari Epicor): dianggap customer aktif -> tahap Distribution.
    const customerOnly = customers
      .filter((c) => !linked.has(c.id))
      .map((c) => ({
        key: `c${c.id}`,
        kind: 'customer',
        id: c.id,
        customerId: c.id,
        name: c.name || '',
        meta: [c.customer_group || c.grade, c.city].filter(Boolean).join(' · '),
        stage: 'DISTRIBUTION',
        value: 0,
        dueDate: null,
        registered: null,
        closedAt: null,
        lastVisit: lastVisit[`c${c.id}`] || null,
      }))
    return [...fromLeads, ...customerOnly]
  }, [leads, customers, lastVisit])

  const counts = useMemo(() => {
    const m = {}
    items.forEach((i) => {
      m[i.stage] = (m[i.stage] || 0) + 1
    })
    return m
  }, [items])

  const now = new Date()
  const ym = `${now.getFullYear()}-${two(now.getMonth() + 1)}`
  const activeCount = items.filter((i) => i.stage !== 'LOSE').length
  const visitsToday = visits.filter((v) => sameDay(v.checkin_at)).length
  const wonThisMonth = items.filter((i) => i.stage === 'WIN' && String(i.closedAt || '').slice(0, 7) === ym).length

  const needle = q.trim().toLowerCase()
  const visible = items.filter((i) => !needle || i.name.toLowerCase().includes(needle))
  const groups = STAGES.filter(([k]) => !stage || stage === k)
    .map(([k, full]) => ({ k, full, rows: visible.filter((i) => i.stage === k) }))
    .filter((g) => g.rows.length > 0)

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,'

  const openCard = (it) =>
    nav('/checkin', { state: it.kind === 'lead' ? { leadId: it.id } : { customerId: it.id } })

  return (
    <Screen>
      <div className="appbar">
        <div className="abrow">
          <div className="greet-wrap">
            <div className="greet">{greeting}</div>
            <div className="gname">{user?.name || 'Sales'}</div>
          </div>
          <button
            type="button"
            className="bell"
            aria-label="Search"
            onClick={() => {
              setSearching((s) => !s)
              if (searching) setQ('')
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
          </button>
          <button type="button" className="bell" aria-label="Notifications" onClick={() => showToast('Belum tersedia', { warn: true })}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" />
            </svg>
          </button>
        </div>
        {searching && (
          <div className="sbar" style={{ marginTop: 12 }}>
            <input autoFocus placeholder="Cari nama customer" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        <div className="cu-stats">
          <div className="cu-stat">
            <b>{activeCount}</b>
            <span>Active customers</span>
          </div>
          <div className="cu-stat">
            <b style={{ color: 'var(--amber)' }}>{visitsToday}</b>
            <span>Visits today</span>
          </div>
          <div className="cu-stat">
            <b style={{ color: 'var(--green)' }}>{wonThisMonth}</b>
            <span>Won this month</span>
          </div>
        </div>
      </div>

      <div className="cu-chips" ref={chipsRef}>
        {STAGES.map(([k, , short]) => {
          const st = statusCustomerMeta(k)
          const on = stage === k
          const dark = k === 'SAMPLING'
          return (
            <button
              key={k}
              type="button"
              className="cu-chip"
              style={
                on
                  ? { background: st.color, color: dark ? '#17202B' : '#FFFFFF' }
                  : { background: `${st.color}26`, color: st.ink }
              }
              onClick={() => setStage(on ? null : k)}
            >
              {short}
              <b>{counts[k] || 0}</b>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="loading-center">Memuat…</div>
      ) : groups.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: '8px 2px' }}>
          Tidak ada customer pada kategori ini.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.k}>
            <div className="cap">
              {g.full} · {g.rows.length} {g.rows.length === 1 ? 'Customer' : 'Customers'}
            </div>
            {g.rows.map((it) => {
              const st = statusCustomerMeta(it.stage)
              const overdue = !CLOSED.includes(it.stage) && it.dueDate && daysFromToday(it.dueDate) < 0
              return (
                <div key={it.key} className="cu-card" onClick={() => openCard(it)} role="button" tabIndex={0}>
                  <div className="cu-top">
                    <span className="cu-av" style={{ background: `${st.color}26`, color: st.ink }}>
                      {initials(it.name)}
                    </span>
                    <div className="cu-main">
                      <div className="cu-name">{it.name}</div>
                      <div className="cu-meta">{it.meta || '—'}</div>
                    </div>
                    <span className="cu-chev">›</span>
                  </div>
                  {it.value > 0 && (
                    <div className="cu-badges">
                      <span className="cu-badge">{potential(it.value)} potential</span>
                    </div>
                  )}
                  <div className="cu-foot">
                    <span>
                      {it.lastVisit
                        ? `Last visit · ${fmtLast(it.lastVisit)}`
                        : it.registered
                          ? `Registered · ${fmtDay(it.registered)}`
                          : ''}
                    </span>
                    <span className="cu-foot-r">
                      {overdue ? <b className="cu-due">Follow up due</b> : null}
                      {it.customerId ? (
                        <button
                          type="button"
                          className="detail-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            nav(`/customers/${it.customerId}`)
                          }}
                        >
                          Detail ›
                        </button>
                      ) : null}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}
      <div style={{ height: 16 }} />
    </Screen>
  )
}
