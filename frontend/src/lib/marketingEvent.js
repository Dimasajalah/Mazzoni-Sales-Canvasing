// frontend/src/lib/marketingEvent.js
// Status event marketing (Blueprint MJU 3.2.2). Persetujuan dikerjakan di tahap 3.2.6 (MKT06).
export const EVENT_STATUS = {
  PENDING_APPROVAL: { label: 'Menunggu Persetujuan', tone: 'wait' },
  APPROVED: { label: 'Disetujui', tone: 'on' },
  REJECTED: { label: 'Ditolak', tone: 'bad' },
  CANCELLED: { label: 'Dibatalkan', tone: 'off' },
}

export const eventStatusMeta = (s) => EVENT_STATUS[s] || { label: s || '—', tone: 'off' }

export const TARGET_LABEL = { NATIONAL: 'Nasional', TERRITORY: 'Territory', CUSTOMER: 'Customer' }

export function targetSummary(ev) {
  if (ev?.target_type === 'TERRITORY') return `Territory: ${(ev.target_territories || []).join(', ')}`
  if (ev?.target_type === 'CUSTOMER') return 'Customer pilihan'
  return 'Nasional (semua customer aktif)'
}

// Program Klaim (Blueprint MJU 3.2.4 / MKT04): ringkasan besaran klaim, mis. "2,5%" atau "Rp 5.000".
export function claimRateLabel(ev) {
  const n = Number(ev?.claim_rate)
  if (!Number.isFinite(n)) return '—'
  return ev.claim_rate_type === 'PERCENT'
    ? `${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`
    : `Rp ${Math.round(n).toLocaleString('id-ID')}`
}