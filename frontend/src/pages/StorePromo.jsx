// frontend/src/pages/StorePromo.jsx
// Dokumen hal. 36 (11 Promo (Customer-facing)): promo yang berlaku untuk toko ini, dengan tombol Apply per kartu.
// Dibuka dari Choose Activity. Diskon promo terpisah dari diskon Quotation; promo yang di-Apply dibawa ke langkah Sales Order.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { applyLeadPromo, getLeadPromos, getPromos, getVisit, removeLeadPromo } from '../api'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { endsIn, isValidNow, promoKind, promoRef } from '../lib/promo'
import { useHideBottomNav } from '../lib/useHideBottomNav'
import '../styles/taskpage.css'

const listOf = (v) => (Array.isArray(v) ? v : v?.data || [])

export default function StorePromo() {
  useHideBottomNav()
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [visit, setVisit] = useState(loc.state?.visit || null)
  const [promos, setPromos] = useState(null) // null = memuat
  const [applied, setApplied] = useState(() => new Set())
  const [busy, setBusy] = useState(null)
  const [active, setActive] = useState(0)
  const cards = useRef([])

  // Dibuka ulang tanpa state (mis. refresh): ambil data kunjungan dari server.
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

  useEffect(() => {
    if (!lead?.id) return undefined
    let alive = true
    ;(async () => {
      try {
        const [all, mine] = await Promise.all([getPromos(), getLeadPromos(lead.id)])
        if (!alive) return
        setPromos(listOf(all).filter((p) => isValidNow(p)))
        setApplied(new Set(listOf(mine).map((a) => a.promo_ref)))
      } catch (e) {
        if (alive) {
          showToast(e.message || 'Gagal memuat promo', { warn: true })
          setPromos([])
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id])

  // Titik di bawah daftar mengikuti kartu yang sedang terlihat.
  useEffect(() => {
    if (!promos?.length || typeof IntersectionObserver === 'undefined') return undefined
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (hit) setActive(Number(hit.target.dataset.index))
      },
      { threshold: [0.4, 0.7, 1] },
    )
    cards.current.forEach((el) => el && obs.observe(el))
    return () => obs.disconnect()
  }, [promos])

  const toggle = async (p) => {
    const ref = promoRef(p)
    setBusy(ref)
    try {
      const next = new Set(applied)
      if (applied.has(ref)) {
        await removeLeadPromo(lead.id, ref)
        next.delete(ref)
        showToast('Promo dilepas dari order berikutnya')
      } else {
        await applyLeadPromo(lead.id, { promo_ref: ref, promo_name: p.name })
        next.add(ref)
        showToast(`Promo ${p.promo_code || p.name} dipasang untuk order berikutnya`)
      }
      setApplied(next)
    } catch (e) {
      showToast(e?.message || 'Gagal memasang promo', { error: true })
    } finally {
      setBusy(null)
    }
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
          <div>Promo for This Store</div>
          <div className="tt-sub">{lead?.business_name || visit?.customer?.name || ''}</div>
        </div>
      </div>

      {!visit ? (
        <div className="loading-center">Memuat…</div>
      ) : !lead ? (
        <div className="tp-empty">Tidak ada prospek untuk kunjungan ini.</div>
      ) : (
        <div className="tp-form">
          <div className="pr-intro">
            Separate from quotation discount — promos below apply automatically at the Sales Order step.
          </div>

          {promos === null ? (
            <div className="loading-center">Memuat…</div>
          ) : promos.length === 0 ? (
            <div className="tp-empty" style={{ margin: 0 }}>No promo is valid for this store right now.</div>
          ) : (
            <>
              {promos.map((p, i) => {
                const kind = promoKind(p)
                const left = endsIn(p.end_date)
                const terms = p.description || p.terms || p.notes || ''
                const ref = promoRef(p)
                const isApplied = applied.has(ref)
                return (
                  <div
                    key={p.id ?? ref}
                    className={`pr-card ${kind.cls}`}
                    data-index={i}
                    ref={(el) => {
                      cards.current[i] = el
                    }}
                  >
                    <div className="pr-deco" />
                    <div className="pr-top">
                      <span className="pr-badge">{kind.emoji} {kind.label}</span>
                      {left ? <span className="pr-left">Ends in {left}</span> : null}
                    </div>
                    <div className="pr-title">{p.name}</div>
                    {terms ? <div className="pr-terms">{terms}</div> : null}
                    <div className="pr-bottom">
                      <span className="pr-code">{p.promo_code ? `Code: ${p.promo_code}` : ''}</span>
                      <button type="button" className="pr-apply" disabled={busy === ref} onClick={() => toggle(p)}>
                        {isApplied ? 'Applied ✓' : 'Apply ✨'}
                      </button>
                    </div>
                  </div>
                )
              })}
              <div className="pr-dots" aria-hidden="true">
                {promos.map((p, i) => (
                  <i key={p.id ?? promoRef(p)} className={active === i ? `on ${promoKind(promos[i]).cls}` : ''} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Screen>
  )
}
