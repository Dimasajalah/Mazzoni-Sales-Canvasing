// frontend/src/api/index.js
import { apiDelete, apiForm, apiGet, apiPatch, apiPost, apiPut } from './client'

const unwrap = (res) => res?.data ?? res

export const getDashboard = () => apiGet('/dashboard').then(unwrap)

export const getLeads = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/leads${q ? `?${q}` : ''}`).then(unwrap)
}

export const createLead = (payload) => apiPost('/leads', payload).then(unwrap)

export const getLead = (id) => apiGet(`/leads/${id}`).then(unwrap)

export const updateLead = (id, payload) => apiPatch(`/leads/${id}`, payload).then(unwrap)

/** Foto toko: dikirim multipart setelah lead tersimpan. */
export const uploadLeadPhoto = (leadId, file) => {
  const fd = new FormData()
  fd.append('photo', file)
  return apiForm(`/leads/${leadId}/photo`, fd).then(unwrap)
}

// --- Mesin tugas & journey ---
export const getLeadTasks = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/lead-tasks${q ? `?${q}` : ''}`).then(unwrap)
}

export const updateLeadTask = (id, payload) => apiPatch(`/lead-tasks/${id}`, payload).then(unwrap)

export const concludeLeadTask = (id, payload) =>
  apiPost(`/lead-tasks/${id}/conclude`, payload).then(unwrap)

export const getTaskTemplates = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/task-templates${q ? `?${q}` : ''}`).then(unwrap)
}

export const createJourneyEntry = (leadId, payload) =>
  apiPost(`/leads/${leadId}/journey-entries`, payload).then(unwrap)

export const getVisit = (id) => apiGet(`/visits/${id}`).then(unwrap)

// --- Kemasan, strata, kompetitor ---
export const getProductPackagings = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/product-packagings${q ? `?${q}` : ''}`).then(unwrap)
}

export const getDiscountStrata = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/discount-strata${q ? `?${q}` : ''}`).then(unwrap)
}

export const getCompetitors = () => apiGet('/competitors').then(unwrap)

// --- Master data (admin / supervisor) ---
export const createProductPackaging = (payload) => apiPost('/product-packagings', payload).then(unwrap)
export const updateProductPackaging = (id, payload) => apiPatch(`/product-packagings/${id}`, payload).then(unwrap)
export const deleteProductPackaging = (id) => apiDelete(`/product-packagings/${id}`).then(unwrap)

export const createDiscountStratum = (payload) => apiPost('/discount-strata', payload).then(unwrap)
export const updateDiscountStratum = (id, payload) => apiPatch(`/discount-strata/${id}`, payload).then(unwrap)
export const deleteDiscountStratum = (id) => apiDelete(`/discount-strata/${id}`).then(unwrap)

export const getCodeMappings = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/code-mappings${q ? `?${q}` : ''}`).then(unwrap)
}
export const saveCodeMapping = (payload) => apiPost('/code-mappings', payload).then(unwrap)
export const deleteCodeMapping = (id) => apiDelete(`/code-mappings/${id}`).then(unwrap)

// --- Tim sales (peran) ---
export const getUsers = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/users${q ? `?${q}` : ''}`).then(unwrap)
}
export const createUser = (payload) => apiPost('/users', payload).then(unwrap)
export const updateUser = (id, payload) => apiPatch(`/users/${id}`, payload).then(unwrap)

// --- Delegasi & laporan NOO ---
export const getDelegations = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/delegations${q ? `?${q}` : ''}`).then(unwrap)
}
export const getDelegationTargets = () => apiGet('/delegation-targets').then(unwrap)
export const getLeadDelegation = (leadId) => apiGet(`/leads/${leadId}/delegation`).then(unwrap)
export const delegateLead = (leadId, payload) => apiPost(`/leads/${leadId}/delegate`, payload).then(unwrap)
export const cancelDelegation = (id) => apiPost(`/delegations/${id}/cancel`, {}).then(unwrap)

export const getNooReport = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/reports/noo${q ? `?${q}` : ''}`).then(unwrap)
}

// --- Quotation ---
export const getQuotes = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/quotes${q ? `?${q}` : ''}`).then(unwrap)
}

