import { useRef } from 'react'

export function PhotoUpload({ files, onChange, max = 6 }) {
  const camRef = useRef(null)
  const galRef = useRef(null)

  const addFiles = (fileList) => {
    const arr = Array.from(fileList || [])
    const next = [...files, ...arr].slice(0, max)
    onChange(next)
  }

  const removeAt = (i) => {
    onChange(files.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <div className="photo-row">
        {files.length === 0 ? (
          <div className="muted" style={{ fontSize: 11 }}>
            Belum ada lampiran foto.
          </div>
        ) : (
          files.map((f, i) => (
            <div className="photo-thumb" key={`${f.name}-${i}`}>
              <img src={URL.createObjectURL(f)} alt={f.name} />
              <button type="button" className="rm" onClick={() => removeAt(i)}>
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={() => camRef.current?.click()}>
          📷 Kamera
        </button>
        <button type="button" className="btn ghost sm" onClick={() => galRef.current?.click()}>
          🖼 Galeri
        </button>
      </div>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
