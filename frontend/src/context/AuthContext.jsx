import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authApi from '../api/auth'
import { getStoredUser, getToken, clearAuth } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser())
  const [token, setTok] = useState(() => getToken())
  const [booting, setBooting] = useState(!!getToken())

  useEffect(() => {
    let alive = true
    async function boot() {
      if (!getToken()) {
        setBooting(false)
        return
      }
      try {
        const me = await authApi.me()
        if (alive) setUser(me)
      } catch {
        if (alive) {
          clearAuth()
          setUser(null)
          setTok(null)
        }
      } finally {
        if (alive) setBooting(false)
      }
    }
    boot()
    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(async (loginId, password) => {
    const { user: u, token: t } = await authApi.login(loginId, password)
    setUser(u)
    setTok(t)
    return u
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
    setTok(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      token,
      booting,
      isAuthenticated: !!token,
      login,
      logout,
      setUser,
    }),
    [user, token, booting, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
