// frontend/src/pages/MoveRequestForm.jsx
// Blueprint MJU 3.2.15 (MKT14): Marketing membuat permintaan pemindahan barang display untuk sebuah event yang sudah disetujui.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'
import { canCreateMoveRequest, MOVE_KINDS } from '../lib/moveRequest'
import { moveApi } from '../lib/moveRequestApi'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const blankRow = () => ({ part_num: '', qty: null, description: '' })

export default function MoveRequestForm({ kind = 'display' }) {
  const K = MOVE_KINDS[kind]
  const { id } = useParams()
  const editing = Boolean(id)
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState([blankRow()])
  const [saving, setSaving] = useState(false)
  const allowed = canCreateMoveRequest(user)

  useEffect(() => {
    if (!allowed) return
    const A = moveApi(kind)
    if (K.withEvent) {
      A.events()
        .then((d) => setEvents(listOf(d)))
        .catch((e) => showToast(e.message || 'Gagal memuat daftar event', { warn: true }))
    }
    if (editing) {
      A.get(id)
        .then((r) => {
          setEventId(r.marketing_event_id ? String(r.marketing_event_id) : '')
          setNotes(r.notes || '')
          setRows((r.items || []).map((i) => ({ part_num: i.part_num, qty: Number(i.qty), description: i.description || '' })))
        })
        .catch((e) => showToast(e.message || 'Gagal memuat permintaan', { warn: true }))
    }
  }, [allowed, editing, id, kind, K.withEvent, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title={K.title} backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Permintaan dibuat oleh Marketing (admin atau supervisor).
        </div>
      </Screen>
    )
  }

  const setRow = (i, patch) => setRows((rs) => rs.map((r, x) => (x === i ? { ...r, ...patch } : r)))

  const submit = async (e) => {
    e.preventDefault()
    const warn = (m) => showToast(m, { warn: true })
    if (K.withEvent && !eventId) return warn('Pilih event')
    const seen = new Set()
    for (let i = 0; i < rows.length; i += 1) {
      const code = rows[i].part_num.trim()
      if (!code) return warn(`Isi kode part barang ${i + 1}`)
      if (!rows[i].qty || rows[i].qty <= 0) return warn(`Isi jumlah barang ${i + 1} lebih dari 0`)
      if (seen.has(code.toLowerCase())) return warn(`Kode part ${code} diisi lebih dari sekali`)
      seen.add(code.toLowerCase())
    }

    const payload = {
      items: rows.map((r) => {
        const item = { part_num: r.part_num.trim(), qty: r.qty }
        if (r.description.trim()) item.description = r.description.trim()
        return item
      }),
    }
    if (K.withEvent) payload.event_id = Number(eventId)
    if (notes.trim()) payload.notes = notes.trim()

    setSaving(true)
    try {
      const saved = await (editing ? moveApi(kind).update(id, payload) : moveApi(kind).create(payload))
      showToast(editing ? 'Permintaan diperbarui' : 'Permintaan tersimpan')
      nav(`${K.path}/${saved.id}`, { replace: true })
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan permintaan', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title={editing ? K.editTitle : K.newTitle} backTo={editing ? `${K.path}/${id}` : K.path} />
      <form onSubmit={submit}>
        <div className="mb-sec">
          <div className="mb-sec-t">{K.withEvent ? 'Event yang Didukung' : 'Permintaan Sample'}</div>
          {K.withEvent ? (
            <Field label="Event">
              <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">— pilih event yang sudah disetujui —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.event_code} · {ev.description}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Catatan (opsional)">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t">{K.itemsTitle}</div>
          <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>Kode part harus ada di Part Master.</div>
          {rows.map((r, i) => (
            <div key={i} className="mb-kv" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <input aria-label={`Kode part ${i + 1}`} placeholder="Kode part" value={r.part_num} maxLength={50} onChange={(e) => setRow(i, { part_num: e.target.value })} />
              <NumInput aria-label={`Jumlah ${i + 1}`} className="mb-money" value={r.qty} onChange={(v) => setRow(i, { qty: v })} placeholder="Jumlah" />
              <input aria-label={`Keterangan ${i + 1}`} placeholder="Keterangan (opsional)" value={r.description} maxLength={120} onChange={(e) => setRow(i, { description: e.target.value })} />
              {rows.length > 1 ? (
                <button type="button" className="btn ghost sm" aria-label={`Hapus barang ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, x) => x !== i))}>Hapus barang</button>
              ) : null}
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>+ Tambah Barang</button>
        </div>

        <button className="btn" type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Permintaan'}</button>
      </form>
      <div style={{ height: 12 }} />
    </Screen>
  )
}
