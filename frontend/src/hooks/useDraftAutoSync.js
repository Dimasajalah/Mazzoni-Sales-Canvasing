// frontend/src/hooks/useDraftAutoSync.js
// Poin 19 (hasil meeting Okt 2026): data yang tersimpan offline (lead/order/expense/retur)
// otomatis dikirim ulang begitu sinyal kembali SELAMA sesi berjalan — tidak perlu menunggu sales
// logout-login lagi (yang sebelumnya satu-satunya pemicu sinkronisasi).
import { useEffect, useRef } from 'react'
import { useOnline } from './useOnline'
import { syncPendingDrafts } from '../lib/draftSync'

export function useDraftAutoSync(enabled, onSynced) {
  const online = useOnline()
  const wasOffline = useRef(!online)

  useEffect(() => {
    if (online && wasOffline.current && enabled) {
      syncPendingDrafts().then((count) => {
        if (count > 0) onSynced?.(count)
      })
    }
    wasOffline.current = !online
  }, [online, enabled, onSynced])
}