export const getQuote = (id) => apiGet(`/quotes/${id}`).then(unwrap)

export const createQuote = (payload) => apiPost('/quotes', payload).then(unwrap)

export const updateQuote = (id, payload) => apiPatch(`/quotes/${id}`, payload).then(unwrap)

export const replaceQuoteLines = (id, lines) => apiPut(`/quotes/${id}/lines`, { lines }).then(unwrap)

export const markQuoteQuoted = (id) => apiPost(`/quotes/${id}/mark-quoted`, {}).then(unwrap)

export const attachQuoteCompetitor = (id, payload) =>
  apiPost(`/quotes/${id}/competitors`, payload).then(unwrap)

export const detachQuoteCompetitor = (id, competitorId) =>
  apiDelete(`/quotes/${id}/competitors/${competitorId}`).then(unwrap)

export const convertQuoteToOrder = (id, payload) =>
  apiPost(`/quotes/${id}/convert-to-order`, payload).then(unwrap)

export const createLeadFollowup = (leadId, payload) =>
  apiPost(`/leads/${leadId}/followups`, payload).then(unwrap)

export const getTaskSets = () => apiGet('/task-sets').then(unwrap)

export const getTaskTypes = () => apiGet('/task-types').then(unwrap)

export const getTasks = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/tasks${q ? `?${q}` : ''}`).then(unwrap)
}

export const getCustomers = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/customers${q ? `?${q}` : ''}`).then(unwrap)
}

export const getCustomer = (id) => apiGet(`/customers/${id}`).then(unwrap)
export const updateCustomer = (id, payload) => apiPatch(`/customers/${id}`, payload).then(unwrap)

export const getCustomerActivity = (id, params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/customers/${id}/activity${q ? `?${q}` : ''}`).then(unwrap)
}

export const getPicTargets = (customerId) => apiGet(`/customers/${customerId}/pic-targets`).then(unwrap)

export const saveQuoteHeader = (id, payload) => apiPost(`/quotes/${id}/header`, payload).then(unwrap)

export const getQuotePdf = (id) => apiGet(`/quotes/${id}/pdf`).then(unwrap)

export const saveQuoteLines = (id, lines) => apiPost(`/quotes/${id}/lines/replace`, { lines }).then(unwrap)

export const getApprovedSamples = (quoteId) => apiGet(`/quotes/${quoteId}/approved-samples`).then(unwrap)

export const searchQuoteProducts = (quoteId, params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString()
  return apiGet(`/quotes/${quoteId}/product-search${qs ? `?${qs}` : ''}`).then(unwrap)
}

export const getLeadPromos = (leadId) => apiGet(`/leads/${leadId}/promos`).then(unwrap)

export const applyLeadPromo = (leadId, payload) => apiPost(`/leads/${leadId}/promos`, payload).then(unwrap)

export const removeLeadPromo = (leadId, promoRef) => apiPost(`/leads/${leadId}/promos/remove`, { promo_ref: promoRef }).then(unwrap)

export const getCashAdvanceNotifications = () => apiGet('/cash-advance/notifications').then(unwrap)
export const markCashAdvanceRead = (id) => apiPost(`/cash-advance/notifications/${id}/read`, {}).then(unwrap)
export const markAllCashAdvanceRead = () => apiPost('/cash-advance/notifications/read-all', {}).then(unwrap)

export const bindQuotePart = (quoteId, lineId, productId) => apiPost(`/quotes/${quoteId}/lines/${lineId}/bind-part`, { product_id: productId }).then(unwrap)

export const confirmQuoteOrder = (quoteId, payload) => apiPost(`/quotes/${quoteId}/checkout`, payload).then(unwrap)

export const delegatePic = (customerId, payload) =>
  apiPost(`/customers/${customerId}/delegate-pic`, payload).then(unwrap)

export const getInventory = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/inventory${q ? `?${q}` : ''}`).then(unwrap)
}

export const getProducts = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/products${q ? `?${q}` : ''}`).then(unwrap)
}

export const getPromos = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/promotions${q ? `?${q}` : ''}`).then(unwrap)
}

