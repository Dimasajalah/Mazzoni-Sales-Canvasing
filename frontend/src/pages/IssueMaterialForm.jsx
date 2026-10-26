// frontend/src/pages/IssueMaterialForm.jsx
// Blueprint MJU 3.2.17 (MKT17), langkah 02: Marketing mencatat Issue Misc. Material (nomor dokumen dan barang). Permintaan User (langkah 01)
// disampaikan di luar sistem; peminta hanya dicatat sebagai keterangan opsional.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createMaterialIssue, getMaterialIssue, updateMaterialIssue } from '../api'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { canIssueMaterial } from '../lib/issueMaterial'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const blankRow = () => ({ part_num: '', qty: null, description: '' })

export default function IssueMaterialForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [reference, setReference] = useState('')
  const [requester, setRequester] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState([blankRow()])
  const [saving, setSaving] = useState(false)
  const allowed = canIssueMaterial(user)

  useEffect(() => {
    if (!allowed || !editing) return
    getMaterialIssue(id)
      .then((i) => {
        setReference(i.issue_reference || '')
        setRequester(i.requester_name || '')
        setNotes(i.notes || '')
        setRows((i.items || []).map((x) => ({ part_num: x.part_num, qty: Number(x.qty), description: x.description || '' })))
      })
      .catch((e) => showToast(e.message || 'Gagal memuat issue', { warn: true }))
  }, [allowed, editing, id, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Issue Produk" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Issue dicatat oleh Marketing (admin atau supervisor).
        </div>
      </Screen>
    )
  }

  const setRow = (i, patch) => setRows((rs) => rs.map((r, x) => (x === i ? { ...r, ...patch } : r)))

  const submit = async (e) => {
    e.preventDefault()
    const warn = (m) => showToast(m, { warn: true })
    if (!reference.trim()) return warn('Isi nomor dokumen Issue Misc. Material')
    const seen = new Set()
    for (let i = 0; i < rows.length; i += 1) {
      const code = rows[i].part_num.trim()
      if (!code) return warn(`Isi kode part barang ${i + 1}`)
      if (!rows[i].qty || rows[i].qty <= 0) return warn(`Isi jumlah barang ${i + 1} lebih dari 0`)
      if (seen.has(code.toLowerCase())) return warn(`Kode part ${code} diisi lebih dari sekali`)
      seen.add(code.toLowerCase())
    }

    const payload = {
      issue_reference: reference.trim(),
      items: rows.map((r) => {
        const item = { part_num: r.part_num.trim(), qty: r.qty }
        if (r.description.trim()) item.description = r.description.trim()
        return item
      }),
    }
    if (requester.trim()) payload.requester_name = requester.trim()
    if (notes.trim()) payload.notes = notes.trim()

    setSaving(true)
    try {
      const saved = await (editing ? updateMaterialIssue(id, payload) : createMaterialIssue(payload))
      showToast(editing ? 'Issue diperbarui' : 'Issue tersimpan')
      nav(`/marketing/issues/${saved.id}`, { replace: true })
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan issue', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title={editing ? 'Ubah Issue' : 'Catat Issue'} backTo={editing ? `/marketing/issues/${id}` : '/marketing/issues'} />
      <form onSubmit={submit}>
        <div className="mb-sec">
          <div className="mb-sec-t">Issue Misc. Material</div>
          <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            Permintaan barang dari User disampaikan di luar aplikasi. Catat di sini setelah Issue Misc. Material dijalankan di Epicor.
          </div>
          <Field label="Nomor Dokumen Issue Misc. Material">
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Peminta (opsional)">
            <input value={requester} onChange={(e) => setRequester(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Catatan (opsional)">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t">Barang yang Dikeluarkan</div>
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

        <button className="btn" type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Issue'}</button>
      </form>
      <div style={{ height: 12 }} />
    </Screen>
  )
}
