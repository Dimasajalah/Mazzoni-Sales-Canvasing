//frontend/src/pages/Login.jsx
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { Screen } from '../components/ui'
import { useOnline } from '../hooks/useOnline'
import { syncPendingDrafts } from '../lib/draftSync'

export default function Login() {
  const { login, isAuthenticated, booting } = useAuth()
  const { showToast } = useUi()
  const online = useOnline()
  const nav = useNavigate()
  const [loginId, setLoginId] = useState('budi.santoso')
  const [password, setPassword] = useState('password')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)

  if (!booting && isAuthenticated) return <Navigate to="/home" replace />

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(loginId.trim(), password)
      if (online) await syncPendingDrafts()
      showToast('Berhasil masuk')
      nav('/home', { replace: true })
    } catch (err) {
      showToast(err.message || 'Login gagal', { error: true })
    } finally {
      setLoading(false)
    }
  }

  const soon = () => showToast('Belum tersedia — menunggu master data Epicor', { warn: true })

  return (
    <Screen noNav>
      <form className="login" onSubmit={onSubmit}>
        <div className="login-logo">
          <img src="/mazzoni-logo.png" alt="Mazzoni" />
        </div>
        <h1 className="login-title">Sales Canvassing</h1>
        <p className="login-sub">Field sales app for the Mazzoni team · by BMT</p>

        <label className="login-label" htmlFor="login-id">Email / ID Sales</label>
        <div className="login-field">
          <span className="ic" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" />
            </svg>
          </span>
          <input
            id="login-id"
            value={loginId}
            placeholder="budi.santoso"
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
          />
        </div>

        <label className="login-label" htmlFor="login-pw">Password</label>
        <div className="login-field">
          <span className="ic" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
          </span>
          <input
            id="login-pw"
            type={showPw ? 'text' : 'password'}
            value={password}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="eye"
            aria-label={showPw ? 'Hide password' : 'Show password'}
            onClick={() => setShowPw((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
              {showPw ? <path d="M4 4l16 16" /> : null}
            </svg>
          </button>
        </div>

        <button type="button" className="login-forgot" onClick={soon}>Forgot password?</button>

        <button className="login-signin" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <div className="login-foot">v1.0.0 · PT Mazzoni Java Utama © 2026</div>
      </form>
    </Screen>
  )
}