// frontend/src/pages/ReturnDetail.jsx
// Detail retur: data, foto kondisi barang, riwayat status, dan aksi verifikasi, persetujuan, penolakan untuk peran berwenang.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getReturn, updateReturnStatus } from '../api'
import { Card, Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { canChangeReturn, returnActions, returnStatusMeta } from '../lib/returnStatus'
import { storageUrl } from '../lib/storageUrl'

const fmtQty = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 6 }}>
      <span className="muted">{label}</span>
      <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
  )
}

export default function ReturnDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [ret, setRet] = useState(null)
  const [missing, setMissing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getReturn(id)
      .then((d) => alive && setRet(d))
      .catch((e) => {
        if (!alive) return
        setMissing(true)
        showToast(e.message || 'Gagal memuat retur', { warn: true })
      })
    return () => {
      alive = false
    }
  }, [id, showToast])

  const back = () => nav('/returns')

  if (missing) {
    return (
      <Screen>
        <TopBar title="Detail Retur" onBack={back} />
        <Card className="muted" style={{ textAlign: 'center' }}>Retur tidak ditemukan.</Card>
      </Screen>
    )
  }

  if (!ret) {
    return (
      <Screen>
        <TopBar title="Detail Retur" onBack={back} />
        <div className="muted">Memuat…</div>
      </Screen>
    )
  }

  const st = returnStatusMeta(ret.status)
  const canAct = ret.can_change_status ?? canChangeReturn(user)
  const actions = canAct ? returnActions(ret.status) : []

  const act = async (a) => {
    const warn = (m) => showToast(m, { warn: true })
    if (a.requireNote && !note.trim()) return warn('Isi catatan alasan penolakan')
    if (!window.confirm(`${a.label} retur ${ret.return_number}?`)) return

    setBusy(true)
    try {
      const payload = { status: a.to }
      if (note.trim()) payload.notes = note.trim()
      setRet(await updateReturnStatus(ret.id, payload))
      setNote('')
      showToast(`Retur ${a.done}`)
    } catch (e) {
      showToast(e.message || 'Gagal mengubah status', { warn: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Detail Retur" onBack={back} />

      <Card style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>{ret.return_number}</div>
          <span className="badge" style={{ background: `${st.color}22`, color: st.color }}>{st.label}</span>
        </div>
        {ret.rma_number ? <Row label="No. RMA">{ret.rma_number}</Row> : null}
        <Row label="Customer">{ret.customer?.name || '—'}</Row>
        <Row label="Diajukan oleh">{ret.salesperson?.name || '—'}</Row>
        <Row label="Tanggal">{fmtDate(ret.created_at)}</Row>
        {ret.so_reference ? <Row label="Ref SO/DO">{ret.so_reference}</Row> : null}
        <Row label="Alasan">{ret.reason || '—'}</Row>
        {ret.condition_notes ? <Row label="Kondisi barang">{ret.condition_notes}</Row> : null}
      </Card>

      <div className="section-h">Barang yang Diretur</div>
      <Card style={{ padding: 14, marginBottom: 12 }}>
        {(ret.lines || []).map((l) => (
          <Row key={l.id} label={`${l.product?.part_num || ''} ${l.product?.description || ''}`.trim() || 'Produk'}>
            {fmtQty(l.qty)}
          </Row>
        ))}
      </Card>

      <div className="section-h">Foto Kondisi Barang</div>
      {(ret.attachments || []).length === 0 ? (
        <Card className="muted" style={{ padding: 14, marginBottom: 12, fontSize: 13 }}>Tidak ada foto terlampir.</Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {ret.attachments.map((a) => {
            const src = a.url || storageUrl(a.path)
            return /pdf/i.test(a.mime || '') ? (
              <a key={a.id} href={src} target="_blank" rel="noreferrer" className="card" style={{ padding: 12, fontSize: 12.5 }}>
                {a.filename}
              </a>
            ) : (
              <a key={a.id} href={src} target="_blank" rel="noreferrer">
                <img src={src} alt={a.filename} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
              </a>
            )
          })}
        </div>
      )}

      <div className="section-h">Riwayat Status</div>
      <Card style={{ padding: 14, marginBottom: 12 }}>
        {(ret.statusHistories || ret.status_histories || []).map((h) => (
          <div key={h.id} style={{ fontSize: 13, marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>
              {h.from_status ? `${returnStatusMeta(h.from_status).label} → ${returnStatusMeta(h.to_status).label}` : returnStatusMeta(h.to_status).label}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {fmtDate(h.created_at)}
              {h.notes ? ` · ${h.notes}` : ''}
            </div>
          </div>
        ))}
      </Card>

      {actions.length > 0 ? (
        <>
          <div className="section-h">Tindakan</div>
          <Card style={{ padding: 14, marginBottom: 12 }}>
            <div className="field">
              <label htmlFor="ret-note">Catatan (wajib untuk Tolak)</label>
              <textarea id="ret-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actions.map((a) => (
                <button
                  key={a.to}
                  type="button"
                  className={a.primary ? 'btn' : 'btn ghost'}
                  style={a.danger ? { background: 'var(--pink)', color: '#fff' } : undefined}
                  disabled={busy}
                  onClick={() => act(a)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Card>
        </>
      ) : null}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
