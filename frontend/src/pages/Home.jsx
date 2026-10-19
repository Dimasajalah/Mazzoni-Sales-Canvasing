//frontend/src/pages/Home.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard } from '../api'
import { GlobalSearch } from '../components/GlobalSearch'
import { AgingBuckets, Card, ListItem, Screen } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { canOrder, isManager } from '../lib/roles'
import { useDraftSync } from '../hooks/useDraftSync'
import { useDragScroll } from '../hooks/useDragScroll'
import { daysFromToday, fmtRp, initials, listOf, statusCustomerMeta } from '../lib/format'
import { useUi } from '../context/UiContext'
import NotificationBell from '../components/NotificationBell'
import { useUnreadNotifications } from '../hooks/useUnreadNotifications'

// Enam batang sesuai dokumen hal. 8 (tanpa Lead dan Distribution)
const PIPE_VIEW = [
  ['PROSPEK', 'Prospect'],
  ['BRAND_AWARENESS', 'Brand Aw.'],
  ['SAMPLING', 'Sampling'],
  ['QUOTATION', 'Quote'],
  ['WIN', 'Win'],
  ['LOSE', 'Lose'],
]

export default function Home() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const { showToast, openSheet, closeSheet } = useUi()
  const [data, setData] = useState(null)
  const [dot, setDot] = useState(0)
  const [loading, setLoading] = useState(true)
  useDraftSync()
  const bannerRef = useDragScroll()
  const fyRef = useDragScroll()
  const { unread } = useUnreadNotifications(true)

  useEffect(() => {
    let alive = true
      ; (async () => {
        try {
          const d = await getDashboard()
          if (alive) setData(d)
        } catch (e) {
          if (alive) showToast(e.message || 'Gagal muat dashboard', { warn: true })
        } finally {
          if (alive) setLoading(false)
        }
      })()
    return () => {
      alive = false
    }
  }, [showToast])

  const name = user?.name || data?.user?.name || 'Sales'
  const ar = data?.ar || data?.aging || {}
  const arTotal = ar.total ?? ar.outstanding ?? 0
  const overdueInv = ar.overdue_count ?? ar.overdue_invoices ?? ar.overdueInv ?? 0
  const buckets = ar.buckets || [ar.CURRENT ?? ar.current ?? 0, ar['1-30'] ?? ar.d1_30 ?? 0, ar['31-60'] ?? ar.d31_60 ?? 0, ar['60+'] ?? ar.d60_plus ?? 0]
  const pipeline = listOf(data?.pipeline)
  const pipeCount = Object.fromEntries(
    pipeline.map((p) => [String(p.key).toUpperCase(), Number(p.count ?? p.value ?? 0)]),
  )
  pipeCount.PROSPEK = (pipeCount.PROSPEK ?? 0) + (pipeCount.LEAD ?? 0)
  const topAr = listOf(data?.top_outstanding)
  const notif = data?.notifications_count ?? data?.unread_notifications ?? 0
  const badges = data?.menu_badges || {}
  const activities = data?.activities || {}
  const delegations = data?.delegations || {}
  const ordering = canOrder(user)
  const delegationBadge = ordering ? delegations.incoming_pending : delegations.outgoing_pending
  const promos = listOf(data?.active_promos)
  const visitsToday = data?.stats?.visits_today ?? 0
  const activeTasks = activities.total ?? 0
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,'

  const allItems = [
    { icon: 'plus', label: 'New Lead', to: '/leads/new' },
    { icon: 'pin', label: 'Canvassing', to: '/canvassing', badge: badges.leads || badges.canvassing, badgeClass: 'blue' },
    {
      icon: 'check',
      label: 'Activities',
      to: '/activities',
      badge: activities.late > 0 ? activities.late : activities.total || undefined,
      badgeClass: activities.late > 0 ? '' : 'blue',
    },
    { icon: 'doc', label: 'Quotation', to: '/quotes' },
    ...(ordering ? [{ icon: 'cart', label: 'New Order', to: '/orders/new' }] : []),
    { icon: 'truck', label: 'Order Tracker', to: '/track', badge: badges.orders, badgeClass: 'blue' },
    { icon: 'home', label: 'Customers', to: '/customers' },
    { icon: 'box', label: 'Check Stock', to: '/stock' },
    { icon: 'pin', label: 'Sales Visit', to: '/visits' },
    { icon: 'users', label: 'Delegasi', to: '/delegations', badge: delegationBadge > 0 ? delegationBadge : undefined },
    { icon: 'chart', label: 'Laporan NOO', to: '/reports/noo' },
    ...(isManager(user) ? [{ icon: 'gear', label: 'Master Data', to: '/master' }] : []),
    { icon: 'gift', label: 'Promo', to: '/promo', badge: badges.promos },
    { icon: 'chart', label: 'Outstanding Report', to: '/ar', badge: overdueInv || undefined },
    { icon: 'card', label: 'Pembayaran', to: '/payment' },
    { icon: 'receipt', label: 'Expense', to: '/expenses', badge: badges.expenses },
    { icon: 'return', label: 'Retur', to: '/returns', badge: badges.returns },
  ]
  const openAll = () =>
    openSheet(
      'Quick Actions',
      <div className="qa-grid">
        {allItems.map((m) => (
          <QaTile
            key={`${m.to}-${m.label}`}
            icon={m.icon}
            label={m.label}
            badge={m.badge}
            badgeClass={m.badgeClass}
            onClick={() => {
              closeSheet()
              nav(m.to)
            }}
          />
        ))}
      </div>,
    )

  const onBannerScroll = (el) => {
    const w = el.firstElementChild ? el.firstElementChild.offsetWidth + 10 : 300
    const i = Math.round(el.scrollLeft / w)
    setDot(Math.min(Math.max(promos.length - 1, 0), Math.max(0, i)))
  }

  return (
    <Screen>
      <div className="appbar">
      <div className="abrow">
          <button type="button" className="dots" aria-label="Menu" onClick={openAll}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          <div
            className="avatar"
            onClick={async () => {
              if (confirm('Keluar dari aplikasi?')) {
                await logout()
                nav('/login', { replace: true })
              }
            }}
            role="button"
            tabIndex={0}
          >
            {initials(name)}
          </div>
          <div className="greet-wrap">
            <div className="greet">{greeting}</div>
            <div className="gname">{name}</div>
          </div>
          <button
            type="button"
            className="bell"
            aria-label="Notifications"
            onClick={() => nav('/notifications')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" />
            </svg>
            {unread > 0 || notif > 0 ? <span className="bdot" /> : null}
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <GlobalSearch />
        </div>
      </div>

      {promos.length > 0 && (
        <>
          <div className="bwrap" ref={bannerRef} onScroll={(e) => onBannerScroll(e.currentTarget)}>
            {promos.map((p, i) => {
              const left = p.end_date ? daysFromToday(p.end_date) : null
              return (
                <div
                  key={p.id || p.promo_code}
                  className={`banner${i % 3 === 1 ? ' b2' : i % 3 === 2 ? ' b3' : ''}`}
                  onClick={() => nav('/promo')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="top">
                    <span className="tag">🔥 PROMO ACTIVE</span>
                    {left != null && left >= 0 ? <span className="left">{left}d left</span> : null}
                  </div>
                  <div className="big">{p.name}</div>
                </div>
              )
            })}
          </div>
          {promos.length > 1 && (
            <div className="bdots">
              {promos.map((p, i) => (
                <i key={p.id || p.promo_code} className={dot === i ? 'on' : ''} />
              ))}
            </div>
          )}
        </>
      )}

      <div className="cap">For You Today</div>
      <div className="fyt" ref={fyRef}>
        <div className="fy" onClick={() => nav('/activities')} role="button" tabIndex={0}>
          <span className="fy-ic" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          </span>
          <div className="fy-n">{activeTasks}</div>
          <div className="fy-l">Active tasks</div>
        </div>
        <div className="fy" onClick={() => nav('/visits')} role="button" tabIndex={0}>
          <span className="fy-ic" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" />
            </svg>
          </span>
          <div className="fy-n">{visitsToday}</div>
          <div className="fy-l">Visits logged</div>
        </div>
        <div className="fy" onClick={() => nav('/customers')} role="button" tabIndex={0}>
        <span className="fy-ic" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
            </svg>
          </span>
          <div className="fy-n">—</div>
          <div className="fy-l">Upsell potential</div>
        </div>
      </div>

      <div className="arcard" onClick={() => nav('/ar')} role="button" tabIndex={0}>
        <div className="ar-body">
          <div className="ar-cap">Outstanding AR</div>
          <div className="ar-total">{fmtRp(arTotal)}</div>
          <div className="ar-sub">
            {ar.customers_with_ar != null ? `${ar.customers_with_ar} customers · ` : ''}
            Epicor AR Aging (read-only)
          </div>
        </div>
        <span className="ar-ic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20V4M4 20h16M8 15l4-4 3 3 5-6" />
          </svg>
          {overdueInv > 0 ? <span className="ar-nb">{overdueInv}</span> : null}
        </span>
      </div>

      <div className="pipecard">
        <div className="pipe-head">
          <span className="cap-in">Pipeline Canvassing</span>
          <span className="pipe-link" onClick={() => nav('/customers')} role="button" tabIndex={0}>
            Detail →
          </span>
        </div>
        {loading ? (
          <div className="loading-center">Memuat…</div>
        ) : (
          <div className="bars">
            {PIPE_VIEW.map(([key, label]) => {
              const n = pipeCount[key] ?? 0
              const h = n === 0 ? 4 : Math.min(64, Math.max(10, n * 6.4))
              return (
                <div className="col" key={key}>
                  <div className="n">{n}</div>
                  <div className="bar" style={{ height: h, background: statusCustomerMeta(key).color }} />
                  <div className="cn">{label}</div>
                </div>
              )
            })}
          </div>
        )}
        <div className="pipe-note">
          "Detail" opens the Customer List, grouped by the same stage — same place the "Customers" tile below goes.
        </div>
      </div>

      <div className="cap">Quick Actions</div>
      <div className="qa-card">
        <div className="qa-grid">
          <QaTile icon="plus" label="New Lead" onClick={() => nav('/leads/new')} />
          <QaTile icon="home" label="Customers" onClick={() => nav('/customers')} badge={data?.stats?.customers || undefined} />
          <QaTile icon="pin" label="Sales Visit" onClick={() => nav('/visits')} />
        </div>
      </div>
      <div className="qa-note">
        "New Lead" opens the Lead Registration form · "Customers" opens the same Customer List as "Detail" above — tap a card there for Customer Detail (Info / Activity tabs).
      </div>

      <div className="cap cap-row">
      <span>Top 10 Outstanding</span>
        <span className="pipe-link" onClick={() => nav('/ar')} role="button" tabIndex={0}>
          Lihat laporan →
        </span>
      </div>
      <Card style={{ padding: '8px 10px' }}>
        {topAr.length === 0 ? (
          <div className="muted" style={{ fontSize: 12, padding: 8 }}>
            Belum ada data AR
          </div>
        ) : (
          topAr.slice(0, 10).map((c) => (
            <ListItem
              key={c.id}
              barColor={c.days_overdue > 60 ? 'var(--pink)' : c.days_overdue > 0 ? 'var(--amber)' : 'var(--green)'}
              title={c.name || '—'}
              subtitle={`${c.customer_code || ''}${c.customer_code ? ' · ' : ''}${
                c.days_overdue > 0 ? `aging ${c.days_overdue} hari` : 'belum jatuh tempo'
              }`}
              right={fmtRp(c.balance)}
              onClick={() => nav(`/customers/${c.id}`)}
            />
          ))
        )}
      </Card>

      <div className="cap">Ringkasan Aging</div>
      <AgingBuckets buckets={buckets} />
      <div style={{ height: 12 }} />
    </Screen>
  )
}

const QA_ICONS = {
  plus: <path d="M12 5v14M5 12h14" />,
  pin: (<><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  check: (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  doc: (<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>),
  cart: (<><path d="M3 4h2l2.4 11h10.2l2-8H6.2" /><circle cx="9" cy="19.5" r="1.3" /><circle cx="18" cy="19.5" r="1.3" /></>),
  truck: (<><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>),
  home: (<><path d="M4 11l8-7 8 7v9H4z" /><path d="M10 20v-5h4v5" /></>),
  box: (<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>),
  more: (<><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>),
  users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0112 0M16 5.2a3.2 3.2 0 010 5.6M18 14.5a6 6 0 013 5.5" /></>),
  chart: <path d="M4 20V4M4 20h16M8 15l4-4 3 3 5-6" />,
  gear: (<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>),
  gift: (<><path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" /><path d="M12 7c-2-3-5-3-5-1s3 1 5 1zm0 0c2-3 5-3 5-1s-3 1-5 1z" /></>),
  card: (<><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></>),
  receipt: (<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>),
  return: (<><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>),
}

const QA_TONE = {
  plus: 'red', pin: 'blue', check: 'green', doc: 'violet', cart: 'amber', truck: 'orange', home: 'red', box: 'slate',
  more: 'slate', users: 'blue', chart: 'blue', gear: 'slate', gift: 'orange', card: 'green', receipt: 'amber', return: 'blue',
}

function QaTile({ icon, label, onClick, badge, badgeClass = '' }) {
  return (
    <div className="qa-item" onClick={onClick} role="button" tabIndex={0}>
      {badge != null && badge !== '' ? <span className={`qa-nb ${badgeClass}`.trim()}>{badge}</span> : null}
      <span className={`qa-ic tone-${QA_TONE[icon]}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {QA_ICONS[icon]}
        </svg>
      </span>
      <span className="qa-lb">{label}</span>
    </div>
  )
}
