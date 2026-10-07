// frontend/src/pages/NewSample.jsx
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createSample, getCustomers, updateLeadTask } from '../api'
import { Field } from '../components/Field'
import { ProductGroupField } from '../components/ProductGroupField'
import { TaskFieldsGrid } from '../components/TaskFieldsGrid'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'

export default function NewSample() {
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()

  // Revisi functional: "pengajuan Sample sudah masuk Customer". Dari tugas sebuah lead, Customer-nya
  // SUDAH ada (terbentuk saat Brand Awareness "Tertarik") dan dikunci — tidak boleh lagi memilih
  // sembarang customer. Sebelumnya dropdown ini otomatis memilih customer PERTAMA di daftar dan
  // customerId lead tidak pernah dikirim, sehingga sample masuk ke customer yang salah/kosong.
  const leadId = loc.state?.leadId || null
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState(loc.state?.customerId ? String(loc.state.customerId) : '')
  const [productGroup, setProductGroup] = useState('')
  const [qty, setQty] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  // Poin 9: ringkasan tugas dari LeadTaskPanel (lewat state navigasi), supaya field tugas tampil seragam
  const task = loc.state?.task || null
  const [comment, setComment] = useState(task?.remark || '')

  useEffect(() => {
    if (leadId) return // customer sudah pasti, tidak perlu daftar pilihan
    getCustomers({})
      .then((d) => setCustomers(listOf(d)))
      .catch((e) => showToast(e.message, { warn: true }))
  }, [leadId, showToast])

  const submit = async (e) => {
    e.preventDefault()
    if (!productGroup || !qty || !batchNumber.trim()) {
      showToast('Pilih Product Group, lalu isi Qty dan Batch', { warn: true })
      return
    }
    setSaving(true)
    try {
      await createSample({
        customer_id: customerId || null,
        lead_id: leadId,
        lead_task_id: loc.state?.leadTaskId || null,
        product_group: productGroup,
        qty: Number(qty),
        batch_number: batchNumber.trim(),
        notes: notes || null,
      })
      // Comment tugas disimpan terpisah; kegagalannya tidak membatalkan sample yang sudah tercatat.
      let commentFailed = false
      const newComment = comment.trim()
      if (loc.state?.leadTaskId && newComment !== (task?.remark || '')) {
        try {
          await updateLeadTask(loc.state.leadTaskId, { remark: newComment || null })
        } catch {
          commentFailed = true
        }
      }
      showToast(
        commentFailed ? 'Sample tersimpan, tetapi Comment gagal disimpan' : 'Pengajuan sample berhasil dicatat',
        commentFailed ? { warn: true } : {},
      )
      nav(-1)
    } catch (err) {
      showToast(err.message || 'Gagal simpan pengajuan sample', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Pengajuan Sample" backTo="/leads" />
      <form onSubmit={submit}>
      {task && (
          <TaskFieldsGrid task={task} comment={comment} onCommentChange={setComment} style={{ marginBottom: 12 }} />
        )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
          {leadId ? (
            <Field label="Customer" style={{ margin: 0 }}>
              <input value={loc.state?.customerName || '—'} readOnly />
            </Field>
          ) : (
            <Field label="Customer" style={{ margin: 0 }}>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— Tidak terkait customer —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Nama Produk" style={{ margin: 0 }}>
            <input value="Sample" readOnly />
          </Field>
        </div>
        <ProductGroupField value={productGroup} onChange={setProductGroup} />
        <div className="row">
          <Field label="Qty (Gram)" style={{ flex: 1 }}>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Batch" style={{ flex: 1 }}>
            <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="mis. B-2026-01" />
          </Field>
        </div>
        <Field label="Keterangan">
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Pengajuan Sample'}
        </button>
      </form>
    </Screen>
  )
}