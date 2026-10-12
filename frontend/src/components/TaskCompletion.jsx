// frontend/src/components/TaskCompletion.jsx
// Task Completion bersama semua form task: Complete, Conclusion, Reason Code, Next Task, Next Stage,
// Status, Comment (kotak besar). Isinya mengikuti Conclusion (Next/Lose).
// Aturan per task (conclusion yang diizinkan, kode alasan, status) dikirim lewat `config`.
// hideComment: halaman yang menaruh Comment di tempat lain (mis. Visit Notes) menyembunyikan kotak ini;
// nilainya tetap tc.comment dan ikut terkirim sebagai remark.
import { useEffect, useState } from 'react'
import { getTaskTemplates } from '../api'
import { stageCode } from '../lib/stageCode'
import { REASON_CODES } from './ConclusionFields'
import { Field } from './Field'

const CONCLUSION_LABEL = { NEXT: 'Next', WIN: 'Win', LOSE: 'Lose' }

// Bawaan = kode alasan lama (supaya form yang belum dipindah tidak berubah perilakunya).
const DEFAULT_REASONS = Object.fromEntries(
  Object.entries(REASON_CODES).map(([k, list]) => [k, list.map((s) => ({ value: s, label: s }))]),
)

/**
 * config: {
 *   conclusions?: ['NEXT','LOSE'],        // bawaan: tugas penutup -> WIN/LOSE; lainnya -> NEXT/WIN/LOSE
 *   reasons?: { NEXT: [{value,label}], LOSE: [...], WIN: [...] },
 *   statuses?: ['Process','WaitCust','Hold'],
 *   defaultStatus?: 'Process',
 *   defaultNextCode?: 'VRFKSNOO',         // template yang dipilih awal untuk Next Task
 *   nextTaskReadOnly?: true,              // Next Task tampil read-only (diturunkan dari kode alasan)
 *   allowSameTask?: true,                 // Next Task boleh memilih template task yang sedang dikerjakan (revisi)
 *   templateLabel?: (template) => string, // teks pilihan Next Task
 *   commentLabel?: string | node,         // label kotak Comment (bawaan "Comment")
 *   commentRows?: number,                 // tinggi kotak Comment (bawaan 5)
 *   plainLabels?: true,                   // Conclusion dan Reason Code tanpa tanda *
 *   nextBesideStatus?: true,              // Next Task di samping Status, tanpa Next Stage
 *   reasonHint?: string,
 * }
 */
export function useTaskCompletion(task, lead, config = {}) {
  const conclusions = config.conclusions || (task?.is_closing ? ['WIN', 'LOSE'] : ['NEXT', 'WIN', 'LOSE'])
  const reasons = config.reasons || DEFAULT_REASONS
  const statuses = config.statuses || ['Process', 'WaitCust', 'Hold', 'In Progress']
  const firstReason = (c) => reasons[c]?.[0]?.value ?? ''

  const [complete, setComplete] = useState(true)
  const [conclusion, setConclusionRaw] = useState(conclusions[0])
  const [reasonCode, setReasonCode] = useState(firstReason(conclusions[0]))
  const [status, setStatus] = useState(config.defaultStatus || statuses[0])
  const [templates, setTemplates] = useState([])
  const [nextId, setNextId] = useState('')
  const [comment, setComment] = useState(task?.remark || '')
  const [loadingTpl, setLoadingTpl] = useState(false)

  const setConclusion = (c) => {
    setConclusionRaw(c)
    setReasonCode(firstReason(c))
  }

  const taskSetId = lead?.task_set_id
  const seq = task?.seq
  const defaultCode = config.defaultNextCode
  const allowSame = Boolean(config.allowSameTask)
  const templateLabel = config.templateLabel || ((t) => `${t.code || t.seq} — ${t.name}`)
  useEffect(() => {
    if (!taskSetId) return undefined
    let alive = true
    setLoadingTpl(true)
    getTaskTemplates({ task_set_id: taskSetId })
      .then((rows) => {
        if (!alive) return
        const list = (Array.isArray(rows) ? rows : rows?.data || []).filter((t) => allowSame || t.seq !== seq)
        setTemplates(list)
        const pick =
          (defaultCode && list.find((t) => t.code === defaultCode)) || list.find((t) => t.seq > seq) || list[0]
        if (pick) setNextId(String(pick.id))
      })
      .catch(() => alive && setTemplates([]))
      .finally(() => alive && setLoadingTpl(false))
    return () => {
      alive = false
    }
  }, [taskSetId, seq, defaultCode, allowSame])

  const valid = () => !complete || conclusion !== 'NEXT' || Boolean(nextId)

  const toPayload = () => ({
    conclusion,
    reason_code: reasonCode || null,
    task_status: status || null,
    next_template_id: conclusion === 'NEXT' ? Number(nextId) : null,
    due_date: null, // tidak ada isian jadwal tugas berikutnya di Task Completion (dokumen); jadwal ada di panel tugas
    remark: comment.trim() || null,
  })

  return {
    complete, setComplete, conclusions, conclusion, setConclusion,
    reasons, reasonCode, setReasonCode, statuses, status, setStatus,
    templates, nextId, setNextId, comment, setComment, loadingTpl,
    nextTaskReadOnly: Boolean(config.nextTaskReadOnly),
    templateLabel,
    commentLabel: config.commentLabel || 'Comment',
    commentRows: config.commentRows || 5,
    plainLabels: Boolean(config.plainLabels),
    nextBesideStatus: Boolean(config.nextBesideStatus),
    reasonHint: config.reasonHint, valid, toPayload,
  }
}

