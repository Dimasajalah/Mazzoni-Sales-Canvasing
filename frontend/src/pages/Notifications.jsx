// frontend/src/pages/Notifications.jsx
// Pemberitahuan uang muka (Petty Cash tahap 2): sales hanya diberi tahu jumlah yang diberikan. Settlement dan approval ada di Epicor.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCashAdvanceNotifications, markAllCashAdvanceRead, markCashAdvanceRead } from '../api'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtIdr } from '../lib/money'
import '../styles/notifications.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''
}

export default function Notifications() {
  const nav = useNavigate()
  const { showToast } = useUi()
  const [state, setState] = useState('loading') // loading | ready | error
  const [items, setItems] = useState([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await getCashAdvanceNotifications()
        if (!alive) return
        setItems(res?.items || [])
        setState('ready')
      } catch {
        if (alive) setState('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const unread = items.filter((n) => !n.read_at).length

  const open = async (n) => {
    if (n.read_at) return
    const stamp = new Date().toISOString()
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: stamp } : x)))
    try {
      await markCashAdvanceRead(n.id)
    } catch (e) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: null } : x)))
      showToast(e?.message || 'Gagal menandai dibaca', { error: true })
    }
  }

  const readAll = async () => {
    const before = items
    const stamp = new Date().toISOString()
    setItems((list) => list.map((x) => ({ ...x, read_at: x.read_at || stamp })))
    try {
      await markAllCashAdvanceRead()
    } catch (e) {
      setItems(before)
      showToast(e?.message || 'Gagal menandai semua dibaca', { error: true })
    }
  }

  return (
    <Screen>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt">
          <div>Pemberitahuan</div>
          <div className="tt-sub">Uang muka dari Finance</div>
        </div>
      </div>

      {state === 'loading' ? (
        <div className="loading-center">Memuat…</div>
      ) : state === 'error' ? (
        <div className="tp-empty">Gagal memuat pemberitahuan. Periksa koneksi, lalu buka lagi.</div>
      ) : !items.length ? (
        <div className="tp-empty">Belum ada pemberitahuan uang muka.</div>
      ) : (
        <div className="nt-list">
          {unread > 0 ? (
            <button type="button" className="nt-readall" onClick={readAll}>Tandai semua dibaca ({unread})</button>
          ) : null}
          {items.map((n) => {
            const isNew = !n.read_at
            return (
              <button
                key={n.id}
                type="button"
                className={`nt-card${isNew ? ' new' : ''}`}
                aria-label={`${isNew ? 'Belum dibaca. ' : ''}Uang muka ${n.legal_number || ''}`}
                onClick={() => open(n)}
              >
                <span className="nt-dot" aria-hidden="true" />
                <span className="nt-body">
                  <span className="nt-title">Uang muka diterima</span>
                  <span className="nt-amount">
                    {n.currency && n.currency !== 'IDR' ? `${n.currency} ${Number(n.amount).toLocaleString('id-ID')}` : fmtIdr(n.amount)}
                  </span>
                  <span className="nt-sub">
                    {[n.legal_number ? `No. ${n.legal_number}` : null, n.cash_desk_id ? `dari ${n.cash_desk_id}` : null, fmtDate(n.apply_date) || null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Screen>
  )
}
