// frontend/src/pages/CustomerDetail.jsx
// Dokumen hal. 16 (04 Customer Detail: Info). Tab Info / Contact / Activity.
// AR, aging, invoice, dan aksi dihapus dari layar ini atas keputusan user (tidak ada di dokumen).
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCustomer, getCustomerActivity, updateCustomer } from '../api'
import ActivityTimeline, { fmtStamp } from '../components/ActivityTimeline'
import DelegatePicSheet from '../components/DelegatePicSheet'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { listOf, statusCustomerMeta } from '../lib/format'
import '../styles/customerdetail.css'

const VISIT_RESULT_LABEL = {
  ORDER: 'Order', NO_ORDER: 'Tidak ada order', FOLLOW_UP: 'Follow-up', NOT_VISITED: 'Belum dikunjungi',
}

// Kunjungan yang belum di-checkout belum punya hasil kunjungan.
const visitStatusLabel = (v) =>
  v.visit_result
    ? VISIT_RESULT_LABEL[v.visit_result] || v.visit_result
    : v.checkout_at ? 'Tanpa hasil' : 'Sedang berkunjung'

// Lima batang "Sales Journey Pipeline" (dokumen hal. 16). Distribution dan Win dihitung selesai.
const PIPE = [
  ['PROSPEK', 'Prospect'],
  ['BRAND_AWARENESS', 'Brand Aw.'],
  ['SAMPLING', 'Sampling'],
  ['QUOTATION', 'Quotation'],
  ['WIN', 'Win'],
]
const LOSE_REACHED = { LEAD: 0, OPPORTUNITY: 2, QUOTE: 3 } // tahap terakhir sebelum kalah (dari stage lama)

function stageIndex(lead) {
  if (!lead) return 4 // customer tanpa lead (mis. dari Epicor): sudah customer aktif
  const s = lead.status_customer
  if (s === 'LOSE') return LOSE_REACHED[lead.stage] ?? 0
  if (s === 'DISTRIBUTION') return 4
  const i = PIPE.findIndex(([k]) => k === (s === 'LEAD' ? 'PROSPEK' : s))
  return i < 0 ? 0 : i
}