export function TaskCompletion({ tc, hideComment = false, title = 'Task Completion', subtitle = null }) {
  const nextTpl = tc.templates.find((t) => String(t.id) === String(tc.nextId))
  const reasonList = tc.reasons[tc.conclusion] || []

  const nextField = (
    <Field label="Next Task" style={{ margin: 0 }}>
      {tc.nextTaskReadOnly ? (
        <input
          readOnly
          value={nextTpl ? tc.templateLabel(nextTpl) : tc.loadingTpl ? 'Memuat…' : '—'}
        />
      ) : (
        <select
          value={tc.nextId}
          onChange={(e) => tc.setNextId(e.target.value)}
          disabled={tc.loadingTpl || !tc.templates.length}
        >
          {!tc.templates.length && <option value="">{tc.loadingTpl ? 'Memuat…' : 'Tidak ada template'}</option>}
          {tc.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {tc.templateLabel(t)}
            </option>
          ))}
        </select>
      )}
    </Field>
  )

  return (
    <div className="tc">
      <div className="tc-h">{title}</div>
      {subtitle ? <div className="qh-tcsub">{subtitle}</div> : null}

      <label className={`tc-complete${tc.complete ? ' on' : ''}`}>
        <input type="checkbox" checked={tc.complete} onChange={(e) => tc.setComplete(e.target.checked)} />
        <span>Complete</span>
      </label>

      {tc.complete && (
        <>
          <div className="tc-grid">
            <Field label={tc.plainLabels ? 'Conclusion' : 'Conclusion *'} style={{ margin: 0 }}>
              <select value={tc.conclusion} onChange={(e) => tc.setConclusion(e.target.value)}>
                {tc.conclusions.map((c) => (
                  <option key={c} value={c}>
                    {CONCLUSION_LABEL[c] || c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tc.plainLabels ? 'Reason Code' : 'Reason Code *'} style={{ margin: 0 }}>
              <select value={tc.reasonCode} onChange={(e) => tc.setReasonCode(e.target.value)}>
                {reasonList.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {tc.reasonHint ? <div className="tc-hint">{tc.reasonHint}</div> : null}

          {tc.conclusion === 'NEXT' && !tc.nextBesideStatus && <div style={{ marginTop: 10 }}>{nextField}</div>}

          <div className="tc-grid" style={{ marginTop: 10 }}>
            {tc.conclusion === 'NEXT' && tc.nextBesideStatus && nextField}
            {tc.conclusion === 'NEXT' && !tc.nextBesideStatus && (
              <Field label="Next Stage" style={{ margin: 0 }}>
                <input readOnly value={nextTpl ? stageCode(nextTpl.stage) : '—'} />
              </Field>
            )}
            <Field label="Status *" style={{ margin: 0 }}>
              <select value={tc.status} onChange={(e) => tc.setStatus(e.target.value)}>
                {tc.statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
        </>
      )}

      {!hideComment && (
        <div className="tc-comment" style={{ marginTop: 10 }}>
          <Field label={tc.commentLabel} style={{ margin: 0 }}>
            <textarea rows={tc.commentRows} maxLength={500} value={tc.comment} onChange={(e) => tc.setComment(e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  )
}
