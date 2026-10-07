// frontend/src/components/ConclusionFields.jsx
// Revisi tim functional (Okt 2026): "Conclusion & Reason Code dipilih MANUAL oleh sales" — field-
// field ini (Conclusion, Reason Code, Tugas berikutnya) dipakai bersama oleh 3 tempat: layar
// "Selesaikan Tugas" (ConcludeForm), Form Brand, dan Form Feedback Sample — supaya sales SELALU
// memilih sendiri Conclusion/Reason Code di form itu, bukan lagi disimpulkan otomatis dari
// keputusan (Tertarik/Interest/dst) seperti sebelumnya (poin 12).
import { useEffect, useState } from 'react'
import { getTaskTemplates } from '../api'
import { STAGE_LABEL } from '../lib/format'
import { Field } from './Field'

export const REASON_CODES = {
  NEXT: ['Tertarik', 'Sample Cocok', 'Lanjut Negosiasi', 'Lanjut Proses'],
  WIN: ['Harga Disepakati', 'Kebutuhan Terpenuhi', 'Negosiasi Berhasil'],
  LOSE: ['Tidak Tertarik', 'Harga Tidak Sesuai', 'Pilih Kompetitor', 'Sample Ditolak', 'Tidak Ada Anggaran', 'Tidak Merespon'],
}

/** State + logika field Conclusion/Reason Code/Tugas berikutnya — dipakai bersama oleh 3 form. */
export function useConclusionFields(taskSetId, taskSeq, isClosing) {
  const [conclusion, setConclusionRaw] = useState(isClosing ? 'WIN' : 'NEXT')
  const [reasonCode, setReasonCode] = useState(REASON_CODES[isClosing ? 'WIN' : 'NEXT'][0])
  const [templates, setTemplates] = useState([])
  const [nextId, setNextId] = useState('')
  const [due, setDue] = useState('')
  const [loadingTpl, setLoadingTpl] = useState(false)

  // Daftar Reason Code beda per konklusi -> ganti konklusi harus ikut reset ke kode pertama yang
  // valid untuk konklusi barunya, supaya tidak terkirim kode yang sudah tidak cocok.
  const setConclusion = (next) => {
    setConclusionRaw(next)
    setReasonCode(REASON_CODES[next][0])
  }

  useEffect(() => {
    if (!taskSetId) return
    let alive = true
    setLoadingTpl(true)
    getTaskTemplates({ task_set_id: taskSetId })
      .then((rows) => {
        if (!alive) return
        const list = (Array.isArray(rows) ? rows : rows?.data || []).filter((t) => t.seq !== taskSeq)
        setTemplates(list)
        const following = list.find((t) => t.seq > taskSeq) || list[0]
        if (following) setNextId(String(following.id))
      })
      .catch(() => alive && setTemplates([]))
      .finally(() => alive && setLoadingTpl(false))
    return () => {
      alive = false
    }
  }, [taskSetId, taskSeq])

  const valid = () => conclusion !== 'NEXT' || Boolean(nextId)

  const toPayload = () => ({
    conclusion,
    reason_code: reasonCode,
    next_template_id: conclusion === 'NEXT' ? Number(nextId) : null,
    due_date: conclusion === 'NEXT' && due ? due : null,
  })

  return { conclusion, setConclusion, reasonCode, setReasonCode, templates, nextId, setNextId, due, setDue, loadingTpl, valid, toPayload }
}

/** Tampilan field-field itu — dirender di dalam <form> masing-masing pemanggil. */
export function ConclusionFields({ isClosing, fields }) {
  const { conclusion, setConclusion, reasonCode, setReasonCode, templates, nextId, setNextId, due, setDue, loadingTpl } = fields
  const nextTpl = templates.find((t) => String(t.id) === String(nextId))

  return (
    <>
      <div className="seg">
        {!isClosing && (
          <button type="button" className={`chip${conclusion === 'NEXT' ? ' on' : ''}`} onClick={() => setConclusion('NEXT')}>
            Lanjut
          </button>
        )}
        <button type="button" className={`chip win${conclusion === 'WIN' ? ' on' : ''}`} onClick={() => setConclusion('WIN')}>
          🏆 Menang
        </button>
        <button type="button" className={`chip lose${conclusion === 'LOSE' ? ' on' : ''}`} onClick={() => setConclusion('LOSE')}>
          ✗ Kalah
        </button>
      </div>
      {isClosing && (
        <div className="muted tp-hint" style={{ marginTop: -4 }}>
          Tugas penutup: hanya bisa diselesaikan dengan Menang atau Kalah.
        </div>
      )}

<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Field label="Reason Code" style={{ margin: 0, gridColumn: conclusion === 'NEXT' ? undefined : '1 / -1' }}>
          <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {REASON_CODES[conclusion].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>

        {conclusion === 'NEXT' && (
          <>
            <Field label="Tugas berikutnya" style={{ margin: 0 }}>
              <select value={nextId} onChange={(e) => setNextId(e.target.value)} disabled={loadingTpl || !templates.length}>
                {!templates.length && <option value="">{loadingTpl ? 'Memuat…' : 'Tidak ada template'}</option>}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.seq} · {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tahap berikutnya" style={{ margin: 0 }}>
              <input
                readOnly
                value={nextTpl ? STAGE_LABEL[nextTpl.stage] || nextTpl.stage : '—'}
                style={{ background: '#E9EEF6', cursor: 'default' }}
              />
            </Field>
            <Field label="Jadwal tugas berikutnya (opsional)" style={{ margin: 0 }}>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </>
  )
}