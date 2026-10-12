// frontend/src/pages/QuoteLineDetail.jsx
// Dokumen hal. 34 (10c Quotation — Line Detail): satu Line (QuoteDtl): identitas produk, konversi UOM, harga, dan diskon Line.
// Juga dipakai sebagai layar peninjauan Line baru dari 10f (/quotes/:id/lines/new?sample=… atau ?product=…): Line baru
// baru tersimpan saat Save Line ditekan.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getApprovedSamples, getQuote, saveQuoteLines, searchQuoteProducts } from '../api'
import { Field } from '../components/Field'
import { NumInput } from '../components/NumInput'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { useHideBottomNav } from '../lib/useHideBottomNav'
import { fmtIdr } from '../lib/money'
import '../styles/taskpage.css'

const trimPct = (n) => String(Math.round(Number(n) * 100) / 100)
const isUnregistered = (l) => Boolean(l.product) && !l.product.epicor_part_num
const autoOf = (l) => {
  const g = Number(l.gramasi_gr)
  return g > 0 ? Math.round((Number(l.qty_kg) * 1000) / g) : 0
}

/** Identitas produk sebuah baris: product_id bila ada, dan tautan ke sample (untuk "Already on Line N") bila ada. */
const identityOf = (l) => ({
  ...(l.product_id ? { product_id: l.product_id } : {}),
  ...(l.product_sample_id ? { sample_id: l.product_sample_id } : {}),
})

/** Baris lain pada Quotation dikirim ulang apa adanya (termasuk Qty Converted yang pernah ditimpa). */
function keepLine(l) {
  const out = {
    ...identityOf(l),
    qty_kg: Number(l.qty_kg),
    packaging_id: l.packaging_id ?? null,
    gramasi_gr: Number(l.gramasi_gr),
    unit_price: Number(l.unit_price),
    disc1_percent: Number(l.disc1_percent || 0),
    disc2_percent: Number(l.disc2_percent || 0),
    disc3_percent: Number(l.disc3_percent || 0),
    disc4_percent: Number(l.disc4_percent || 0),
  }
  if (Number(l.qty_pcs) !== autoOf(l)) out.qty_pcs = Number(l.qty_pcs)
  return out
}

const BLANK = { qty_pcs: 0, strata_percent: 0, disc1_percent: 0, disc2_percent: 0, disc3_percent: 0, disc4_percent: 0 }

/** Line baru dari sample yang disetujui: identitas dan Packaging terisi dari sample; Qty dan harga diisi di layar ini. */
function draftFromSample(s) {
  const registered = s.registered_product_id ?? null // item Reguler: produk yang sudah teregister sebagai Part Epicor
  return {
    ...BLANK,
    id: 'new',
    product_id: registered,
    product_sample_id: s.id,
    description: s.description || s.part || '',
    qty_kg: null,
    gramasi_gr: s.package_size_gr ?? null,
    unit_price: s.registered_price === null || s.registered_price === undefined ? null : Number(s.registered_price),
    product: { part_num: s.part, revision: s.rev, product_group: s.product_group, epicor_part_num: registered ? 'REGISTERED' : null },
    source_followup: { number: s.followup_number, reason: 'Sample Cocok' },
  }
}

/** Line kosong (manual): produk dari katalog, tanpa badge sample yang disetujui. */
function draftFromProduct(p) {
  return {
    ...BLANK,
    id: 'new',
    product_id: p.id,
    product_sample_id: null,
    description: p.description || '',
    qty_kg: null,
    gramasi_gr: null,
    unit_price: p.price === null || p.price === undefined ? null : Number(p.price),
    product: { part_num: p.part_num, revision: p.revision, product_group: p.product_group, epicor_part_num: p.epicor_part_num },
    source_followup: null,
  }
}

/** Diskon berjenjang: strata dulu, lalu Disc 1-4; tiap kolom memotong sisa harga (sama dengan hitungan server). */
function breakdown(gross, strata, discs) {
  let remaining = gross
  const rows = []
  if (strata > 0) {
    const a = (remaining * strata) / 100
    remaining -= a
    rows.push({ key: 's', label: `Strata (${trimPct(strata)}%)`, amount: a })
  }
  discs.forEach((p, i) => {
    if (p > 0) {
      const a = (remaining * p) / 100
      remaining -= a
      rows.push({ key: `d${i}`, label: `Disc ${i + 1} (${trimPct(p)}%)`, amount: a })
    }
  })
  return { rows, total: Math.round(remaining * 100) / 100 }
}

