// frontend/src/components/LeadTaskPanel.jsx
// Isi sheet untuk sebuah prospek: tugas aktif, tombol fitur per tugas (journey), dan konklusi tugas.
// Dipakai dari halaman Leads, Canvassing, dan Activities.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    cancelDelegation,
    concludeLeadTask,
    delegateLead,
    deliverSample,
    getDelegationTargets,
    getLeadDelegation,
    getQuotes,
    getSamples,
    updateLead,
    updateLeadTask,
} from '../api'
import { useAuth } from '../context/AuthContext'
import { TaskFields } from './TaskFields'
import { TaskFieldsGrid } from './TaskFieldsGrid'
import { ConclusionFields, useConclusionFields } from './ConclusionFields'
import { dueMeta, listOf, STAGE_LABEL, stageColor, winLossMeta } from '../lib/format'
import { canDelegate, canOrder } from '../lib/roles'
import { Field } from './Field'

export const TASK_ICON = {
    'Desk Call': '☎️',
    'Panggilan Telepon': '📞',
    Kunjungan: '📍',
    Meeting: '🤝',
    Quote: '📄',
    'Follow-up': '🔁',
}

const ACTIONS = {
    brand: { icon: '🏷️', label: 'Form Brand' },
    sample: { icon: '🎁', label: 'Pengajuan Sample' },
    feedback: { icon: '📝', label: 'Feedback Sample' },
    // Revisi tim functional: "Penawaran" diganti nama jadi "Quotation" di seluruh aplikasi.
    quote: { icon: '📄', label: 'Quotation' },
    order: { icon: '🛒', label: 'Buat Order' },
}

function Header({ lead }) {
    const sc = stageColor(lead.stage)
    const wl = winLossMeta(lead.win_loss)
    return (
        <div style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{lead.business_name}</div>
            <div className="badges" style={{ marginTop: 6 }}>
                <span className="badge" style={{ background: `${sc}22`, color: sc }}>
                    {STAGE_LABEL[lead.stage] || lead.stage}
                </span>
                <span className="badge" style={{ background: `${wl.color}22`, color: wl.color }}>
                    {wl.label}
                </span>
            </div>
        </div>
    )
}

function BackLink({ onClick }) {
    return (
        <button type="button" className="btn ghost sm" style={{ marginBottom: 10 }} onClick={onClick}>
            ‹ Kembali
        </button>
    )
}

