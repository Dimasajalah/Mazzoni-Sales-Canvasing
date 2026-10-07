// frontend/src/lib/draftSync.js
// Poin 19 (hasil meeting Okt 2026): data yang dibuat saat tidak ada sinyal (lead, order, expense,
// retur) tersimpan sebagai draft lokal dulu, lalu dikirim ulang otomatis begitu sinyal kembali —
// tidak perlu menunggu sales logout-login lagi.
import { createExpense, createLead, createOrder, createReturn } from '../api'
import { loadDrafts, removeDraft } from './drafts'

async function syncFormDataDrafts(type, createFn) {
  let synced = 0
  for (const d of loadDrafts(type)) {
    if (!d.formFields) continue
    try {
      const fd = new FormData()
      Object.entries(d.formFields).forEach(([k, v]) => {
        if (v != null) fd.append(k, v)
      })
      await createFn(fd)
      removeDraft(type, d.id)
      synced++
    } catch {
      /* masih gagal (mis. belum benar-benar online, atau ditolak server) -> biarkan, coba lagi nanti */
    }
  }
  return synced
}

async function syncJsonDrafts(type, createFn) {
  let synced = 0
  for (const d of loadDrafts(type)) {
    try {
      await createFn(d.payload || d)
      removeDraft(type, d.id)
      synced++
    } catch {
      /* keep */
    }
  }
  return synced
}

export function offlineSaveMessage(err, noun) {
    if (err?.status === 0) {
      return `Tidak ada sinyal — ${noun} tersimpan sebagai draft, akan terkirim otomatis saat sinyal kembali.`
    }
    return err?.message || `Gagal menyimpan ${noun} — tersimpan sebagai draft.`
  }

/** Coba kirim ulang semua draft tersimpan. @returns {Promise<number>} jumlah yang berhasil disinkron. */
export async function syncPendingDrafts() {
  const counts = await Promise.all([
    syncJsonDrafts('lead', createLead),
    syncJsonDrafts('order', createOrder),
    syncFormDataDrafts('expense', createExpense),
    syncFormDataDrafts('return', createReturn),
  ])
  return counts.reduce((a, b) => a + b, 0)
}