function LineForm({ quote, line, index, isNew, closed, onSaved, showToast }) {
  const lines = quote.lines || []
  const gr0 = Number(line.gramasi_gr) || 0
  const kg0 = Number(line.qty_kg) || null
  const auto0 = autoOf(line)
  const strata = Number(line.strata_percent) || 0

  const [kg, setKg] = useState(kg0)
  const [pack, setPack] = useState(gr0 || null)
  const [unit, setUnit] = useState('GR')
  const [pcsOverride, setPcsOverride] = useState(Number(line.qty_pcs) !== auto0 ? Number(line.qty_pcs) : null)
  const [price, setPrice] = useState(line.unit_price === null || line.unit_price === undefined ? null : Number(line.unit_price))
  const [discs, setDiscs] = useState([1, 2, 3, 4].map((i) => Number(line[`disc${i}_percent`]) || 0))
  const [busy, setBusy] = useState(false)

  const grams = unit === 'KG' ? (pack || 0) * 1000 : pack || 0
  const autoPcs = kg > 0 && grams > 0 ? Math.round((kg * 1000) / grams) : 0
  const pcs = pcsOverride ?? autoPcs
  const gross = pcs * (price || 0)
  const { rows, total } = breakdown(gross, strata, discs)
  const custom = isUnregistered(line)
  const product = line.product || {}
  const qtyChanged = kg !== kg0

  const setDisc = (i, v) => setDiscs((d) => d.map((x, k) => (k === i ? v ?? 0 : x)))

  const persist = async (nextLines, message) => {
    setBusy(true)
    try {
      await saveQuoteLines(quote.id, nextLines)
      showToast(message)
      onSaved()
    } catch (err) {
      showToast(err?.message || 'Gagal menyimpan Line', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    if (!(kg > 0) || !(grams > 0) || price === null) {
      showToast('Isi Qty Order, Packaging, dan Price / PCS', { warn: true })
      return
    }
    const edited = {
      ...identityOf(line),
      qty_kg: kg,
      packaging_id: grams === gr0 ? line.packaging_id ?? null : null,
      gramasi_gr: grams,
      unit_price: price,
      disc1_percent: discs[0],
      disc2_percent: discs[1],
      disc3_percent: discs[2],
      disc4_percent: discs[3],
      ...(pcsOverride !== null && pcsOverride !== autoPcs ? { qty_pcs: pcsOverride } : {}),
    }
    const next = isNew ? [...lines.map(keepLine), edited] : lines.map((l, i) => (i === index ? edited : keepLine(l)))
    persist(next, isNew ? 'Line ditambahkan' : 'Line tersimpan')
  }

  const remove = () => {
    if (isNew) {
      onSaved() // Line baru belum tersimpan: cukup dibuang
      return
    }
    // eslint-disable-next-line no-alert
    if (!window.confirm('Remove this line from the Quotation?')) return
    persist(
      lines.filter((_, i) => i !== index).map(keepLine),
      'Line dihapus',
    )
  }

  return (
    <div className="tp-form">
      <div className="ld-card">
        {line.source_followup ? (
          <span className="ld-chip blue">
            Pulled from Follow Up Sample {line.source_followup.number} · Reason: {line.source_followup.reason}
          </span>
        ) : null}
        {custom ? <span className="ld-chip gold">Custom B2B — not yet a registered Part</span> : null}

        <div className="qh-kvbox" style={{ marginTop: 8 }}>
          <div className="qh-kv">
            <span>Product Group</span>
            <b className="ld-blue">
              {product.product_group || '—'} <span aria-hidden="true">⌄</span>
            </b>
          </div>
          <div className="qh-kv"><span>{custom ? 'Part (free text)' : 'Part'}</span><b>{product.part_num || '—'}</b></div>
          <div className="qh-kv"><span>{custom ? 'Rev (free text)' : 'Rev'}</span><b>{product.revision || '—'}</b></div>
          <div className="qh-kv"><span>Description</span><b>{line.description || product.description || '—'}</b></div>
        </div>

        <div className="ld-grid2">
          <Field label="Qty Order (KG) *" style={{ margin: 0 }}>
            <NumInput value={kg} onChange={setKg} readOnly={closed} />
          </Field>
          <div className="field" style={{ margin: 0 }}>
            <label>Packaging *</label>
            <div className="ld-pack">
              <NumInput aria-label="Packaging" value={pack} onChange={setPack} readOnly={closed} />
              <select aria-label="Packaging unit" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={closed}>
                <option value="GR">GR</option>
                <option value="KG">KG</option>
              </select>
            </div>
          </div>
        </div>

        <div className="ld-grid2" style={{ marginTop: 10 }}>
          <Field label="Qty Converted (PCS)" style={{ margin: 0 }}>
            <NumInput
              className={pcsOverride === null ? 'ld-auto' : ''}
              value={pcs}
              onChange={(v) => setPcsOverride(v === null || v === autoPcs ? null : v)}
              readOnly={closed}
            />
          </Field>
          <Field label="Price / PCS (Rp) *" style={{ margin: 0 }}>
            <NumInput value={price} onChange={setPrice} readOnly={closed} />
          </Field>
        </div>

        <p className="ld-note">
          Qty Order (KG) ÷ Packaging (GR → converted to KG) = Qty Converted (PCS) auto-calculates — same UOM Class conversion
          Epicor runs — but can be overridden here if the actual pack count differs. A &quot;Reguler&quot; catalog item is
          already a registered Part; this custom B2B formula only gets searched &amp; bound to a real Part later, at Sales Order
          creation.
        </p>

        <div className="ld-gross">
          <span>Gross Value</span>
          <span>{fmtIdr(gross)}</span>
        </div>
      </div>

      <div className="ld-card">
        <div className="qh-title">Line Discount</div>
        <div className="ld-disc">
          {discs.map((d, i) => (
            <Field key={i} label={`Disc ${i + 1} (%)`} style={{ margin: 0 }}>
              <NumInput value={d} onChange={(v) => setDisc(i, v)} readOnly={closed} />
            </Field>
          ))}
        </div>
        <p className="ld-note" style={{ marginBottom: 0 }}>Discount is applied per Line in Epicor, not at the Quote Header.</p>
      </div>

      <div className="qh-totals">
        <div className="qh-trow"><span>Line Gross</span><span>{fmtIdr(gross)}</span></div>
        {rows.map((r) => (
          <div className="qh-trow" key={r.key}>
            <span>{r.label}</span>
            <span>− {fmtIdr(r.amount)}</span>
          </div>
        ))}
        <div className="qh-trow deal"><span>Line Total</span><span>{fmtIdr(total)}</span></div>
        {strata > 0 && qtyChanged ? (
          <div className="qh-tfoot">Diskon strata mengikuti Qty dan dihitung ulang saat disimpan.</div>
        ) : null}
      </div>

      <div className="ld-foot">
        <button type="button" className="ld-save" onClick={save} disabled={busy || closed}>
          {busy ? 'Menyimpan…' : 'Save Line — Back to Lines List'}
        </button>
        <button type="button" className="ld-remove" onClick={remove} disabled={busy || (closed && !isNew)}>
          {isNew ? 'Discard Line' : 'Remove Line'}
        </button>
      </div>
    </div>
  )
}

export default function QuoteLineDetail() {
  useHideBottomNav()
  const { id, lineId } = useParams()
  const isNew = lineId === undefined
  const [params] = useSearchParams()
  const sampleParam = params.get('sample')
  const productParam = params.get('product')
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [quote, setQuote] = useState(null)
  const [draft, setDraft] = useState(null)
  const [problem, setProblem] = useState(null)
  const [loadState, setLoadState] = useState('loading') // loading | ready | missing

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const q = await getQuote(id)
        let d = null
        let why = null
        if (q && isNew) {
          if (sampleParam) {
            const list = await getApprovedSamples(id)
            const s = (Array.isArray(list) ? list : list?.data || []).find((x) => String(x.id) === String(sampleParam))
            if (!s) why = 'Sample yang disetujui tidak ditemukan.'
            else if (s.used_on_line) why = `Sample ini sudah dipakai di Line ${s.used_on_line}.`
            else d = draftFromSample(s)
          } else if (productParam) {
            const res = await searchQuoteProducts(id, { id: productParam })
            const p = (res?.products || [])[0]
            if (!p) why = 'Produk tidak ditemukan.'
            else d = draftFromProduct(p)
          } else {
            why = 'Pilih sample atau produk dari layar Add Line.'
          }
        }
        if (alive) {
          setQuote(q)
          setDraft(d)
          setProblem(why)
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
  }, [id, lineId, sampleParam, productParam])

  const lines = quote?.lines || []
  const existingIndex = isNew ? -1 : lines.findIndex((l) => String(l.id) === String(lineId))
  const line = isNew ? draft : existingIndex >= 0 ? lines[existingIndex] : null
  const index = isNew ? lines.length : existingIndex
  const closed = Boolean(quote) && ['WON', 'LOST'].includes(quote.status)

  const backToList = () => nav(`/quotes/${id}/lines`, { state: loc.state, replace: true })

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ minWidth: 0 }}>
          <div>{line ? `Line ${index + 1}` : 'Line'}</div>
          <div className="tt-sub">{line ? line.description || line.product?.description || '' : ''}</div>
        </div>
      </div>

      {loadState === 'loading' ? (
        <div className="loading-center">Memuat…</div>
      ) : !line ? (
        <div className="tp-empty">{problem || 'Line tidak ditemukan.'}</div>
      ) : (
        <>
          {closed ? (
            <div className="tp-empty" style={{ marginTop: 0 }}>
              Quotation sudah ditutup ({quote.status}); Line tidak bisa diubah.
            </div>
          ) : null}
          <LineForm
            key={isNew ? `new-${sampleParam || productParam}` : line.id}
            quote={quote}
            line={line}
            index={index}
            isNew={isNew}
            closed={closed}
            onSaved={backToList}
            showToast={showToast}
          />
        </>
      )}
    </Screen>
  )
}
