import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard } from '../api'
import { GlobalSearch } from '../components/GlobalSearch'
import { AgingBuckets, Card, ListItem, Screen } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useDraftSync } from '../hooks/useDraftSync'
import { useOnline } from '../hooks/useOnline'
import { fmtRp, fmtShort, initials, listOf } from '../lib/format'
import { useUi } from '../context/UiContext'

export default function Home() {
  const { user, logout } = useAuth()
  const online = useOnline()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [data, setData] = useState(null)
  const [dot, setDot] = useState(0)
  const [loading, setLoading] = useState(true)
  useDraftSync()

  useEffect(() => {
    let alive = true
    ;(async () => {
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
  const role = user?.role || data?.user?.role || 'sales'
  const territory = user?.territory || data?.user?.territory || data?.territory || '—'
  const ar = data?.ar || data?.aging || {}
  const arTotal = ar.total ?? ar.outstanding ?? 0
  const overdueInv = ar.overdue_invoices ?? ar.overdueInv ?? 0
  const buckets = ar.buckets || [ar.current || 0, ar.d1_30 || 0, ar.d31_60 || 0, ar.d60_plus || 0]
  const pipeline = listOf(data?.pipeline)
  const topAr = listOf(data?.top_aging || data?.top_ar)
  const today = data?.today || {}
  const notif = data?.notifications_count ?? data?.unread_notifications ?? 0
  const badges = data?.menu_badges || {}

  const onBannerScroll = (el) => {
    const i = Math.round(el.scrollLeft / 300)
    setDot(Math.min(2, Math.max(0, i)))
  }

  return (
    <Screen>
      <div className="appbar">
        <div className="abrow">
          <GlobalSearch />
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
            {notif > 0 ? <span className="dot">{notif > 9 ? '9+' : notif}</span> : null}
          </div>
        </div>
        <div className="cust-chip">
          <img className="lg" src="/mazzoni-logo.png" alt="Mazzoni" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>{name}</div>
            <div className="muted" style={{ fontSize: 10 }}>
              {String(role).charAt(0).toUpperCase() + String(role).slice(1)} · {territory}
            </div>
          </div>
          <span
            className="badge"
            style={{
              background: online ? 'rgba(46,212,122,.2)' : 'rgba(184,116,0,.2)',
              color: online ? 'var(--green)' : 'var(--amber)',
            }}
          >
            ● {online ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="bwrap" onScroll={(e) => onBannerScroll(e.currentTarget)}>
          <div className="banner" onClick={() => nav('/promo')} role="button" tabIndex={0}>
            <span className="tag">PROMO AKTIF</span>
            <div className="big">Diskon 12%</div>
            <div className="sm">Akhir tahun · min. 50 unit Produk A</div>
            <div className="em">🎁</div>
          </div>
          <div className="banner b2" onClick={() => nav('/ar')} role="button" tabIndex={0}>
            <span className="tag">TAGIHAN</span>
            <div className="big">{fmtRp(arTotal)}</div>
            <div className="sm">{overdueInv} invoice jatuh tempo · tagih hari ini</div>
            <div className="em">💰</div>
          </div>
          <div className="banner b3" onClick={() => nav('/visits')} role="button" tabIndex={0}>
            <span className="tag">KUNJUNGAN</span>
            <div className="big">Check-in</div>
            <div className="sm">Validasi GPS radius 500 m dari customer</div>
            <div className="em">📍</div>
          </div>
        </div>
        <div className="bdots">
          {[0, 1, 2].map((i) => (
            <i key={i} className={dot === i ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className="wallet">
        <div className="wl">
          <div className="muted" style={{ fontSize: 10.5 }}>
            Outstanding AR portofolio
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--pink)', marginTop: 2 }}>
            {fmtRp(arTotal)}
          </div>
          <div className="muted" style={{ fontSize: 9.5 }}>
            {ar.customers_with_ar ?? '—'} customer · limit terpakai
          </div>
        </div>
        <div className="wact">
          <div className="wb" onClick={() => nav('/payment')} role="button" tabIndex={0}>
            <div className="ci">💳</div>
            <span>Bayar</span>
          </div>
          <div className="wb" onClick={() => nav('/ar')} role="button" tabIndex={0}>
            <div className="ci">📊</div>
            <span>Aging</span>
            {overdueInv > 0 ? <span className="nb">{overdueInv}</span> : null}
          </div>
        </div>
      </div>

      <div className="section-h">Semua Menu</div>
      <div className="grid">
        <GridItem ic="📝" label="New Lead" color="var(--orange)" onClick={() => nav('/leads/new')} badge="BARU" />
        <GridItem
          ic="🎯"
          label="Canvassing"
          color="var(--blue)"
          onClick={() => nav('/canvassing')}
          badge={badges.leads || badges.canvassing}
          badgeClass="g4"
        />
        <GridItem ic="🛒" label="New Order" color="var(--orange)" onClick={() => nav('/orders/new')} />
        <GridItem
          ic="🚚"
          label="Order Tracker"
          color="var(--blue)"
          onClick={() => nav('/track')}
          badge={badges.orders}
          badgeClass="g4"
        />
        <GridItem ic="🏢" label="Customers" color="var(--green)" onClick={() => nav('/customers')} />
        <GridItem
          ic="📦"
          label="Cek On Hand"
          color="var(--amber)"
          onClick={() => nav('/stock')}
          badge="!"
          badgeClass="g2"
        />
        <GridItem
          ic="🎁"
          label="Promo"
          color="var(--orange)"
          onClick={() => nav('/promo')}
          badge={badges.promos}
        />
        <GridItem
          ic="📍"
          label="Sales Visit"
          color="var(--green)"
          onClick={() => nav('/visits')}
          badge="GPS"
          badgeClass="g3"
        />
        <GridItem
          ic="💰"
          label="Aging AR"
          color="var(--pink)"
          onClick={() => nav('/ar')}
          badge={overdueInv || undefined}
          badgeClass="g2"
        />
        <GridItem ic="💳" label="Pembayaran" color="var(--green)" onClick={() => nav('/payment')} />
        <GridItem
          ic="🧾"
          label="Expense"
          color="var(--amber)"
          onClick={() => nav('/expenses')}
          badge={badges.expenses}
          badgeClass="g2"
        />
        <GridItem
          ic="↩️"
          label="Retur"
          color="var(--blue)"
          onClick={() => nav('/returns')}
          badge={badges.returns}
          badgeClass="g4"
        />
      </div>

      <div className="section-h">Untuk Anda Hari Ini</div>
      <div className="hscroll">
        <div className="fcard" onClick={() => nav('/visits')} role="button" tabIndex={0}>
          <div className="fe">📍</div>
          <div className="ft">Kunjungan</div>
          <div className="fs">{today.visits ?? 0} tercatat hari ini</div>
        </div>
        <div className="fcard" onClick={() => nav('/customers')} role="button" tabIndex={0}>
          <div className="fe">⭐</div>
          <div className="ft">Upsale siap</div>
          <div className="fs">{today.upsell_label || 'Pelanggan prioritas'}</div>
        </div>
        <div className="fcard" onClick={() => nav('/expenses')} role="button" tabIndex={0}>
          <div className="fe">🧾</div>
          <div className="ft">Expense</div>
          <div className="fs">{today.expense_label || 'Lihat laporan'}</div>
        </div>
        <div className="fcard" onClick={() => nav('/returns')} role="button" tabIndex={0}>
          <div className="fe">↩️</div>
          <div className="ft">Retur</div>
          <div className="fs">{today.return_label || 'Permintaan retur'}</div>
        </div>
        <div className="fcard" onClick={() => nav('/promo')} role="button" tabIndex={0}>
          <div className="fe">🎁</div>
          <div className="ft">Promo aktif</div>
          <div className="fs">{today.promo_label || 'Penawaran berlaku'}</div>
        </div>
      </div>

      <div className="section-h">
        Pipeline Canvassing{' '}
        <span className="link" onClick={() => nav('/leads')} role="button" tabIndex={0}>
          Detail ›
        </span>
      </div>
      <Card>
        {loading ? (
          <div className="loading-center">Memuat…</div>
        ) : (
          <div className="bars">
            {(pipeline.length
              ? pipeline
              : [
                  { stage: 'New', count: 0, color: 'var(--orange)' },
                  { stage: 'Contact', count: 0, color: 'var(--blue)' },
                  { stage: 'Qualified', count: 0, color: 'var(--orange2)' },
                  { stage: 'Quote', count: 0, color: 'var(--amber)' },
                  { stage: 'Won', count: 0, color: 'var(--green)' },
                ]
            ).map((p) => {
              const n = p.count ?? p.value ?? 0
              const label = p.stage || p.name || p.label
              const c = p.color || 'var(--orange)'
              return (
                <div className="col" key={label}>
                  <div className="n">{n}</div>
                  <div className="bar" style={{ height: Math.max(8, n * 6), background: c, opacity: 0.9 }} />
                  <div className="cn">{label}</div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <div className="section-h">
        Top 10 Aging AR{' '}
        <span className="link" onClick={() => nav('/ar')} role="button" tabIndex={0}>
          Lihat laporan ›
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
              key={c.id || c.customer_code}
              barColor="var(--pink)"
              title={c.name || c.customer_name}
              subtitle={c.customer_code || c.subtitle}
              right={fmtShort(c.balance ?? c.total ?? c.amount)}
              onClick={() => nav(`/customers/${c.id}`)}
            />
          ))
        )}
      </Card>

      <div className="section-h">Ringkasan Aging</div>
      <AgingBuckets buckets={buckets} />
      <div style={{ height: 12 }} />
    </Screen>
  )
}

function GridItem({ ic, label, color, onClick, badge, badgeClass = '' }) {
  return (
    <div className="gitem" onClick={onClick} role="button" tabIndex={0}>
      {badge != null && badge !== '' ? (
        <span className={`gbadge ${badgeClass}`.trim()}>{badge}</span>
      ) : null}
      <div className="gic" style={{ background: 'rgba(238,106,10,.12)', boxShadow: `inset 0 0 0 1px ${color}33` }}>
        {ic}
      </div>
      <div className="gl">{label}</div>
    </div>
  )
}
