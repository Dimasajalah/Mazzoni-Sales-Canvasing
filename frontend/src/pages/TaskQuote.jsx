// frontend/src/pages/TaskQuote.jsx
// Dokumen hal. 32 (10 Quotation — Header) sebagai halaman penuh, dibuka dari Choose Activity.
// Setelah Save, kembali ke Choose Activity (tugas berikutnya: SENDQ).
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getQuote, getQuotes, getVisit } from '../api'
import QuoteHeaderForm, { QUOTE_TASK_NAME } from '../components/QuoteHeaderForm'
import { TaskErrorBoundary } from '../components/TaskErrorBoundary'
import { Screen } from '../components/ui'
import { useUi } from '../context/UiContext'
import { listOf } from '../lib/format'

export default function TaskQuote() {
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [visit, setVisit] = useState(loc.state?.visit || null)
  const [quote, setQuote] = useState(null)
  const [quoteState, setQuoteState] = useState('loading') // loading | ready | missing

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
  const task = lead?.current_task || null
  const isQuote = Boolean(task?.actions?.includes('quote'))

  // Quotation terbaru milik prospek ini (nomor terbit saat tugas Quotation dibuka).
  useEffect(() => {
    if (!lead?.id || !isQuote) return undefined
    let alive = true
    ;(async () => {
      try {
        const list = listOf(await getQuotes({ lead_id: lead.id }))
        if (!list.length) {
          if (alive) setQuoteState('missing')
          return
        }
        const full = await getQuote(list[0].id)
        if (alive) {
          setQuote(full)
          setQuoteState('ready')
        }
      } catch (e) {
        if (alive) {
          showToast(e.message || 'Gagal memuat Quotation', { warn: true })
          setQuoteState('missing')
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, isQuote])

  return (
    <Screen noNav>
      <div className="topbar">
        <button type="button" className="back" aria-label="Kembali" onClick={() => nav(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="tt" style={{ flex: 1, minWidth: 0 }}>
          <div>Quotation</div>
          <div className="tt-sub">
            {[lead?.business_name, task ? `Task: ${QUOTE_TASK_NAME} (${task.code})` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {!visit ? (
        <div className="loading-center">Memuat…</div>
      ) : !task ? (
        <div className="tp-empty">Tidak ada tugas aktif untuk kunjungan ini.</div>
      ) : !isQuote ? (
        <div className="tp-empty">Tugas aktif saat ini bukan Quotation. Kembali ke Choose Activity.</div>
      ) : quoteState === 'loading' ? (
        <div className="loading-center">Memuat…</div>
      ) : quoteState === 'missing' ? (
        <div className="tp-empty">
          Quotation untuk prospek ini belum ada.
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn ghost sm" onClick={() => nav('/quotes/new', { state: { leadId: lead.id } })}>
              Buka form Quotation
            </button>
          </div>
        </div>
      ) : (
        <TaskErrorBoundary>
          <QuoteHeaderForm
            key={quote.id}
            lead={lead}
            task={task}
            quote={quote}
            showToast={showToast}
            onDone={() => nav(-1)}
            onOpenLines={() => nav(`/quotes/${quote.id}/lines`, { state: { visit } })}
          />
        </TaskErrorBoundary>
      )}
    </Screen>
  )
}
