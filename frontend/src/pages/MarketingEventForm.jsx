// frontend/src/pages/MarketingEventForm.jsx
// Blueprint MJU 3.2.2 (MKT02 Pure Event Entry), langkah 01 sampai 05.
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createMarketingEvent, getMarketingBudgets, getMarketingEvent, getMarketingEventOptions, reviseEvent } from '../api'
import { AttachmentPicker } from '../components/AttachmentPicker'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingbudget.css'
import '../styles/marketingevent.css'

const TARGETS = [
  { value: 'NATIONAL', label: 'Nasional' },
  { value: 'TERRITORY', label: 'Territory' },
  { value: 'CUSTOMER', label: 'Customer' },
]

export default function MarketingEventForm() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { id } = useParams()
  const revising = Boolean(id) // MKT06: event yang ditolak direvisi lalu diajukan ulang
  const { showToast } = useUi()
  const allowed = isManager(user)

  const [budgets, setBudgets] = useState([])
  const [options, setOptions] = useState({ activity_types: [], territories: [], customers: [] })
  const [budgetId, setBudgetId] = useState(params.get('budget') || '')
  const [description, setDescription] = useState('')
  const [letterNo, setLetterNo] = useState('')
  const [activityType, setActivityType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [targetType, setTargetType] = useState('NATIONAL')
  const [territories, setTerritories] = useState([])
  const [customers, setCustomers] = useState([])
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [amount, setAmount] = useState(null)
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!allowed) return
    Promise.all([getMarketingBudgets(), getMarketingEventOptions({})])
      .then(([b, o]) => {
        setBudgets(listOf(b).filter((x) => x.status === 'ACTIVE'))
        setOptions({ activity_types: o?.activity_types || [], territories: o?.territories || [], customers: o?.customers || [] })
        setFound(o?.customers || [])
        setActivityType((cur) => cur || o?.activity_types?.[0]?.value || '')
      })
      .catch((e) => showToast(e.message || 'Gagal memuat data form', { warn: true }))
  }, [allowed, showToast])

  // mode revisi: isi form dari event yang ditolak
  useEffect(() => {
    if (!allowed || !revising) return
    getMarketingEvent(id)
      .then((ev) => {
        setBudgetId(String(ev.marketing_budget_id))
        setDescription(ev.description || '')
        setLetterNo(ev.reference_letter_no || '')
        setActivityType(ev.activity_type || '')
        setStartDate(ev.start_date || '')
        setEndDate(ev.end_date || '')
        setTargetType(ev.target_type || 'NATIONAL')
        setTerritories(ev.target_territories || [])
        setCustomers(ev.target_customers || [])
        setAmount(Number(ev.budget_amount))
      })
      .catch((e) => showToast(e.message || 'Gagal memuat event', { warn: true }))
  }, [allowed, revising, id, showToast])

  // pencarian customer (target Customer), ditunda sebentar supaya tidak memanggil server di tiap ketikan
  useEffect(() => {
    if (!allowed || targetType !== 'CUSTOMER') return undefined
    const t = setTimeout(() => {
      getMarketingEventOptions({ q })
        .then((o) => setFound(o?.customers || []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [q, targetType, allowed])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Event Marketing" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const budget = budgets.find((b) => String(b.id) === String(budgetId))
  const remaining = budget ? Number(budget.remaining_budget) : null
  const over = remaining != null && amount != null && amount > remaining
  const toggleTerritory = (t) => setTerritories((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const toggleCustomer = (c) =>
    setCustomers((cur) => (cur.some((x) => x.id === c.id) ? cur.filter((x) => x.id !== c.id) : [...cur, c]))

  const submit = async (e) => {
    e.preventDefault()
    const warn = (m) => showToast(m, { warn: true })
    if (!budgetId) return warn('Pilih Campaign')
    if (!description.trim()) return warn('Isi deskripsi event')
    if (!letterNo.trim()) return warn('Isi Nomor Surat Komunikasi')
    if (!startDate || !endDate) return warn('Isi tanggal mulai dan selesai')
    if (endDate < startDate) return warn('Tanggal selesai tidak boleh sebelum tanggal mulai')
    if (targetType === 'TERRITORY' && territories.length === 0) return warn('Pilih minimal satu territory')
    if (targetType === 'CUSTOMER' && customers.length === 0) return warn('Pilih minimal satu customer')
    if (!amount || amount <= 0) return warn('Isi budget (RAB) lebih dari 0')
    if (over) return warn('Budget melebihi sisa budget Campaign')

    const fd = new FormData()
    fd.append('marketing_budget_id', budgetId)
    fd.append('description', description.trim())
    fd.append('reference_letter_no', letterNo.trim())
    fd.append('activity_type', activityType)
    fd.append('start_date', startDate)
    fd.append('end_date', endDate)
    fd.append('target_type', targetType)
    fd.append('budget_amount', String(amount))
    if (targetType === 'TERRITORY') territories.forEach((t) => fd.append('territories[]', t))
    if (targetType === 'CUSTOMER') customers.forEach((c) => fd.append('customer_ids[]', String(c.id)))
    files.forEach((f) => fd.append('attachments[]', f, f.name))

    setSaving(true)
    try {
      const saved = revising ? await reviseEvent(id, fd) : await createMarketingEvent(fd)
      showToast(revising ? 'Event direvisi dan diajukan ulang' : 'Event tersimpan, menunggu persetujuan')
      nav(`/marketing/events/${saved?.id ?? id}`, { replace: true })
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan event', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title={revising ? 'Revisi Event' : 'Event Baru'} backTo={revising ? `/marketing/events/${id}` : '/marketing/events'} />
      <form onSubmit={submit}>
        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">1</span>Event ID &amp; Deskripsi</div>
          <Field label="Campaign">
            <select value={budgetId} disabled={revising} onChange={(e) => setBudgetId(e.target.value)}>
              <option value="">— pilih Campaign —</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>{b.campaign_code} · {b.name}</option>
              ))}
            </select>
          </Field>
          {budget ? <div className="me-hint" style={{ marginTop: -4, marginBottom: 10 }}>Sisa budget Campaign: <b>{fmtIdr(remaining)}</b></div> : null}
          <Field label="Deskripsi Event">
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="mis. Bazaar Ramadan" />
          </Field>
          <Field label="Nomor Surat Komunikasi" hint={<div className="me-hint">Penanda satu event. Event ID dibuat otomatis (urut per Campaign).</div>}>
            <input value={letterNo} onChange={(e) => setLetterNo(e.target.value)} maxLength={100} />
          </Field>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">2</span>Activity Type</div>
          <Field label="Activity Type">
            <select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
              {options.activity_types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">3</span>Periode Event</div>
          <div className="row">
            <Field label="Tanggal Mulai" style={{ flex: 1 }}>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Tanggal Selesai" style={{ flex: 1 }}>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">4</span>Target &amp; Budget</div>
          <div className="mb-seg three">
            {TARGETS.map((t) => (
              <button key={t.value} type="button" className={targetType === t.value ? 'on' : ''} aria-pressed={targetType === t.value} onClick={() => setTargetType(t.value)}>
                {t.label}
              </button>
            ))}
          </div>

          {targetType === 'NATIONAL' ? <div className="me-hint">Berlaku nasional: semua customer aktif menjadi peserta.</div> : null}

          {targetType === 'TERRITORY' ? (
            <div style={{ marginTop: 10 }}>
              {options.territories.length === 0 ? (
                <div className="me-hint">Belum ada territory pada data sales.</div>
              ) : (
                <div className="me-pills">
                  {options.territories.map((t) => (
                    <button key={t} type="button" className={`me-pill${territories.includes(t) ? ' on' : ''}`} aria-pressed={territories.includes(t)} onClick={() => toggleTerritory(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <div className="me-hint">Peserta: customer aktif milik sales di territory terpilih.</div>
            </div>
          ) : null}

          {targetType === 'CUSTOMER' ? (
            <div style={{ marginTop: 10 }}>
              <Field label="Cari customer">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama atau kode customer" />
              </Field>
              {found.map((c) => {
                const on = customers.some((x) => x.id === c.id)
                return (
                  <button key={c.id} type="button" className={`me-pick${on ? ' sel' : ''}`} onClick={() => toggleCustomer(c)}>
                    <span><b>{c.name}</b><small>{c.customer_code}{c.city ? ` · ${c.city}` : ''}</small></span>
                    <span>{on ? '✓' : '+'}</span>
                  </button>
                )
              })}
              <div className="me-hint">{customers.length} customer dipilih</div>
            </div>
          ) : null}

          <div style={{ marginTop: 14 }}>
            <Field label="Budget / RAB (Rp)">
              <NumInput className="mb-money" value={amount} onChange={setAmount} placeholder="0" />
            </Field>
            <div className="me-hint">Total: <b>{fmtIdr(amount || 0)}</b></div>
            {over ? <div className="me-warn">Melebihi sisa budget Campaign ({fmtIdr(remaining)})</div> : null}
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="me-doc-t"><div className="mb-sec-t" style={{ margin: 0 }}>Lampiran RAB</div><span>{revising ? 'lampiran lama tetap tersimpan · maks. 5 file baru' : 'maks. 5 file'}</span></div>
            <div style={{ height: 8 }} />
            <AttachmentPicker files={files} onChange={setFiles} />
          </div>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">5</span>Detail Target</div>
          <div className="me-hint" style={{ marginTop: 0 }}>Daftar peserta event dibentuk otomatis dari target di atas begitu event disimpan, lalu bisa dilihat di detail event.</div>
        </div>

        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : revising ? 'Simpan Revisi & Ajukan Ulang' : 'Simpan Event'}
        </button>
        <div className="me-hint" style={{ textAlign: 'center' }}>
          {revising ? 'Setelah diajukan ulang, persetujuan dimulai lagi dari Tahap 1.' : 'Setelah disimpan, event menunggu persetujuan sebelum dapat dipakai.'}
        </div>
        <div style={{ height: 12 }} />
      </form>
    </Screen>
  )
}
