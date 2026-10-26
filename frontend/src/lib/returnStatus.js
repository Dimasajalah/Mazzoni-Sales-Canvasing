// frontend/src/lib/returnStatus.js
// Status dan aksi retur (Blueprint MJU 5.2.18 / FDD Sales Mobile 4.13).

export const RETURN_STATUS = {
  SUBMITTED: { label: 'Diajukan', color: 'var(--amber)' },
  VERIFIED: { label: 'Diverifikasi', color: 'var(--blue)' },
  APPROVED: { label: 'Disetujui', color: 'var(--green-ink)' },
  RMA_ISSUED: { label: 'RMA terbit', color: 'var(--green-ink)' },
  REJECTED: { label: 'Ditolak', color: 'var(--pink)' },
}

export const returnStatusMeta = (s) => RETURN_STATUS[s] || { label: s || '—', color: 'var(--mut)' }

const verify = { to: 'VERIFIED', label: 'Verifikasi', done: 'diverifikasi' }
const approve = { to: 'APPROVED', label: 'Setujui', done: 'disetujui', primary: true }
const reject = { to: 'REJECTED', label: 'Tolak', done: 'ditolak', danger: true, requireNote: true }
const issueRma = { to: 'RMA_ISSUED', label: 'Terbitkan RMA', done: 'berstatus RMA terbit', primary: true }

// Aksi per status. Mengikuti config/access.php di backend: hanya maju; REJECTED dan RMA_ISSUED menutup proses.
const ACTIONS = {
  SUBMITTED: [verify, approve, reject],
  VERIFIED: [approve, reject],
  APPROVED: [issueRma],
}

export const returnActions = (status) => ACTIONS[status] || []

// Cadangan bila server tidak mengirim penanda can_change_status; server tetap yang memutuskan.
export const canChangeReturn = (user) => ['supervisor', 'admin'].includes(user?.role)