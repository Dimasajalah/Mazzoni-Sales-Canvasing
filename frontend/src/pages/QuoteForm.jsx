// frontend/src/pages/QuoteForm.jsx
// Buat / ubah penawaran (Quotation). Baris dihitung dari Kg: pcs = Kg x 1000 / gramasi.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  attachQuoteCompetitor,
  convertQuoteToOrder,
  createQuote,
  detachQuoteCompetitor,
  getCompetitors,
  getCustomers,
  getDiscountStrata,
  getProductPackagings,
  getProducts,
  getQuote,
  getSamples,
  markQuoteQuoted,
  replaceQuoteLines,
  updateQuote,
  updateLeadTask,
} from '../api'
import { Field } from '../components/Field'
import { TaskFieldsGrid } from '../components/TaskFieldsGrid'
import { Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { fmtRp, listOf, listProducts } from '../lib/format'
import { lineCalc } from '../lib/packaging'
import { canOrder } from '../lib/roles'
import { QUOTE_STATUS } from './Quotes'

const EMPTY_HEADER = {
  customer_id: '',
  product_sample_id: '',
  customer_po: '',
  due_date: '',
  expected_close_date: '',
  follow_up_date: '',
  expires_at: '',
  terms: '',
  payment_term: '',
}

// Poin 14: harus sama persis dengan QuoteService::PAYMENT_TERMS di backend
const PAYMENT_TERMS = ['15D', '30D', '45D']

const TERM_HINTS = ['Pembayaran: ', 'Masa berlaku: ', 'Pengiriman: ']

const toNull = (v) => (v === '' || v === undefined ? null : v)
const EMPTY_DRAFT = { productId: '', packagingId: '', gramasi: '', qtyKg: '', disc1: '', disc2: '', disc3: '', disc4: '' }
const EMPTY_COMP = { competitorId: '', comment: '', isNew: false, name: '', address: '', phone: '', email: '' }

function fromServerLine(l) {
  return {
    product_id: l.product_id,
    description: l.description || l.product?.description || '',
    packaging_id: l.packaging_id || null,
    packaging_name: l.packaging?.name || null,
    gramasi: Number(l.gramasi_gr),
    qty_kg: Number(l.qty_kg),
    disc1_percent: Number(l.disc1_percent) || 0,
    disc2_percent: Number(l.disc2_percent) || 0,
    disc3_percent: Number(l.disc3_percent) || 0,
    disc4_percent: Number(l.disc4_percent) || 0,
    unit_price: Number(l.unit_price),
    registered: Boolean(l.product?.epicor_part_num),
    product_group: l.product?.product_group || null,
    // Poin 22: revisi saat ini (reformula menaikkan angka ini, kode part tetap sama).
    revision: l.product?.revision || 1,
  }
}

export default function QuoteForm() {
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast, openSheet, closeSheet } = useUi()
  const { user } = useAuth()
  const ordering = canOrder(user)

  const [quote, setQuote] = useState(null)
  const [header, setHeader] = useState(EMPTY_HEADER)
  const [lines, setLines] = useState([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(Boolean(id))

  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [tiers, setTiers] = useState([])
  const [competitors, setCompetitors] = useState([])
  const [samples, setSamples] = useState([])
  const [packagings, setPackagings] = useState({}) // { [productId]: [...] }

  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [comp, setComp] = useState(EMPTY_COMP)

  const leadId = quote?.lead_id ?? loc.state?.leadId ?? null
  const closed = quote ? ['WON', 'LOST'].includes(quote.status) : false
  // Penerima delegasi (bukan pemilik) hanya membaca dan menjadikannya order
  const notOwner = Boolean(quote && user?.role === 'sales' && quote.salesperson_id && quote.salesperson_id !== user.id)
  const readOnly = closed || notOwner
  const status = QUOTE_STATUS[quote?.status] || QUOTE_STATUS.DRAFT
  // Poin 9: ringkasan tugas dari LeadTaskPanel (lewat state navigasi), supaya field tugas tampil seragam
  const task = loc.state?.task || null
  const [comment, setComment] = useState(task?.remark || '')
  const [commentBase, setCommentBase] = useState(task?.remark || '') // nilai Comment yang sudah tersimpan di server

  const applyServer = useCallback((q) => {
    setQuote(q)
    setHeader({
      customer_id: q.customer_id ?? '',
      product_sample_id: q.product_sample_id ?? '',
      customer_po: q.customer_po ?? '',
      due_date: q.due_date ?? '',
      expected_close_date: q.expected_close_date ?? '',
      follow_up_date: q.follow_up_date ?? '',
      expires_at: q.expires_at ?? '',
      terms: q.terms ?? '',
      payment_term: q.payment_term ?? '',
    })
    setLines((q.lines || []).map(fromServerLine))
    setDirty(false)
  }, [])

  // Data pendukung
  useEffect(() => {
    Promise.all([getCustomers({}), getDiscountStrata(), getCompetitors()])
      .then(([c, t, k]) => {
        setCustomers(listOf(c))
        setTiers(listOf(t))
        setCompetitors(listOf(k))
      })
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  // Poin 21: daftar produk difilter ke Product Group dari sample yang sudah diajukan untuk lead
  // ini (kalau ada) — supaya produk yang ditawarkan sesuai kategori yang sudah dicoba customer.
  // Dimuat ulang begitu data quote (berikut sample-nya) selesai dimuat; sebelum itu, atau untuk
  // quote tanpa sample sama sekali, pencarian produk tetap bebas seperti biasa (tidak difilter).
  const sampleProductGroup = quote?.sample_product_group || null
  useEffect(() => {
    getProducts(sampleProductGroup ? { product_group: sampleProductGroup } : {})
      .then((p) => setProducts(listProducts(p)))
      .catch((e) => showToast(e.message, { warn: true }))
  }, [sampleProductGroup, showToast])

  // Penawaran yang sedang dibuka
  useEffect(() => {
    if (!id) return
    let alive = true
    getQuote(id)
      .then((q) => alive && applyServer(q))
      .catch((e) => {
        showToast(e.message || 'Quotation tidak ditemukan', { error: true })
        nav('/quotes', { replace: true })
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [id, applyServer, showToast, nav])

  // Sample milik prospek (opsional, sebagai asal penawaran)
  useEffect(() => {
    if (!leadId) return
    getSamples({ lead_id: leadId })
      .then((s) => setSamples(listOf(s)))
      .catch(() => setSamples([]))
  }, [leadId])

  const loadPackagings = useCallback(
    async (productId) => {
      if (!productId || packagings[productId]) return
      try {
        const rows = listOf(await getProductPackagings({ product_id: productId }))
        setPackagings((m) => ({ ...m, [productId]: rows }))
      } catch {
        setPackagings((m) => ({ ...m, [productId]: [] }))
      }
    },
    [packagings],
  )

  const setH = (k) => (e) => {
    setHeader((h) => ({ ...h, [k]: e.target.value }))
    setDirty(true)
  }

  const productOf = (pid) => products.find((p) => String(p.id) === String(pid))
  const draftProduct = productOf(draft.productId)
  const draftPackagings = packagings[draft.productId] || []
  const draftPackaging = draftPackagings.find((k) => String(k.id) === String(draft.packagingId))
  const draftGramasi = draftPackaging ? Number(draftPackaging.gramasi_gr) : Number(draft.gramasi)

  const draftCalc = useMemo(
    () =>
      draftProduct && Number(draft.qtyKg) > 0 && draftGramasi > 0
        ? lineCalc({
          tiers,
          productId: draftProduct.id,
          qtyKg: draft.qtyKg,
          gramasi: draftGramasi,
          unitPrice: draftProduct.price,
          discPercents: [draft.disc1, draft.disc2, draft.disc3, draft.disc4],
        })
        : null,
    [tiers, draftProduct, draft.qtyKg, draft.disc1, draft.disc2, draft.disc3, draft.disc4, draftGramasi],
  )

  const pickProduct = (value) => {
    setDraft({ ...EMPTY_DRAFT, productId: value })
    loadPackagings(value)
  }

  const moqShortfall =
    draftProduct?.moq_kg && Number(draft.qtyKg) > 0 && Number(draft.qtyKg) < Number(draftProduct.moq_kg)
      ? Number(draftProduct.moq_kg)
      : null

  const addLine = () => {
    if (!draftProduct) return showToast('Pilih produk', { warn: true })
    if (!(Number(draft.qtyKg) > 0)) return showToast('Isi jumlah Kg', { warn: true })
    if (!(draftGramasi > 0)) return showToast('Pilih kemasan atau isi gramasi', { warn: true })
    if (moqShortfall) return showToast(`Jumlah order minimal ${moqShortfall} Kg untuk produk ini (MOQ)`, { warn: true })

    setLines((prev) => [
      ...prev,
      {
        product_id: draftProduct.id,
        description: draftProduct.description || draftProduct.name,
        packaging_id: draftPackaging?.id ?? null,
        packaging_name: draftPackaging?.name ?? null,
        gramasi: draftGramasi,
        qty_kg: Number(draft.qtyKg),
        disc1_percent: Number(draft.disc1) || 0,
        disc2_percent: Number(draft.disc2) || 0,
        disc3_percent: Number(draft.disc3) || 0,
        disc4_percent: Number(draft.disc4) || 0,
        unit_price: Number(draftProduct.price) || 0,
        registered: Boolean(draftProduct.epicor_part_num),
        product_group: draftProduct.product_group || null,
        revision: draftProduct.revision || 1,
      },
    ])
    setDraft({ ...EMPTY_DRAFT, productId: draft.productId })
    setDirty(true)
  }

  const removeLine = (i) => {
    setLines((prev) => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  const calcs = useMemo(
    () =>
      lines.map((l) =>
        lineCalc({
          tiers,
          productId: l.product_id,
          qtyKg: l.qty_kg,
          gramasi: l.gramasi,
          unitPrice: l.unit_price,
          discPercents: [l.disc1_percent, l.disc2_percent, l.disc3_percent, l.disc4_percent],
        }),
      ),
    [lines, tiers],
  )
  const gross = calcs.reduce((s, c) => s + c.gross, 0)
  const total = calcs.reduce((s, c) => s + c.total, 0)

  const headerPayload = () => ({
    customer_id: toNull(header.customer_id),
    product_sample_id: toNull(header.product_sample_id),
    customer_po: toNull(header.customer_po),
    due_date: toNull(header.due_date),
    expected_close_date: toNull(header.expected_close_date),
    follow_up_date: toNull(header.follow_up_date),
    expires_at: toNull(header.expires_at),
    terms: toNull(header.terms),
    payment_term: toNull(header.payment_term),
  })

  const linesPayload = () =>
    lines.map((l) => ({
      product_id: l.product_id,
      packaging_id: l.packaging_id,
      ...(l.packaging_id ? {} : { gramasi_gr: l.gramasi }),
      qty_kg: l.qty_kg,
      disc1_percent: l.disc1_percent,
      disc2_percent: l.disc2_percent,
      disc3_percent: l.disc3_percent,
      disc4_percent: l.disc4_percent,
      unit_price: l.unit_price,
    }))

  // Mengembalikan true bila GAGAL, supaya kegagalannya tidak membatalkan quotation yang sudah tersimpan.
  const saveComment = async () => {
    const leadTaskId = loc.state?.leadTaskId
    const next = comment.trim()
    if (!leadTaskId || next === commentBase) return false
    try {
      await updateLeadTask(leadTaskId, { remark: next || null })
      setCommentBase(next)
      return false
    } catch {
      return true
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      if (!quote) {
        const created = await createQuote({
          ...headerPayload(),
          lead_id: leadId,
          lines: linesPayload(),
        })
        showToast(`Quotation ${created.quote_number} dibuat`)
        nav(`/quotes/${created.id}`, { replace: true })
        return
      }
      await updateQuote(quote.id, headerPayload())
      const saved = await replaceQuoteLines(quote.id, linesPayload())
      applyServer(saved)
      const commentFailed = await saveComment()
      showToast(
        commentFailed ? 'Quotation disimpan, tetapi Comment gagal disimpan' : 'Quotation disimpan',
        commentFailed ? { warn: true } : {},
      )
    } catch (err) {
      showToast(err?.message || 'Gagal menyimpan quotation', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const markQuoted = async () => {
    setBusy(true)
    try {
      applyServer(await markQuoteQuoted(quote.id))
      showToast('Quotation ditandai Quoted')
    } catch (err) {
      showToast(err?.message || 'Gagal menandai Quoted', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const addCompetitor = async () => {
    const payload = comp.isNew
      ? { name: comp.name.trim(), address: toNull(comp.address), phone: toNull(comp.phone), email: toNull(comp.email), comment: toNull(comp.comment) }
      : { competitor_id: Number(comp.competitorId), comment: toNull(comp.comment) }

    if (comp.isNew ? !payload.name : !comp.competitorId) {
      return showToast(comp.isNew ? 'Isi nama kompetitor' : 'Pilih kompetitor', { warn: true })
    }

    try {
      const saved = await attachQuoteCompetitor(quote.id, payload)
      setQuote(saved)
      setComp(EMPTY_COMP)
      if (comp.isNew) setCompetitors(listOf(await getCompetitors()))
      showToast('Kompetitor dicatat')
    } catch (err) {
      showToast(err?.message || 'Gagal mencatat kompetitor', { error: true })
    }
  }

  const removeCompetitor = async (competitorId) => {
    try {
      setQuote(await detachQuoteCompetitor(quote.id, competitorId))
    } catch (err) {
      showToast(err?.message || 'Gagal melepas kompetitor', { error: true })
    }
  }

  const openConvert = () =>
    openSheet(
      'Jadikan Order',
      <ConvertSheet
        quote={quote}
        customers={customers}
        defaultCustomerId={header.customer_id}
        defaultPo={header.customer_po}
        showToast={showToast}
        onDone={() => {
          closeSheet()
          nav('/orders')
        }}
      />,
    )

  if (loading) {
    return (
      <Screen>
        <TopBar title="Quotation" backTo="/quotes" />
        <div className="loading-center">Memuat…</div>
      </Screen>
    )
  }

  const locked = readOnly || busy
  const canQuote = Boolean(quote) && !dirty && !readOnly && lines.length > 0
  // Order bisa dibuat dari penawaran yang belum Lost dan belum pernah dijadikan order (termasuk yang sudah WON lewat Win prospek)
  const convertible = ordering && Boolean(quote) && quote.status !== 'LOST' && !quote.order
  const canConvert = !dirty && lines.length > 0

  return (
    <Screen>
      <TopBar title={quote ? quote.quote_number : 'Quotation Baru'} backTo="/quotes" />

      {quote && (
        <div className="badges" style={{ marginTop: 0, marginBottom: 12 }}>
          <span className="badge" style={{ background: `${status.color}22`, color: status.color }}>
            {status.label}
          </span>
          {quote.lead?.business_name && (
            <span className="badge" style={{ background: 'rgba(110,126,158,.14)', color: 'var(--mut)' }}>
              Prospek: {quote.lead.business_name}
            </span>
          )}
        </div>
      )}
      {!quote && loc.state?.customerName && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Untuk prospek: <b>{loc.state.customerName}</b>
        </div>
      )}
      {closed && !notOwner && (
        <div className="card muted" style={{ padding: 12, marginBottom: 12, fontSize: 12 }}>
          Quotation sudah ditutup ({status.label}) dan tidak bisa diubah.
        </div>
      )}
      {notOwner && (
        <div className="card muted" style={{ padding: 12, marginBottom: 12, fontSize: 12 }}>
          Anda melihat Quotation ini sebagai penerima delegasi (hanya baca).
        </div>
      )}
      {quote?.order && (
        <div className="card accent-g" style={{ padding: 12, marginBottom: 12, fontSize: 12.5 }}>
          Order <b>{quote.order.order_number}</b> sudah dibuat dari Quotation ini.
        </div>
      )}

      {task && (
        <>
          <div className="section-h">Tugas</div>
          <TaskFieldsGrid
            task={task}
            comment={comment}
            onCommentChange={readOnly ? undefined : setComment}
            style={{ marginBottom: 12 }}
          />
        </>
      )}

      {/* ---------- Header ---------- */}
      <div className="section-h">Header</div>
      <Field label="Customer (opsional untuk prospek)">
        <select value={header.customer_id} onChange={setH('customer_id')} disabled={locked}>
          <option value="">— Belum ada customer —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="No. PO Customer">
        <input value={header.customer_po} onChange={setH('customer_po')} disabled={locked} />
      </Field>
      <Field label="Termin Pembayaran">
        <select value={header.payment_term} onChange={setH('payment_term')} disabled={locked}>
          <option value="">— Tidak ditentukan —</option>
          {PAYMENT_TERMS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      {samples.length > 0 && (
        <Field label="Sample terkait (opsional)">
          <select value={header.product_sample_id} onChange={setH('product_sample_id')} disabled={locked}>
            <option value="">— Tanpa sample —</option>
            {samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.flavor_variant} · versi {s.version} · {s.qty} pcs
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Jatuh tempo (Due)" className="half">
        <input type="date" value={header.due_date} onChange={setH('due_date')} disabled={locked} />
      </Field>
      <Field label="Perkiraan closing" className="half">
        <input type="date" value={header.expected_close_date} onChange={setH('expected_close_date')} disabled={locked} />
      </Field>
      <Field label="Follow-up" className="half">
        <input type="date" value={header.follow_up_date} onChange={setH('follow_up_date')} disabled={locked} />
      </Field>
      <Field label="Berlaku sampai" className="half">
        <input type="date" value={header.expires_at} onChange={setH('expires_at')} disabled={locked} />
      </Field>

      {/* ---------- Baris ---------- */}
      <div className="section-h">Baris Quotation</div>
      {!readOnly && (
        <div className="card" style={{ padding: 12, marginBottom: 12, border: '1px dashed var(--orange)' }}>
          <Field
            label="Produk"
            hint={
              sampleProductGroup ? (
                <div className="muted tp-hint">Difilter ke product group sample: {sampleProductGroup}</div>
              ) : null
            }
          >
            <select value={draft.productId} onChange={(e) => pickProduct(e.target.value)}>
              <option value="">— Pilih produk —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.part_num || p.sku) + ' — ' + (p.description || p.name)}
                </option>
              ))}
            </select>
          </Field>
          {draftProduct && (
            <>
              <Field label="Kemasan (gramasi per pcs)">
                <select
                  value={draft.packagingId}
                  onChange={(e) => setDraft((d) => ({ ...d, packagingId: e.target.value, gramasi: '' }))}
                >
                  <option value="">— Isi gramasi manual —</option>
                  {draftPackagings.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({Number(k.gramasi_gr)} gr)
                    </option>
                  ))}
                </select>
              </Field>
              {!draftPackaging && (
                <Field label="Gramasi (gr per pcs)">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={draft.gramasi}
                    onChange={(e) => setDraft((d) => ({ ...d, gramasi: e.target.value }))}
                  />
                </Field>
              )}
              <Field label="Jumlah order (Kg)">
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={draft.qtyKg}
                  onChange={(e) => setDraft((d) => ({ ...d, qtyKg: e.target.value }))}
                />
              </Field>
              {/* Poin 15: 4 kolom diskon bertingkat — tiap kolom memotong sisa harga, bukan dijumlah */}
              <div className="row">
                {['disc1', 'disc2', 'disc3', 'disc4'].map((key, idx) => (
                  <Field key={key} label={`Disc ${idx + 1} (%)`} style={{ flex: 1 }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      inputMode="decimal"
                      value={draft[key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    />
                  </Field>
                ))}
              </div>
              {draftCalc && (
                <div className="muted" style={{ fontSize: 12, margin: '0 0 10px' }} data-testid="draft-preview">
                  {draft.qtyKg} Kg ÷ {draftGramasi} gr ={' '}
                  <b style={{ color: 'var(--text)' }}>{draftCalc.pcs.toLocaleString('id-ID')} pcs</b> · strata{' '}
                  {draftCalc.strata}% · total <b style={{ color: 'var(--orange)' }}>{fmtRp(draftCalc.total)}</b>
                </div>
              )}
              {moqShortfall && (
                <div style={{ fontSize: 12, margin: '0 0 10px', color: 'var(--pink)' }}>
                  ⚠ Jumlah order minimal <b>{moqShortfall} Kg</b> untuk produk ini (MOQ).
                </div>
              )}
              <button type="button" className="btn ghost sm" style={{ width: '100%' }} disabled={Boolean(moqShortfall)} onClick={addLine}>
                + Tambah baris
              </button>
            </>
          )}
        </div>
      )}

      {lines.length === 0 ? (
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Belum ada baris.
        </div>
      ) : (
        lines.map((l, i) => (
          <div key={`${l.product_id}-${i}`} className="card li" style={{ padding: 10, marginBottom: 8 }}>
            <div className="main">
              <div className="n" style={{ fontSize: 12.5 }}>
                {l.description}
                {/* Poin 22: cuma ditampilkan kalau sudah pernah direformula (revisi > 1) — produk
                    normal yang belum pernah direvisi tidak perlu ditandai apa-apa. */}
                {l.revision > 1 && (
                  <span className="badge" style={{ background: 'rgba(42,111,214,.14)', color: 'var(--blue)', fontSize: 10, marginLeft: 6 }}>
                    Rev {l.revision}
                  </span>
                )}
              </div>
              <div className="d">
                {l.qty_kg} Kg → {calcs[i].pcs.toLocaleString('id-ID')} pcs ({l.gramasi} gr
                {l.packaging_name ? ` · ${l.packaging_name}` : ''}) × {fmtRp(l.unit_price)}
              </div>
              <div className="d">
                Diskon {calcs[i].effective}% bertingkat (strata {calcs[i].strata}%, Disc {l.disc1_percent}/{l.disc2_percent}/{l.disc3_percent}/{l.disc4_percent}%)
              </div>
              {l.registered === false && (
                <div style={{ marginTop: 5 }}>
                  <span className="badge" style={{ background: 'rgba(220,48,85,.14)', color: 'var(--pink)', fontSize: 10.5 }}>
                    ⚠ Belum teregister{l.product_group ? ` · ${l.product_group}` : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="r">
              {fmtRp(calcs[i].total)}
              {!readOnly && (
                <div style={{ marginTop: 5 }}>
                  <span onClick={() => removeLine(i)} role="button" tabIndex={0} style={{ color: 'var(--pink)', fontSize: 11, cursor: 'pointer' }}>
                    hapus
                  </span>
                </div>
              )}
            </div>
          </div>
        ))
      )}

      <div className="card" style={{ marginBottom: 12, background: 'var(--card2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
          <span className="muted">Nilai kotor</span>
          <span>{fmtRp(gross)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 4 }}>
          <span className="muted">Diskon</span>
          <span style={{ color: 'var(--pink)' }}>− {fmtRp(gross - total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginTop: 8 }}>
          <span>Total</span>
          <span style={{ color: 'var(--orange)' }}>{fmtRp(total)}</span>
        </div>
      </div>

      {/* ---------- Terms ---------- */}
      <div className="section-h">Terms</div>
      {!readOnly && (
        <div className="chips">
          {TERM_HINTS.map((h) => (
            <button
              key={h}
              type="button"
              className="chip"
              onClick={() => {
                setHeader((s) => ({ ...s, terms: s.terms ? `${s.terms}\n${h}` : h }))
                setDirty(true)
              }}
            >
              + {h.replace(': ', '')}
            </button>
          ))}
        </div>
      )}
      <Field label="Syarat & ketentuan">
        <textarea rows={4} value={header.terms} onChange={setH('terms')} disabled={locked} />
      </Field>

      {/* ---------- Kompetitor ---------- */}
      <div className="section-h">Kompetitor</div>
      {!quote ? (
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Simpan Quotation terlebih dahulu untuk mencatat kompetitor.
        </div>
      ) : (
        <>
          {(quote.competitors || []).map((qc) => (
            <div key={qc.id} className="card li" style={{ padding: 10, marginBottom: 8 }}>
              <div className="main">
                <div className="n" style={{ fontSize: 12.5 }}>
                  {qc.competitor?.name}
                </div>
                <div className="d">{qc.comment || '—'}</div>
              </div>
              {!readOnly && (
                <div className="r">
                  <span onClick={() => removeCompetitor(qc.competitor_id)} role="button" tabIndex={0} style={{ color: 'var(--pink)', fontSize: 11, cursor: 'pointer' }}>
                    lepas
                  </span>
                </div>
              )}
            </div>
          ))}
          {!readOnly && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              {comp.isNew ? (
                <>
                  <Field label="Nama kompetitor">
                    <input value={comp.name} onChange={(e) => setComp((c) => ({ ...c, name: e.target.value }))} />
                  </Field>
                  <Field label="Alamat">
                    <input value={comp.address} onChange={(e) => setComp((c) => ({ ...c, address: e.target.value }))} />
                  </Field>
                  <Field label="Telepon" className="half">
                    <input value={comp.phone} onChange={(e) => setComp((c) => ({ ...c, phone: e.target.value }))} />
                  </Field>
                  <Field label="Email" className="half">
                    <input value={comp.email} onChange={(e) => setComp((c) => ({ ...c, email: e.target.value }))} />
                  </Field>
                </>
              ) : (
                <Field label="Pilih kompetitor">
                  <select value={comp.competitorId} onChange={(e) => setComp((c) => ({ ...c, competitorId: e.target.value }))}>
                    <option value="">— Pilih —</option>
                    {competitors.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Catatan (tanpa harga)">
                <input value={comp.comment} onChange={(e) => setComp((c) => ({ ...c, comment: e.target.value }))} />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn ghost sm" style={{ flex: 1 }} onClick={addCompetitor}>
                  + Catat kompetitor
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  style={{ flex: 1 }}
                  onClick={() => setComp((c) => ({ ...EMPTY_COMP, isNew: !c.isNew }))}
                >
                  {comp.isNew ? 'Pilih dari daftar' : 'Kompetitor baru'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- Aksi ---------- */}
      {!readOnly && (
        <button type="button" className="btn" style={{ marginBottom: 8 }} disabled={busy} onClick={save}>
          {busy ? 'Menyimpan…' : quote ? 'Simpan Perubahan' : 'Simpan Quotation'}
        </button>
      )}
      {quote && !readOnly && dirty && (
        <div className="muted tp-hint" style={{ textAlign: 'center' }}>
          Ada perubahan yang belum disimpan.
        </div>
      )}
      {quote && (!readOnly || convertible) && (
        <div className="tp-actions">
          {!readOnly && (
            <button type="button" className="btn ghost" disabled={!canQuote || busy || quote.status === 'QUOTED'} onClick={markQuoted}>
              {quote.status === 'QUOTED' ? '✓ Sudah Quoted' : 'Tandai Quoted'}
            </button>
          )}
          {convertible && (
            <button type="button" className="btn ghost" disabled={!canConvert || busy} onClick={openConvert}>
              🛒 Jadikan Order
            </button>
          )}
        </div>
      )}
    </Screen>
  )
}

// =====================================================================================

function ConvertSheet({ quote, customers, defaultCustomerId, defaultPo, onDone, showToast }) {
  const [customerId, setCustomerId] = useState(defaultCustomerId ? String(defaultCustomerId) : '')
  const [po, setPo] = useState(defaultPo || '')
  const [destination, setDestination] = useState('HO')
  const [distributorId, setDistributorId] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!customerId) return showToast('Pilih customer untuk order ini', { warn: true })
    if (destination === 'DISTRIBUTOR' && !distributorId) return showToast('Pilih distributor', { warn: true })

    setBusy(true)
    try {
      const res = await convertQuoteToOrder(quote.id, {
        customer_id: Number(customerId),
        customer_po: po || null,
        destination,
        distributor_customer_id: destination === 'DISTRIBUTOR' ? Number(distributorId) : null,
      })
      showToast(`Order ${res?.order?.order_number || ''} dibuat dari Quotation`.trim())
      onDone(res)
    } catch (err) {
      showToast(err?.message || 'Gagal membuat order', { error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Quotation {quote.quote_number} · total {fmtRp(quote.total)}. Qty Kg, pcs, dan gramasi ikut terbawa ke order.
      </div>
      <Field label="Customer">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">— Pilih customer —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="No. PO Customer">
        <input value={po} onChange={(e) => setPo(e.target.value)} />
      </Field>
      <Field label="Tujuan order">
        <select value={destination} onChange={(e) => setDestination(e.target.value)}>
          <option value="HO">HO</option>
          <option value="DISTRIBUTOR">Distributor</option>
        </select>
      </Field>
      {destination === 'DISTRIBUTOR' && (
        <Field label="Distributor">
          <select value={distributorId} onChange={(e) => setDistributorId(e.target.value)}>
            <option value="">— Pilih distributor —</option>
            {customers
              .filter((c) => String(c.id) !== String(customerId))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Membuat order…' : 'Buat Order'}
      </button>
    </form>
  )
}