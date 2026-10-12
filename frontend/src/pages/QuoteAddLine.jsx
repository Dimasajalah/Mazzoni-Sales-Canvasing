// frontend/src/pages/QuoteAddLine.jsx
// Dokumen hal. 35 (10f Quotation — Add Line): Line baru bersumber dari sample yang disetujui. Jalur utama selalu menarik
// dari sample; "Add Blank Line" (cari manual Product Group / Part) hanyalah cadangan dan tanpa badge sample.
// Memilih salah satu membuka 10c (Line Detail) untuk ditinjau; Line baru tersimpan saat Save Line ditekan di sana.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getApprovedSamples, getQuote, searchQuoteProducts } from '../api'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { quoteCode } from '../lib/leadCode'
import { useHideBottomNav } from '../lib/useHideBottomNav'
import '../styles/taskpage.css'

const listOf = (v) => (Array.isArray(v) ? v : v?.data || [])

export default function QuoteAddLine() {
  useHideBottomNav()
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [quote, setQuote] = useState(null)
  const [samples, setSamples] = useState([])
  const [loadState, setLoadState] = useState('loading') // loading | ready | missing
  const [blankOpen, setBlankOpen] = useState(false)
  const [groups, setGroups] = useState([])
  const [group, setGroup] = useState('')
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [quoteData, sampleData] = await Promise.all([getQuote(id), getApprovedSamples(id)])
        if (alive) {
          setQuote(quoteData)
          setSamples(listOf(sampleData))
          setLoadState(quoteData ? 'ready' : 'missing')
        }
      } catch (e) {
        if (alive) {
          showToast(e.message || 'Gagal memuat sample yang disetujui', { warn: true })
          setLoadState('missing')
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Pencarian manual (cadangan): Product Group dan teks Part / Description.
  useEffect(() => {
    if (!blankOpen) return undefined
    let alive = true
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await searchQuoteProducts(id, { q: q.trim(), product_group: group })
        if (alive) {
          setResults(res?.products || [])
          if (res?.groups) setGroups(res.groups)
        }
      } catch (e) {
        if (alive) showToast(e.message || 'Gagal mencari produk', { warn: true })
      } finally {
        if (alive) setSearching(false)
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blankOpen, q, group, id])

  const closed = Boolean(quote) && ['WON', 'LOST'].includes(quote.status)
  const leadId = quote?.lead_id ?? quote?.lead?.id
  const nextNo = (quote?.lines || []).length + 1 // nomor Line yang akan terbentuk
  const pullSample = (s) => nav(`/quotes/${id}/lines/new?sample=${s.id}`, { state: loc.state })
  const pickProduct = (p) => nav(`/quotes/${id}/lines/new?product=${p.id}`, { state: loc.state })

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ minWidth: 0 }}>
          <div>Add Line</div>
          <div className="tt-sub">
            {quote
              ? [leadId ? `Quote ${quoteCode({ id: leadId })}` : null, quote.customer?.name || quote.lead?.business_name]
                  .filter(Boolean)
                  .join(' · ')
              : ''}
          </div>
        </div>
      </div>

      {loadState === 'loading' ? (
        <div className="loading-center">Memuat…</div>
      ) : loadState === 'missing' ? (
        <div className="ql-empty">Quotation tidak ditemukan.</div>
      ) : (
        <div className="tp-form">
          {closed ? (
            <div className="tp-empty" style={{ margin: '0 0 12px' }}>
              Quotation sudah ditutup ({quote.status}); Line tidak bisa ditambah.
            </div>
          ) : null}

          <div className="af-intro">
            Pick an approved sample for this customer to pull its product &amp; qty straight into a new Quotation Line — same
            source as Line 1.
          </div>
          <div className="af-h">From Approved Samples ({samples.length})</div>

          {samples.length === 0 ? (
            <div className="af-note" style={{ marginTop: 0 }}>
              No approved sample for this customer yet. A sample is approved when its Follow Up is concluded as “Sample Cocok”.
            </div>
          ) : null}

          {samples.map((s) => {
            const used = s.used_on_line
            const off = Boolean(used) || closed
            return (
              <button
                key={s.id}
                type="button"
                className={`af-card${used ? ' used' : ''}`}
                disabled={off}
                style={closed && !used ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                onClick={() => pullSample(s)}
              >
                <span className="af-no" aria-hidden="true">{used ? '✓' : nextNo}</span>
                <span className="af-body">
                  <span className="af-name">{s.description || s.part || '—'}</span>
                  <span className="af-sub">Follow Up Sample {s.followup_number} · Reason: Sample Cocok</span>
                  {used ? null : s.registered_product_id ? (
                    <span className="af-badge reg">Reguler — already a registered Part</span>
                  ) : (
                    <span className="af-badge custom">Custom B2B — not yet a registered Part</span>
                  )}
                </span>
                {used ? <span className="af-used">Already on Line {used}</span> : <span className="ql-chev" aria-hidden="true">›</span>}
              </button>
            )
          })}

          <div className="af-note">
            Tapping a sample above pulls its Product Group, Part/Rev, Qty &amp; Packaging into a new Line, opened straight on the
            Line Detail screen to review before saving.
          </div>

          <div className="af-sep" />
          <div className="af-h">Or add manually</div>

          <button type="button" className="ql-addmore" onClick={() => setBlankOpen((v) => !v)} disabled={closed}>
            <span aria-hidden="true">+</span>
            Add Blank Line — search Product Group / Part
          </button>
          <div className="af-note">
            Use this only when a product is quoted without going through Sampling first — no approved-sample badge will show on
            that line.
          </div>

          {blankOpen ? (
            <div className="ld-card" style={{ marginTop: 8 }}>
              <div className="ld-grid2">
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="af-group">Product Group</label>
                  <select id="af-group" value={group} onChange={(e) => setGroup(e.target.value)}>
                    <option value="">All</option>
                    {groups.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="af-q">Part / Description</label>
                  <input id="af-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                {searching ? <div className="ql-hint">Mencari…</div> : null}
                {!searching && !results.length ? <div className="ql-hint">No matching product.</div> : null}
                {results.map((p) => (
                  <button key={p.id} type="button" className="ql-line" onClick={() => pickProduct(p)} style={{ marginBottom: 8 }}>
                    <span className="ql-body">
                      <span className="ql-name" style={{ display: 'block' }}>{p.description || p.part_num}</span>
                      <span className="ql-sub" style={{ display: 'block' }}>
                        {[p.product_group, p.part_num ? (p.revision ? `${p.part_num} / ${p.revision}` : p.part_num) : null].filter(Boolean).join(' · ')}
                      </span>
                      {!p.epicor_part_num ? <span className="ql-badge">Custom B2B — not yet a registered Part</span> : null}
                    </span>
                    <span className="ql-chev" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="ld-foot">
            <button type="button" className="af-cancel" onClick={() => nav(-1)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Screen>
  )
}
