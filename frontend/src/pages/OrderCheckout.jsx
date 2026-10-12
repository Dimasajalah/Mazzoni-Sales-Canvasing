// frontend/src/pages/OrderCheckout.jsx
// Dokumen hal. 37 (12 Sales Order / Checkout): membuat Sales Order dari Quotation yang Win. Langkah akhir: ikat tiap baris
// Custom B2B ke Part Epicor yang sudah teregister, lalu konfirmasi. Tanpa cetak PDF di sini (PDF Quotation ada di layar 10).
// Aman offline: order disimpan di perangkat dan dikirim otomatis begitu koneksi kembali.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  bindQuotePart, concludeLeadTask, confirmQuoteOrder, getLeadPromos, getPromos, getQuote, getQuotes, getVisit,
  removeLeadPromo, searchQuoteProducts,
} from '../api'
import { Screen } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { opportunityCode } from '../lib/leadCode'
import { fmtIdr } from '../lib/money'
import { clock, getQueued, isNetworkError, queueOrder, removeQueued, WIN_PAYLOAD } from '../lib/orderQueue'
import { bonusText, promoKind, promoRef } from '../lib/promo'
import { canOrder } from '../lib/roles'
import { useHideBottomNav } from '../lib/useHideBottomNav'
import '../styles/taskpage.css'

const listOf = (v) => (Array.isArray(v) ? v : v?.data || [])
const TOP_LABEL = { '15D': '15 Days', '30D': '30 Days', '45D': '45 Days', COD: 'COD' }
const STATUS_LABEL = { WON: 'Win', LOST: 'Lost', QUOTED: 'Quoted', DRAFT: 'Draft' }
const grossOf = (l) => Number(l.qty_pcs) * Number(l.unit_price)
const isUnbound = (l) => Boolean(l.product) && !l.product.epicor_part_num
const trimPct = (n) => String(Math.round(Number(n) * 100) / 100)

/** Satu baris diskon per Line yang diberi diskon: "Discount 1 (2%)". */
function discountRows(lines, fallback) {
  const rows = []
  lines.forEach((l, i) => {
    const gross = grossOf(l)
    const disc = gross - Number(l.line_total)
    if (gross > 0 && disc > 0.005) rows.push({ key: l.id ?? i, label: `Discount ${i + 1} (${trimPct((disc / gross) * 100)}%)`, amount: disc })
  })
  return rows.length ? rows : [{ key: 'none', label: 'Discount', amount: Number(fallback || 0) }]
}

