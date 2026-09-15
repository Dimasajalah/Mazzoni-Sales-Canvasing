import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLeads } from '../api'
import { ListItem, Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf, stageColor } from '../lib/format'

export default function Canvassing() {
  const [items, setItems] = useState([])
  const { showToast, openSheet, closeSheet } = useUi()
  const nav = useNavigate()

  useEffect(() => {
    getLeads({})
      .then((d) => setItems(listOf(d)))
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  return (
    <Screen>
      <TopBar title="Canvassing / Follow-up" backTo="/home" />
      <p className="sub">Tindak lanjut lead aktif</p>
      {items.map((l) => (
        <ListItem
          key={l.id}
          barColor={stageColor(l.stage)}
          title={l.business_name || l.name}
          subtitle={`${l.stage} · ${l.phone || l.address || '—'}`}
          onClick={() =>
            openSheet('Follow-up', (
              <div>
                <div style={{ fontWeight: 800 }}>{l.business_name}</div>
                <p className="muted" style={{ fontSize: 12 }}>
                  {l.owner_name} · {l.phone}
                </p>
                <button
                  type="button"
                  className="btn"
                  style={{ marginBottom: 8 }}
                  onClick={() => {
                    closeSheet()
                    nav('/visits')
                  }}
                >
                  Jadwalkan Visit
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    closeSheet()
                    nav('/orders/new')
                  }}
                >
                  Buat Penawaran / Order
                </button>
              </div>
            ))
          }
        />
      ))}
    </Screen>
  )
}
