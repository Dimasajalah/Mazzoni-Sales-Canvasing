// frontend/src/pages/Leads.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLeads, getTaskSets, getTaskTypes, getTasks, createLeadFollowup } from '../api'
import { Chips, ListItem, Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtRp, listOf, stageColor } from '../lib/format'

const FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'QUOTE', label: 'Quote' },
  { value: 'WON', label: 'Won' },
]

function FollowupForm({ lead, onDone, showToast }) {
  const [taskSets, setTaskSets] = useState([])
  const [taskTypes, setTaskTypes] = useState([])
  const [tasks, setTasks] = useState([])
  const [taskSetId, setTaskSetId] = useState('')
  const [taskTypeId, setTaskTypeId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [followupAt, setFollowupAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getTaskSets(), getTaskTypes()])
      .then(([ts, tt]) => {
        setTaskSets(listOf(ts))
        setTaskTypes(listOf(tt))
      })
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  useEffect(() => {
    if (!taskTypeId) {
      setTasks([])
      setTaskId('')
      return
    }
    getTasks({ task_type_id: taskTypeId })
      .then((res) => setTasks(listOf(res)))
      .catch((e) => showToast(e.message, { warn: true }))
  }, [taskTypeId, showToast])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createLeadFollowup(lead.id, {
        followup_at: followupAt,
        notes: notes || null,
        task_set_id: taskSetId || null,
        task_type_id: taskTypeId || null,
        task_id: taskId || null,
      })
      showToast('Follow-up tersimpan')
      onDone()
    } catch (err) {
      showToast(err.message || 'Gagal simpan follow-up', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Task Set</label>
        <select value={taskSetId} onChange={(e) => setTaskSetId(e.target.value)}>
          <option value="">— Pilih Task Set —</option>
          {taskSets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Task Type</label>
        <select value={taskTypeId} onChange={(e) => setTaskTypeId(e.target.value)}>
          <option value="">— Pilih Task Type —</option>
          {taskTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Task</label>
        <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!taskTypeId}>
          <option value="">
            {taskTypeId ? '— Pilih Task —' : 'Pilih Task Type dahulu'}
          </option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Tanggal Follow-up</label>
        <input
          type="datetime-local"
          value={followupAt}
          onChange={(e) => setFollowupAt(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label>Catatan</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={saving}>
        {saving ? 'Menyimpan…' : 'Simpan Follow-up'}
      </button>
    </form>
  )
}

export default function Leads() {
  const [filter, setFilter] = useState('ALL')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast, openSheet, closeSheet } = useUi()
  const nav = useNavigate()

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const params = filter === 'ALL' ? {} : { stage: filter }
        const data = await getLeads(params)
        if (alive) setItems(listOf(data))
      } catch (e) {
        if (alive) showToast(e.message || 'Gagal muat leads', { warn: true })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [filter, showToast])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return items
    return items.filter((l) => String(l.stage || '').toUpperCase() === filter)
  }, [items, filter])

  const openFollowUp = (lead) => {
    openSheet('Follow-up Canvassing', (
      <div>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>{lead.business_name || lead.name}</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Stage: {lead.stage} · {lead.owner_name || '—'}
        </div>

        <FollowupForm lead={lead} showToast={showToast} onDone={closeSheet} />

        <div style={{ height: 12 }} />
        <button
          type="button"
          className="btn ghost"
          style={{ marginBottom: 8 }}
          onClick={() => {
            closeSheet()
            nav('/orders/new', { state: { leadId: lead.id, customerName: lead.business_name } })
          }}
        >
          Buat Order
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            closeSheet()
            nav('/canvassing')
          }}
        >
          Buka Canvassing
        </button>
      </div>
    ))
  }

  return (
    <Screen>
      <h1 className="title">Leads</h1>
      <p className="sub">Pipeline canvassing lapangan</p>
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      {loading ? (
        <div className="loading-center">Memuat leads…</div>
      ) : filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          Belum ada lead.
        </div>
      ) : (
        filtered.map((l) => {
          const stage = String(l.stage || 'NEW').toUpperCase()
          return (
            <ListItem
              key={l.id}
              barColor={stageColor(stage)}
              title={l.business_name || l.name}
              subtitle={`${stage} · ${l.owner_name || l.phone || '—'}`}
              right={l.estimated_value != null ? fmtRp(l.estimated_value) : '—'}
              onClick={() => openFollowUp(l)}
            />
          )
        })
      )}
    </Screen>
  )
}