// frontend/src/lib/roles.js
// Aturan peran di sisi tampilan. Server tetap yang memutuskan (Dealmaker ditolak API saat membuat order);
// helper ini hanya menyembunyikan menu agar pengguna tidak menemui jalan buntu.
//
// Sesi lama yang belum memuat flag (undefined) diperlakukan aman:
//  - bisa order  : ya (server tetap menolak bila memang tidak boleh)
//  - bisa delegasi: tidak

export const canOrder = (user) => user?.can_order !== false
export const canDelegate = (user) => user?.can_delegate === true
export const isManager = (user) => ['admin', 'supervisor'].includes(user?.role)
export const isAdmin = (user) => user?.role === 'admin'

export const SALES_TYPE_LABEL = { DEALMAKER: 'Sales Dealmaker', ORDER: 'Sales Order' }

export function roleLabel(user) {
  if (!user) return ''
  if (user.role === 'sales') return SALES_TYPE_LABEL[user.sales_type] || 'Sales'
  return user.role.charAt(0).toUpperCase() + user.role.slice(1)
}
