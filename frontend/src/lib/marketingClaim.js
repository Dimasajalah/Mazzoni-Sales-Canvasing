// frontend/src/lib/marketingClaim.js
// Status Pengajuan Program Klaim (Blueprint MJU 3.2.8 / MKT08) dan approval-nya (3.2.9 / MKT09).
export const CLAIM_STATUS = {
  DRAFT: { label: 'Draft', tone: 'off' },
  PENDING_PASS: { label: 'Pending (melewati periode)', tone: 'wait' },
  STOPPED: { label: 'Dihentikan', tone: 'bad' },
  CALCULATED: { label: 'Sudah Dihitung', tone: 'on' },
  SUBMITTED: { label: 'Diajukan', tone: 'on' },
  IN_APPROVAL: { label: 'Dalam Approval', tone: 'wait' },
  AWAITING_AMOUNT: { label: 'Input Nilai Disetujui', tone: 'wait' },
  APPROVED: { label: 'Disetujui', tone: 'on' },
  DISBURSED: { label: 'Dicairkan', tone: 'on' },
  REJECTED: { label: 'Ditolak', tone: 'bad' },
}

export const claimStatusMeta = (s) => CLAIM_STATUS[s] || { label: s || '—', tone: 'off' }

// Potong Nota (Blueprint MJU 3.2.10 / MKT10) dikerjakan Sales; admin dan supervisor ikut bisa. Server tetap yang memutuskan.
export const canDeduct = (user) => ['sales', 'supervisor', 'admin'].includes(user?.role)

// Potong Tagihan (Blueprint MJU 3.2.11 / MKT11) dikerjakan Finance; admin ikut bisa. Server tetap yang memutuskan.
export const canCreditMemo = (user) => ['finance', 'admin'].includes(user?.role)

export const CREDIT_MEMO_STATUS = {
  ENTERED: { label: 'Sudah dientri', tone: 'wait' },
  POSTED: { label: 'Terposting', tone: 'wait' },
  APPLIED: { label: 'Teraplikasi', tone: 'on' },
}

export const creditMemoStatusMeta = (s) => CREDIT_MEMO_STATUS[s] || { label: 'Belum dientri', tone: 'off' }

// Pencairan Transfer (Blueprint MJU 3.2.12 / MKT12) dikerjakan Finance; admin ikut bisa. Server tetap yang memutuskan.
export const canTransfer = (user) => ['finance', 'admin'].includes(user?.role)

export const TRANSFER_STATUS = {
  ENTERED: { label: 'Sudah dientri', tone: 'wait' },
  TRANSFERRED: { label: 'Dicairkan', tone: 'on' },
}

export const transferStatusMeta = (s) => TRANSFER_STATUS[s] || { label: 'Belum dientri', tone: 'off' }

// Pencairan Barang/Reward (Blueprint MJU 3.2.13 / MKT13) dikerjakan Marketing (supervisor dan admin). Server tetap yang memutuskan.
export const canGoods = (user) => ['supervisor', 'admin'].includes(user?.role)

export const GOODS_STATUS = {
  SET: { label: 'Reward diatur', tone: 'wait' },
  REQUISITION: { label: 'Menunggu Requisition', tone: 'wait' },
  READY: { label: 'Barang siap', tone: 'wait' },
  SHIPPED: { label: 'Misc. Shipment', tone: 'wait' },
  ISSUED: { label: 'Barang dikeluarkan', tone: 'wait' },
  HANDED_OVER: { label: 'Dicairkan', tone: 'on' },
}

export const goodsStatusMeta = (s) => GOODS_STATUS[s] || { label: 'Belum diatur', tone: 'off' }