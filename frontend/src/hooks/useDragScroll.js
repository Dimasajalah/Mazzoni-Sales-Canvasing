//frontend/src/hooks/useDragScroll.js
import { useCallback, useRef } from 'react'

/** Geser daftar horizontal dengan mouse (drag). Sentuhan tetap memakai scroll bawaan. */
export function useDragScroll() {
  const cleanup = useRef(null)
  return useCallback((el) => {
    if (cleanup.current) {
      cleanup.current()
      cleanup.current = null
    }
    if (!el) return
    let down = false
    let moved = false
    let startX = 0
    let startLeft = 0
    const onDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      down = true
      moved = false
      startX = e.clientX
      startLeft = el.scrollLeft
    }
    const onMove = (e) => {
      if (!down) return
      const dx = e.clientX - startX
      if (!moved && Math.abs(dx) > 5) {
        moved = true
        el.classList.add('dragging')
      }
      if (moved) el.scrollLeft = startLeft - dx
    }
    const end = () => {
      if (!down) return
      down = false
      el.classList.remove('dragging')
    }
    const onClickCapture = (e) => {
      if (moved) {
        e.stopPropagation()
        e.preventDefault()
        moved = false
      }
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    el.addEventListener('click', onClickCapture, true)
    cleanup.current = () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      el.removeEventListener('click', onClickCapture, true)
    }
  }, [])
}