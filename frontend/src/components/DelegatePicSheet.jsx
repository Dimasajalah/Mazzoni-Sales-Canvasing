// frontend/src/components/DelegatePicSheet.jsx
// Dokumen hal. 20 (06 Delegate PIC): lembar bawah untuk menyerahkan customer ke sales lain.
// Dipakai lewat openSheet() dari Detail Customer; scrim gelap adalah milik lembar bawah aplikasi.
import { useEffect, useMemo, useState } from 'react'
import { delegatePic, getPicTargets } from '../api'
import { initials, listOf } from '../lib/format'
import '../styles/delegatepic.css'

const TONES = ['blue', 'green', 'gold']

export default function DelegatePicSheet({ customer, showToast, onClose, onDone }) {
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getPicTargets(customer.id)
      .then((r) => {
        if (alive) setTargets(listOf(r))
      })
      .catch((e) => {
        if (alive) showToast(e.message || 'Gagal memuat daftar sales', { warn: true })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [customer.id, showToast])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return targets.filter(
      (t) =>
        !needle ||
        [t.name, t.salesperson_code, t.territory].filter(Boolean).join(' ').toLowerCase().includes(needle),
    )
  }, [targets, q])

  const confirm = async () => {
    if (!pick) return
    setBusy(true)
    try {
      const updated = await delegatePic(customer.id, { to_user_id: pick.id })
      showToast(`PIC dipindahkan ke ${pick.name}`)
      onDone?.(updated)
      onClose?.()
    } catch (e) {
      showToast(e.message || 'Gagal memindahkan PIC', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const firstName = pick ? pick.name.split(' ')[0] : ''

  return (
    <div>
      <div className="dp-head">
        <div className="dp-title">Delegate PIC</div>
        <button type="button" className="dp-x" aria-label="Tutup" onClick={() => onClose?.()}>
          ×
        </button>
      </div>
      <p className="dp-sub">
        Hand over PIC for <b>{customer.name}</b> to another sales rep.
      </p>

      <input
        className="dp-search"
        type="search"
        placeholder="Search name / code / area"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="dp-list">
        {loading ? (
          <div className="dp-empty">Memuat…</div>
        ) : shown.length === 0 ? (
            <div className="dp-empty">
            {targets.length === 0 ? 'Belum ada sales lain yang aktif' : 'Tidak ada sales yang cocok'}
          </div>
        ) : (
          shown.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`dp-row${pick?.id === t.id ? ' on' : ''}`}
              onClick={() => setPick(t)}
            >
              <span className={`dp-av ${TONES[i % TONES.length]}`}>{initials(t.name)}</span>
              <span>
                <div className="dp-n">{t.name}</div>
                <div className="dp-c">
                  {t.salesperson_code || '—'} · {t.territory || '—'}
                </div>
              </span>
              {pick?.id === t.id ? <span className="dp-tick">✓</span> : null}
            </button>
          ))
        )}
      </div>

      <div className="dp-foot">
        <button type="button" className="dp-cancel" onClick={() => onClose?.()}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={!pick || busy} onClick={confirm}>
          {busy ? 'Delegating…' : pick ? `Delegate to ${firstName}` : 'Delegate'}
        </button>
      </div>
    </div>
  )
}
