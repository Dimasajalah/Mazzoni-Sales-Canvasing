//frontend/src/pages/Login.jsx
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { Screen } from '../components/ui'
import { useOnline } from '../hooks/useOnline'
import { loadDrafts, removeDraft } from '../lib/drafts'
import { createExpense, createLead, createOrder, createReturn } from '../api'

export default function Login() {
  const { login, isAuthenticated, booting } = useAuth()
  const { showToast } = useUi()
  const online = useOnline()
  const nav = useNavigate()
  const [loginId, setLoginId] = useState('budi.santoso')
  const [password, setPassword] = useState('password')
  const [loading, setLoading] = useState(false)

  if (!booting && isAuthenticated) return <Navigate to="/home" replace />

  const retryDrafts = async () => {
    if (!online) return
    const leadDrafts = loadDrafts('lead')
    for (const d of leadDrafts) {
      try {
        await createLead(d.payload || d)
        removeDraft('lead', d.id)
      } catch {
        /* keep */
      }
    }
    const orderDrafts = loadDrafts('order')
    for (const d of orderDrafts) {
      try {
        await createOrder(d.payload || d)
        removeDraft('order', d.id)
      } catch {
        /* keep */
      }
    }
    const expDrafts = loadDrafts('expense')
    for (const d of expDrafts) {
      try {
        if (d.formFields) {
          const fd = new FormData()
          Object.entries(d.formFields).forEach(([k, v]) => {
            if (v != null) fd.append(k, v)
          })
          await createExpense(fd)
          removeDraft('expense', d.id)
        }
      } catch {
        /* keep */
      }
    }
    const retDrafts = loadDrafts('return')
    for (const d of retDrafts) {
      try {
        if (d.formFields) {
          const fd = new FormData()
          Object.entries(d.formFields).forEach(([k, v]) => {
            if (v != null) fd.append(k, v)
          })
          await createReturn(fd)
          removeDraft('return', d.id)
        }
      } catch {
        /* keep */
      }
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(loginId.trim(), password)
      await retryDrafts()
      showToast('Berhasil masuk')
      nav('/home', { replace: true })
    } catch (err) {
      showToast(err.message || 'Login gagal', { error: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen noNav>
      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: '100%',
          padding: '0 8px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <img
            src="/mazzoni-logo.png"
            alt="Mazzoni"
            style={{ width: 210, maxWidth: '76%', height: 'auto', display: 'block', margin: '0 auto 18px' }}
          />
          <h1 className="title" style={{ fontSize: 24 }}>
            Sales Canvassing
          </h1>
          <p className="sub">Aplikasi sales lapangan Mazzoni · oleh BMT</p>
        </div>
        <div className="field">
          <label>Email / ID Sales</label>
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>Kata sandi</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Masuk…' : 'Masuk'}
        </button>
        <p className="sub" style={{ textAlign: 'center', marginTop: 16 }}>
          Demo: budi.santoso / password
        </p>
      </form>
    </Screen>
  )
}
