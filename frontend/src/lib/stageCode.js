// frontend/src/lib/stageCode.js
// Kode tahap seperti di dokumen: LEAD, OPPO, QUOTE.
const CODES = { LEAD: 'LEAD', OPPORTUNITY: 'OPPO', QUOTE: 'QUOTE' }
export const stageCode = (stage) => CODES[stage] || stage || ''