export default function LeadTaskPanel({ lead, task: initialTask, onChanged, onClose, showToast, hideCheckin }) {
    const nav = useNavigate()
    const { user } = useAuth()
    const ordering = canOrder(user) // Sales Dealmaker tidak membuat order
    const delegating = canDelegate(user)
    const [view, setView] = useState('main')
    const [task, setTask] = useState(initialTask || null)
    const [dueDate, setDueDate] = useState(initialTask?.due_date || '')
    const [remark, setRemark] = useState(initialTask?.remark || '')
    const [busy, setBusy] = useState(false)

    const closed = (lead.win_loss || 'OPEN') !== 'OPEN'
    const toState = {
        leadId: lead.id,
        leadTaskId: task?.id ?? null,
        customerId: lead.customer_id ?? null,
        customerName: lead.business_name,
        // Revisi tim functional: Feedback Sample (halaman terpisah) juga butuh field Conclusion
        // manual -> perlu tahu task_set_id/seq/is_closing tugas ini untuk muat daftar "Tugas
        // berikutnya" yang benar, sama seperti form Brand di panel ini.
        taskSetId: lead.task_set_id ?? null,
        taskSeq: task?.seq ?? null,
        taskClosing: task?.is_closing ?? false,
        // Poin 9: ringkasan field tugas untuk halaman tujuan (Feedback Sample).
        task: task
            ? {
                  name: task.name,
                  task_type: task.task_type,
                  stage: task.stage,
                  status: task.status,
                  remark: task.remark ?? null,
                  assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
              }
            : null,
    }

    const fail = (err, fallback) => showToast(err?.message || fallback, { error: true })

    const go = (path) => {
        onClose?.()
        nav(path, { state: toState })
    }

    const runAction = (key) => {
        if (key === 'brand') return setView('brand')
        if (key === 'sample') return go('/samples/new')
        if (key === 'feedback') return go('/sample-feedbacks/new')
        if (key === 'order') return go('/orders/new')
        if (key === 'quote') return openQuote()
        return null
    }

    // Buka penawaran prospek ini bila sudah ada, kalau belum buat baru
    const openQuote = async () => {
        try {
            const existing = listOf(await getQuotes({ lead_id: lead.id }))[0]
            go(existing ? `/quotes/${existing.id}` : '/quotes/new')
        } catch (err) {
            fail(err, 'Gagal membuka Quotation')
        }
    }

    const saveDue = async () => {
        setBusy(true)
        try {
            const updated = await updateLeadTask(task.id, { due_date: dueDate || null })
            setTask((t) => ({ ...t, ...updated }))
            showToast(dueDate ? 'Jadwal tugas tersimpan' : 'Jadwal dihapus')
            onChanged?.()
        } catch (err) {
            fail(err, 'Gagal menyimpan jadwal')
        } finally {
            setBusy(false)
        }
    }

    const saveRemark = async () => {
        setBusy(true)
        try {
            const updated = await updateLeadTask(task.id, { remark: remark.trim() || null })
            setTask((t) => ({ ...t, ...updated }))
            showToast('Comment tersimpan')
            onChanged?.()
        } catch (err) {
            fail(err, 'Gagal menyimpan comment')
        } finally {
            setBusy(false)
        }
    }

    const closeManually = async (winLoss) => {
        setBusy(true)
        try {
            await updateLead(lead.id, { win_loss: winLoss, ...(winLoss === 'WIN' ? { stage: 'QUOTE' } : {}) })
            showToast(winLoss === 'WIN' ? 'Prospek ditandai MENANG' : 'Prospek ditandai KALAH')
            onChanged?.()
            onClose?.()
        } catch (err) {
            fail(err, 'Gagal memperbarui prospek')
        } finally {
            setBusy(false)
        }
    }

    // ---------- form Brand ----------
    if (view === 'brand') {
        return (
            <BrandForm
                lead={lead}
                task={task}
                onBack={() => setView('main')}
                onDone={() => {
                    onChanged?.()
                    onClose?.()
                }}
                showToast={showToast}
            />
        )
    }

    // ---------- konklusi ----------
    if (view === 'conclude' && task) {
        return (
            <ConcludeForm
                lead={lead}
                task={task}
                onBack={() => setView('main')}
                showToast={showToast}
                onDone={(res, conclusion) => {
                    onChanged?.(res)
                    if (conclusion === 'WIN') return setView('won')
                    if (conclusion === 'LOSE') return setView('lost')
                    // Lanjut: tampilkan tugas baru langsung di panel ini, tanpa menutup dan minta buka ulang
                    // (menutup panel di sini berisiko menampilkan tugas lama yang stale bila daftar induk belum sempat dimuat ulang)
                    setTask(res?.next_task || null)
                    setDueDate(res?.next_task?.due_date || '')
                    setRemark(res?.next_task?.remark || '')
                    setView('main')
                }}
            />
        )
    }

    if (view === 'lost') {
        return (
            <div>
                <Header lead={{ ...lead, win_loss: 'LOSE' }} />
                <div className="card muted" style={{ textAlign: 'center', padding: 16, margin: '12px 0' }}>
                    <div style={{ fontSize: 26 }}>✗</div>
                    <div style={{ fontWeight: 800, marginTop: 4 }}>Prospek KALAH</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                        Tidak ada tugas aktif lagi untuk prospek ini.
                    </div>
                </div>
                <button type="button" className="btn ghost" onClick={() => onClose?.()}>
                    Tutup
                </button>
            </div>
        )
    }

    if (view === 'won') {
        return (
            <div>
                <Header lead={{ ...lead, win_loss: 'WIN', stage: 'QUOTE' }} />
                <div className="card accent-g" style={{ textAlign: 'center', padding: 16, margin: '12px 0' }}>
                    <div style={{ fontSize: 26 }}>🏆</div>
                    <div style={{ fontWeight: 800, marginTop: 4 }}>Prospek MENANG</div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                        {ordering
                            ? 'Lanjutkan dengan membuat order untuk prospek ini.'
                            : 'Sales Dealmaker tidak membuat order. Delegasikan prospek ini ke Sales Order.'}
                    </div>
                </div>
                {ordering && (
                    <button type="button" className="btn" style={{ marginBottom: 8 }} onClick={() => go('/orders/new')}>
                        🛒 Buat Order
                    </button>
                )}
                {delegating && <DelegateBox lead={lead} showToast={showToast} />}
                <button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={() => onClose?.()}>
                    Tutup
                </button>
            </div>
        )
    }

    // ---------- tampilan utama ----------
    const due = task ? dueMeta(task.due_date) : null
    const actions = (task?.actions || []).filter((a) => ACTIONS[a] && (a !== 'order' || ordering))
    const orderHidden = !ordering && (task?.actions || []).includes('order')
    const hasSampleAction = (task?.actions || []).some((a) => a === 'sample' || a === 'feedback')

    return (
        <div>
            <Header lead={lead} />

            {/* Hasil meeting lanjutan: "abis daftar lead, langsung check-in... dari situ langsung
            integrate semua ke tugas Canvassing" — disembunyikan saat panel ini SENDIRI sedang
            ditampilkan di dalam Visit Mode (sales sudah check-in), supaya tidak redundan. */}
            {!hideCheckin && (
                <button type="button" className="btn ghost sm" style={{ marginBottom: 10, width: '100%' }} onClick={() => go('/checkin')}>
                    📍 Check-in di lokasi ini
                </button>
            )}

            {closed ? (
                <>
                    <div className="card muted" style={{ padding: 14, margin: '12px 0', fontSize: 12.5 }}>
                        Prospek ini sudah ditutup ({winLossMeta(lead.win_loss).label}). Tidak ada tugas aktif.
                    </div>
                    {lead.win_loss === 'WIN' && ordering ? (
                        <button type="button" className="btn" style={{ marginBottom: 8 }} onClick={() => go('/orders/new')}>
                            🛒 Buat Order
                        </button>
                    ) : null}
                    {lead.win_loss === 'WIN' && delegating ? <DelegateBox lead={lead} showToast={showToast} /> : null}
                </>
            ) : !task ? (
                <>
                    <div className="card muted" style={{ padding: 14, margin: '12px 0', fontSize: 12.5 }}>
                        Belum ada tugas aktif. Task Set prospek ini belum punya langkah (template) atau semua tugas sudah selesai.
                    </div>
                    <div className="tp-actions">
                        <button type="button" className="btn" disabled={busy} onClick={() => closeManually('WIN')}>
                            🏆 Tandai Menang
                        </button>
                        <button type="button" className="btn ghost" disabled={busy} onClick={() => closeManually('LOSE')}>
                            ✗ Tandai Kalah
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className="tp-task">
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <div style={{ fontSize: 22 }}>{TASK_ICON[task.task_type] || '📋'}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="muted" style={{ fontSize: 10.5 }}>
                                    Tugas aktif · {task.task_type}
                                </div>
                                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{task.name}</div>
                            </div>
                            <span className="badge" style={{ background: `${due.color}22`, color: due.color }}>
                                {due.label}
                            </span>
                        </div>

                        <TaskFields task={task} style={{ marginTop: 8 }} />

                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12 }}>
                            <Field label="Jadwal tugas (opsional)" style={{ flex: 1, margin: 0 }}>
                                <input type="date" value={dueDate || ''} onChange={(e) => setDueDate(e.target.value)} />
                            </Field>
                            <button
                                type="button"
                                className="btn ghost sm"
                                disabled={busy || (dueDate || '') === (task.due_date || '')}
                                onClick={saveDue}
                            >
                                Simpan
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 10 }}>
                            <Field label="Comment (opsional)" style={{ flex: 1, margin: 0 }}>
                                <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
                            </Field>
                            <button
                                type="button"
                                className="btn ghost sm"
                                disabled={busy || (remark || '') === (task.remark || '')}
                                onClick={saveRemark}
                            >
                                Simpan
                            </button>
                        </div>
                    </div>

                    {hasSampleAction && <SampleStatusBox taskId={task.id} showToast={showToast} />}

                    {actions.length > 0 && (
                        <div className="tp-actions">
                            {actions.map((a) => (
                                <button key={a} type="button" className="btn ghost" onClick={() => runAction(a)}>
                                    {ACTIONS[a].icon} {ACTIONS[a].label}
                                </button>
                            ))}
                        </div>
                    )}

                    {orderHidden && (
                        <div className="muted tp-hint">
                            Sales Dealmaker tidak membuat order. Selesaikan tugas dengan Menang, lalu delegasikan ke Sales Order.
                        </div>
                    )}

                    <button type="button" className="btn" style={{ marginTop: 6 }} onClick={() => setView('conclude')}>
                        ✓ Selesaikan Tugas
                    </button>
                </>
            )}
        </div>
    )
}

