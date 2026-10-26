// frontend/src/pages/MarketingBudgetForm.jsx
// Blueprint MJU 3.2.1 (MKT01) langkah 02: Budget Entry = membuat Campaign untuk mengisi budget ke sistem.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createMarketingBudget, getMarketingBudget, updateMarketingBudget } from '../api'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingbudget.css'

const THIS_YEAR = new Date().getFullYear()

export default function MarketingBudgetForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const { user } = useAuth()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [budget, setBudget] = useState(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [year, setYear] = useState(THIS_YEAR)
  const [total, setTotal] = useState(null)
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const [saving, setSaving] = useState(false)
  const allowed = isManager(user)

  useEffect(() => {
    if (!editing || !allowed) return
    getMarketingBudget(id)
      .then((b) => {
        setBudget(b)
        setCode(b.campaign_code)
        setName(b.name)
        setYear(b.fiscal_year)
        setTotal(Number(b.total_budget))
        setDescription(b.description || '')
        setStatus(b.status)
      })
      .catch((e) => showToast(e.message || 'Gagal memuat budget', { warn: true }))
  }, [editing, allowed, id, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Budget Marketing" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return showToast('Isi nama campaign', { warn: true })
    if (!total || total <= 0) return showToast('Isi total budget lebih dari 0', { warn: true })

    setSaving(true)
    try {
      if (editing) {
        await updateMarketingBudget(id, { name: name.trim(), total_budget: total, description, status })
        showToast('Budget diperbarui')
      } else {
        const payload = { name: name.trim(), fiscal_year: Number(year), total_budget: total, description }
        if (code.trim()) payload.campaign_code = code.trim()
        await createMarketingBudget(payload)
        showToast('Budget marketing tersimpan')
      }
      nav('/marketing/budgets', { replace: true })
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan', { error: true })
    } finally {
      setSaving(false)
    }
  }

  const allocated = Number(budget?.allocated_amount) || 0
  const pct = total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : 0

  return (
    <Screen>
      <TopBar title={editing ? 'Ubah Budget' : 'Budget Marketing Baru'} backTo="/marketing/budgets" />
      <form onSubmit={submit}>
        <div className="mb-sec">
          <div className="mb-sec-t">Informasi Campaign</div>
          <Field label="Nama Campaign">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="mis. Campaign Ramadan" />
          </Field>
          <div className="row">
            <Field label="Kode Campaign" style={{ flex: 1 }}>
              <input value={code} readOnly={editing} onChange={(e) => setCode(e.target.value)} maxLength={30} placeholder={editing ? '' : 'Otomatis'} />
            </Field>
            <Field label="Tahun Anggaran" style={{ flex: 1 }}>
              <input type="number" value={year} readOnly={editing} min="2020" max="2100" onChange={(e) => setYear(e.target.value)} />
            </Field>
          </div>
          <Field label="Keterangan">
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t">Budget</div>
          <Field label="Total Budget (Rp)">
            <NumInput className="mb-money" value={total} onChange={setTotal} placeholder="0" />
          </Field>
          <div className="mb-preview">Total: <b>{fmtIdr(total || 0)}</b></div>
        </div>

        {editing && budget ? (
          <div className="mb-sec">
            <div className="mb-sec-t">Pemakaian Budget</div>
            <div className="mb-bar"><i className={pct >= 100 ? 'full' : pct >= 80 ? 'warn' : ''} style={{ width: `${pct}%` }} /></div>
            <div className="mb-kv" style={{ marginTop: 8 }}>Teralokasi ke Event/Klaim: <b>{fmtIdr(allocated)}</b></div>
            <div className="mb-kv">Sisa budget: <b>{fmtIdr(budget.remaining_budget)}</b></div>
            {status === 'ACTIVE' ? (
              <button type="button" className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => nav(`/marketing/events/new?budget=${budget.id}`)}>
                + Tambah Event dari Campaign ini
              </button>
            ) : null}
            {status === 'ACTIVE' ? (
              <button type="button" className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => nav(`/marketing/claim-programs/new?budget=${budget.id}`)}>
                + Tambah Program Klaim dari Campaign ini
              </button>
            ) : null}
            <div className="mb-sec-t" style={{ marginTop: 10 }}>Status</div>
            <div className="mb-seg">
              <button type="button" className={status === 'ACTIVE' ? 'on' : ''} aria-pressed={status === 'ACTIVE'} onClick={() => setStatus('ACTIVE')}>Aktif</button>
              <button type="button" className={status === 'CLOSED' ? 'on' : ''} aria-pressed={status === 'CLOSED'} onClick={() => setStatus('CLOSED')}>Ditutup</button>
            </div>
          </div>
        ) : null}

        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
        <div style={{ height: 12 }} />
      </form>
    </Screen>
  )
}
