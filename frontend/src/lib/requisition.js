// frontend/src/lib/requisition.js
// Requisition User, Reward dan Design (Blueprint MJU 3.2.14 / PR01, Purchasing Management).

export const PR_STATUS = {
  DRAFT: { label: 'Draft', tone: 'off' },
  PRICING: { label: 'Update Harga', tone: 'wait' },
  MANAGER: { label: 'Menunggu Manager', tone: 'wait' },
  DIRECTOR: { label: 'Menunggu Direktur', tone: 'wait' },
  REVISION: { label: 'Revisi', tone: 'bad' },
  PURCHASING: { label: 'Menunggu Purchasing', tone: 'wait' },
  DISPATCHED: { label: 'Diteruskan', tone: 'on' },
}

export const prStatusMeta = (s) => PR_STATUS[s] || { label: s || '—', tone: 'off' }

export const PR_CATEGORIES = [
  { value: 'REWARD', label: 'Reward' },
  { value: 'DESIGN', label: 'Design' },
]

// Peran tiap langkah diatur server (role atau email); ini hanya untuk menyembunyikan menu bagi yang jelas tidak berperan.
export const canRequisition = (user) => ['supervisor', 'admin'].includes(user?.role)