// frontend/src/pages/IssueMaterialDetail.jsx
// Blueprint MJU 3.2.17 (MKT17), langkah 03: Marketing mengisi nama sales atau customer beserta peruntukannya pada Remarks.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { completeMaterialIssue, getMaterialIssue } from '../api'
import { Field } from '../components/Field'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { canIssueMaterial, ISSUE_RECIPIENT_TYPES, issueStatusMeta } from '../lib/issueMaterial'
import '../styles/marketingbudget.css'
import '../styles/marketingclaim.css'
import '../styles/marketingevent.css'

const fmtQty = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })

export default function IssueMaterialDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [issue, setIssue] = useState(null)
  const [type, setType] = useState('')
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const allowed = canIssueMaterial(user)

  useEffect(() => {
    if (!allowed) return
    getMaterialIssue(id)
      .then(setIssue)
      .catch((e) => showToast(e.message || 'Gagal memuat issue', { warn: true }))
  }, [allowed, id, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Issue Produk" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor (Marketing).
        </div>
      </Screen>
    )
  }

  if (!issue) {
    return (
      <Screen>
        <TopBar title="Issue Produk" backTo="/marketing/issues" />
        <div className="muted" style={{ fontSize: 12.5 }}>Memuat…</div>
      </Screen>
    )
  }

  const flags = issue.flags || {}
  const st = issueStatusMeta(issue.status)
  const types = issue.recipient_types?.length ? issue.recipient_types : ISSUE_RECIPIENT_TYPES
  const typeLabel = types.find((t) => t.value === type)?.label
  const nameLabel = type === 'CUSTOMER' ? 'Nama Customer' : 'Nama Sales'

  const complete = async (e) => {
    e.preventDefault()
    const warn = (m) => showToast(m, { warn: true })
    if (!type) return warn('Pilih Sales atau Customer')
    if (!name.trim()) return warn(type === 'CUSTOMER' ? 'Isi nama customer' : 'Isi nama sales')
    if (!purpose.trim()) return warn('Isi peruntukan')

    setBusy(true)
    try {
      setIssue(await completeMaterialIssue(issue.id, { recipient_type: type, recipient_name: name.trim(), purpose: purpose.trim() }))
      showToast('Remarks tersimpan')
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan Remarks', { error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Issue Produk" backTo="/marketing/issues" />

      <div className="mb-sec">
        <div className="mb-top">
          <div className="mb-main">
            <div className="mb-name" style={{ whiteSpace: 'normal' }}>{issue.issue_no}</div>
            <div className="mb-meta">Issue Misc. Material {issue.issue_reference}</div>
          </div>
          <span className={`mb-badge ${st.tone}`}>{st.label}</span>
        </div>
        <div className="mb-kv">Dicatat oleh <b>{issue.creator?.name || '—'}</b></div>
        {issue.requester_name ? <div className="mb-kv">Peminta <b>{issue.requester_name}</b></div> : null}
        {issue.notes ? <div className="me-hint">Catatan: {issue.notes}</div> : null}
        {issue.awaiting_label ? <div className="me-hint">Menunggu {issue.awaiting_label}</div> : null}
        {flags.can_edit ? (
          <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => nav(`/marketing/issues/${issue.id}/edit`)}>Ubah Issue</button>
        ) : null}
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">Barang yang Dikeluarkan ({issue.items.length})</div>
        {issue.items.map((i, n) => (
          <div key={i.id} className="mb-kv" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <span><b>{n + 1}. {i.part_num}</b>{i.description ? ` · ${i.description}` : ''}</span>
            <span>Jumlah {fmtQty(i.qty)}</span>
          </div>
        ))}
      </div>

      <div className="mb-sec">
        <div className="mb-sec-t">Remarks: Nama Sales atau Customer dan Peruntukannya</div>
        {flags.can_complete ? (
          <form onSubmit={complete}>
            <Field label="Jenis Penerima">
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">— pilih Sales atau Customer —</option>
                {types.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label={nameLabel}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </Field>
            <Field label="Peruntukan">
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={150} />
            </Field>
            <div className="cl-res">
              <div className="cl-res-row"><span>Remarks</span><b>{name.trim() || '…'}{typeLabel ? ` (${typeLabel})` : ''} / {purpose.trim() || '…'}</b></div>
            </div>
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 12 }}>Simpan Remarks</button>
          </form>
        ) : (
          <>
            <div className="mb-kv">Remarks <b>{issue.remarks}</b></div>
            <div className="me-hint">Dicatat {fmtDate(issue.completed_at)} sebagai keterangan peruntukan barang.</div>
          </>
        )}
      </div>
      <div style={{ height: 12 }} />
    </Screen>
  )
}
