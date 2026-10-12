// frontend/src/lib/leadCode.js
// Penanda record di bawah judul halaman task (dokumen hal. 26 dan 28):
//   tahap LEAD        -> "Lead #L-0032"
//   tahap OPPORTUNITY -> "Opportunity #10019"
// Kedua nomor diturunkan dari id lead (data belum punya nomor sendiri).
export const leadCode = (id) => `L-${String(id).padStart(4, '0')}`
export const opportunityCode = (id) => String(10000 + Number(id))
// Nomor Quotation di header (dokumen hal. 32): "QUO-10019", memakai nomor Opportunity yang sama.
export const quoteCode = (lead) => (lead?.id ? `QUO-${opportunityCode(lead.id)}` : '—')

export function recordLabel(lead, task) {
  if (!lead) return ''
  const stage = task?.stage || lead.stage
  return stage === 'LEAD' ? `Lead #${leadCode(lead.id)}` : `Opportunity #${opportunityCode(lead.id)}`
}