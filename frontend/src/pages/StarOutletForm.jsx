// frontend/src/pages/StarOutletForm.jsx
// Blueprint MJU 3.2.3 (MKT03): langkah 01 pengajuan Distributor (di luar sistem) dicatat sebagai referensi,
// langkah 02 Marketing Staff mencentang Star Outlet Aktif.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createStarOutlet, getStarOutletCandidates } from '../api'
import { Field } from '../components/Field'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'
import { isManager } from '../lib/roles'
import '../styles/marketingbudget.css'
import '../styles/marketingevent.css'
import '../styles/marketingstar.css'

export default function StarOutletForm() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const allowed = isManager(user)
  const [requestedBy, setRequestedBy] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  // pencarian outlet, ditunda sebentar supaya tidak memanggil server di tiap ketikan
  useEffect(() => {
    if (!allowed) return undefined
    const t = setTimeout(() => {
      getStarOutletCandidates({ q })
        .then((d) => setFound(listOf(d)))
        .catch((e) => showToast(e.message || 'Gagal mencari outlet', { warn: true }))
    }, 300)
    return () => clearTimeout(t)
  }, [q, allowed, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Star Outlet" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!selected) return showToast('Pilih outlet', { warn: true })
    if (selected.star_status === 'ACTIVE') return showToast('Outlet ini sudah Star Outlet aktif', { warn: true })

    const payload = { customer_id: selected.id }
    if (requestedBy.trim()) payload.requested_by = requestedBy.trim()
    if (reference.trim()) payload.request_reference = reference.trim()
    if (notes.trim()) payload.notes = notes.trim()

    setSaving(true)
    try {
      await createStarOutlet(payload)
      showToast('Star Outlet diaktifkan')
      nav('/marketing/star-outlets', { replace: true })
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Star Outlet Baru" backTo="/marketing/star-outlets" />
      <form onSubmit={submit}>
        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">1</span>Pengajuan dari Distributor</div>
          <div className="so-info" style={{ marginTop: 0, marginBottom: 10 }}>
            Pengajuan disampaikan distributor di luar sistem (Dokumen: Pengajuan Star Outlet). Isi referensinya di sini bila ada.
          </div>
          <Field label="Distributor Pengaju">
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} maxLength={150} />
          </Field>
          <Field label="No. / Referensi Pengajuan">
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Catatan">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">2</span>Centang Star Outlet Aktif</div>
          {selected ? (
            <div className="so-chosen">
              <span>
                <b>{selected.name}</b>
                <small>{selected.customer_code}{selected.city ? ` · ${selected.city}` : ''}</small>
              </span>
              <button type="button" className="btn ghost sm" onClick={() => setSelected(null)}>Ganti</button>
            </div>
          ) : (
            <>
              <Field label="Cari outlet (customer)">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama atau kode outlet" />
              </Field>
              {found.map((c) => (
                <button key={c.id} type="button" className="me-pick" onClick={() => setSelected(c)}>
                  <span><b>{c.name}</b><small>{c.customer_code}{c.city ? ` · ${c.city}` : ''}</small></span>
                  {c.star_status ? (
                    <span className={`so-tag${c.star_status === 'ACTIVE' ? '' : ' off'}`}>
                      {c.star_status === 'ACTIVE' ? 'Star aktif' : 'Pernah Star'}
                    </span>
                  ) : (
                    <span>+</span>
                  )}
                </button>
              ))}
            </>
          )}
          <div className="so-info">Outlet yang ditandai aktif berhak atas Disc 3 pada Price &amp; Discount di Sales Order.</div>
        </div>

        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Aktifkan Star Outlet'}
        </button>
        <div style={{ height: 12 }} />
      </form>
    </Screen>
  )
}
