import { apiGet, apiPost, clearAuth, setStoredUser, setToken } from './client'

export async function login(login, password) {
  const res = await apiPost(
    '/auth/login',
    { login, username: login, email: login, password },
    { auth: false },
  )
  const data = res.data ?? res
  const token = data.token || data.access_token || res.token
  const user = data.user || data
  if (token) setToken(token)
  if (user) setStoredUser(user)
  return { token, user, raw: res }
}

export async function logout() {
  try {
    await apiPost('/auth/logout', {})
  } catch {
    /* ignore */
  }
  clearAuth()
}

export async function me() {
  const res = await apiGet('/auth/me')
  const user = res.data ?? res
  setStoredUser(user)
  return user
}
