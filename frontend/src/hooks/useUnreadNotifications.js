// frontend/src/hooks/useUnreadNotifications.js
// Jumlah pemberitahuan uang muka yang belum dibaca (untuk lencana). Diperbarui saat dibuka, saat online, dan tiap menit.
import { useCallback, useEffect, useState } from 'react'
import { getCashAdvanceNotifications } from '../api'

export function useUnreadNotifications(enabled = true, intervalMs = 60000) {
  const [unread, setUnread] = useState(0)

  const refresh = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    try {
      const res = await getCashAdvanceNotifications()
      setUnread(Number(res?.unread || 0))
    } catch {
      // lencana tidak kritis: diam saja bila gagal
    }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    refresh()
    const timer = setInterval(refresh, intervalMs)
    window.addEventListener('online', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', refresh)
    }
  }, [enabled, intervalMs, refresh])

  return { unread, refresh }
}