// frontend/src/components/SellOutPanel.jsx
// Panel "Data Sell Out" pada detail Program Klaim (Blueprint MJU 3.2.7 / MKT07). Hanya menyala bila sumber data program
// adalah Sell Out. Alurnya: unduh template baku, upload berkas yang sudah direkap, sistem memvalidasi tiap baris;
// bila ada yang ditolak, perbaiki berkas lalu upload ulang. Setelah valid, program siap untuk Pengajuan Klaim.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSellOutPanel, getSellOutTemplate, uploadSellOut } from '../api'
import { useUi } from '../context/UiContext'
import { fmtDate } from '../lib/format'
import { fmtIdr } from '../lib/money'
import '../styles/marketingbudget.css'
import '../styles/marketingevent.css'
import '../styles/marketingsellout.css'

const SHOWN_ERRORS = 50
const STATUS = {
  VALID: { label: 'Valid', tone: 'on' },
  REJECTED: { label: 'Ditolak', tone: 'bad' },
  SUPERSEDED: { label: 'Digantikan', tone: 'off' },
}
const statusMeta = (s) => STATUS[s] || { label: s, tone: 'off' }
const num = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 3 })

export function SellOutPanel({ program }) {
  const { showToast } = useUi()
  const enabled = program?.claim_source === 'SELL_OUT'
  const [panel, setPanel] = useState(null)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // hasil upload terakhir pada sesi ini
  const inputRef = useRef(null)

  const load = useCallback(
    () => getSellOutPanel(program.id).then(setPanel).catch((e) => showToast(e.message || 'Gagal memuat data sell out', { warn: true })),
    [program?.id, showToast],
  )

  useEffect(() => {
    if (enabled) load()
  }, [enabled, load])

  if (!enabled) return null

  const download = async () => {
    try {
      const t = await getSellOutTemplate(program.id)
      const url = URL.createObjectURL(new Blob([t.content], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = t.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      showToast('Template diunduh')
    } catch (e) {
      showToast(e.message || 'Gagal mengunduh template', { error: true })
    }
  }

  const submit = async () => {
    if (!file) return showToast('Pilih berkas CSV dulu', { warn: true })
    const fd = new FormData()
    fd.append('file', file, file.name)

    setBusy(true)
    try {
      const r = await uploadSellOut(program.id, fd)
      setResult(r)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      showToast(r.status === 'VALID' ? 'Data sell out valid' : 'Data sell out ditolak, lihat baris yang bermasalah', { warn: r.status !== 'VALID' })
      await load()
    } catch (e) {
      showToast(e.message || 'Gagal mengunggah berkas', { error: true })
    } finally {
      setBusy(false)
    }
  }

  const shown = result || panel?.latest
  const rejected = shown?.status === 'REJECTED'
  const errors = (shown?.errors || []).slice(0, SHOWN_ERRORS)
  const moreErrors = rejected ? Math.max(0, shown.error_count - errors.length) : 0
  const current = panel?.current

  return (
    <div className="mb-sec">
      <div className="mb-sec-t">Data Sell Out</div>

      <div className="me-hint" style={{ marginTop: 0 }}>
        Rekap data mentah distributor ke template baku di luar aplikasi, lalu unggah di sini. Setiap baris dicek terhadap master:
        outlet, salesman, dan part harus terdaftar, dan tanggal harus dalam periode program
        {panel ? ` (${fmtDate(panel.period.start)} – ${fmtDate(panel.period.end)})` : ''}.
      </div>

      {panel ? (
        <ul className="sl-cols">
          {panel.columns.map((c) => (
            <li key={c.name}>
              <code>{c.name}{c.required ? ' *' : ''}</code>
              <span>{c.label}</span>
            </li>
          ))}
          <li><code /><span>* wajib. Kolom angka yang wajib mengikuti basis perhitungan program ({panel.claim_basis_label}). Tulis angka tanpa pemisah ribuan.</span></li>
        </ul>
      ) : null}

      <div className="sl-actions">
        <button type="button" className="btn ghost" onClick={download}>Unduh Template</button>
        <div className={`sl-file${file ? ' has' : ''}`}>{file ? file.name : 'Belum ada berkas dipilih (format CSV).'}</div>
        <button type="button" className="btn ghost" onClick={() => inputRef.current?.click()} disabled={busy}>Pilih Berkas CSV</button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button type="button" className="btn" onClick={submit} disabled={busy || !file}>
          {busy ? 'Memvalidasi…' : 'Upload & Validasi'}
        </button>
      </div>

      {rejected ? (
        <div className="sl-alert bad">
          <b>Data ditolak: {shown.error_count} masalah ditemukan</b>
          Tidak ada baris yang disimpan. Perbaiki berkas sesuai daftar di bawah, lalu upload ulang.
          {current ? ` Data valid sebelumnya (${current.filename}) tetap dipakai.` : ''}
          <ul className="sl-errors">
            {errors.map((e, i) => (
              <li key={`${e.row}-${e.field}-${i}`}>
                <b>Baris {e.row} · {e.field}</b>
                <small>{e.message}{e.value ? ` (isi: ${e.value})` : ''}</small>
              </li>
            ))}
          </ul>
          {moreErrors > 0 ? <div>dan {moreErrors} masalah lainnya</div> : null}
        </div>
      ) : null}

      {current ? (
        <div className="sl-alert ok">
          <b>Data valid: {current.total_rows} baris</b>
          {current.filename} · total kuantitas {num(current.total_qty)} · total nilai {fmtIdr(current.total_amount)}
        </div>
      ) : null}

      <div className="me-hint">
        {panel?.calculate_ready
          ? 'Data valid. Program siap untuk Pengajuan Klaim; tombol Calculate aktif di tahap itu.'
          : 'Belum ada data valid. Tombol Calculate baru aktif setelah validasi berhasil.'}
      </div>

      {panel?.history?.length ? (
        <div style={{ marginTop: 12 }}>
          <div className="mb-sec-t">Riwayat berkas</div>
          {panel.history.map((h) => {
            const st = statusMeta(h.status)
            return (
              <div key={h.id} className="sl-hist">
                <span>{h.filename}{h.uploaded_by ? ` · ${h.uploaded_by}` : ''}</span>
                <span className={`mb-badge ${st.tone}`}>{st.label}</span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
