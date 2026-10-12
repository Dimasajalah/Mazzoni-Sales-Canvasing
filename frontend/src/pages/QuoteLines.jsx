// frontend/src/pages/QuoteLines.jsx
// Dokumen hal. 33 (10b Quotation — Lines List): daftar Line pada Quotation, tombol Add, dan ringkasan Total Deal.
// Ketukan pada baris membuka 10c (Line Detail). Add dan Add another line membuka 10f (Add Line).
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getQuote } from '../api'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtIdr } from '../lib/money'
import { opportunityCode } from '../lib/leadCode'
import { useHideBottomNav } from '../lib/useHideBottomNav'
import '../styles/taskpage.css'

const nf = (v) => Number(v || 0).toLocaleString('id-ID')
const grossOf = (l) => Number(l.qty_pcs) * Number(l.unit_price)
/** Produk custom yang belum teregister sebagai Part Epicor (sama dengan aturan konversi ke order). */
const isUnregistered = (l) => Boolean(l.product) && !l.product.epicor_part_num
const subtitleOf = (l) => {
  const p = l.product || {}
  const part = p.part_num ? (p.revision ? `${p.part_num} / ${p.revision}` : p.part_num) : null
  return [p.product_group, part].filter(Boolean).join(' · ')
}

export default function QuoteLines() {
  useHideBottomNav()
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [quote, setQuote] = useState(null)
  const [loadState, setLoadState] = useState('loading') // loading | ready | missing

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const q = await getQuote(id)
        if (alive) {
          setQuote(q)
          setLoadState(q ? 'ready' : 'missing')
        }
      } catch (e) {
        if (alive) {
          showToast(e.message || 'Gagal memuat Quotation', { warn: true })
          setLoadState('missing')
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const lines = quote?.lines || []
  const n = lines.length
  const closed = Boolean(quote) && ['WON', 'LOST'].includes(quote.status)
  const leadId = quote?.lead_id ?? quote?.lead?.id
  const plural = n === 1 ? '' : 's'

  const openEditor = () => nav(`/quotes/${id}/lines/add`, { state: loc.state })
  const openLine = (l) => nav(`/quotes/${id}/lines/${l.id}`, { state: loc.state })
  const done = () => {
    const visit = loc.state?.visit
    if (visit) nav(`/visit/${visit.id}/quote`, { state: { visit }, replace: true })
    else nav(-1)
  }

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ minWidth: 0 }}>
          <div>Quotation Lines</div>
          <div className="tt-sub">
            {quote
              ? [leadId ? `Quote ${opportunityCode(leadId)}` : null, quote.customer?.name || quote.lead?.business_name]
                  .filter(Boolean)
                  .join(' · ')
              : ''}
          </div>
        </div>
        {quote ? (
          <button type="button" className="ql-add" onClick={openEditor} disabled={closed}>
            <span aria-hidden="true">+ </span>Add
          </button>
        ) : null}
      </div>

      {loadState === 'loading' ? (
        <div className="loading-center">Memuat…</div>
      ) : loadState === 'missing' ? (
        <div className="ql-empty">Quotation tidak ditemukan.</div>
      ) : (
        <>
          <div className="ql-hint">
            {n
              ? `${n} line${plural} on this Quotation — tap a line to view or edit its UOM conversion, pricing & discount.`
              : 'No lines on this Quotation yet — tap Add to pick an approved sample.'}
          </div>

          {lines.map((l, i) => (
            <button key={l.id ?? i} type="button" className="ql-line" onClick={() => openLine(l)}>
              <span className="ql-no">{i + 1}</span>
              <span className="ql-body">
                <span className="ql-name" style={{ display: 'block' }}>{l.description || l.product?.description}</span>
                <span className="ql-sub" style={{ display: 'block' }}>{subtitleOf(l)}</span>
                <span className="ql-row">
                  <span>
                    {nf(l.qty_kg)} KG → <b className="ql-pcs">{nf(l.qty_pcs)} PCS</b>
                  </span>
                  <span className="ql-gross">{fmtIdr(grossOf(l))}</span>
                </span>
                {isUnregistered(l) ? <span className="ql-badge">Custom B2B — not yet a registered Part</span> : null}
              </span>
              <span className="ql-chev" aria-hidden="true">›</span>
            </button>
          ))}

          <button type="button" className="ql-addmore" onClick={openEditor} disabled={closed}>
            <span aria-hidden="true">+</span>
            {n ? 'Add another line — pick from an approved sample' : 'Add the first line — pick from an approved sample'}
          </button>
          <div className="ql-note">
            Same as the &quot;Add&quot; button above — opens Add Line, where you pick an approved sample to pull from.
          </div>

          <div className="ql-foot">
            <div className="ql-total">
              <span>Total Deal ({n} line{plural})</span>
              <span>{fmtIdr(quote.total)}</span>
            </div>
            <button type="button" className="ql-done" onClick={done}>
              Done — Back to Quotation
            </button>
          </div>
        </>
      )}
    </Screen>
  )
}