const ICONS = {
  flow: <path d="M4 5h16v4H4zM4 15h10v4H4z" />,
  home: (<><path d="M4 11l8-7 8 7v9H4z" /><path d="M10 20v-5h4v5" /></>),
  pin: (<><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  doc: (<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>),
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0112 0M16 5.2a3.2 3.2 0 010 5.6M18 14.5a6 6 0 013 5.5" /></>),
  person: (<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />,
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
  id: (<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M14 10h4M14 14h4M6 16c.5-1.5 1.5-2 3-2s2.5.5 3 2" /></>),
}

function Ic({ n, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[n]}
    </svg>
  )
}

function Kv({ icon, label, children, good }) {
  return (
    <div className="cd-kv">
      <Ic n={icon} size={18} />
      <div style={{ minWidth: 0 }}>
        <small>{label}</small>
        <b className={good ? 'good' : ''}>{children || '—'}</b>
      </div>
    </div>
  )
}

export default function CustomerDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info') // 'info' | 'contact' | 'activity'
  const [notes, setNotes] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const notesRef = useRef(null)
  const [activity, setActivity] = useState({ items: [], total: 0, loaded: false })
  const nav = useNavigate()
  const { showToast, openSheet, closeSheet } = useUi()
  const { user } = useAuth()

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

  // Log aktivitas dimuat saat tab Activity dibuka (10 terbaru; semuanya di halaman tersendiri).
  useEffect(() => {
    if (tab !== 'activity' || !c || activity.loaded) return undefined
    let alive = true
    getCustomerActivity(c.id, { limit: 10 })
      .then((r) => {
        if (alive) setActivity({ items: r?.items || [], total: r?.total ?? 0, loaded: true })
      })
      .catch((e) => {
        if (alive) {
          showToast(e.message || 'Gagal memuat aktivitas', { warn: true })
          setActivity((a) => ({ ...a, loaded: true }))
        }
      })
    return () => {
      alive = false
    }
  }, [tab, c, activity.loaded, showToast])

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

  const lead = c.lead || null
  // Serah-terima PIC: PIC saat ini, supervisor, atau admin (server menegakkan aturan yang sama).
  const canHandOver =
    ['admin', 'supervisor'].includes(user?.role) ||
    (user?.id != null && Number(user.id) === Number(c.salesperson_id))
  const openDelegate = () =>
    openSheet(
      '',
      <DelegatePicSheet
        customer={c}
        showToast={showToast}
        onClose={closeSheet}
        onDone={(u) => setC((prev) => ({ ...prev, salesperson_id: u?.salesperson_id ?? prev.salesperson_id }))}
      />,
    )
  const visits = listOf(c.visits) // sudah terurut terbaru dulu dari server
  const lastVisit = visits[0] || null

  const st = statusCustomerMeta(lead?.status_customer || 'DISTRIBUTION')
  const idx = stageIndex(lead)
  const lost = lead?.status_customer === 'LOSE'
  const storeType = lead?.business_type || c.customer_group || c.grade || ''
  const place = [c.city || lead?.city, lead?.province].filter(Boolean).join(', ')
  const sub = [storeType, place].filter(Boolean).join(' · ')
  const address = [c.address || lead?.address, c.city].filter(Boolean).join(', ')
  const potential = lead?.estimated_value ? `Rp ${Number(lead.estimated_value).toLocaleString('id-ID')} / order` : ''

  const barColor = (i) => {
    if (i < idx) return 'var(--green)'
    if (i === idx) return lost ? 'var(--primary)' : st.color
    return '#E5E7EB'
  }

  const continueJourney = () =>
    nav('/checkin', { state: lead ? { leadId: lead.id } : { customerId: c.id } })

  return (
    <Screen noNav>
      <div className="topbar cd-top">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav('/customers')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ flex: 1, minWidth: 0 }}>
          <div>{c.name}</div>
          <div className="tt-sub">{sub || c.customer_code}</div>
        </div>
        <span className="cd-chip" style={{ background: st.color, color: lead?.status_customer === 'SAMPLING' ? '#17202B' : '#FFFFFF' }}>
          {st.label}
        </span>
      </div>
      <div className="cd-tabs" role="tablist">
        {[
          ['info', 'Info'],
          ['contact', 'Contact'],
          ['activity', 'Activity'],
        ].map(([k, label]) => (
          <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'activity' ? (
        <>
          <div className="cd-stats">
            <div className="cd-stat">
              <b>{visits.length}</b>
              <span>TOTAL VISITS</span>
            </div>
            <div className="cd-stat">
              <b className="good">{lastVisit ? visitStatusLabel(lastVisit) : 'Belum pernah dikunjungi'}</b>
              <span>LAST VISIT STATUS</span>
            </div>
          </div>

          {lastVisit && (
            <div className="cd-lastv">
              <Ic n="cal" />
              <span>
                Last visit recorded on <b>{fmtStamp(lastVisit.checkin_at)}</b>
              </span>
            </div>
          )}

          <div className="cap">Activity History</div>
          <ActivityTimeline items={activity.items} loading={!activity.loaded} />
          {activity.total > activity.items.length && (
            <button
              type="button"
              className="cd-viewall"
              onClick={() => nav(`/customers/${c.id}/activity`, { state: { name: c.name } })}
            >
              View all activity ({activity.total}) ›
            </button>
          )}
        </>
      ) : tab === 'contact' ? (
        <div className="cd-card">
          <h3 className="cd-h">
            <span>
              <Ic n="phone" />
              Customer Contact
            </span>
          </h3>
          <Kv icon="person" label="Contact Person">{lead?.owner_name}</Kv>
          <Kv icon="phone" label="Phone">{c.phone || lead?.phone}</Kv>
          <Kv icon="mail" label="Email">{c.email || lead?.email}</Kv>
          <Kv icon="doc" label="NPWP">{c.npwp || lead?.npwp}</Kv>
          <Kv icon="id" label="KTP">{lead?.ktp}</Kv>
        </div>
      ) : (
        <>
          <div className="cd-card">
            <h3 className="cd-h">
              <span>
                <Ic n="flow" />
                Sales Journey Pipeline
              </span>
            </h3>
            <div className="cd-pipe">
              {PIPE.map(([k], i) => (
                <i key={k} style={{ background: barColor(i) }} />
              ))}
            </div>
            <div className="cd-pipe-l">
              {PIPE.map(([k, label], i) => (
                <span key={k} className={i === idx ? 'on' : ''}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="cd-card">
            <h3 className="cd-h">
              <span>Store Information</span>
            </h3>
            <Kv icon="home" label="Store Type">{storeType}</Kv>
            <Kv icon="pin" label="Address">{address}</Kv>
            <Kv icon="star" label="Potential Value" good>{potential}</Kv>
          </div>

          {/* Poin 5: tempat catatan bebas untuk sales */}
          <div className="cd-card cd-note">
            <h3 className="cd-h">
              <span>
                <Ic n="doc" />
                Notes for Sales
              </span>
              <button type="button" className="cd-pencil" aria-label="Ubah catatan" onClick={() => notesRef.current?.focus()}>
                <Ic n="edit" />
              </button>
            </h3>
            <textarea
              ref={notesRef}
              rows={3}
              value={notes}
              placeholder="Catatan internal, mis. jam buka, kontak alternatif, preferensi customer…"
              onChange={(e) => {
                setNotes(e.target.value)
                setNotesDirty(true)
              }}
            />
            <button
              type="button"
              className="btn ghost sm"
              style={{ marginTop: 10 }}
              disabled={!notesDirty || savingNotes}
              onClick={saveNotes}
            >
              {savingNotes ? 'Menyimpan…' : 'Simpan Catatan'}
            </button>
          </div>

          {canHandOver && (
            <button type="button" className="cd-deleg" onClick={openDelegate}>
              <Ic n="users" size={18} />
              Delegate PIC to Another Sales
            </button>
          )}

          <div className="cd-foot">
            <button type="button" className="btn" onClick={continueJourney}>
              Continue Journey
            </button>
          </div>
        </>
      )}
      <div style={{ height: 16 }} />
    </Screen>
  )
}
