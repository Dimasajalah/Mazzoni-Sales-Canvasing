// frontend/src/lib/returnForm.js
// Susunan FormData pengajuan retur sesuai yang diminta server (ReturnController@store):
//   lines[n][product_id], lines[n][qty]  dan  attachments[]  (bukan product_id/qty biasa dan bukan photos[]).

export function buildReturnFormData(form, productId, photos = []) {
  const fd = new FormData()
  // product_id dan qty dari form masuk ke lines, bukan sebagai field biasa
  const { product_id: _product, qty, ...header } = form

  Object.entries(header).forEach(([k, v]) => {
    if (v != null && v !== '') fd.append(k, v)
  })
  fd.append('lines[0][product_id]', String(productId))
  fd.append('lines[0][qty]', String(qty))
  photos.forEach((f) => fd.append('attachments[]', f))

  return fd
}