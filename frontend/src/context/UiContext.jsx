import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const UiContext = createContext(null)

export function UiProvider({ children }) {
  const [toast, setToast] = useState({ show: false, msg: '', warn: false, error: false })
  const [sheet, setSheet] = useState({ open: false, title: '', body: null })
  const timer = useRef(null)

  const showToast = useCallback((msg, opts = {}) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({
      show: true,
      msg,
      warn: !!opts.warn,
      error: !!opts.error,
    })
    timer.current = setTimeout(() => {
      setToast((t) => ({ ...t, show: false }))
    }, opts.ms || 2600)
  }, [])

  const openSheet = useCallback((title, body) => {
    setSheet({ open: true, title, body })
  }, [])

  const closeSheet = useCallback(() => {
    setSheet((s) => ({ ...s, open: false }))
  }, [])

  const value = useMemo(
    () => ({ toast, showToast, sheet, openSheet, closeSheet }),
    [toast, showToast, sheet, openSheet, closeSheet],
  )

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

export function useUi() {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi outside UiProvider')
  return ctx
}
