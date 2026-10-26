// frontend/src/pages/NewPettyCashIssue.jsx
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createCashAdvanceIssue, getCashAdvanceSummary, retryCashAdvanceAttachments, searchCustomersForPicker } from '../api'
import { ApiError } from '../api/client'
import { Screen, TopBar } from '../components/ui'
import { useDebounce } from '../hooks/useDebounce'
import { useUi } from '../context/UiContext'
import { fmtIdr } from '../lib/money'
import '../styles/cashadvance.css'

const CATEGORY_LIST = [
  { operation_type: 'Biaya Hotel Sales', display_name: 'Hotel', icon: '🏨' },
  { operation_type: 'Biaya BBM Sales', display_name: 'Bensin', icon: '⛽' },
  { operation_type: 'Biaya Makan Minum Sales', display_name: 'Makan & Minum', icon: '🍽️' },
  { operation_type: 'Biaya Tol Sales', display_name: 'Tol', icon: '🚗' },
  { operation_type: 'Biaya Parkir Sales', display_name: 'Parkir', icon: '🅿️' },
  { operation_type: 'Biaya Lain-lain Sales', display_name: 'Lain-lain', icon: '🏷️' },
]

export default function NewPettyCashIssue() {
  const { state } = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const fileInputRef = useRef(null)
  const now = new Date()

  const [opType, setOpType] = useState(state?.operationType || '')
  const [amount, setAmount] = useState('')
  const [customer, setCustomer] = useState(null)
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState([])
  const [balance, setBalance] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false)

  // E-09: dokumen sudah tersimpan di Epicor, tinggal foto yang perlu diunggah ulang
  const [issueResult, setIssueResult] = useState(null) // {id, cash_document, ...}
  const [failedNames, setFailedNames] = useState([])
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    getCashAdvanceSummary(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
      .then((s) => setBalance(s.balance))
      .catch(() => setBalance(null))
  }, [])

  function addPhotos(fileList) {
    const incoming = Array.from(fileList)
    if (photos.length + incoming.length > 3) setErrors((e) => ({ ...e, photos: 'Maksimal 3 foto bukti.' })) // E-11
    setPhotos((prev) => [...prev, ...incoming].slice(0, 3))
  }

  function validate() {
    const e = {}
    if (!opType) e.opType = 'Pilih kategori pengeluaran.' // E-03
    const n = Number(amount)
    if (!amount || n <= 0) e.amount = 'Nominal harus lebih dari Rp 0.' // E-04
    else if (balance != null && n > balance) e.amount = 'Nominal melebihi saldo Cash Advance.' // E-05
    if (!note.trim()) e.note = 'Keterangan wajib diisi.' // E-06
    if (photos.length === 0) e.photos = 'Lampirkan minimal 1 foto bukti.' // E-07
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (saving || !validate()) return
    setSaving(true)
    setErrors((e) => ({ ...e, submit: undefined }))
    try {
      const category = CATEGORY_LIST.find((c) => c.operation_type === opType)
      const form = new FormData()
      form.append('operation_type', opType)
      form.append('display_name', category?.display_name || '')
      form.append('cash_amount', amount)
      if (customer) form.append('customer_ref', `${customer.id} - ${customer.name}`)
      form.append('comment', note)
      photos.forEach((p) => form.append('photos[]', p))

      const result = await createCashAdvanceIssue(form)

      if (result.attachment_failures?.length) {
        // E-09: dokumen tersimpan, sebagian/semua foto gagal diunggah — tetap di halaman ini untuk Coba Lagi
        setIssueResult(result)
        setFailedNames(result.attachment_failures)
        showToast(`Pengeluaran ${result.cash_document} tersimpan, tetapi foto bukti gagal diunggah.`, { warn: true })
      } else {
        showToast(`Pengeluaran ${result.cash_document} tersimpan`)
        nav('/cash-advance')
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        // E-10: koneksi putus saat Simpan — dokumen mungkin sudah terbentuk di Epicor (backend sudah cek duplikat),
        // jadi cukup biarkan Sales ketuk Simpan lagi.
        setErrors((e) => ({ ...e, submit: 'Koneksi terputus. Periksa koneksi lalu ketuk Simpan lagi.' }))
      } else if (err instanceof ApiError && err.data?.errors?.code === 'E-05') {
        setErrors((e) => ({ ...e, amount: err.message }))
      } else {
        setErrors((e) => ({ ...e, submit: err.message || 'Pengeluaran gagal disimpan.' })) // E-08
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleRetryAttachments() {
    if (!issueResult || retrying) return
    setRetrying(true)
    try {
      const failedFiles = photos.filter((p) => failedNames.includes(p.name))
      const form = new FormData()
      failedFiles.forEach((p) => form.append('photos[]', p))

      const res = await retryCashAdvanceAttachments(issueResult.id, form)
      const stillFailed = res.attachment_failures || []
      setFailedNames(stillFailed)

      if (stillFailed.length === 0) {
        showToast(`Foto bukti ${issueResult.cash_document} berhasil diunggah`)
        nav('/cash-advance')
      }
    } catch (err) {
      showToast(err?.message || 'Gagal mengunggah ulang foto', { error: true })
    } finally {
      setRetrying(false)
    }
  }

  function handleBack() {
    const dirty = opType || amount || note || photos.length > 0
    if (dirty && !leaveConfirm) { setLeaveConfirm(true); return }
    nav(-1)
  }

  // --- Layar retry E-09: dokumen sudah ada, form asli tidak ditampilkan lagi supaya tidak submit dobel ---
  if (issueResult) {
    const failedFiles = photos.filter((p) => failedNames.includes(p.name))
    return (
      <Screen>
        <TopBar title="Catat Pengeluaran" onBack={() => nav('/cash-advance')} />
        <div className="ca-retry-panel">
          <p className="ca-retry-title">
            Pengeluaran {issueResult.cash_document} tersimpan, tetapi foto bukti gagal diunggah.
          </p>
          <div className="ca-photos">
            {failedFiles.map((p, i) => (
              <div key={i} className="ca-photo-thumb">
                <img src={URL.createObjectURL(p)} alt={p.name} />
              </div>
            ))}
          </div>
          <button className="ca-btn-primary" disabled={retrying} onClick={handleRetryAttachments}>
            {retrying ? 'Mengunggah…' : 'Coba Lagi'}
          </button>
          {/* Bukan dari FDD — tambahan saya supaya Sales tidak terjebak di layar ini. Hapus kalau tidak diinginkan. */}
          <button type="button" className="ca-btn-outline" onClick={() => nav('/cash-advance')}>
            Lanjut Nanti
          </button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <TopBar title="Catat Pengeluaran" onBack={handleBack} />

      <div className="ca-form">
        <Field label="Tanggal" badge="AUTO">
          {now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}, {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        </Field>
        <Field label="Cash Document" badge="AUTO">—</Field>

        <Field label="Kategori *" error={errors.opType}>
          <select value={opType} onChange={(e) => setOpType(e.target.value)}>
            <option value="">Pilih kategori</option>
            {CATEGORY_LIST.map((c) => <option key={c.operation_type} value={c.operation_type}>{c.icon} {c.display_name}</option>)}
          </select>
        </Field>

        <Field label="Nominal *" error={errors.amount}>
          <div className="ca-amount-input">
            <span>Rp</span>
            <input type="text" inputMode="numeric" value={amount ? Number(amount).toLocaleString('id-ID') : ''}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 12))} />
          </div>
        </Field>

        <Field label="Customer (opsional)">
          <CustomerPicker value={customer} onChange={setCustomer} />
        </Field>

        <Field label="Keterangan *" error={errors.note}>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <Field label="Lampiran Bukti (Foto) *" error={errors.photos} hint={photos.length > 0 ? `✓ ${photos.length} foto` : null}>
          <div className="ca-photos">
            {photos.map((p, i) => (
              <div key={i} className="ca-photo-thumb">
                <img src={URL.createObjectURL(p)} alt={p.name} />
                <button onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}>×</button>
              </div>
            ))}
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" capture="environment" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
          <button type="button" className="ca-btn-outline" onClick={() => fileInputRef.current.click()}>📷 Ambil Foto Lagi</button>
          <button type="button" className="ca-btn-outline" onClick={() => fileInputRef.current.click()}>🖼️ Pilih dari Galeri</button>
        </Field>

        {errors.submit && <p className="ca-error-text">{errors.submit}</p>}

        <button className="ca-btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Menyimpan…' : 'Simpan'}</button>

        <p className="ca-balance-hint">
          {amount ? <>Saldo berkurang <strong>{fmtIdr(Number(amount))}</strong> dari {fmtIdr(balance ?? 0)}</> : <>Saldo {fmtIdr(balance ?? 0)}</>}
        </p>
      </div>

      {leaveConfirm && (
        <div className="ca-dialog-backdrop">
          <div className="ca-dialog">
            <p>Buang pengeluaran yang belum disimpan?</p>
            <button onClick={() => setLeaveConfirm(false)}>Batal</button>
            <button onClick={() => nav(-1)}>Buang</button>
          </div>
        </div>
      )}
    </Screen>
  )
}