/** Cari dan ikat Part terdaftar untuk satu baris Custom B2B (dalam Product Group baris itu). */
function PartBinder({ quoteId, line, disabled, onBind }) {
  const group = line.product?.product_group || ''
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return undefined
    }
    let alive = true
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await searchQuoteProducts(quoteId, { q: q.trim(), product_group: group, registered: 1 })
        if (alive) setResults(res?.products || [])
      } catch {
        if (alive) setResults([])
      } finally {
        if (alive) setSearching(false)
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q, group, quoteId])

  return (
    <div className="oc-bind">
      <div className="oc-partbox">
        <div className="oc-partname">{line.description || line.product?.description}</div>
        <div className="oc-partsub">
          Part {line.product?.part_num || '—'}{line.product?.revision ? ` / Rev ${line.product.revision}` : ''} · From the won Quotation line
          {group ? ` · Product Group: ${group}` : ''}
        </div>
      </div>
      <div className="oc-err" role="alert">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" />
        </svg>
        <span>
          Not yet bound to a registered Epicor Part. Search within {group || 'its product group'} — Reguler catalog items resolve
          instantly; a new custom B2B part needs Sales Admin to register it first.
        </span>
      </div>
      <label className="oc-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          aria-label={`Search registered part in ${group || 'product group'}`}
          placeholder={`Search registered part in ${group || 'product group'}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
        />
      </label>
      {searching ? <div className="oc-hint">Mencari…</div> : null}
      {q.trim().length >= 2 && !searching && !results.length ? <div className="oc-hint">No registered part found.</div> : null}
      {results.map((p) => (
        <button key={p.id} type="button" className="oc-result" disabled={disabled} onClick={() => onBind(line, p)}>
          <span className="oc-partname">{p.part_num}{p.revision ? ` / ${p.revision}` : ''}</span>
          <span className="oc-partsub">{p.description}{p.product_group ? ` · ${p.product_group}` : ''}</span>
        </button>
      ))}
    </div>
  )
}

export default function OrderCheckout() {
  useHideBottomNav()
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { user } = useAuth()
  const { showToast } = useUi()
  const [visit, setVisit] = useState(loc.state?.visit || null)
  const [quote, setQuote] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | missing
  const [promoList, setPromoList] = useState([])
  const [applied, setApplied] = useState([]) // [{ promo_ref, promo_name }]
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [local, setLocal] = useState(null) // entri antrean lokal untuk Quotation ini

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (visit) return undefined
    let alive = true
    ;(async () => {
      try {
        const v = await getVisit(id)
        if (alive && v) setVisit(v)
      } catch (e) {
        if (alive) showToast(e.message || 'Gagal memuat kunjungan', { warn: true })
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const lead = visit?.lead || null
  const task = lead?.current_task || null

  const reloadQuote = async (quoteId) => {
    const full = await getQuote(quoteId)
    setQuote(full)
    return full
  }

  useEffect(() => {
    if (!lead?.id) return undefined
    let alive = true
    ;(async () => {
      try {
        const list = listOf(await getQuotes({ lead_id: lead.id }))
        if (!list.length) {
          if (alive) setState('missing')
          return
        }
        const full = await getQuote(list[0].id)
        const [all, mine] = await Promise.all([getPromos(), getLeadPromos(lead.id)])
        if (!alive) return
        setQuote(full)
        setPromoList(listOf(all))
        setApplied(listOf(mine))
        setLocal(getQueued(full.id))
        setState('ready')
      } catch (e) {
        if (alive) {
          showToast(e.message || 'Gagal memuat Quotation', { warn: true })
          setState('missing')
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id])

  const lines = quote?.lines || []
  const unbound = lines.filter(isUnbound)
  const customerId = lead?.customer_id ?? visit?.customer?.id ?? quote?.customer_id ?? null
  const closingTaskId = task?.is_closing && task?.status === 'OPEN' ? task.id : null
  const appliedPromos = applied.map((a) => {
    const p = promoList.find((x) => promoRef(x) === a.promo_ref)
    return { ref: a.promo_ref, name: p?.name || a.promo_name || a.promo_ref, code: p?.promo_code || a.promo_ref, promo: p || null }
  })
  const bonuses = appliedPromos.map((a) => (a.promo ? bonusText(a.promo) : null)).filter(Boolean)

  const orderPayload = () => ({
    ...(customerId ? { customer_id: customerId } : {}),
    ...(quote.customer_po ? { customer_po: quote.customer_po } : {}),
    destination: 'HO',
  })
  const entry = () => ({ quoteId: quote.id, leadId: lead.id, payload: orderPayload(), closingTaskId })

  const bind = async (line, product) => {
    setBusy(true)
    try {
      await bindQuotePart(quote.id, line.id, product.id)
      showToast(`Part terikat: ${product.part_num}`)
      await reloadQuote(quote.id)
    } catch (e) {
      showToast(e?.message || 'Gagal mengikat Part', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const removePromo = async (ref) => {
    try {
      await removeLeadPromo(lead.id, ref)
      setApplied((list) => list.filter((a) => a.promo_ref !== ref))
    } catch (e) {
      showToast(e?.message || 'Gagal melepas promo', { error: true })
    }
  }

  const saveDraft = () => {
    setLocal(queueOrder(entry(), 'draft'))
    showToast('Draft disimpan di perangkat')
  }

  const queueForSync = () => {
    setLocal(queueOrder(entry(), 'pending'))
    showToast('Order disimpan di perangkat; akan dikirim otomatis saat online')
  }

  const confirm = async () => {
    if (unbound.length) return
    if (!online) {
      queueForSync()
      return
    }
    setBusy(true)
    try {
      const res = await confirmQuoteOrder(quote.id, orderPayload())
      removeQueued(quote.id)
      const number = res?.order?.order_number
      if (closingTaskId) {
        try {
          await concludeLeadTask(closingTaskId, WIN_PAYLOAD)
        } catch (e) {
          showToast(`Order dibuat, tetapi tugas belum ditutup: ${e?.message || 'galat'}`, { warn: true })
          nav('/orders')
          return
        }
      }
      showToast(number ? `Sales Order ${number} dibuat` : 'Sales Order dibuat')
      nav('/orders')
    } catch (err) {
      if (isNetworkError(err)) queueForSync()
      else showToast(err?.message || 'Gagal membuat Sales Order', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const sub = lead && quote
    ? `${lead.business_name} · from Quote ${opportunityCode(lead.id)} (${STATUS_LABEL[quote.status] || quote.status})`
    : lead?.business_name || ''

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ minWidth: 0 }}>
          <div>Register New Order</div>
          <div className="tt-sub">{sub}</div>
        </div>
      </div>

      {!visit ? (
        <div className="loading-center">Memuat…</div>
      ) : !lead ? (
        <div className="tp-empty">Tidak ada prospek untuk kunjungan ini.</div>
      ) : !canOrder(user) ? (
        <div className="tp-empty">Sales Dealmaker tidak dapat membuat order. Delegasikan prospek yang sudah Win ke Sales Order.</div>
      ) : state === 'loading' ? (
        <div className="loading-center">Memuat…</div>
      ) : state === 'missing' ? (
        <div className="tp-empty">Quotation untuk prospek ini belum ada.</div>
      ) : (
        <div className="tp-form">
          {!online ? (
            <div className="oc-banner" role="status">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M2 8.8a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5v.01M3 3l18 18" />
              </svg>
              <div>
                <b>No signal</b>
                <div>Order saved on this device. It will sync and get an Order Number automatically once your connection returns.</div>
              </div>
            </div>
          ) : null}

          <div className="oc-card">
            <div className="oc-title">Confirm Part — required before order</div>
            {unbound.length ? (
              unbound.map((l) => <PartBinder key={l.id} quoteId={quote.id} line={l} disabled={busy} onBind={bind} />)
            ) : (
              <div className="oc-ok">✓ All parts are registered Epicor Parts.</div>
            )}
            <div className="oc-hint">Confirm Sales Order stays disabled until a registered Part is bound here.</div>
          </div>

          <div className="oc-card">
            <div className="oc-title">Order Summary</div>
            <div className="qh-kv"><span>Customer PO Number</span><b>{quote.customer_po || '—'}</b></div>
            <div className="qh-kv"><span>TOP</span><b>{TOP_LABEL[quote.payment_term] || quote.payment_term || '—'}</b></div>
            {lines.map((l) => (
              <div className="oc-line" key={l.id}>
                <div>
                  <div className="oc-partname">
                    {l.description || l.product?.description}
                    {Number(l.gramasi_gr) > 0 ? ` ${Number(l.gramasi_gr)}gr` : ''}
                  </div>
                  <div className="oc-partsub">
                    {Number(l.qty_kg)} kg ({Number(l.qty_pcs).toLocaleString('en-US')} pcs) · @{fmtIdr(l.unit_price)}
                  </div>
                </div>
                <b>{fmtIdr(grossOf(l))}</b>
              </div>
            ))}
          </div>

          {appliedPromos.length ? (
            <div className="oc-card oc-promo">
              <div className="oc-title oc-titlerow">
                <span>Promo Applied</span>
                <span className="oc-pill">ACTIVE</span>
              </div>
              {appliedPromos.map((a) => {
                const kind = promoKind(a.promo || { name: a.name, promo_code: a.code })
                return (
                  <div className="oc-promotile" key={a.ref}>
                    <span className={`oc-promoic ${kind.cls}`} aria-hidden="true">{kind.emoji}</span>
                    <div className="oc-promotext">
                      <div className="oc-partname">{a.name}</div>
                      <div className="oc-partsub">Code {a.code} · applied at order level, before Save</div>
                    </div>
                    <button type="button" className="oc-x" aria-label={`Remove promo ${a.code}`} onClick={() => removePromo(a.ref)}>×</button>
                  </div>
                )
              })}
            </div>
          ) : null}

          <div className="oc-card">
            <div className="oc-title">Totals</div>
            <div className="oc-trow"><span>Total Gross</span><span>{fmtIdr(quote.subtotal)}</span></div>
            {discountRows(lines, quote.discount_total).map((r) => (
              <div className="oc-trow" key={r.key}><span>{r.label}</span><span>− {fmtIdr(r.amount)}</span></div>
            ))}
            {bonuses.length ? <div className="oc-trow bonus"><span>Promo Bonus</span><span>{bonuses.join(' + ')}</span></div> : null}
            <div className="oc-deal"><span>Total Deal</span><span>{fmtIdr(quote.total)}</span></div>
          </div>

          <button type="button" className="oc-confirm" disabled={busy || unbound.length > 0} onClick={confirm}>
            {unbound.length ? 'Confirm Sales Order 🔒 — bind part first' : busy ? 'Menyimpan…' : 'Confirm Sales Order'}
          </button>
          <button type="button" className="oc-draft" disabled={busy} onClick={saveDraft}>Save Draft</button>
          <p className="oc-note">
            No print-out here — the SSRS quotation PDF is downloaded from the Quotation screen, before Win.
          </p>
          <p className="oc-note">
            {local?.status === 'draft'
              ? `Draft saved locally at ${clock(local.savedAt)} · Confirm Sales Order to send it`
              : `Saved locally at ${clock(local?.savedAt ?? new Date().toISOString())} · will sync automatically once online`}
          </p>
        </div>
      )}
    </Screen>
  )
}
