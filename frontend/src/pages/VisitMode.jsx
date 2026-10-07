//frontend/src/pages/VisitMode.jsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { checkoutVisit, getVisit } from '../api'
import { Field } from '../components/Field'
import LeadTaskPanel from '../components/LeadTaskPanel'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { useGeolocation } from '../hooks/useGeolocation'

const RESULTS = [
  'Pesanan didapat',
  'Quotation diberikan',
  'Follow-up dijadwalkan',
  'Tidak ada order',
  'Tidak bertemu',
  'Toko tutup',
]

export default function VisitMode() {
  const loc = useLocation()
  const { id: routeId } = useParams()
  const nav = useNavigate()
  const { showToast } = useUi()
  const { coords, refresh } = useGeolocation()
  const [result, setResult] = useState(RESULTS[1])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState('00:00')
  const [customer, setCustomer] = useState(loc.state?.customer || null)
  // Hasil meeting lanjutan: check-in bisa menyasar Lead langsung — begitu kunjungan ini milik
  // sebuah Lead, panel tugas Canvassing (Brand Awareness/Sample/Quotation) tampil di sini juga,
  // supaya sales bisa langsung isi tugasnya tanpa pindah layar ("dari situ dia langsung integrate
  // semua, dia bisa buat penawarannya dari situ").
  const [lead, setLead] = useState(loc.state?.lead || null)
  const [checkedInAt, setCheckedInAt] = useState(loc.state?.checkedInAt || null)

  const visitId = loc.state?.visitId || routeId
  // useMemo: sebelumnya objek Date dibuat ulang tiap render sehingga interval & GPS diulang terus
  const started = useMemo(() => (checkedInAt ? new Date(checkedInAt) : new Date()), [checkedInAt])

  const reloadVisit = () =>
    getVisit(visitId)
      .then((v) => {
        if (v?.customer) setCustomer(v.customer)
        if (v?.lead) setLead(v.lead)
        if (!checkedInAt && v?.checkin_at) setCheckedInAt(v.checkin_at)
      })
      .catch(() => {})

  // Halaman dibuka ulang tanpa state (mis. refresh): ambil data kunjungan dari server
  useEffect(() => {
    if ((customer && checkedInAt) || !visitId) return
    reloadVisit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000))
      setElapsed(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(t)
  }, [started])

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

  const distance = loc.state?.distance

  return (
    <Screen noNav>
      <TopBar title="Visit Mode" backTo="/visits" />
      <div className="card accent-g" style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 11 }}>Sedang berkunjung</div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{customer?.name || lead?.business_name || 'Customer'}</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Durasi {elapsed}
          {distance != null ? ` · jarak check-in ${Math.round(distance)} m` : ''}
        </div>
      </div>

      {lead && (
        <>
          <div className="section-h">Tugas Canvassing</div>
          {/* key wajib ada: lihat catatan yang sama di Leads.jsx openLead() — tanpa ini, panel
              tetap menampilkan tugas LAMA setelah reloadVisit() memperbarui `lead`, karena
              LeadTaskPanel menyimpan tugas di state internalnya sendiri yang tidak otomatis
              mengikuti perubahan prop. */}
          <LeadTaskPanel
            key={`${lead.id}-${lead.current_task?.id ?? 'none'}`}
            lead={lead}
            task={lead.current_task}
            onChanged={reloadVisit}
            onClose={reloadVisit}
            showToast={showToast}
            hideCheckin
          />
        </>
      )}

      <Field label="Hasil kunjungan">
        <select value={result} onChange={(e) => setResult(e.target.value)}>
          {RESULTS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <Field label="Catatan">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <button type="button" className="btn" style={{ marginTop: 16 }} disabled={busy} onClick={checkout}>
        {busy ? 'Checkout…' : 'Checkout'}
      </button>
    </Screen>
  )
}