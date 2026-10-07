import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// jsdom tidak punya ini; Leaflet & komponen memerlukannya
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
}
// URL.createObjectURL bawaan Node tidak cocok dengan File milik jsdom -> paksa mock
window.URL.createObjectURL = () => 'blob:test'
globalThis.URL.createObjectURL = () => 'blob:test'
