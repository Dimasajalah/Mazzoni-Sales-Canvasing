// frontend/src/lib/expenseStatus.js
// Status dan aksi expense (FDD Sales Mobile 4.12): Submitted -> Approved -> Paid (bisa Rejected).

export const EXPENSE_STATUS = {
  DRAFT: { label: 'Draft', color: 'var(--mut)' },
  SUBMITTED: { label: 'Menunggu', color: 'var(--amber)' },
  APPROVED: { label: 'Disetujui', color: 'var(--green)' },
  PAID: { label: 'Dibayar', color: 'var(--green-ink)' },
  REJECTED: { label: 'Ditolak', color: 'var(--pink)' },
}

export const expenseStatusMeta = (s) => EXPENSE_STATUS[s] || { label: s || '—', color: 'var(--mut)' }

// Tampilan tiap aksi. Daftar aksi yang boleh dipilih pengguna datang dari server (field `actions`), layar hanya memberi nama.
export const EXPENSE_ACTIONS = {
  APPROVED: { label: 'Setujui', done: 'disetujui', primary: true },
  REJECTED: { label: 'Tolak', done: 'ditolak', danger: true, requireNote: true },
  PAID: { label: 'Tandai Dibayar', done: 'ditandai dibayar', primary: true },
}

/** Mengubah daftar status tujuan dari server menjadi tombol; status yang tidak dikenal layar diabaikan. */
export const expenseButtons = (serverActions) =>
  (Array.isArray(serverActions) ? serverActions : [])
    .filter((to) => EXPENSE_ACTIONS[to])
    .map((to) => ({ to, ...EXPENSE_ACTIONS[to] }))