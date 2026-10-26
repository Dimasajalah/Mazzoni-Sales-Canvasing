//frontend/src/pages/Home.jsx
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard } from '../api'
import { Card, ListItem, Screen } from '../components/ui'
import { Sidebar } from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { canOrder, isManager } from '../lib/roles'
import { useDraftSync } from '../hooks/useDraftSync'
import { useDragScroll } from '../hooks/useDragScroll'
import { daysFromToday, fmtRp, initials, listOf, statusCustomerMeta } from '../lib/format'
import { useUi } from '../context/UiContext'
import NotificationBell from '../components/NotificationBell'
import { useUnreadNotifications } from '../hooks/useUnreadNotifications'
import { canDeduct } from '../lib/marketingClaim'
import { canCreditMemo } from '../lib/marketingClaim'
import { canTransfer } from '../lib/marketingClaim'
import { canGoods } from '../lib/marketingClaim'
import { canRequisition } from '../lib/requisition'
import { canMoveRequest } from '../lib/moveRequest'
import { canIssueMaterial } from '../lib/issueMaterial'

// Enam batang sesuai dokumen hal. 8 (tanpa Lead dan Distribution)
// 4 tahap sesuai Section Flow Petty Cash.pdf / Figma Home — warna tile tetap (bukan statusCustomerMeta,
// itu dipakai halaman lain dan warnanya beda dari yang di Figma Home).
const PIPE_VIEW = [
  ['PROSPEK', 'Prospek', '#F1ECDF'],
  ['BRAND_AWARENESS', 'Brand Awareness', '#EEF2FF'],
  ['SAMPLING', 'Sample', '#FFF7E0'],
  ['QUOTATION', 'Quotation', '#F3EAFB'],
]

