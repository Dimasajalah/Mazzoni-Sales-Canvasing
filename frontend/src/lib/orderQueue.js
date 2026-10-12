// frontend/src/lib/orderQueue.js
// Layar 12 Sales Order / Checkout (dokumen hal. 37): aman offline. Order disimpan di perangkat dan dikirim otomatis begitu
// koneksi kembali; Order Number baru ada setelah sinkron. Antrean ini terpisah dari mesin draft lain di aplikasi.

const KEY = 'mazzoni.orderQueue'

/** Penutupan tugas penutup (QRSLT) setelah order berhasil dibuat. */
export const WIN_PAYLOAD = {
  conclusion: 'WIN', reason_code: 'SUKSES', task_status: 'Process', next_template_id: null, due_date: null, remark: null,
}

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const write = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // penyimpanan penuh atau tidak tersedia: abaikan
  }
}

/** Simpan (atau ganti) entri untuk sebuah Quotation. status: 'pending' dikirim otomatis, 'draft' hanya titik pulih. */
export function queueOrder(entry, status = 'pending') {
  const saved = { ...entry, status, savedAt: new Date().toISOString() }
  write([...read().filter((e) => e.quoteId !== entry.quoteId), saved])
  return saved
}

export const getQueued = (quoteId) => read().find((e) => e.quoteId === quoteId) || null
export const removeQueued = (quoteId) => write(read().filter((e) => e.quoteId !== quoteId))
export const pendingCount = () => read().filter((e) => e.status === 'pending').length

export const isNetworkError = (err) =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) ||
  err?.name === 'TypeError' ||
  /network|failed to fetch|load failed/i.test(err?.message || '')

export const isAlreadyOrdered = (err) => /sudah dijadikan order/i.test(err?.message || '')

/** "14:52" dari penanda waktu. */
export const clock = (iso) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Kirim semua entri 'pending'. Berhenti bila jaringan putus; galat lain membiarkan entri tetap di antrean. Mengembalikan jumlah yang terkirim. */
export async function syncQueuedOrders({ confirmOrder, finishTask }) {
  let done = 0
  for (const e of read().filter((x) => x.status === 'pending')) {
    try {
      await confirmOrder(e.quoteId, e.payload)
      removeQueued(e.quoteId) // order sudah ada di server: jangan dikirim lagi walau penutupan tugas gagal
      done += 1
      if (finishTask && e.closingTaskId) {
        try {
          await finishTask(e.closingTaskId)
        } catch {
          // tugas penutup bisa diselesaikan manual; order-nya sudah terkirim
        }
      }
    } catch (err) {
      if (isAlreadyOrdered(err)) {
        removeQueued(e.quoteId)
        done += 1
      } else if (isNetworkError(err)) {
        break
      }
    }
  }
  return done
}