/** Poin 9: status pemberian sample untuk tugas Pengajuan Sample ini, kalau sudah pernah diajukan. */
function SampleStatusBox({ taskId, showToast }) {
    const [loading, setLoading] = useState(true)
    const [sample, setSample] = useState(null)
    const [marking, setMarking] = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        return getSamples({ lead_task_id: taskId })
            .then((rows) => {
                const list = listOf(rows)
                // Bug ditemukan lewat tes manual: sample lama yang sudah DELIVERED (mis. dari
                // backfill) bisa muncul lebih dulu di daftar daripada sample PENDING yang baru —
                // ambil yang PENDING kalau ada, jangan asal ambil elemen pertama.
                setSample(list.find((s) => s.status === 'PENDING') || list[0] || null)
            })
            .catch(() => setSample(null))
            .finally(() => setLoading(false))
    }, [taskId])

    useEffect(() => {
        load()
    }, [load])

    if (loading || !sample) return null

    if (sample.status === 'DELIVERED') {
        return (
            <div className="card accent-g" style={{ padding: 12, marginBottom: 8, fontSize: 12.5 }}>
                ✓ Sample sudah diberikan
            </div>
        )
    }

    const deliver = async () => {
        setMarking(true)
        try {
            const updated = await deliverSample(sample.id)
            setSample(updated)
            showToast('Sample ditandai sudah diberikan')
        } catch (err) {
            showToast(err?.message || 'Gagal menandai sample', { error: true })
        } finally {
            setMarking(false)
        }
    }

    return (
        <div className="card" style={{ padding: 12, marginBottom: 8, borderColor: 'var(--amber)' }}>
            <div style={{ fontSize: 12.5 }}>⏳ Menunggu pemberian sample</div>
            <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} disabled={marking} onClick={deliver}>
                {marking ? 'Menyimpan…' : 'Tandai sudah diberikan'}
            </button>
        </div>
    )
}