export const getSamples = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/samples${q ? `?${q}` : ''}`).then(unwrap)
}

// Revisi functional: Product Group harus DIPILIH dari daftar (bukan diketik bebas)
export const getProductGroups = () => apiGet('/product-groups').then(unwrap)
export const createSample = (payload) => apiPost('/samples', payload).then(unwrap)

export const deliverSample = (id) => apiPost(`/samples/${id}/deliver`, {}).then(unwrap)

export const getSampleFeedbacks = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/sample-feedbacks${q ? `?${q}` : ''}`).then(unwrap)
}

export const createSampleFeedback = (payload) => apiPost('/sample-feedbacks', payload).then(unwrap)

export const offerPromo = (promoId, payload = {}) =>
  apiPost('/promotions/offer', {
    promo_id: promoId,
    ...payload,
  }).then(unwrap)

export const getCustomerPromoHistory = (customerId) =>
  apiGet(`/customers/${customerId}/promo-offers`).then(unwrap)

export const getVisits = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/visits${q ? `?${q}` : ''}`).then(unwrap)
}

export const checkinVisit = (payload) => {
  const { photo, ...rest } = payload
  if (!photo) return apiPost('/visits/checkin', rest).then(unwrap)
  const fd = new FormData()
  Object.entries(rest).forEach(([k, v]) => {
    if (v != null) fd.append(k, v)
  })
  fd.append('photo', photo)
  return apiForm('/visits/checkin', fd).then(unwrap)
}

export const checkoutVisit = (id, payload) =>
  apiPost(`/visits/${id}/checkout`, payload).then(unwrap)

export const getOrders = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/orders${q ? `?${q}` : ''}`).then(unwrap)
}

export const createOrder = (payload) => apiPost('/orders', payload).then(unwrap)

export const getOrderTracker = (id) => apiGet(`/orders/${id}/tracker`).then(unwrap)

export const getAging = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/ar/aging${q ? `?${q}` : ''}`).then(unwrap)
}

export const createPayment = (payload) => apiPost('/payments', payload).then(unwrap)

export const getExpenses = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/expenses${q ? `?${q}` : ''}`).then(unwrap)
}

export const createExpense = (formData) => apiForm('/expenses', formData).then(unwrap)

export const getReturns = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/returns${q ? `?${q}` : ''}`).then(unwrap)
}

export const createReturn = (formData) => apiForm('/returns', formData).then(unwrap)

export const globalSearch = (q) =>
  apiGet(`/search?q=${encodeURIComponent(q)}`).then(unwrap)

export const getMarketingBudgets = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/budgets${q ? `?${q}` : ''}`).then(unwrap)
}
export const getMarketingBudget = (id) => apiGet(`/marketing/budgets/${id}`).then(unwrap)
export const createMarketingBudget = (payload) => apiPost('/marketing/budgets', payload).then(unwrap)
export const updateMarketingBudget = (id, payload) => apiPatch(`/marketing/budgets/${id}`, payload).then(unwrap)

export const getMarketingEvents = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/events${q ? `?${q}` : ''}`).then(unwrap)
}
export const getMarketingEvent = (id) => apiGet(`/marketing/events/${id}`).then(unwrap)
export const getMarketingEventOptions = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/event-options${q ? `?${q}` : ''}`).then(unwrap)
}
export const createMarketingEvent = (formData) => apiForm('/marketing/events', formData).then(unwrap)

export const getStarOutlets = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/star-outlets${q ? `?${q}` : ''}`).then(unwrap)
}
export const getStarOutletCandidates = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/star-outlet-candidates${q ? `?${q}` : ''}`).then(unwrap)
}
export const createStarOutlet = (payload) => apiPost('/marketing/star-outlets', payload).then(unwrap)
export const updateStarOutlet = (id, payload) => apiPatch(`/marketing/star-outlets/${id}`, payload).then(unwrap)

