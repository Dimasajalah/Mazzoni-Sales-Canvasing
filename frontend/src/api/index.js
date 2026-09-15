import { apiForm, apiGet, apiPost } from './client'

const unwrap = (res) => res?.data ?? res

export const getDashboard = () => apiGet('/dashboard').then(unwrap)

export const getLeads = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/leads${q ? `?${q}` : ''}`).then(unwrap)
}

export const createLead = (payload) => apiPost('/leads', payload).then(unwrap)

export const getCustomers = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return apiGet(`/customers${q ? `?${q}` : ''}`).then(unwrap)
}

export const getCustomer = (id) => apiGet(`/customers/${id}`).then(unwrap)

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

export const offerPromo = (promoId, payload = {}) =>
  apiPost('/promotions/offer', {
    promo_id: promoId,
    ...payload,
  }).then(unwrap)

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
