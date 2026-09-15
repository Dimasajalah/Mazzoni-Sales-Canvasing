import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { checkoutVisit } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { useGeolocation } from '../hooks/useGeolocation'

const RESULTS = [
  'Pesanan didapat',
  'Penawaran diberikan',
  'Follow-up dijadwalkan',
  'Tidak bertemu',
  'Toko tutup',
]

export default function VisitMode() {
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const { coords, refresh } = useGeolocation()
  const [result, setResult] = useState(RESULTS[1])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState('00:00')

  const visitId = loc.state?.visitId
  const customer = loc.state?.customer
  const started = loc.state?.checkedInAt ? new Date(loc.state.checkedInAt) : new Date()

  useEffect(() => {
    refresh().catch(() => {})
    const t = setInterval(() => {
      const ms = Date.now() - started.getTime()
      const s = Math.floor(ms / 1000)
      const mm = String(Math.floor(s / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      setElapsed(`${mm}:${ss}`)
    }, 1000)
    return () => clearInterval(t)
  }, [refresh, started])

  const checkout = async () => {
    if (!visitId) {
      showToast('Visit ID tidak ada — kembali ke riwayat', { warn: true })
      nav('/visits', { replace: true })
      return
    }
    setBusy(true)
    try {
      await checkoutVisit(visitId, {
        latitude: coords?.lat,
        longitude: coords?.lng,
        accuracy: coords?.accuracy,
        visit_result: result,
        notes,
      })
      showToast('Checkout berhasil')
      nav('/visits', { replace: true })
    } catch (e) {
      showToast(e.message || 'Checkout gagal', { error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen noNav>
      <TopBar title="Visit Mode" backTo="/visits" />
      <div className="card accent-g" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 11 }}>Sedang berkunjung</div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{customer?.name || 'Customer'}</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Durasi {elapsed}
          {loc.state?.distance != null ? ` · jarak check-in ${Math.round(loc.state.distance)} m` : ''}
        </div>
      </div>

      <div className="field">
        <label>Hasil kunjungan</label>
        <select value={result} onChange={(e) => setResult(e.target.value)}>
          {RESULTS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Catatan</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="section-h">Quick actions</div>
      <div className="qa">
        <div
          className="item"
          onClick={() => nav('/orders/new', { state: { customerId: customer?.id } })}
          role="button"
          tabIndex={0}
        >
          <div className="ic" style={{ background: 'rgba(238,106,10,.15)' }}>🛒</div>
          <div className="t">Order</div>
        </div>
        <div
          className="item"
          onClick={() => nav('/payment', { state: { customerId: customer?.id } })}
          role="button"
          tabIndex={0}
        >
          <div className="ic" style={{ background: 'rgba(18,160,90,.15)' }}>💳</div>
          <div className="t">Bayar</div>
        </div>
        <div
          className="item"
          onClick={() => nav('/returns/new', { state: { customerId: customer?.id } })}
          role="button"
          tabIndex={0}
        >
          <div className="ic" style={{ background: 'rgba(42,111,214,.15)' }}>↩️</div>
          <div className="t">Retur</div>
        </div>
        <div className="item" onClick={() => nav('/expenses/new')} role="button" tabIndex={0}>
          <div className="ic" style={{ background: 'rgba(184,116,0,.15)' }}>🧾</div>
          <div className="t">Expense</div>
        </div>
      </div>

      <button type="button" className="btn" style={{ marginTop: 16 }} disabled={busy} onClick={checkout}>
        {busy ? 'Checkout…' : 'Checkout'}
      </button>
    </Screen>
  )
}
