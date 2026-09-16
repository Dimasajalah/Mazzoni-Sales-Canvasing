// frontend/src/api/client.js
const TOKEN_KEY = 'sc_token'
const USER_KEY = 'sc_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

export function clearAuth() {
  setToken(null)
  setStoredUser(null)
  window.dispatchEvent(new Event('auth:cleared'))
}

const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status, errors, data } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
    this.data = data
  }
}

async function parseBody(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

export async function api(path, options = {}) {
  const {
    method = 'GET',
    body,
    formData,
    auth = true,
    headers: extraHeaders = {},
  } = options

  const headers = { Accept: 'application/json', ...extraHeaders }
  const token = getToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let payload = body
  if (formData) {
    payload = formData
  } else if (body != null && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : payload,
  })

  const data = await parseBody(res)

  if (!res.ok) {
    if (res.status === 401) {
      clearAuth()
    }
    throw new ApiError(data?.message || `HTTP ${res.status}`, {
      status: res.status,
      errors: data?.errors,
      data,
    })
  }

  return data
}

export function apiGet(path, opts) {
  return api(path, { ...opts, method: 'GET' })
}

export function apiPost(path, body, opts) {
  return api(path, { ...opts, method: 'POST', body })
}

export function apiPut(path, body, opts) {
  return api(path, { ...opts, method: 'PUT', body })
}

export function apiPatch(path, body, opts) {
  return api(path, { ...opts, method: 'PATCH', body })
}

export function apiDelete(path, opts) {
  return api(path, { ...opts, method: 'DELETE' })
}

export function apiForm(path, formData, method = 'POST', opts) {
  return api(path, { ...opts, method, formData })
}
