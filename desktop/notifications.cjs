// No URLs, icons, paths or arbitrary Electron options cross this boundary.
function createNotifications({ Notification, trusted, focus, now = Date.now }) {
  const seen = new Map()
  const active = new Set()
  let lastError = null
  function status(event) {
    if (!trusted(event)) throw new Error('Untrusted notification caller')
    return { supported: Notification.isSupported(), permission: 'unknown', lastError }
  }
  function show(event, payload) {
    if (!trusted(event)) throw new Error('Untrusted notification caller')
    if (!payload || !['meeting', 'focus', 'water', 'test'].includes(payload.kind) ||
        typeof payload.id !== 'string' || !payload.id || payload.id.length > 200 ||
        typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 160 ||
        typeof payload.body !== 'string' || payload.body.length > 500 ||
        (payload.silent !== undefined && typeof payload.silent !== 'boolean')) throw new Error('Invalid notification')
    if (!Notification.isSupported()) return { status: 'unsupported' }
    const key = `${payload.kind}:${payload.id}`
    const time = now()
    for (const [id, at] of seen) if (time - at > 86400000) seen.delete(id)
    if (seen.has(key)) return { status: 'duplicate' }
    // Bound both memory and burst delivery from a malformed renderer.
    if (active.size >= 5 || [...seen.values()].filter(at => time - at < 60000).length >= 10) return { status: 'rate_limited' }
    let n
    try {
      lastError = null
      n = new Notification({ title: payload.title.replace(/\s+/g, ' ').trim(), body: payload.body.replace(/\s+/g, ' ').trim(), silent: payload.silent === true })
      active.add(n)
      seen.set(key, time)
      if (seen.size > 500) seen.delete(seen.keys().next().value)
      n.on('click', () => { focus(); n.close() })
      n.on('close', () => active.delete(n))
      n.on('failed', () => { active.delete(n); lastError = 'delivery_failed' })
      const timeout = setTimeout(() => { active.delete(n) }, 60000)
      timeout.unref?.()
      n.show()
      // OS Focus / notification settings can suppress presentation; never say delivered.
      return { status: 'submitted' }
    } catch { if (n) active.delete(n); seen.delete(key); lastError = 'delivery_failed'; return { status: 'failed' } }
  }
  function clear(event) {
    if (!trusted(event)) throw new Error('Untrusted notification caller')
    for (const n of active) n.close()
    active.clear()
  }
  return { status, show, clear }
}
module.exports = { createNotifications }