// =====================================================================================

function ConcludeForm({ lead, task, onBack, onDone, showToast }) {
    const fields = useConclusionFields(lead.task_set_id, task.seq, task.is_closing)
    const [remark, setRemark] = useState('')
    const [busy, setBusy] = useState(false)

    const submit = async (e) => {
        e.preventDefault()
        if (!fields.valid()) {
            showToast('Pilih tugas berikutnya', { warn: true })
            return
        }
        setBusy(true)
        try {
            const res = await concludeLeadTask(task.id, { ...fields.toPayload(), remark: remark.trim() || null })
            if (fields.conclusion === 'NEXT') showToast(`Tugas selesai · berikutnya: ${res?.next_task?.name || '—'}`)
            else showToast(fields.conclusion === 'WIN' ? 'Prospek ditandai MENANG 🏆' : 'Prospek ditandai KALAH')
            onDone(res, fields.conclusion)
        } catch (err) {
            showToast(err?.message || 'Gagal menyelesaikan tugas', { error: true })
        } finally {
            setBusy(false)
        }
    }

    return (
        <form onSubmit={submit}>
            <BackLink onClick={onBack} />
            <div style={{ fontWeight: 800, marginBottom: 2 }}>{task.name}</div>
            <TaskFieldsGrid task={task} commentLabel="Comment sebelumnya" style={{ marginBottom: 12 }} />
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 12 }}>
                Pilih konklusi tugas ini
            </div>

            <ConclusionFields isClosing={task.is_closing} fields={fields} />

            <Field label="Catatan hasil (opsional)">
                <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </Field>
            <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan Konklusi'}
            </button>
        </form>
    )
}

// =====================================================================================

function BrandForm({ lead, task, onBack, onDone, showToast }) {
    const [busy, setBusy] = useState(false)
    const [comment, setComment] = useState(task?.remark || '')
    const fields = useConclusionFields(lead.task_set_id, task?.seq, task?.is_closing)

    const submit = async (e) => {
        e.preventDefault()
        if (!task?.id) {
            showToast('Tidak ada tugas aktif untuk diselesaikan', { warn: true })
            return
        }
        if (!fields.valid()) {
            showToast('Pilih tugas berikutnya', { warn: true })
            return
        }
        setBusy(true)
        try {
            const res = await concludeLeadTask(task.id, { ...fields.toPayload(), remark: comment.trim() || null })
            showToast(
                fields.conclusion === 'NEXT'
                    ? `Brand Awareness selesai · berikutnya: ${res?.next_task?.name || '—'}`
                    : fields.conclusion === 'WIN'
                        ? 'Prospek ditandai MENANG 🏆'
                        : 'Prospek ditandai KALAH',
            )
            // Panel ditutup & data dimuat ulang begitu tugas selesai, supaya tidak menampilkan
            // tugas lama yang sudah basi.
            onDone?.()
        } catch (err) {
            showToast(err?.message || 'Gagal menyimpan', { error: true })
        } finally {
            setBusy(false)
        }
    }

    return (
        <form onSubmit={submit}>
            <BackLink onClick={onBack} />
            <div style={{ fontWeight: 800, marginBottom: 2 }}>Form Brand</div>
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
                {lead.business_name}
            </div>
            <TaskFieldsGrid task={task} comment={comment} onCommentChange={setComment} style={{ marginBottom: 12 }} />
            <div className="section-h" style={{ marginTop: 4 }}>Selesaikan Tugas</div>
            <ConclusionFields isClosing={task?.is_closing} fields={fields} />
            <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
            </button>
        </form>
    )
}

