// frontend/src/pages/ExpenseDetail.jsx
// Detail expense: data, foto bukti, riwayat status, dan aksi setujui, tolak, atau tandai dibayar untuk peran berwenang.
// Tombol mengikuti field `actions` dari server (bergantung peran dan status), bukan tebakan di layar.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getExpense, updateExpenseStatus } from '../api'
import { Card, Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { expenseButtons, expenseStatusMeta } from '../lib/expenseStatus'
import { fmtDate, fmtRp } from '../lib/format'
import { storageUrl } from '../lib/storageUrl'

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 6 }}>
      <span className="muted">{label}</span>
      <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
  )
}

export default function ExpenseDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [exp, setExp] = useState(null)
  const [missing, setMissing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getExpense(id)
      .then((d) => alive && setExp(d))
      .catch((e) => {
        if (!alive) return
        setMissing(true)
        showToast(e.message || 'Gagal memuat expense', { warn: true })
      })
    return () => {
      alive = false
    }
  }, [id, showToast])

  const back = () => nav('/expenses')

  if (missing) {
    return (
      <Screen>
        <TopBar title="Detail Expense" onBack={back} />
        <Card className="muted" style={{ textAlign: 'center' }}>Expense tidak ditemukan.</Card>
      </Screen>
    )
  }

  if (!exp) {
    return (
      <Screen>
        <TopBar title="Detail Expense" onBack={back} />
        <div className="muted">Memuat…</div>
      </Screen>
    )
  }

  const st = expenseStatusMeta(exp.status)
  const buttons = expenseButtons(exp.actions)

  const act = async (a) => {
    const warn = (m) => showToast(m, { warn: true })
    if (a.requireNote && !note.trim()) return warn('Isi catatan alasan penolakan')
    if (!window.confirm(`${a.label} expense ${exp.expense_number}?`)) return

    setBusy(true)
    try {
      const payload = { status: a.to }
      if (note.trim()) payload.notes = note.trim()
      setExp(await updateExpenseStatus(exp.id, payload))
      setNote('')
      showToast(`Expense ${a.done}`)
    } catch (e) {
      showToast(e.message || 'Gagal mengubah status', { warn: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Detail Expense" onBack={back} />

      <Card style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>{exp.expense_number}</div>
          <span className="badge" style={{ background: `${st.color}22`, color: st.color }}>{st.label}</span>
        </div>
        <Row label="Nominal">{fmtRp(exp.amount)}</Row>
        <Row label="Kategori">{exp.category || '—'}</Row>
        <Row label="Diajukan oleh">{exp.salesperson?.name || '—'}</Row>
        <Row label="Tanggal">{fmtDate(exp.expense_date)}</Row>
        {exp.customer?.name ? <Row label="Customer">{exp.customer.name}</Row> : null}
        {exp.note ? <Row label="Keterangan">{exp.note}</Row> : null}
      </Card>

      <div className="section-h">Foto Bukti</div>
      {(exp.attachments || []).length === 0 ? (
        <Card className="muted" style={{ padding: 14, marginBottom: 12, fontSize: 13 }}>Tidak ada foto terlampir.</Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {exp.attachments.map((a) => {
            const src = a.url || storageUrl(a.path)
            return /pdf/i.test(a.mime || '') ? (
              <a key={a.id} href={src} target="_blank" rel="noreferrer" className="card" style={{ padding: 12, fontSize: 12.5 }}>
                {a.filename}
              </a>
            ) : (
              <a key={a.id} href={src} target="_blank" rel="noreferrer">
                <img src={src} alt={a.filename} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
              </a>
            )
          })}
        </div>
      )}

      <div className="section-h">Riwayat Status</div>
      <Card style={{ padding: 14, marginBottom: 12 }}>
        {(exp.statusHistories || exp.status_histories || []).map((h) => (
          <div key={h.id} style={{ fontSize: 13, marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>
              {h.from_status ? `${expenseStatusMeta(h.from_status).label} → ${expenseStatusMeta(h.to_status).label}` : expenseStatusMeta(h.to_status).label}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {fmtDate(h.created_at)}
              {h.notes ? ` · ${h.notes}` : ''}
            </div>
          </div>
        ))}
      </Card>

      {buttons.length > 0 ? (
        <>
          <div className="section-h">Tindakan</div>
          <Card style={{ padding: 14, marginBottom: 12 }}>
            <div className="field">
              <label htmlFor="exp-note">Catatan (wajib untuk Tolak)</label>
              <textarea id="exp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {buttons.map((a) => (
                <button
                  key={a.to}
                  type="button"
                  className={a.primary ? 'btn' : 'btn ghost'}
                  style={a.danger ? { background: 'var(--pink)', color: '#fff' } : undefined}
                  disabled={busy}
                  onClick={() => act(a)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Card>
        </>
      ) : null}
      <div style={{ height: 12 }} />
    </Screen>
  )
}
