import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getReturns } from '../api'
import { Card, Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'

const ST = {
  SUBMITTED: ['Diajukan', 'var(--amber)'],
  VERIFIED: ['Diverifikasi', 'var(--blue)'],
  APPROVED: ['Disetujui', 'var(--green)'],
  RMA_ISSUED: ['RMA terbit', 'var(--green)'],
  REJECTED: ['Ditolak', 'var(--pink)'],
}

export default function Returns() {
  const nav = useNavigate()
  const { showToast } = useUi()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const d = await getReturns()
        setRows(listOf(d?.data || d))
      } catch (e) {
        showToast(e.message || 'Gagal muat retur', { warn: true })
      } finally {
        setLoading(false)
      }
    })()
  }, [showToast])

  const open = rows.filter((r) => ['SUBMITTED', 'VERIFIED'].includes(r.status)).length
  const done = rows.filter((r) => ['RMA_ISSUED', 'APPROVED'].includes(r.status)).length

  return (
    <Screen>
      <h1 className="title">Permintaan Retur</h1>
      <p className="sub">Pengajuan retur barang dari customer</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <Card className="kpi accent-b">
          <div className="lbl">Total</div>
          <div className="big">{rows.length}</div>
        </Card>
        <Card className="kpi accent-a">
          <div className="lbl">Diproses</div>
          <div className="big">{open}</div>
        </Card>
        <Card className="kpi accent-g">
          <div className="lbl">RMA</div>
          <div className="big">{done}</div>
        </Card>
      </div>
      <button className="btn" style={{ marginBottom: 16 }} type="button" onClick={() => nav('/returns/new')}>
        ↩️ Ajukan Retur Baru
      </button>
      {loading ? <div className="muted">Memuat…</div> : null}
      {rows.map((r) => {
        const line = r.lines?.[0]
        const [lbl, col] = ST[r.status] || [r.status, 'var(--mut)']
        return (
          <Card key={r.id} className="li" style={{ padding: 13, marginBottom: 9 }}>
            <div className="barL" style={{ background: col }} />
            <div className="main">
              <div className="n" style={{ fontSize: 13 }}>{line?.product?.description || r.return_number}</div>
              <div className="d">
                {line?.product?.part_num} · {line?.qty} · {r.customer?.name}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                <span className="badge" style={{ background: `${col}22`, color: col }}>{lbl}</span>
                {r.rma_number ? (
                  <span className="badge" style={{ background: 'rgba(46,212,122,.16)', color: 'var(--green)' }}>
                    {r.rma_number}
                  </span>
                ) : null}
              </div>
            </div>
          </Card>
        )
      })}
      {!loading && !rows.length ? <Card className="muted" style={{ textAlign: 'center' }}>Belum ada retur.</Card> : null}
    </Screen>
  )
}
