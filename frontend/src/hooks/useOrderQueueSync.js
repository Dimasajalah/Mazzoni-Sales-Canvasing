// frontend/src/hooks/useOrderQueueSync.js
// Mengirim antrean order offline (layar 12) saat aplikasi dibuka, saat koneksi kembali, dan tiap menit.
import { useEffect } from 'react'
import { concludeLeadTask, confirmQuoteOrder } from '../api'
import { pendingCount, syncQueuedOrders, WIN_PAYLOAD } from '../lib/orderQueue'

export function useOrderQueueSync(enabled, onSynced) {
  useEffect(() => {
    if (!enabled) return undefined
    let busy = false
    const run = async () => {
      if (busy || !navigator.onLine || pendingCount() === 0) return
      busy = true
      try {
        const n = await syncQueuedOrders({
          confirmOrder: confirmQuoteOrder,
          finishTask: (taskId) => concludeLeadTask(taskId, WIN_PAYLOAD),
        })
        if (n) onSynced?.(n)
      } finally {
        busy = false
      }
    }
    run()
    window.addEventListener('online', run)
    const timer = setInterval(run, 60000)
    return () => {
      window.removeEventListener('online', run)
      clearInterval(timer)
    }
  }, [enabled, onSynced])
}