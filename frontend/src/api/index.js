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

export const checkinVisit = (payload) => apiPost('/visits/checkin', payload).then(unwrap)

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