// =====================================================================================

/** Delegasi prospek yang sudah Win ke Sales Order (untuk Sales Dealmaker / admin / supervisor). */
function DelegateBox({ lead, showToast }) {
    const [loading, setLoading] = useState(true)
    const [delegation, setDelegation] = useState(null)
    const [form, setForm] = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        return getLeadDelegation(lead.id)
            .then((d) => setDelegation(d || null))
            .catch(() => setDelegation(null))
            .finally(() => setLoading(false))
    }, [lead.id])

    useEffect(() => {
        load()
    }, [load])

    if (loading) return <div className="muted tp-hint">Memuat delegasi…</div>

    if (form) {
        return (
            <DelegateForm
                lead={lead}
                showToast={showToast}
                onBack={() => setForm(false)}
                onDone={() => {
                    setForm(false)
                    load()
                }}
            />
        )
    }

    const cancel = async () => {
        try {
            await cancelDelegation(delegation.id)
            showToast('Delegasi dibatalkan')
            load()
        } catch (err) {
            showToast(err?.message || 'Gagal membatalkan delegasi', { error: true })
        }
    }

    if (delegation?.status === 'ORDERED') {
        return (
            <div className="card accent-g" style={{ padding: 12, fontSize: 12.5 }}>
                Order <b>{delegation.order?.order_number || ''}</b> sudah dibuat oleh <b>{delegation.to?.name}</b>.
            </div>
        )
    }

    if (delegation?.status === 'PENDING') {
        return (
            <div className="card" style={{ padding: 12 }}>
                <div style={{ fontSize: 12.5 }}>
                    Didelegasikan ke <b>{delegation.to?.name}</b> · menunggu order
                </div>
                {delegation.note ? (
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                        “{delegation.note}”
                    </div>
                ) : null}
                <div className="tp-actions" style={{ marginTop: 10 }}>
                    <button type="button" className="btn ghost sm" onClick={() => setForm(true)}>
                        Ganti sales
                    </button>
                    <button type="button" className="btn ghost sm" onClick={cancel}>
                        Batalkan delegasi
                    </button>
                </div>
            </div>
        )
    }

    return (
        <button type="button" className="btn" onClick={() => setForm(true)}>
            🤝 Delegasikan ke Sales Order
        </button>
    )
}

function DelegateForm({ lead, onBack, onDone, showToast }) {
    const [targets, setTargets] = useState([])
    const [loadingTargets, setLoadingTargets] = useState(true)
    const [toId, setToId] = useState('')
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        let alive = true
        getDelegationTargets()
            .then((rows) => alive && setTargets(listOf(rows)))
            .catch(() => alive && setTargets([]))
            .finally(() => alive && setLoadingTargets(false))
        return () => {
            alive = false
        }
    }, [])

    const submit = async (e) => {
        e.preventDefault()
        if (!toId) {
            showToast('Pilih Sales Order tujuan', { warn: true })
            return
        }
        setBusy(true)
        try {
            await delegateLead(lead.id, { to_user_id: Number(toId), note: note.trim() || null })
            const name = targets.find((t) => String(t.id) === String(toId))?.name
            showToast(`Prospek didelegasikan ke ${name || 'Sales Order'}`)
            onDone()
        } catch (err) {
            showToast(err?.message || 'Gagal mendelegasikan', { error: true })
        } finally {
            setBusy(false)
        }
    }

    return (
        <form onSubmit={submit} className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 2 }}>Delegasikan ke Sales Order</div>
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
                Order untuk {lead.business_name} akan dibuat oleh sales yang dipilih. NOO tetap dihitung ke Anda.
            </div>
            <Field label="Sales Order tujuan">
                <select value={toId} onChange={(e) => setToId(e.target.value)} disabled={loadingTargets}>
                    <option value="">{loadingTargets ? 'Memuat…' : targets.length ? '— Pilih sales —' : 'Belum ada Sales Order aktif'}</option>
                    {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.name}
                            {t.territory ? ` · ${t.territory}` : ''}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="Catatan untuk penerima (opsional)">
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
            </Field>
            <div className="tp-actions">
                <button type="button" className="btn ghost" onClick={onBack}>
                    Batal
                </button>
                <button type="submit" className="btn" disabled={busy}>
                    {busy ? 'Menyimpan…' : 'Delegasikan'}
                </button>
            </div>
        </form>
    )
}