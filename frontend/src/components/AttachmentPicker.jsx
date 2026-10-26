// frontend/src/components/AttachmentPicker.jsx
// Lampiran foto atau PDF (mis. RAB). PhotoUpload hanya menerima foto, jadi komponen ini terpisah.
import { useRef } from 'react'

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export function AttachmentPicker({ files, onChange, max = 5 }) {
  const ref = useRef(null)
  const add = (list) => onChange([...files, ...Array.from(list || [])].slice(0, max))

  return (
    <div>
      {files.length === 0 ? (
        <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>Belum ada lampiran.</div>
      ) : (
        files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="me-file">
            <span className="me-file-n">{f.name}</span>
            <span className="me-file-s">{fmtSize(f.size)}</span>
            <button type="button" aria-label={`Hapus ${f.name}`} onClick={() => onChange(files.filter((_, x) => x !== i))}>×</button>
          </div>
        ))
      )}
      <button type="button" className="btn ghost sm" onClick={() => ref.current?.click()} disabled={files.length >= max}>
        + Pilih File (foto / PDF)
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
