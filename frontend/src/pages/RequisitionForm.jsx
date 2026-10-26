// frontend/src/pages/RequisitionForm.jsx
// Blueprint MJU 3.2.14 (PR01), langkah 01-02: User mengisi header (tanggal barang dibutuhkan) dan Add Line (part number), serta melampirkan
// RAB atau gambar barang. Part yang belum terdaftar di Part Master ditandai dan didaftarkan IT. Juga dipakai untuk merevisi (langkah 07).
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createRequisition, getRequisition, updateRequisition, uploadRequisitionFiles } from '../api'
import { AttachmentPicker } from '../components/AttachmentPicker'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { canRequisition, PR_CATEGORIES } from '../lib/requisition'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const blankRow = () => ({ part_num: '', qty: null, unit_price: null, is_asset: false, description: '' })

export default function RequisitionForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [category, setCategory] = useState('')
  const [neededDate, setNeededDate] = useState('')
  const [isRab, setIsRab] = useState(false)
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState([blankRow()])
  const [files, setFiles] = useState([])
  const [existing, setExisting] = useState([])
  const [saving, setSaving] = useState(false)
  const allowed = canRequisition(user)

  useEffect(() => {
    if (!allowed || !editing) return
    getRequisition(id)
      .then((pr) => {
        setCategory(pr.category)
        setNeededDate(pr.needed_date)
        setIsRab(Boolean(pr.is_rab))
        setNotes(pr.notes || '')
        setExisting(pr.attachments || [])
        setRows((pr.lines || []).map((l) => ({
          part_num: l.part_num, qty: Number(l.qty), unit_price: l.unit_price === null ? null : Number(l.unit_price), is_asset: Boolean(l.is_asset), description: l.description || '',
        })))
      })
      .catch((e) => showToast(e.message || 'Gagal memuat requisition', { warn: true }))
  }, [allowed, editing, id, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Requisition" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const setRow = (i, patch) => setRows((rs) => rs.map((r, x) => (x === i ? { ...r, ...patch } : r)))

  const submit = async (e) => {
    e.preventDefault()
    const warn = (m) => showToast(m, { warn: true })
    if (!category) return warn('Pilih kategori')
    if (!neededDate) return warn('Isi tanggal barang dibutuhkan')
    const seen = new Set()
    for (let i = 0; i < rows.length; i += 1) {
      const code = rows[i].part_num.trim()
      if (!code) return warn(`Isi kode part baris ${i + 1}`)
      if (!rows[i].qty || rows[i].qty <= 0) return warn(`Isi jumlah baris ${i + 1} lebih dari 0`)
      if (seen.has(code.toLowerCase())) return warn(`Kode part ${code} diisi lebih dari sekali`)
      seen.add(code.toLowerCase())
    }

    const payload = {
      category, needed_date: neededDate, is_rab: isRab,
      lines: rows.map((r) => {
        const line = { part_num: r.part_num.trim(), qty: r.qty, is_asset: r.is_asset }
        if (r.unit_price !== null && r.unit_price !== undefined) line.unit_price = r.unit_price
        if (r.description.trim()) line.description = r.description.trim()
        return line
      }),
    }
    if (notes.trim()) payload.notes = notes.trim()

    setSaving(true)
    let saved = null
    try {
      saved = await (editing ? updateRequisition(id, payload) : createRequisition(payload))
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan requisition', { error: true })
      setSaving(false)
      return
    }

    try {
      if (files.length) {
        const fd = new FormData()
        files.forEach((f) => fd.append('files[]', f, f.name))
        await uploadRequisitionFiles(saved.id, fd)
      }
      showToast(editing ? 'Requisition diperbarui' : 'Requisition tersimpan')
    } catch (err) {
      showToast(`Requisition tersimpan, tetapi lampiran gagal diunggah: ${err.message || 'coba lagi dari halaman detail'}`, { error: true })
    }
    setSaving(false)
    nav(`/purchasing/requisitions/${saved.id}`, { replace: true })
  }

  return (
    <Screen>
      <TopBar title={editing ? 'Ubah Requisition' : 'Requisition Baru'} backTo={editing ? `/purchasing/requisitions/${id}` : '/purchasing/requisitions'} />
      <form onSubmit={submit}>
        <div className="mb-sec">
          <div className="mb-sec-t">PR Header</div>
          <Field label="Kategori">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">— pilih kategori —</option>
              {PR_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Tanggal Barang Dibutuhkan">
            <input type="date" value={neededDate} onChange={(e) => setNeededDate(e.target.value)} />
          </Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
            <input type="checkbox" checked={isRab} onChange={(e) => setIsRab(e.target.checked)} />
            Termasuk RAB / Bulanan
          </label>
          <div className="me-hint" style={{ marginTop: 0 }}>Pengajuan RAB/Bulanan wajib melampirkan RAB dan harga purchasing diperbarui PIC Dept.</div>
          <Field label="Catatan (opsional)">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </Field>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t">Add Line</div>
          <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            Pilih part number barang yang diminta. Part yang belum terdaftar di Part Master wajib diberi keterangan, lalu didaftarkan IT sebelum PR bisa diajukan.
          </div>
          {rows.map((r, i) => (
            <div key={i} className="mb-kv" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <input aria-label={`Kode part ${i + 1}`} placeholder="Kode part" value={r.part_num} maxLength={50} onChange={(e) => setRow(i, { part_num: e.target.value })} />
              <NumInput aria-label={`Jumlah ${i + 1}`} className="mb-money" value={r.qty} onChange={(v) => setRow(i, { qty: v })} placeholder="Jumlah" />
              <NumInput aria-label={`Harga satuan ${i + 1}`} className="mb-money" value={r.unit_price} onChange={(v) => setRow(i, { unit_price: v })} placeholder="Harga satuan (opsional)" />
              <input aria-label={`Keterangan ${i + 1}`} placeholder="Keterangan (wajib untuk part baru)" value={r.description} maxLength={120} onChange={(e) => setRow(i, { description: e.target.value })} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                <input type="checkbox" aria-label={`Barang asset ${i + 1}`} checked={r.is_asset} onChange={(e) => setRow(i, { is_asset: e.target.checked })} />
                Barang asset (Direktur ikut menyetujui)
              </label>
              {rows.length > 1 ? (
                <button type="button" className="btn ghost sm" aria-label={`Hapus baris ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, x) => x !== i))}>Hapus baris</button>
              ) : null}
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>+ Tambah Baris</button>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t">RAB / Gambar Barang</div>
          {existing.map((a) => (
            <div key={a.id} className="me-file"><span className="me-file-n">{a.filename}</span></div>
          ))}
          <AttachmentPicker files={files} onChange={setFiles} />
        </div>

        <button className="btn" type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Requisition'}</button>
      </form>
      <div style={{ height: 12 }} />
    </Screen>
  )
}
