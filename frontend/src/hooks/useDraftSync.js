// frontend/src/hooks/useDraftSync.js
import { useEffect, useRef } from 'react'
import { createExpense, createLead, createOrder, createReturn } from '../api'
import { loadDrafts, removeDraft } from '../lib/drafts'
import { useOnline } from './useOnline'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'

/** Retry local drafts when connection returns */
export function useDraftSync() {
  const online = useOnline()
  const { isAuthenticated } = useAuth()
  const { showToast } = useUi()
  const ran = useRef(false)

  useEffect(() => {
    if (!online || !isAuthenticated) {
      ran.current = false
      return
    }
    if (ran.current) return
    ran.current = true

    ;(async () => {
      let synced = 0
      for (const d of loadDrafts('lead')) {
        try {
          await createLead(d.payload || d)
          removeDraft('lead', d.id)
          synced++
        } catch {
          /* keep */
        }
      }
      for (const d of loadDrafts('order')) {
        try {
          await createOrder(d.payload || d)
          removeDraft('order', d.id)
          synced++
        } catch {
          /* keep */
        }
      }
      for (const d of loadDrafts('expense')) {
        try {
          if (!d.formFields) continue
          const fd = new FormData()
          Object.entries(d.formFields).forEach(([k, v]) => {
            if (v != null) fd.append(k, v)
          })
          await createExpense(fd)
          removeDraft('expense', d.id)
          synced++
        } catch {
          /* keep */
        }
      }
      for (const d of loadDrafts('return')) {
        try {
          if (!d.formFields) continue
          const fd = new FormData()
          Object.entries(d.formFields).forEach(([k, v]) => {
            if (v != null) fd.append(k, v)
          })
          await createReturn(fd)
          removeDraft('return', d.id)
          synced++
        } catch {
          /* keep */
        }
      }
      if (synced > 0) showToast(`${synced} draft offline berhasil disinkronkan`)
    })()
  }, [online, isAuthenticated, showToast])
}
