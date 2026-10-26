// frontend/src/pages/Achievement.jsx
// Upload Data Sales Target & Achievement (Blueprint MJU 5.2.14 / SL14). Marketing/Admin merekap data
// target & capaian sales secara manual di luar sistem, lalu upload di sini. Aplikasi hanya menyimpan dan
// menampilkan angkanya (Dashboard Last Achievement & Actual Achievement di Home); tidak ada perhitungan capaian.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getAchievementPanel, getAchievementTemplate, uploadAchievement } from '../api'
import { Screen, TopBar } from '../components/ui'
import { useUi } from '../context/UiContext'
import '../styles/marketingbudget.css'
import '../styles/marketingsellout.css'

const SHOWN_ERRORS = 50
const STATUS = {
    VALID: { label: 'Valid', tone: 'on' },
    REJECTED: { label: 'Ditolak', tone: 'bad' },
}
const statusMeta = (s) => STATUS[s] || { label: s, tone: 'off' }

export default function Achievement() {
    const { showToast } = useUi()
    const [panel, setPanel] = useState(null)
    const [file, setFile] = useState(null)
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState(null)
    const inputRef = useRef(null)

    const load = useCallback(
        () => getAchievementPanel().then(setPanel).catch((e) => showToast(e.message || 'Gagal memuat data achievement', { warn: true })),
        [showToast],
    )

    useEffect(() => {
        load()
    }, [load])

    const download = async () => {
        try {
            const t = await getAchievementTemplate()
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
            const r = await uploadAchievement(fd)
            setResult(r)
            setFile(null)
            if (inputRef.current) inputRef.current.value = ''
            showToast(r.status === 'VALID' ? 'Data Sales Target & Achievement valid' : 'Data ditolak, lihat baris yang bermasalah', { warn: r.status !== 'VALID' })
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

    return (
        <Screen>
            +      <TopBar title="Sales Target & Achievement" backTo="/home" />
            <div className="mb-sec">
                <div className="mb-sec-t">Upload Data</div>

                <div className="me-hint" style={{ marginTop: 0 }}>
                    Rekap Sales Target dan Achievement per sales per bulan di luar aplikasi memakai template baku, lalu unggah di sini.
                    Setiap baris dicek: periode harus format YYYY-MM dan kode sales harus terdaftar. Data menggantikan baris periode +
                    kode sales yang sama dari upload sebelumnya.
                </div>

                {panel ? (
                    <ul className="sl-cols">
                        {panel.columns.map((c) => (
                            <li key={c.name}>
                                <code>{c.name} *</code>
                                <span>{c.label}</span>
                            </li>
                        ))}
                        <li><code /><span>* wajib (boleh bernilai 0). Tulis angka tanpa pemisah ribuan.</span></li>
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

                {!rejected && shown?.status === 'VALID' ? (
                    <div className="sl-alert ok">
                        <b>Data valid: {shown.total_rows} baris</b>
                        {shown.filename}
                    </div>
                ) : null}

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
        </Screen>
    )
}