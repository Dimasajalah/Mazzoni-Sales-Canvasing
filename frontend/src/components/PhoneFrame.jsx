import { useEffect, useState } from 'react'
import { useOnline } from '../hooks/useOnline'
import { useUi } from '../context/UiContext'
import { hhmm } from '../lib/format'

export function PhoneFrame({ children, showChrome = true }) {
  const [clock, setClock] = useState(hhmm())
  const online = useOnline()
  const { toast, sheet, closeSheet } = useUi()

  useEffect(() => {
    const t = setInterval(() => setClock(hhmm()), 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="stage">
      <div className="brandbar">
        <img className="logo-dot" src="/mazzoni-logo.png" alt="Mazzoni" />
        <span>
          <b>Mazzoni</b> · Sales Canvassing — oleh BMT
        </span>
      </div>
      <div className="phone">
        <div className="screen-wrap">
          {showChrome && (
            <>
              <div className="notch" />
              <div className="statusbar">
                <span>{clock}</span>
                <span className="r">
                  <span className="bar" />
                  <span className="bat" />
                </span>
              </div>
            </>
          )}
          {!online && (
            <div className="offline-banner">● Offline — draft lokal aktif, sync saat online</div>
          )}
          {children}

          <div
            className={`sheet-bg${sheet.open ? ' open' : ''}`}
            onClick={closeSheet}
            role="presentation"
          />
          <div className={`sheet${sheet.open ? ' open' : ''}`}>
            <div className="grab" />
            {sheet.title ? (
              <div style={{ fontWeight: 800, marginBottom: 10 }}>{sheet.title}</div>
            ) : null}
            <div>{sheet.body}</div>
          </div>

          <div
            className={`toast${toast.show ? ' show' : ''}${toast.warn ? ' warn' : ''}${
              toast.error ? ' error' : ''
            }`}
          >
            <span>{toast.error ? '!' : toast.warn ? '!' : '✓'}</span>
            <span>{toast.msg}</span>
          </div>
        </div>
      </div>
      <div className="hint">Buka di ponsel untuk layar penuh.</div>
    </div>
  )
}
