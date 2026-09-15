import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getVisits } from '../api'
import { ListItem, Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'

export default function Visits() {
  const [items, setItems] = useState([])
  const nav = useNavigate()
  const { showToast } = useUi()

  useEffect(() => {
    getVisits({})
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  return (
    <Screen>
      <TopBar title="Sales Visit" backTo="/home" />
      <button type="button" className="btn" style={{ marginBottom: 14 }} onClick={() => nav('/checkin')}>
        Check-in Kunjungan
      </button>
      <div className="section-h">Riwayat hari ini</div>
      {items.length === 0 ? (
        <div className="muted">Belum ada kunjungan</div>
      ) : (
        items.map((v) => (
          <ListItem
            key={v.id}
            barColor={v.valid === false || v.checkin_distance > 500 ? 'var(--amber)' : 'var(--green)'}
            title={v.customer?.name || v.customer_name || v.cust}
            subtitle={`${v.checkin_at || v.in || '—'} → ${v.checkout_at || v.out || '…'} · ${
              v.visit_result || v.result || '—'
            }`}
            right={
              v.checkin_distance != null
                ? `${Math.round(v.checkin_distance)} m`
                : v.dist != null
                  ? `${v.dist} m`
                  : null
            }
          />
        ))
      )}
    </Screen>
  )
}