export const getClaimPrograms = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/claim-programs${q ? `?${q}` : ''}`).then(unwrap)
}
export const getClaimProgram = (id) => apiGet(`/marketing/claim-programs/${id}`).then(unwrap)
export const getClaimProgramOptions = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/claim-program-options${q ? `?${q}` : ''}`).then(unwrap)
}
export const createClaimProgram = (formData) => apiForm('/marketing/claim-programs', formData).then(unwrap)

export const approveClaimProgram = (id, payload) => apiPost(`/marketing/claim-programs/${id}/approve`, payload).then(unwrap)
export const rejectClaimProgram = (id, payload) => apiPost(`/marketing/claim-programs/${id}/reject`, payload).then(unwrap)

export const approveEvent = (id, payload) => apiPost(`/marketing/events/${id}/approve`, payload).then(unwrap)
export const rejectEvent = (id, payload) => apiPost(`/marketing/events/${id}/reject`, payload).then(unwrap)
export const reviseEvent = (id, formData) => apiForm(`/marketing/events/${id}/revise`, formData).then(unwrap)
export const getPendingApprovals = () => apiGet('/marketing/approvals/pending').then(unwrap)

export const getSellOutPanel = (id) => apiGet(`/marketing/claim-programs/${id}/sellout`).then(unwrap)
export const getSellOutTemplate = (id) => apiGet(`/marketing/claim-programs/${id}/sellout/template`).then(unwrap)
export const uploadSellOut = (id, formData) => apiForm(`/marketing/claim-programs/${id}/sellout`, formData).then(unwrap)

export const getClaimOptions = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/claims/options${q ? `?${q}` : ''}`).then(unwrap)
}
export const getClaims = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/claims${q ? `?${q}` : ''}`).then(unwrap)
}
export const getClaim = (id) => apiGet(`/marketing/claims/${id}`).then(unwrap)
export const createClaim = (formData) => apiForm('/marketing/claims', formData).then(unwrap)
export const passClaim = (id, payload) => apiPost(`/marketing/claims/${id}/pass`, payload).then(unwrap)
export const refuseClaim = (id, payload) => apiPost(`/marketing/claims/${id}/refuse`, payload).then(unwrap)
export const calculateClaim = (id) => apiPost(`/marketing/claims/${id}/calculate`, {}).then(unwrap)
export const submitClaim = (id, payload) => apiPost(`/marketing/claims/${id}/submit`, payload).then(unwrap)

export const confirmClaimDifference = (id, payload = {}) => apiPost(`/marketing/claims/${id}/confirm-difference`, payload).then(unwrap)
export const approveClaimSubmission = (id, payload) => apiPost(`/marketing/claims/${id}/approve`, payload).then(unwrap)
export const rejectClaimSubmission = (id, payload) => apiPost(`/marketing/claims/${id}/reject`, payload).then(unwrap)
export const finalizeClaimAmount = (id, payload) => apiPost(`/marketing/claims/${id}/approved-amount`, payload).then(unwrap)

export const getDeductionClaims = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/deduction-claims${q ? `?${q}` : ''}`).then(unwrap)
}
export const getDeductionClaim = (id) => apiGet(`/marketing/deduction-claims/${id}`).then(unwrap)
export const postClaimDeduction = (id, payload) => apiPost(`/marketing/deduction-claims/${id}/post-invoice`, payload).then(unwrap)

export const getCreditMemoClaims = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/credit-memo-claims${q ? `?${q}` : ''}`).then(unwrap)
}
export const getCreditMemoClaim = (id) => apiGet(`/marketing/credit-memo-claims/${id}`).then(unwrap)
export const saveCreditMemoEntry = (id, payload) => apiPost(`/marketing/credit-memo-claims/${id}/entry`, payload).then(unwrap)
export const postCreditMemo = (id, payload) => apiPost(`/marketing/credit-memo-claims/${id}/post`, payload).then(unwrap)
export const applyCreditMemo = (id) => apiPost(`/marketing/credit-memo-claims/${id}/apply`, {}).then(unwrap)

