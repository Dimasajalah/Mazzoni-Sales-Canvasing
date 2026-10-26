// frontend/src/pages/Login.jsx
import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { Screen } from '../components/ui'
import { useOnline } from '../hooks/useOnline'
import { useGeolocation } from '../hooks/useGeolocation'
import { syncPendingDrafts } from '../lib/draftSync'

// Step: 'form' -> 'locating' -> 'located' -> navigate ke /home (Section Flow Petty Cash.pdf, Login 1-3)
export default function Login() {
  const { login, isAuthenticated, booting } = useAuth()
  const { showToast } = useUi()
  const online = useOnline()
  const nav = useNavigate()
  const { refresh: refreshLocation } = useGeolocation()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [step, setStep] = useState('form') // 'form' | 'locating' | 'located'
  const submittingRef = useRef(false)

  if (!booting && isAuthenticated && !submittingRef.current) return <Navigate to="/home" replace />

  const onSubmit = async (e) => {
    e.preventDefault()
    submittingRef.current = true
    setLoading(true)
    try {
      await login(loginId.trim(), password)
      if (online) await syncPendingDrafts()
      detectLocation()
    } catch (err) {
      showToast(err.message || 'Login gagal', { error: true })
      setLoading(false)
    }
  }

  async function detectLocation() {
    setStep('locating')
    try {
      await refreshLocation()
    } catch {
      // Izin ditolak / gagal deteksi — PDF/FDD tidak mendefinisikan state gagal, jadi tetap
      // lanjut daripada memblokir login. Lihat catatan di bawah — tolong konfirmasi ini yang diinginkan.
      showToast('Gagal mendeteksi lokasi, tetap melanjutkan', { warn: true })
    }
    setStep('located')
    setTimeout(() => nav('/home', { replace: true }), 700) // jeda singkat biar centang sempat terlihat
  }

  return (
    <Screen noNav>
      <form className={`login${step !== 'form' ? ' login-dimmed' : ''}`} onSubmit={onSubmit}>
        <div className="login-logo">
          <img src="/mazzoni-logo.png" alt="Mazzoni" />
        </div>
        <h1 className="login-title">Sales Canvassing</h1>
        <p className="login-sub">Mazzoni Java Utama</p>

        <label className="login-label" htmlFor="login-id">ID SALES</label>
        <div className="login-field">
          <span className="ic" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" />
            </svg>
          </span>
          <input
            id="login-id"
            value={loginId}
            placeholder="rizki.pratama12"
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            disabled={step !== 'form'}
          />
        </div>

        <label className="login-label" htmlFor="login-pw">PASSWORD</label>
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
            disabled={step !== 'form'}
          />
          <button
            type="button"
            className="eye"
            aria-label={showPw ? 'Sembunyikan password' : 'Lihat password'}
            onClick={() => setShowPw((v) => !v)}
            disabled={step !== 'form'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
              {showPw ? <path d="M4 4l16 16" /> : null}
            </svg>
          </button>
        </div>

        <button type="button" className="login-forgot" disabled={step !== 'form'}
          onClick={() => showToast('Hubungi admin untuk reset password', { warn: true })}>
          Forgot password?
        </button>

        <button className="login-signin" type="submit" disabled={loading || step !== 'form'}>
          {loading ? 'Memproses…' : 'Log In'}
        </button>

        <div className="login-foot">
          <p>v1.0.0 · PT Mazzoni Java Utama © 2026</p>
          <p className="login-credit">Created by<br />Bima Maju Teknologi</p>
        </div>
      </form>

      {step !== 'form' && (
        <div className="login-overlay-card">
          <span className={`login-overlay-icon${step === 'located' ? ' ok' : ''}`}>
            {step === 'located' ? (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
            ) : (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            )}
          </span>
          <strong>{step === 'located' ? 'Berhasil' : 'Mendeteksi Lokasi'}</strong>
          <span>{step === 'located' ? 'Lokasi Berhasil Terdeteksi' : 'Mohon Tunggu Sebentar…'}</span>
        </div>
      )}
    </Screen>
  )
}