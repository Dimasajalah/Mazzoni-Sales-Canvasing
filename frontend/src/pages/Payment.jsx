import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createPayment, getCustomer, getCustomers } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import { fmtRp, listOf } from '../lib/format'

const METHODS = ['Transfer Bank', 'Tunai', 'Giro/Cek', 'QRIS']

export default function Payment() {
  const loc = useLocation()
  const nav = useNavigate()
  const { showToast } = useUi()
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState(loc.state?.customerId || '')
  const [invoices, setInvoices] = useState([])
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState(METHODS[0])
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCustomers({})
      .then((d) => {
        const list = listOf(d)
        setCustomers(list)
        if (!customerId && list[0]) setCustomerId(String(list[0].id))
      })
      .catch((e) => showToast(e.message, { warn: true }))
  }, [showToast])

  useEffect(() => {
    if (!customerId) return
    getCustomer(customerId)
      .then((c) => {
        const inv = listOf(c.invoices || c.ar?.invoices)
        setInvoices(inv)
        if (inv[0]) {
          setInvoiceId(String(inv[0].id || inv[0].invoice_number))
          setAmount(String(inv[0].balance ?? inv[0].bal ?? ''))
        } else {
          setInvoiceId('')
          setAmount('')
        }
      })
      .catch(() => setInvoices([]))
  }, [customerId])

  const selectedInv = useMemo(
    () => invoices.find((i) => String(i.id || i.invoice_number) === String(invoiceId)),
    [invoices, invoiceId],
  )

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createPayment({
        customer_id: customerId,
        invoice_id: selectedInv?.id || invoiceId,
        amount: Number(amount),
        method,
        reference,
        payment_date: date,
      })
      showToast('Pembayaran tercatat')
      nav('/ar')
    } catch (err) {
      showToast(err.message || 'Gagal simpan pembayaran', { error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Catat Pembayaran" backTo="/home" />
      <form onSubmit={submit}>
        <div className="field">
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Invoice</label>
          <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} required>
            {invoices.map((i) => (
              <option key={i.id || i.invoice_number} value={i.id || i.invoice_number}>
                {(i.invoice_number || i.inv) + ' · ' + fmtRp(i.balance ?? i.bal)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Amount</label>
          <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Reference</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan Pembayaran'}
        </button>
      </form>
    </Screen>
  )
}