export default function Home() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const { showToast, openSheet, closeSheet } = useUi()
  const [data, setData] = useState(null)
  const [dot, setDot] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useDraftSync()
  const bannerRef = useDragScroll()
  const { unread } = useUnreadNotifications(true)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getDashboard()
      setData(d)
    } catch (e) {
      showToast(e.message || 'Gagal muat dashboard', { warn: true })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const name = user?.name || data?.user?.name || 'Sales'
  const ar = data?.ar || data?.aging || {}
  const arTotal = ar.total ?? ar.outstanding ?? 0
  const overdueInv = ar.overdue_count ?? ar.overdue_invoices ?? ar.overdueInv ?? 0
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
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning..' : hour < 17 ? 'Good Afternoon..' : 'Good Evening..'
  const todayLong = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

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
    ...(isManager(user) ? [{ icon: 'card', label: 'Budget Marketing', to: '/marketing/budgets' }] : []),
    ...(isManager(user) ? [{ icon: 'card', label: 'Event Marketing', to: '/marketing/events' }] : []),
    ...(isManager(user) ? [{ icon: 'gift', label: 'Star Outlet', to: '/marketing/star-outlets' }] : []),
    ...(isManager(user) ? [{ icon: 'gift', label: 'Program Klaim', to: '/marketing/claim-programs' }] : []),
    ...(isManager(user) ? [{ icon: 'check', label: 'Persetujuan Marketing', to: '/marketing/approvals' }] : []),
    ...(isManager(user) ? [{ icon: 'receipt', label: 'Pengajuan Klaim', to: '/marketing/claims' }] : []),
    ...(canDeduct(user) ? [{ icon: 'doc', label: 'Potong Nota', to: '/marketing/deductions' }] : []),
    ...(canCreditMemo(user) ? [{ icon: 'doc', label: 'Potong Tagihan', to: '/marketing/credit-memos' }] : []),
    ...(canTransfer(user) ? [{ icon: 'doc', label: 'Pencairan Transfer', to: '/marketing/transfers' }] : []),
    ...(canGoods(user) ? [{ icon: 'doc', label: 'Pencairan Barang', to: '/marketing/goods' }] : []),
    ...(canRequisition(user) ? [{ icon: 'doc', label: 'Requisition', to: '/purchasing/requisitions' }] : []),
    ...(canMoveRequest(user) ? [{ icon: 'doc', label: 'Move Inventory', to: '/marketing/move-requests' }] : []),
    ...(canMoveRequest(user) ? [{ icon: 'doc', label: 'Sample Internal', to: '/marketing/sample-requests' }] : []),
    ...(canIssueMaterial(user) ? [{ icon: 'doc', label: 'Issue Produk', to: '/marketing/issues' }] : []),
    ...(isManager(user) ? [{ icon: 'chart', label: 'Sales Target & Achievement', to: '/marketing/achievement' }] : []),
    { icon: 'gift', label: 'Promo', to: '/promo', badge: badges.promos },
    { icon: 'chart', label: 'Outstanding Report', to: '/ar', badge: overdueInv || undefined },
    { icon: 'wallet', label: 'Cash Advance', to: '/cash-advance' },
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
      <div className="home-page">
      <div className="home-topbar">
      <button type="button" className="dots" aria-label="Menu" onClick={() => setSidebarOpen((v) => !v)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="ab-title">Home</div>
        <div className="ab-actions">
        <button type="button" className="ab-icon ab-icon-accent" aria-label="Notifications" onClick={() => nav('/notifications')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" />
            </svg>
            {unread > 0 || notif > 0 ? <span className="bdot" /> : null}
          </button>
          <button type="button" className="ab-icon" aria-label="Bantuan" onClick={() => showToast('Bantuan segera hadir', { warn: true })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M9.5 9a2.5 2.5 0 014.8 1c0 1.6-2.3 2-2.3 3.5M12 17h.01" />
            </svg>
          </button>
          <button type="button" className="ab-icon" aria-label="Muat ulang" onClick={loadDashboard}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0115-6.7M21 12a9 9 0 01-15 6.7" /><path d="M18 3v4h-4M6 21v-4h4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="appbar home-appbar">
        <div className="greet-block">
          <div className="greet">{greeting}</div>
          <div className="greet-date">{todayLong}</div>
        </div>

        <div className="sales-card">
          <img src="/mazzoni-logo.png" alt="Mazzoni" className="sales-card-logo" />
          <div className="sales-card-info">
            <div className="sales-card-name">{name}</div>
            <div className="sales-card-role">
              {[user?.sales_type ? `Sales ${user.sales_type}` : null, user?.territory].filter(Boolean).join(' - ') || '—'}
            </div>
          </div>
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
        <span className="cap-in">Pipeline Journey</span>
          <span className="pipe-link" onClick={() => nav('/customers')} role="button" tabIndex={0}>
            Detail →
          </span>
        </div>
        {loading ? (
          <div className="loading-center">Memuat…</div>
        ) : (
          <div className="bars">
          {PIPE_VIEW.map(([key, label, color]) => (
            <div className="col" key={key}>
              <div className="pipe-tile" style={{ background: color }}>
                <span className="n">{pipeCount[key] ?? 0}</span>
              </div>
              <div className="cn">{label}</div>
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="cap">Quick Actions</div>
      <div className="qa-stack">
        <button type="button" className="qa-btn-primary" onClick={() => nav('/leads/new')}>New Lead</button>
        <button type="button" className="qa-btn-outline" onClick={() => nav('/visits')}>Sales Visit</button>
      </div>

      <div className="cap cap-row">
        <span>TOP 10 Outstanding</span>
        <span className="pipe-link" onClick={() => nav('/ar')} role="button" tabIndex={0}>
          Laporan →
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
              subtitle={`${c.customer_code || ''}${c.customer_code ? ' · ' : ''}${c.days_overdue > 0 ? `aging ${c.days_overdue} hari` : 'belum jatuh tempo'
                }`}
              right={fmtRp(c.balance)}
              onClick={() => nav(`/customers/${c.id}`)}
            />
          ))
        )}
      </Card>

      <div style={{ height: 12 }} />
      </div>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        badges={{
          canvassing: badges.leads || badges.canvassing,
          activities: activities.late > 0 ? activities.late : activities.total || undefined,
          returns: badges.returns,
          tracking: badges.orders,
          promo: badges.promos,
          arInvoice: overdueInv || undefined,
        }}
        canOrder={ordering}
        onLogout={async () => {
          if (!confirm('Keluar dari aplikasi?')) return
          await logout()
          nav('/login', { replace: true })
        }}
      />
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
  wallet: (<><path d="M3 7a2 2 0 012-2h12a2 2 0 012 2v2H3z" /><path d="M3 9h16a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle cx="16.5" cy="14" r="1.2" /></>),
}

const QA_TONE = {
  plus: 'red', pin: 'blue', check: 'green', doc: 'violet', cart: 'amber', truck: 'orange', home: 'red', box: 'slate',
  more: 'slate', users: 'blue', chart: 'blue', gear: 'slate', gift: 'orange', card: 'green', receipt: 'amber', return: 'blue',
  wallet: 'orange',
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
