// Peta Google tiruan untuk tes (jsdom tidak bisa menjalankan Google Maps sungguhan).
export const instances = []

class FakeMap {
  constructor(el, opts) {
    this.el = el
    this.opts = opts
    this.center = { ...opts.center }
    this.zoom = opts.zoom
    this.listeners = {}
    instances.push(this)
  }

  addListener(name, fn) {
    ;(this.listeners[name] ||= []).push(fn)
    return { remove: () => { this.listeners[name] = (this.listeners[name] || []).filter((f) => f !== fn) } }
  }

  getCenter() {
    return { lat: () => this.center.lat, lng: () => this.center.lng }
  }

  setCenter(c) { this.center = { lat: c.lat, lng: c.lng } }
  getZoom() { return this.zoom }
  setZoom(z) { this.zoom = z }

  // Pembantu tes
  emit(name) { (this.listeners[name] || []).forEach((f) => f()) }
  dragTo(c) {
    this.emit('dragstart')
    this.center = { lat: c.lat, lng: c.lng }
    this.emit('idle')
  }
}

export const fakeMaps = { Map: FakeMap, ControlPosition: { RIGHT_TOP: 7 } }
export const resetFake = () => { instances.length = 0 }