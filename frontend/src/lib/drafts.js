const PREFIX = 'sc_draft_'

export function saveDraft(type, payload) {
  const key = PREFIX + type
  const list = loadDrafts(type)
  const item = {
    id: payload.client_uuid || payload.id || `${Date.now()}`,
    savedAt: new Date().toISOString(),
    ...payload,
  }
  const next = [item, ...list.filter((x) => x.id !== item.id)]
  localStorage.setItem(key, JSON.stringify(next))
  return item
}

export function loadDrafts(type) {
  try {
    const raw = localStorage.getItem(PREFIX + type)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function removeDraft(type, id) {
  const next = loadDrafts(type).filter((x) => x.id !== id)
  localStorage.setItem(PREFIX + type, JSON.stringify(next))
}

export function clearDrafts(type) {
  localStorage.removeItem(PREFIX + type)
}

export function loadDraft(type) {
  return loadDrafts(type)[0] || null
}

export function clearDraft(type) {
  clearDrafts(type)
}
