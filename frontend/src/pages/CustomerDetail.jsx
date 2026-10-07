//frontend/src/pages/CustomerDetail.jsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCustomer, offerPromo, updateCustomer } from '../api'
import { AgingBuckets, Card, ListItem, Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { bucketOf, fmtDate, fmtRp, listOf } from '../lib/format'
import { canOrder } from '../lib/roles'

const VISIT_RESULT_LABEL = {
  ORDER: 'Order', NO_ORDER: 'Tidak ada order', FOLLOW_UP: 'Follow-up', NOT_VISITED: 'Belum dikunjungi',
}

const SAMPLE_STATUS_LABEL = { PENDING: 'Menunggu diberikan', DELIVERED: 'Sudah diberikan' }

// Kunjungan yang belum di-checkout belum punya hasil kunjungan.
const visitStatusLabel = (v) =>
  v.visit_result
    ? VISIT_RESULT_LABEL[v.visit_result] || v.visit_result
    : v.checkout_at ? 'Tanpa hasil' : 'Sedang berkunjung'

export default function CustomerDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info') // 'info' | 'activity'
  const [notes, setNotes] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const nav = useNavigate()
  const { showToast } = useUi()
  const { user } = useAuth()
  const ordering = canOrder(user)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await getCustomer(id)
        if (alive) {
          setC(data)
          setNotes(data.sales_notes || '')
        }
      } catch (e) {
        if (alive) showToast(e.message, { error: true })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id, showToast])

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      const updated = await updateCustomer(c.id, { sales_notes: notes })
      setC((prev) => ({ ...prev, sales_notes: updated.sales_notes }))
      setNotesDirty(false)
      showToast('Catatan tersimpan')
    } catch (e) {
      showToast(e.message || 'Gagal menyimpan catatan', { error: true })
    } finally {
      setSavingNotes(false)
    }
  }

  if (loading) {
    return (
      <Screen>
        <TopBar title="Customer" backTo="/customers" />
        <div className="loading-center">Memuat…</div>
      </Screen>
    )
  }

  if (!c) {
    return (
      <Screen>
        <TopBar title="Customer" backTo="/customers" />
        <div className="muted">Customer tidak ditemukan</div>
      </Screen>
    )
  }

  const invoices = listOf(c.invoices || c.ar?.invoices || c.ar?.inv)
  const visits = listOf(c.visits) // sudah terurut terbaru dulu dari server
  const samples = listOf(c.samples)
  const lastVisit = visits[0] || null
  const buckets = [0, 0, 0, 0]
  invoices.forEach((inv) => {
    buckets[bucketOf(inv.days_overdue ?? inv.days)] += Number(inv.balance ?? inv.bal ?? 0)
  })
  const totalAr = invoices.reduce((s, i) => s + Number(i.balance ?? i.bal ?? 0), 0)
  const limit = c.credit_limit ?? c.ar?.limit ?? 0

  return (
    <Screen>
      <TopBar title="Detail Customer" backTo="/customers" />
      <Card>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{c.name}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {c.customer_group || '—'} · {c.customer_code}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          {c.address}
          {c.city ? `, ${c.city}` : ''}
        </div>
        <div style={{ marginTop: 10, fontSize: 12 }}>
          AR: <b style={{ color: 'var(--pink)' }}>{fmtRp(totalAr)}</b>
          <span className="muted"> / limit {fmtRp(limit)}</span>
        </div>
        <div className="prog">
          <span
            style={{
              width: `${limit ? Math.min(100, (totalAr / limit) * 100) : 0}%`,
              background: 'var(--pink)',
            }}
          />
        </div>
      </Card>

      {/* Poin 4: tab Aktivitas (total kunjungan + status kunjungan terakhir) */}
      <div className="seg" style={{ marginTop: 12, marginBottom: 12 }}>
        <button type="button" className={`chip${tab === 'info' ? ' on' : ''}`} onClick={() => setTab('info')}>
          Info
        </button>
        <button type="button" className={`chip${tab === 'activity' ? ' on' : ''}`} onClick={() => setTab('activity')}>
          Aktivitas
        </button>
      </div>

      {tab === 'activity' ? (
        <>
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>Total Kunjungan</span>
              <b style={{ fontSize: 16 }}>{visits.length}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Status Kunjungan Terakhir</span>
              <b style={{ fontSize: 13 }}>
              {lastVisit ? visitStatusLabel(lastVisit) : 'Belum pernah dikunjungi'}
              </b>
            </div>
            {lastVisit && (
              <div className="muted" style={{ fontSize: 11, marginTop: 4, textAlign: 'right' }}>
                {fmtDate(lastVisit.checkin_at)}
              </div>
            )}
          </div>

          <div className="section-h">Riwayat Kunjungan</div>
          {visits.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>Belum ada kunjungan tercatat</div>
          ) : (
            visits.map((v) => (
              <ListItem
                key={v.id}
                barColor="var(--blue)"
                title={visitStatusLabel(v)}
                subtitle={fmtDate(v.checkin_at)}
                right={v.duration_minutes ? `${Math.round(v.duration_minutes)} mnt` : null}
              />
            ))
          )}

          <div className="section-h">Sample</div>
          {samples.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>Belum ada sample tercatat</div>
          ) : (
            samples.map((s) => (
              <ListItem
                key={s.id}
                barColor={s.status === 'DELIVERED' ? 'var(--green)' : 'var(--amber)'}
                title={`${s.product_group || 'Sample'} · ${s.qty} gr`}
                subtitle={`Batch ${s.batch_number || '—'} · ${fmtDate(s.created_at)}`}
                right={SAMPLE_STATUS_LABEL[s.status] || s.status}
              />
            ))
          )}
        </>
      ) : (
        <>
          {/* Hasil meeting lanjutan: "hapus fitur Lancar di Aging" — bucket 1-30/31-60/60+ tetap
              ada, cuma bucket Lancar (belum jatuh tempo) yang dihilangkan dari tampilan. */}
          <div className="section-h">Aging</div>
          <AgingBuckets buckets={buckets} hideCurrent />

          <div className="section-h">Invoice terbuka</div>
          {invoices.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>Tidak ada invoice</div>
          ) : (
            invoices.map((i) => {
              const days = i.days_overdue ?? i.days ?? 0
              const col =
                days <= 0 ? 'var(--green)' : days <= 30 ? 'var(--amber)' : days <= 60 ? '#FF8A3D' : 'var(--pink)'
              return (
                <ListItem
                  key={i.id || i.invoice_number || i.inv}
                  barColor={col}
                  title={i.invoice_number || i.inv}
                  subtitle={`JT ${i.due_date || i.due}${days > 0 ? ` · telat ${days} hari` : ''}`}
                  right={fmtRp(i.balance ?? i.bal)}
                />
              )
            })
          )}

          {/* Poin 5: tempat catatan bebas untuk sales */}
          <div className="section-h">Catatan untuk Sales</div>
          <div className="field">
            <textarea
              rows={3}
              value={notes}
              placeholder="Catatan internal, mis. jam buka, kontak alternatif, preferensi customer…"
              onChange={(e) => {
                setNotes(e.target.value)
                setNotesDirty(true)
              }}
            />
          </div>
          <button
            type="button"
            className="btn ghost sm"
            style={{ marginBottom: 12 }}
            disabled={!notesDirty || savingNotes}
            onClick={saveNotes}
          >
            {savingNotes ? 'Menyimpan…' : 'Simpan Catatan'}
          </button>

          <div className="section-h">Aksi</div>
          <div className="qa">
            <div className="item" onClick={() => nav('/checkin', { state: { customerId: c.id, customer: c } })} role="button" tabIndex={0}>
              <div className="ic" style={{ background: 'rgba(18,160,90,.15)' }}>📍</div>
              <div className="t">Check-in</div>
            </div>
            <div className="item" onClick={() => nav('/payment', { state: { customerId: c.id } })} role="button" tabIndex={0}>
              <div className="ic" style={{ background: 'rgba(42,111,214,.15)' }}>💳</div>
              <div className="t">Bayar</div>
            </div>
            {ordering && (
              <div className="item" onClick={() => nav('/orders/new', { state: { customerId: c.id } })} role="button" tabIndex={0}>
                <div className="ic" style={{ background: 'rgba(238,106,10,.15)' }}>🛒</div>
                <div className="t">Order</div>
              </div>
            )}
            <div className="item" onClick={() => nav('/track', { state: { customerId: c.id } })} role="button" tabIndex={0}>
              <div className="ic" style={{ background: 'rgba(42,111,214,.15)' }}>🚚</div>
              <div className="t">Lacak Order</div>
            </div>
            <div
              className="item"
              onClick={async () => {
                try {
                  const promoId = c.suggested_promo_id || 1
                  await offerPromo(promoId, { customer_id: c.id })
                  showToast('Promo ditawarkan ke customer')
                } catch (e) {
                  showToast(e.message || 'Gagal offer promo', { warn: true })
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="ic" style={{ background: 'rgba(238,106,10,.15)' }}>🎁</div>
              <div className="t">Promo</div>
            </div>
          </div>
        </>
      )}
      <div style={{ height: 16 }} />
    </Screen>
  )
}