export const getTransferClaims = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/transfer-claims${q ? `?${q}` : ''}`).then(unwrap)
}
export const getTransferClaim = (id) => apiGet(`/marketing/transfer-claims/${id}`).then(unwrap)
export const saveTransferEntry = (id, payload) => apiPost(`/marketing/transfer-claims/${id}/entry`, payload).then(unwrap)
export const markTransferred = (id, payload) => apiPost(`/marketing/transfer-claims/${id}/transferred`, payload).then(unwrap)

export const getGoodsClaims = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/goods-claims${q ? `?${q}` : ''}`).then(unwrap)
}
export const getGoodsClaim = (id) => apiGet(`/marketing/goods-claims/${id}`).then(unwrap)
export const saveGoodsItems = (id, items) => apiPost(`/marketing/goods-claims/${id}/items`, { items }).then(unwrap)
export const checkGoodsStock = (id, payload) => apiPost(`/marketing/goods-claims/${id}/stock-check`, payload).then(unwrap)
export const saveGoodsRequisition = (id, payload) => apiPost(`/marketing/goods-claims/${id}/requisition`, payload).then(unwrap)
export const confirmGoodsReceipt = (id) => apiPost(`/marketing/goods-claims/${id}/receipt`, {}).then(unwrap)
export const saveGoodsShipment = (id, payload) => apiPost(`/marketing/goods-claims/${id}/shipment`, payload).then(unwrap)
export const saveGoodsIssue = (id, payload) => apiPost(`/marketing/goods-claims/${id}/issue`, payload).then(unwrap)
// kirim berkas (FormData): samakan gayanya dengan createClaim yang sudah ada, hanya alamatnya berbeda
export const handOverGoods = (id, fd) => apiPost(`/marketing/goods-claims/${id}/handover`, fd).then(unwrap)

export const getRequisitions = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/purchasing/requisitions${q ? `?${q}` : ''}`).then(unwrap)
}
export const getRequisition = (id) => apiGet(`/purchasing/requisitions/${id}`).then(unwrap)
export const createRequisition = (payload) => apiPost('/purchasing/requisitions', payload).then(unwrap)
export const updateRequisition = (id, payload) => apiPut(`/purchasing/requisitions/${id}`, payload).then(unwrap)
// kirim berkas (FormData): samakan gayanya dengan createClaim yang sudah ada, hanya alamatnya berbeda
export const uploadRequisitionFiles = (id, fd) => apiPost(`/purchasing/requisitions/${id}/attachments`, fd).then(unwrap)
export const submitRequisition = (id) => apiPost(`/purchasing/requisitions/${id}/submit`, {}).then(unwrap)
export const registerRequisitionPart = (id, lineId, payload) => apiPost(`/purchasing/requisitions/${id}/lines/${lineId}/register`, payload).then(unwrap)
export const saveRequisitionPrices = (id, prices) => apiPost(`/purchasing/requisitions/${id}/prices`, { prices }).then(unwrap)
export const approveRequisition = (id, payload) => apiPost(`/purchasing/requisitions/${id}/approve`, payload).then(unwrap)
export const rejectRequisition = (id, payload) => apiPost(`/purchasing/requisitions/${id}/reject`, payload).then(unwrap)
export const resubmitRequisition = (id) => apiPost(`/purchasing/requisitions/${id}/resubmit`, {}).then(unwrap)
export const dispatchRequisition = (id, payload) => apiPost(`/purchasing/requisitions/${id}/dispatch`, payload).then(unwrap)

export const getMoveRequests = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/move-requests${q ? `?${q}` : ''}`).then(unwrap)
}
export const getMoveRequestEvents = () => apiGet('/marketing/move-requests/events').then(unwrap)
export const getMoveRequest = (id) => apiGet(`/marketing/move-requests/${id}`).then(unwrap)
export const createMoveRequest = (payload) => apiPost('/marketing/move-requests', payload).then(unwrap)
export const updateMoveRequest = (id, payload) => apiPut(`/marketing/move-requests/${id}`, payload).then(unwrap)
export const checkMoveRequestOnHand = (id, payload) => apiPost(`/marketing/move-requests/${id}/onhand`, payload).then(unwrap)
export const saveMoveRequestMove = (id, payload) => apiPost(`/marketing/move-requests/${id}/move-request`, payload).then(unwrap)
export const saveMoveRequestTransfer = (id, payload) => apiPost(`/marketing/move-requests/${id}/transfer`, payload).then(unwrap)
export const saveMoveRequestIssue = (id, payload) => apiPost(`/marketing/move-requests/${id}/issue`, payload).then(unwrap)
export const completeMoveRequest = (id, payload) => apiPost(`/marketing/move-requests/${id}/complete`, payload).then(unwrap)