function Field({ label, badge, error, hint, children }) {
  return (
    <div className="ca-field">
      <label>{label} {badge && <span className="ca-badge-auto">{badge}</span>} {hint && <span className="ca-hint">{hint}</span>}</label>
      {children}
      {error && <p className="ca-error-text">{error}</p>}
    </div>
  )
}

function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const debounced = useDebounce(q, 350)

  useEffect(() => {
    if (!debounced || debounced.length < 2) { setResults([]); return }
    let alive = true
    searchCustomersForPicker(debounced).then((data) => { if (alive) { setResults(data || []); setOpen(true) } }).catch(() => alive && setResults([]))
    return () => { alive = false }
  }, [debounced])

  if (value) {
    return (
      <div className="ca-customer-chip">
        <span>{(value.name || '?').slice(0, 2).toUpperCase()}</span>
        <div><strong>{value.name}</strong><small>{[value.type, value.city].filter(Boolean).join(' · ')}</small></div>
        <button onClick={() => onChange(null)}>×</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input placeholder="Cari customer…" value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)} />
      {open && results.length > 0 && (
        <div className="search-results">
          {results.map((c) => (
            <div key={c.id} className="sr-item" role="button" tabIndex={0}
              onMouseDown={() => { onChange(c); setQ(''); setOpen(false) }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>{[c.type, c.city].filter(Boolean).join(' · ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}