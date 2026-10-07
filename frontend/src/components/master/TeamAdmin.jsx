// frontend/src/components/master/TeamAdmin.jsx
// Tim sales: peran Sales Dealmaker (tidak bisa order) atau Sales Order (tidak bisa delegasi).
import { useCallback, useEffect, useState } from 'react'
import { createUser, getUsers, updateUser } from '../../api'
import { listOf } from '../../lib/format'
import { SALES_TYPE_LABEL } from '../../lib/roles'
import { Field } from '../Field'

const ROLES = ['sales', 'supervisor', 'admin', 'finance', 'warehouse']
const EMPTY = { name: '', username: '', email: '', password: '', role: 'sales', sales_type: 'ORDER', territory: '' }

export default function TeamAdmin({ canEdit, currentUserId, showToast }) {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setUsers(listOf(await getUsers()))
    } catch (e) {
      showToast(e.message || 'Gagal memuat tim', { warn: true })
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const patch = async (u, changes, okMsg) => {
    try {
      await updateUser(u.id, changes)
      showToast(okMsg)
      await load()
    } catch (e) {
      showToast(e.message || 'Gagal memperbarui user', { error: true })
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await createUser({
        ...form,
        territory: form.territory.trim() || null,
        ...(form.role === 'sales' ? {} : { sales_type: undefined }),
      })
      showToast('User dibuat')
      setForm(EMPTY)
      setShowForm(false)
      await load()
    } catch (err) {
      showToast(err.message || 'Gagal membuat user', { error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
        Sales Dealmaker: NOO, kunjungan, sample, delegasi (tidak bisa order). Sales Order: semua itu kecuali delegasi, dan
        bisa order ke HO.
      </div>

      {users.map((u) => (
        <div key={u.id} className="card" style={{ padding: 10, marginBottom: 8, opacity: u.active ? 1 : 0.55 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12.5 }}>{u.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {u.username} · {u.role}
                {u.territory ? ` · ${u.territory}` : ''}
                {u.active ? '' : ' · nonaktif'}
              </div>
            </div>
            {u.role === 'sales' && (
              <span className="badge" style={{ background: 'rgba(42,111,214,.14)', color: 'var(--blue)', alignSelf: 'flex-start' }}>
                {SALES_TYPE_LABEL[u.sales_type] || u.sales_type}
              </span>
            )}
          </div>

          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              {u.role === 'sales' && (
                <select
                  aria-label={`Peran ${u.name}`}
                  value={u.sales_type}
                  style={{ flex: 1 }}
                  onChange={(e) => patch(u, { sales_type: e.target.value }, 'Peran diperbarui')}
                >
                  <option value="ORDER">Sales Order</option>
                  <option value="DEALMAKER">Sales Dealmaker</option>
                </select>
              )}
              {u.id !== currentUserId && (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => patch(u, { active: !u.active }, u.active ? 'User dinonaktifkan' : 'User diaktifkan')}
                >
                  {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {canEdit &&
        (showForm ? (
          <form onSubmit={submit} className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8 }}>Tambah user</div>
            <Field label="Nama">
              <input value={form.name} onChange={set('name')} required />
            </Field>
            <Field label="Username">
              <input value={form.username} onChange={set('username')} required autoCapitalize="none" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={set('email')} required />
            </Field>
            <Field label="Password (min. 8 karakter)">
              <input type="password" value={form.password} onChange={set('password')} required minLength={8} />
            </Field>
            <Field label="Role">
              <select value={form.role} onChange={set('role')}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            {form.role === 'sales' && (
              <Field label="Tipe sales">
                <select value={form.sales_type} onChange={set('sales_type')}>
                  <option value="ORDER">Sales Order</option>
                  <option value="DEALMAKER">Sales Dealmaker</option>
                </select>
              </Field>
            )}
            <Field label="Territory">
              <input value={form.territory} onChange={set('territory')} />
            </Field>
            <div className="tp-actions">
              <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>
                Batal
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan user'}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn" onClick={() => setShowForm(true)}>
            + Tambah user
          </button>
        ))}
      {!canEdit && (
        <div className="muted" style={{ fontSize: 11.5 }}>
          Hanya admin yang dapat menambah atau mengubah user.
        </div>
      )}
    </div>
  )
}