export const getSampleRequests = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/sample-requests${q ? `?${q}` : ''}`).then(unwrap)
}
export const getSampleRequest = (id) => apiGet(`/marketing/sample-requests/${id}`).then(unwrap)
export const createSampleRequest = (payload) => apiPost('/marketing/sample-requests', payload).then(unwrap)
export const updateSampleRequest = (id, payload) => apiPut(`/marketing/sample-requests/${id}`, payload).then(unwrap)
export const checkSampleRequestOnHand = (id, payload) => apiPost(`/marketing/sample-requests/${id}/onhand`, payload).then(unwrap)
export const saveSampleRequestMove = (id, payload) => apiPost(`/marketing/sample-requests/${id}/move-request`, payload).then(unwrap)
export const saveSampleRequestTransfer = (id, payload) => apiPost(`/marketing/sample-requests/${id}/transfer`, payload).then(unwrap)
export const saveSampleRequestIssue = (id, payload) => apiPost(`/marketing/sample-requests/${id}/issue`, payload).then(unwrap)
export const completeSampleRequest = (id, payload) => apiPost(`/marketing/sample-requests/${id}/complete`, payload).then(unwrap)

export const getMaterialIssues = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/marketing/issues${q ? `?${q}` : ''}`).then(unwrap)
}
export const getMaterialIssue = (id) => apiGet(`/marketing/issues/${id}`).then(unwrap)
export const createMaterialIssue = (payload) => apiPost('/marketing/issues', payload).then(unwrap)
export const updateMaterialIssue = (id, payload) => apiPut(`/marketing/issues/${id}`, payload).then(unwrap)
export const completeMaterialIssue = (id, payload) => apiPost(`/marketing/issues/${id}/complete`, payload).then(unwrap)

export const getReturn = (id) => apiGet(`/returns/${id}`).then(unwrap)
export const updateReturnStatus = (id, payload) => apiPatch(`/returns/${id}/status`, payload).then(unwrap)

export const getExpense = (id) => apiGet(`/expenses/${id}`).then(unwrap)
export const updateExpenseStatus = (id, payload) => apiPatch(`/expenses/${id}/status`, payload).then(unwrap)

export const getAchievementPanel = () => apiGet('/marketing/achievement').then(unwrap)
export const getAchievementTemplate = () => apiGet('/marketing/achievement/template').then(unwrap)
export const uploadAchievement = (formData) => apiForm('/marketing/achievement', formData).then(unwrap)
export const getMyAchievement = () => apiGet('/marketing/achievement/me').then(unwrap)

export async function getCashAdvanceSummary(month) {
  const res = await apiGet(`/cash-advance/summary?month=${encodeURIComponent(month)}`)
  return res.data
}

export async function getCashAdvanceCategories(month) {
  const res = await apiGet(`/cash-advance/categories?month=${encodeURIComponent(month)}`)
  return res.data
}

export async function getCashAdvanceDocuments(month, direction, operationType) {
  const params = new URLSearchParams({ month, direction })
  if (operationType) params.set('operation_type', operationType)
  const res = await apiGet(`/cash-advance/documents?${params.toString()}`)
  return res.data
}

export async function createCashAdvanceIssue(formData) {
  const res = await apiForm('/cash-advance/issues', formData)
  return res.data
}

export async function retryCashAdvanceAttachments(issueId, formData) {
  const res = await apiForm(`/cash-advance/issues/${issueId}/attachments`, formData)
  return res.data
}

export async function searchCustomersForPicker(q) {
  const res = await apiGet(`/customers?search=${encodeURIComponent(q)}`)
  return res.data
}

