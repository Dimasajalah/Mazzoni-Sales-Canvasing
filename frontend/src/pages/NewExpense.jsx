import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createExpense, getCustomers } from '../api'
import { PhotoUpload } from '../components/PhotoUpload'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { useOnline } from '../hooks/useOnline'
import { saveDraft } from '../lib/drafts'
import { listOf } from '../lib/format'
import { uuid } from '../lib/uuid'

const CATS = [
  { k: 'bensin', n: 'Bensin' },
  { k: 'tol', n: 'Tol' },
  { k: 'makan', n: 'Makan' },
  { k: 'hotel', n: 'Hotel' },
  { k: 'entertain', n: 'Entertain' },
]

export default function NewExpense() {
  const online = useOnline()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [customers, setCustomers] = useState([])
  const [category, setCategory] = useState('bensin')
  const [amount, setAmount] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [photos, setPhotos] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCustomers({})
      .then((d) => setCustomers(listOf(d)))
      .catch(() => {})
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    const client_uuid = uuid()
    const formFields = {
      category,
      amount: String(amount),
      note,
      expense_date: date,
      client_uuid,
    }
    if (customerId) formFields.customer_id = customerId

    if (!online) {
      saveDraft('expense', { id: client_uuid, formFields })
      showToast('Offline — expense disimpan draft (foto perlu diunggah ulang)', { warn: true })
      nav('/expenses')
      return
    }

    const fd = new FormData()
    Object.entries(formFields).forEach(([k, v]) => fd.append(k, v))
    photos.forEach((f, i) => fd.append('photos[]', f, f.name || `photo-${i}.jpg`))

    setSaving(true)
    try {
      await createExpense(fd)
      showToast('Expense berhasil diajukan')
      nav('/expenses')
    } catch (err) {
      saveDraft('expense', { id: client_uuid, formFields })
      showToast(err.message || 'Gagal — draft tersimpan', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Laporkan Expense" backTo="/expenses" />
      <form onSubmit={submit}>
        <div className="field">
          <label>Kategori</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATS.map((c) => (
              <option key={c.k} value={c.k}>
                {c.n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Nominal</label>
          <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Customer (opsional)</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">—</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Keterangan</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="field">
          <label>Tanggal</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Foto bukti</label>
          <PhotoUpload files={photos} onChange={setPhotos} />
        </div>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Mengunggah…' : 'Ajukan Expense'}
        </button>
      </form>
    </Screen>
  )
}
