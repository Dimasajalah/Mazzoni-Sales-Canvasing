// frontend/src/lib/storageUrl.js
// Alamat berkas di storage publik Laravel (butuh `php artisan storage:link`).
// Asal server diambil dari VITE_API_URL tanpa /api/v1; bila VITE_API_URL relatif (mis. '/api/v1'), memakai asal yang sama dengan aplikasi.

export function storageUrl(path, apiUrl = import.meta.env?.VITE_API_URL) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const origin = String(apiUrl || '').replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '')
  return `${origin}/storage/${String(path).replace(/^\/+/, '')}`
}