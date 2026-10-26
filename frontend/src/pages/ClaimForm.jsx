// frontend/src/pages/ClaimForm.jsx
// Blueprint MJU 3.2.8 (MKT08) langkah 02-04: Claim Entry. Pilih program klaim yang sudah Approved, pilih distributor dari
// peserta program, isi tanggal terima surat dan nilai pengajuan. Surat dan kertas kerja dikirim distributor di luar sistem.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createClaim, getClaimOptions } from '../api'
import { AttachmentPicker } from '../components/AttachmentPicker'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { fmtIdr } from '../lib/money'
import { isManager } from '../lib/roles'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'
import '../styles/marketingstar.css'

export default function ClaimForm() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { showToast } = useUi()
  const allowed = isManager(user)

  const [programs, setPrograms] = useState([])
  const [programId, setProgramId] = useState(params.get('program') || '')
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [customer, setCustomer] = useState(null)
  const [received, setReceived] = useState('')
  const [amount, setAmount] = useState(null)
  const [letters, setLetters] = useState([])
  const [worksheets, setWorksheets] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!allowed) return
    getClaimOptions({})
      .then((o) => setPrograms(o?.programs || []))
      .catch((e) => showToast(e.message || 'Gagal memuat program klaim', { warn: true }))
  }, [allowed, showToast])

  // peserta program (calon distributor), dicari dengan jeda singkat supaya tidak memanggil server di tiap ketikan
  useEffect(() => {
    if (!allowed || !programId) {
      setFound([])
      return undefined
    }
    const t = setTimeout(() => {
      getClaimOptions({ program_id: programId, q })
        .then((o) => setFound(o?.participants || []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [allowed, programId, q])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Pengajuan Klaim" backTo="/home" />
        <div className="card muted" style={{ fontSize: 13, padding: 16 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  const program = programs.find((p) => String(p.id) === String(programId))
  const late = Boolean(program?.claim_deadline && received && received > program.claim_deadline)

  const chooseProgram = (id) => {
    setProgramId(id)
    setCustomer(null)
    setQ('')
  }

  const submit = async (e) => {
    e.preventDefault()
    const warn = (m) => showToast(m, { warn: true })
    if (!programId) return warn('Pilih program klaim')
    if (!customer) return warn('Pilih distributor')
    if (!received) return warn('Isi tanggal terima surat')
    if (!amount || amount <= 0) return warn('Isi nilai pengajuan lebih dari 0')

    const fd = new FormData()
    fd.append('program_id', programId)
    fd.append('customer_id', String(customer.id))
    fd.append('letter_received_date', received)
    fd.append('claimed_amount', String(amount))
    letters.forEach((f) => fd.append('letters[]', f, f.name))
    worksheets.forEach((f) => fd.append('worksheets[]', f, f.name))

    setSaving(true)
    try {
      const created = await createClaim(fd)
      showToast(created?.status === 'PENDING_PASS' ? 'Klaim tersimpan, menunggu persetujuan khusus' : 'Pengajuan klaim tersimpan')
      nav(`/marketing/claims/${created.id}`, { replace: true })
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pengajuan klaim', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Ajukan Klaim" backTo="/marketing/claims" />
      <form onSubmit={submit}>
        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">1</span>Surat &amp; Kertas Kerja Distributor</div>
          <div className="me-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            Distributor mengirim surat pengajuan klaim beserta kertas kerja di luar aplikasi. Lampirkan salinannya di sini bila ada.
          </div>
          <div className="mb-sec-t" style={{ marginBottom: 6 }}>Surat Klaim Distributor</div>
          <AttachmentPicker files={letters} onChange={setLetters} />
          <div className="mb-sec-t" style={{ margin: '14px 0 6px' }}>Kertas Kerja Klaim</div>
          <AttachmentPicker files={worksheets} onChange={setWorksheets} />
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">2</span>Program Klaim</div>
          <Field label="Program Klaim">
            <select value={programId} onChange={(e) => chooseProgram(e.target.value)}>
              <option value="">— pilih program klaim —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.event_code} · {p.description}</option>
              ))}
            </select>
          </Field>
          <div className="me-hint" style={{ marginTop: -4 }}>Hanya program klaim yang sudah disetujui (Approved) yang muncul.</div>
          {program ? (
            <div className="mb-kv" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <span>{program.claim_type_label} · sumber data {program.claim_source_label}</span>
              <span>Periode {fmtDate(program.start_date)} – {fmtDate(program.end_date)}</span>
              <span>Batas pengajuan klaim <b>{fmtDate(program.claim_deadline)}</b></span>
            </div>
          ) : null}
        </div>

        <div className="mb-sec">
          <div className="mb-sec-t"><span className="me-step">3</span>Distributor, Tanggal Surat &amp; Nilai</div>
          {customer ? (
            <div className="so-chosen" style={{ marginBottom: 10 }}>
              <span><b>{customer.name}</b><small>{customer.customer_code}{customer.city ? ` · ${customer.city}` : ''}</small></span>
              <button type="button" className="btn ghost sm" onClick={() => setCustomer(null)}>Ganti</button>
            </div>
          ) : (
            <>
              <Field label="Cari distributor (peserta program)">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={programId ? 'Nama atau kode distributor' : 'Pilih program klaim dulu'} disabled={!programId} />
              </Field>
              {found.map((c) => (
                <button key={c.id} type="button" className="me-pick" onClick={() => setCustomer(c)}>
                  <span><b>{c.name}</b><small>{c.customer_code}{c.city ? ` · ${c.city}` : ''}</small></span>
                  <span>+</span>
                </button>
              ))}
            </>
          )}
          <div style={{ height: 10 }} />
          <Field label="Tanggal Terima Surat">
            <input type="date" value={received} onChange={(e) => setReceived(e.target.value)} />
          </Field>
          {late ? (
            <div className="cl-late">
              Melewati periode klaim (batas {fmtDate(program.claim_deadline)}). Klaim tetap bisa disimpan dengan status Pending dan
              butuh persetujuan khusus Direktur Sales.
            </div>
          ) : null}
          <Field label="Nilai Pengajuan (Rp)">
            <NumInput className="mb-money" value={amount} onChange={setAmount} placeholder="0" />
          </Field>
          <div className="me-hint">Total: <b>{fmtIdr(amount || 0)}</b></div>
        </div>

        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Pengajuan Klaim'}
        </button>
        <div className="me-hint" style={{ textAlign: 'center' }}>
          Nilai eligible tidak diketik: dihitung dari parameter program lewat tombol Calculate setelah disimpan.
        </div>
        <div style={{ height: 12 }} />
      </form>
    </Screen>
  )
}
