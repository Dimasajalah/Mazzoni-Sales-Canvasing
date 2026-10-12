// frontend/src/lib/useHideBottomNav.js
// Menyembunyikan bilah menu bawah (Home, Customers, Tasks, Orders, Profile) selama layar ini tampil.
// Dokumen tidak memakainya di layar Quotation Lines dan Line Detail; tanpa ini ia menutup tombol di bagian bawah.
import { useEffect } from 'react'

export function useHideBottomNav() {
  useEffect(() => {
    document.body.classList.add('hide-bottom-nav')
    return () => document.body.classList.remove('hide-bottom-nav')
  }, [])
}