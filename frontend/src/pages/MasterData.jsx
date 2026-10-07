// frontend/src/pages/MasterData.jsx
// Layar admin / supervisor untuk data master: kemasan & gramasi, strata, mapping kode, dan tim sales.
import { useEffect, useState } from 'react'
import { getCustomers, getProducts } from '../api'
import CodeMapAdmin from '../components/master/CodeMapAdmin'
import PackagingAdmin from '../components/master/PackagingAdmin'
import StrataAdmin from '../components/master/StrataAdmin'
import TeamAdmin from '../components/master/TeamAdmin'
import { Chips, Screen, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { listOf, listProducts } from '../lib/format'
import { isAdmin, isManager } from '../lib/roles'

const TABS = [
  { value: 'packaging', label: 'Kemasan' },
  { value: 'strata', label: 'Strata' },
  { value: 'codes', label: 'Kode' },
  { value: 'team', label: 'Tim Sales' },
]

export default function MasterData() {
  const { user } = useAuth()
  const { showToast } = useUi()
  const [tab, setTab] = useState('packaging')
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])

  const allowed = isManager(user)

  useEffect(() => {
    if (!allowed) return
    Promise.all([getProducts({}), getCustomers({})])
      .then(([p, c]) => {
        setProducts(listProducts(p))
        setCustomers(listOf(c))
      })
      .catch((e) => showToast(e.message, { warn: true }))
  }, [allowed, showToast])

  if (!allowed) {
    return (
      <Screen>
        <TopBar title="Master Data" backTo="/home" />
        <div className="card muted" style={{ padding: 16, fontSize: 13 }}>
          Halaman ini hanya untuk admin dan supervisor.
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <TopBar title="Master Data" backTo="/home" />
      <p className="sub">Data ini dipakai untuk konversi Kg ke pcs, diskon strata, dan pemetaan kode</p>
      <Chips options={TABS} value={tab} onChange={setTab} />

      {tab === 'packaging' && <PackagingAdmin products={products} showToast={showToast} />}
      {tab === 'strata' && <StrataAdmin products={products} showToast={showToast} />}
      {tab === 'codes' && <CodeMapAdmin products={products} customers={customers} showToast={showToast} />}
      {tab === 'team' && <TeamAdmin canEdit={isAdmin(user)} currentUserId={user?.id} showToast={showToast} />}
    </Screen>
  )
}
