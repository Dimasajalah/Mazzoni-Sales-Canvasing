// frontend/src/lib/issueMaterial.js
// Issue Miscellaneous Material (Blueprint MJU 3.2.17 / MKT17).

export const ISSUE_STATUS = {
  ISSUED: { label: 'Menunggu Remarks', tone: 'wait' },
  DONE: { label: 'Selesai', tone: 'on' },
}

export const issueStatusMeta = (s) => ISSUE_STATUS[s] || { label: s || '—', tone: 'off' }

export const ISSUE_RECIPIENT_TYPES = [
  { value: 'SALES', label: 'Sales' },
  { value: 'CUSTOMER', label: 'Customer' },
]

// Marketing (supervisor dan admin) mengerjakan proses ini; server tetap yang memutuskan.
export const canIssueMaterial = (user) => ['supervisor', 'admin'].includes(user?.role)