// frontend/src/pages/ClaimProgramForm.jsx
// Blueprint MJU 3.2.4 (MKT04 Program Klaim Entry), langkah 01 sampai 11.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createClaimProgram, getClaimProgramOptions, getMarketingBudgets } from '../api'
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
const RATE_TYPES = [
  { value: 'PERCENT', label: 'Persen (%)' },
  { value: 'AMOUNT', label: 'Nominal (Rp)' },
]

const Seg = ({ items, value, onChange, three }) => (
  <div className={`mb-seg${three ? ' three' : ''}`}>
    {items.map((t) => (
      <button key={t.value} type="button" className={value === t.value ? 'on' : ''} aria-pressed={value === t.value} onClick={() => onChange(t.value)}>
        {t.label}
      </button>
    ))}
  </div>
)

export default function ClaimProgramForm() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { showToast } = useUi()
  const allowed = isManager(user)

  const [budgets, setBudgets] = useState([])
  const [options, setOptions] = useState({ claim_types: [], claim_sources: [], claim_bases: [], territories: [], customers: [] })
  const [budgetId, setBudgetId] = useState(params.get('budget') || '')
  const [letterNo, setLetterNo] = useState('')
  const [description, setDescription] = useState('')
  const [claimType, setClaimType] = useState('')
  const [claimSource, setClaimSource] = useState('')
  const [claimBasis, setClaimBasis] = useState('')
  const [threshold, setThreshold] = useState(null)
  const [rate, setRate] = useState(null)
  const [rateType, setRateType] = useState('PERCENT')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [deadline, setDeadline] = useState('')
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
    Promise.all([getMarketingBudgets(), getClaimProgramOptions({})])
      .then(([b, o]) => {
        setBudgets(listOf(b).filter((x) => x.status === 'ACTIVE'))
        setOptions({
          claim_types: o?.claim_types || [], claim_sources: o?.claim_sources || [], claim_bases: o?.claim_bases || [],
          territories: o?.territories || [], customers: o?.customers || [],
        })
        setFound(o?.customers || [])
        setClaimSource((cur) => cur || o?.claim_sources?.[0]?.value || '')
        setClaimBasis((cur) => cur || o?.claim_bases?.[0]?.value || '')
      })
      .catch((e) => showToast(e.message || 'Gagal memuat data form', { warn: true }))
  }, [allowed, showToast])

  // pencarian customer (target Customer), ditunda sebentar supaya tidak memanggil server di tiap ketikan
  useEffect(() => {
    if (!allowed || targetType !== 'CUSTOMER') return undefined
    const t = setTimeout(() => {
      getClaimProgramOptions({ q })
        .then((o) => setFound(o?.customers || []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [q, targetType, allowed])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Program Klaim" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const budget = budgets.find((b) => String(b.id) === String(budgetId))
  const remaining = budget ? Number(budget.remaining_budget) : null
  const over = remaining != null && amount != null && amount > remaining
  const sourceLabel = options.claim_sources.find((s) => s.value === claimSource)?.label
  const toggleTerritory = (t) => setTerritories((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const toggleCustomer = (c) =>
    setCustomers((cur) => (cur.some((x) => x.id === c.id) ? cur.filter((x) => x.id !== c.id) : [...cur, c]))

  const submit = async (e) => {
    e.preventDefault()
    const warn = (m) => showToast(m, { warn: true })
    if (!budgetId) return warn('Pilih Campaign')
    if (!letterNo.trim()) return warn('Isi Nomor Surat Komunikasi Program')
    if (!description.trim()) return warn('Isi deskripsi program klaim')
    if (!claimType) return warn('Pilih jenis klaim')
    if (!rate || rate <= 0) return warn('Isi besaran klaim lebih dari 0')
    if (rateType === 'PERCENT' && rate > 100) return warn('Persen tidak boleh lebih dari 100')
    if (!startDate || !endDate || !deadline) return warn('Isi tanggal program dan batas pengajuan klaim')
    if (endDate < startDate) return warn('Tanggal selesai tidak boleh sebelum tanggal mulai')
    if (deadline < endDate) return warn('Batas pengajuan klaim tidak boleh sebelum tanggal selesai program')
    if (targetType === 'TERRITORY' && territories.length === 0) return warn('Pilih minimal satu territory')
    if (targetType === 'CUSTOMER' && customers.length === 0) return warn('Pilih minimal satu customer')
    if (!amount || amount <= 0) return warn('Isi budget lebih dari 0')
    if (over) return warn('Budget melebihi sisa budget Campaign')

    const fd = new FormData()
    fd.append('marketing_budget_id', budgetId)
    fd.append('reference_letter_no', letterNo.trim())
    fd.append('description', description.trim())
    fd.append('claim_type', claimType)
    fd.append('claim_source', claimSource)
    fd.append('claim_basis', claimBasis)
    fd.append('claim_rate_type', rateType)
    fd.append('claim_rate', String(rate))
    if (threshold != null) fd.append('claim_threshold', String(threshold))
    fd.append('start_date', startDate)
    fd.append('end_date', endDate)
    fd.append('claim_deadline', deadline)
    fd.append('target_type', targetType)
    fd.append('budget_amount', String(amount))
    if (targetType === 'TERRITORY') territories.forEach((t) => fd.append('territories[]', t))
    if (targetType === 'CUSTOMER') customers.forEach((c) => fd.append('customer_ids[]', String(c.id)))
    files.forEach((f) => fd.append('attachments[]', f, f.name))

    setSaving(true)
    try {
      const created = await createClaimProgram(fd)
      showToast('Program klaim tersimpan, menunggu persetujuan')
      nav(`/marketing/claim-programs/${created.id}`, { replace: true })
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan program klaim', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Program Klaim Baru" backTo="/marketing/claim-programs" />
      <form onSubmit={submit}>
        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">1</span>Surat Komunikasi Program</div>
          <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            Surat dibuat Staff Direksi di luar sistem. Isi nomornya sebagai rujukan, dan lampirkan salinannya bila ada.
          </div>
          <Field label="Nomor Surat Komunikasi Program">
            <input value={letterNo} onChange={(e) => setLetterNo(e.target.value)} maxLength={100} />
          </Field>
          <div className="me-doc-t"><div className="mb-sec-t" style={{ margin: 0 }}>Lampiran Surat</div><span>maks. 5 file</span></div>
          <div style={{ height: 8 }} />
          <AttachmentPicker files={files} onChange={setFiles} />
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">2</span>Klaim ID &amp; Deskripsi</div>
          <Field label="Campaign">
            <select value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
              <option value="">— pilih Campaign —</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>{b.campaign_code} · {b.name}</option>
              ))}
            </select>
          </Field>
          {budget ? <div className="me-hint" style={{ marginTop: -4, marginBottom: 10 }}>Sisa budget Campaign: <b>{fmtIdr(remaining)}</b></div> : null}
          <Field label="Deskripsi Program Klaim" hint={<div className="me-hint">Activity Type otomatis <b>Klaim</b>. Klaim ID dibuat otomatis (urut per Campaign).</div>}>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="mis. Diskon Saus Q4" />
          </Field>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">3</span>Jenis Klaim &amp; Sumber Data</div>
          <Field label="Jenis Klaim">
            <select value={claimType} onChange={(e) => setClaimType(e.target.value)}>
              <option value="">— pilih jenis klaim —</option>
              {options.claim_types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <div className="mb-sec-t" style={{ marginBottom: 6 }}>Sumber Data Klaim</div>
          <Seg items={options.claim_sources} value={claimSource} onChange={setClaimSource} />
          {claimSource === 'SELL_OUT' ? (
            <div className="me-hint">Sell Out: setelah program disimpan, unggah data sell out distributor lewat panel Data Sell Out di detail program.</div>
          ) : null}
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">4</span>Parameter Program</div>
          <Field label="Basis Perhitungan">
            <select value={claimBasis} onChange={(e) => setClaimBasis(e.target.value)}>
              {options.claim_bases.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Ambang (opsional)" hint={<div className="me-hint">Batas minimal pencapaian agar klaim berlaku.</div>}>
            <NumInput value={threshold} onChange={setThreshold} placeholder="0" />
          </Field>
          <div className="mb-sec-t" style={{ marginBottom: 6 }}>Jenis Besaran</div>
          <Seg items={RATE_TYPES} value={rateType} onChange={setRateType} />
          <div style={{ marginTop: 10 }}>
            <Field label="Besaran">
              <NumInput className="mb-money" value={rate} onChange={setRate} placeholder="0" />
            </Field>
            <div className="me-hint">
              Besaran: <b>{rate ? (rateType === 'PERCENT' ? `${rate}%` : fmtIdr(rate)) : '—'}</b>
              {sourceLabel ? ` dari data ${sourceLabel}` : ''}
            </div>
          </div>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">5</span>Periode Program &amp; Klaim</div>
          <div className="row">
            <Field label="Tanggal Mulai Program" style={{ flex: 1 }}>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Tanggal Selesai Program" style={{ flex: 1 }}>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Batas Pengajuan Klaim" hint={<div className="me-hint">Batas waktu peserta mengajukan klaim, tidak boleh sebelum program selesai.</div>}>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">6</span>Target &amp; Budget</div>
          <Seg items={TARGETS} value={targetType} onChange={setTargetType} three />

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
            <Field label="Budget (Rp)">
              <NumInput className="mb-money" value={amount} onChange={setAmount} placeholder="0" />
            </Field>
            <div className="me-hint">Total: <b>{fmtIdr(amount || 0)}</b></div>
            {over ? <div className="me-warn">Melebihi sisa budget Campaign ({fmtIdr(remaining)})</div> : null}
          </div>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">7</span>Detail Target</div>
          <div className="me-hint" style={{ marginTop: 0 }}>Daftar peserta klaim dibentuk otomatis dari target di atas begitu program disimpan, lalu bisa dilihat di detail program.</div>
        </div>

        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Program Klaim'}
        </button>
        <div className="me-hint" style={{ textAlign: 'center' }}>Setelah disimpan, program menunggu persetujuan sebelum dapat dipakai.</div>
        <div style={{ height: 12 }} />
      </form>
    </Screen>
  )
}
