// frontend/src/pages/NewSampleFeedback.jsx
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createSampleFeedback } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'

const FEEDBACK_TYPES = [
  { value: 'interest', label: 'Interest' },
  { value: 'not_interest', label: 'Not Interest' },
  { value: 'revision', label: 'Revisi' },
]

const REVISION_TYPES = ['warna', 'tekstur', 'bau', 'rasa']

export default function NewSampleFeedback() {
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [versionSample, setVersionSample] = useState(1)
  const [batchNumber, setBatchNumber] = useState('')
  const [feedbackType, setFeedbackType] = useState('interest')
  const [revisionTypes, setRevisionTypes] = useState([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleRevisionType = (type) => {
    setRevisionTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (feedbackType === 'revision' && revisionTypes.length === 0) {
      showToast('Pilih minimal 1 jenis revisi', { warn: true })
      return
    }
    setSaving(true)
    try {
      await createSampleFeedback({
        product_sample_id: loc.state?.sampleId || null,
        customer_id: loc.state?.customerId || null,
        lead_id: loc.state?.leadId || null,
        version_sample: Number(versionSample),
        batch_number: batchNumber,
        feedback_type: feedbackType,
        revision_types: feedbackType === 'revision' ? revisionTypes : null,
        notes: notes || null,
      })
      showToast('Feedback sample berhasil dicatat')
      nav(-1)
    } catch (err) {
      showToast(err.message || 'Gagal simpan feedback', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Feedback Sample" backTo="/leads" />
      <form onSubmit={submit}>
        <div className="field">
          <label>Version Sample</label>
          <input type="number" min={1} value={versionSample} onChange={(e) => setVersionSample(e.target.value)} />
        </div>
        <div className="field">
          <label>Nomor Batch</label>
          <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} required />
        </div>
        <div className="field">
          <label>Jenis Feedback</label>
          <select value={feedbackType} onChange={(e) => setFeedbackType(e.target.value)}>
            {FEEDBACK_TYPES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {feedbackType === 'revision' && (
          <div className="field">
            <label>Jenis Revisi (bisa pilih lebih dari satu)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {REVISION_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`chip${revisionTypes.includes(t) ? ' on' : ''}`}
                  onClick={() => toggleRevisionType(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label>Keterangan</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Feedback'}
        </button>
      </form>
    </Screen>
  )
}