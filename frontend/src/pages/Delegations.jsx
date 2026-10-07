// frontend/src/pages/Delegations.jsx
// Delegasi prospek Win: Dealmaker mendelegasikan, Sales Order menerima dan membuatkan order.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cancelDelegation, getDelegations } from '../api'
import { Chips, Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate, fmtRp, listOf } from '../lib/format'
import { canOrder, isManager } from '../lib/roles'

const STATUS = {
  PENDING: { label: 'Menunggu order', color: 'var(--amber)' },
  ORDERED: { label: 'Sudah jadi order', color: 'var(--green)' },
  CANCELLED: { label: 'Dibatalkan', color: 'var(--mut)' },
}

export default function Delegations() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const manager = isManager(user)
  const [tab, setTab] = useState(manager ? 'all' : canOrder(user) ? 'incoming' : 'outgoing')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(listOf(await getDelegations()))
    } catch (e) {
      showToast(e.message || 'Gagal memuat delegasi', { warn: true })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const incoming = useMemo(() => items.filter((d) => d.to?.id === user?.id), [items, user])
  const outgoing = useMemo(() => items.filter((d) => d.from?.id === user?.id), [items, user])
  const shown = tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : items

  const options = [
    ...(manager ? [{ value: 'all', label: `Semua (${items.length})` }] : []),
    { value: 'incoming', label: `Masuk (${incoming.length})` },
    { value: 'outgoing', label: `Keluar (${outgoing.length})` },
  ]

  const openOrder = (d) =>
    d.quote
      ? nav(`/quotes/${d.quote.id}`)
      : nav('/orders/new', { state: { leadId: d.lead?.id, customerName: d.lead?.business_name } })

  const cancel = async (d) => {
    try {
      await cancelDelegation(d.id)
      showToast('Delegasi dibatalkan')
      load()
    } catch (e) {
      showToast(e.message || 'Gagal membatalkan delegasi', { error: true })
    }
  }

  return (
    <Screen>
      <TopBar title="Delegasi" backTo="/home" />
      <p className="sub">Prospek Win yang didelegasikan untuk dibuatkan order</p>
      <Chips options={options} value={tab} onChange={setTab} />

      {loading ? (
        <div className="loading-center">Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          {tab === 'incoming'
            ? 'Belum ada delegasi masuk.'
            : 'Belum ada delegasi. Tandai prospek Menang, lalu delegasikan dari daftar prospek.'}
        </div>
      ) : (
        shown.map((d) => {
          const st = STATUS[d.status] || STATUS.PENDING
          const isIncoming = d.to?.id === user?.id
          return (
            <div key={d.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{d.lead?.business_name}</div>
                <span className="badge" style={{ background: `${st.color}22`, color: st.color }}>
                  {st.label}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                {d.from?.name} → {d.to?.name} · {fmtDate(d.delegated_at)}
              </div>
              {d.note ? (
                <div style={{ fontSize: 12, marginTop: 6 }}>“{d.note}”</div>
              ) : null}
              {d.quote ? (
                <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  Quotation {d.quote.quote_number} · {fmtRp(d.quote.total)}
                </div>
              ) : null}
              {d.order ? (
                <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--green)' }}>Order {d.order.order_number}</div>
              ) : null}

              {d.status === 'PENDING' && (
                <div className="tp-actions" style={{ marginTop: 10 }}>
                  {isIncoming && canOrder(user) && (
                    <button type="button" className="btn sm" onClick={() => openOrder(d)}>
                      🛒 Buat Order
                    </button>
                  )}
                  {(d.from?.id === user?.id || manager) && (
                    <button type="button" className="btn ghost sm" onClick={() => cancel(d)}>
                      Batalkan
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </Screen>
  )
}
