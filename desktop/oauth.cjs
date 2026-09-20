const crypto = require('node:crypto')
const fs = require('node:fs')
const TTL = 5 * 60 * 1000
const SCHEME = 'huddle-desktop:'
function createOAuth({ file, origin, openExternal, now = Date.now }) {
  function clear() { try { fs.unlinkSync(file) } catch {} }
  function read() { try { const p = JSON.parse(fs.readFileSync(file, 'utf8')); return p.expires > now() ? p : null } catch { return null } }
  return {
    begin() {
      const state = crypto.randomBytes(32).toString('hex')
      fs.writeFileSync(file, JSON.stringify({ state, expires: now() + TTL }), { mode: 0o600 })
      return state
    },
    cancel: clear,
    async open(raw) {
      const u = new URL(raw)
      const redirect = new URL(u.searchParams.get('redirect_to'))
      const pending = read()
      if (!pending || u.protocol !== 'https:' || u.hostname !== 'jnikcndiexjojgvicohf.supabase.co' || u.port || u.username || u.password || u.pathname !== '/auth/v1/authorize' || !['google', 'apple'].includes(u.searchParams.get('provider')) || !u.searchParams.get('code_challenge') || u.searchParams.get('code_challenge_method') !== 's256' || redirect.origin !== origin || redirect.pathname !== '/auth/callback' || redirect.searchParams.get('desktop') !== '1' || redirect.searchParams.get('desktop_state') !== pending.state) throw new Error('無效的桌面登入要求')
      await openExternal(u.href)
    },
    consume(raw) {
      try {
        const u = new URL(raw)
        const pending = read()
        if (!pending || u.protocol !== SCHEME || u.hostname !== 'auth' || u.pathname !== '/callback' || u.username || u.password || u.port || u.hash || u.searchParams.get('state') !== pending.state) return null
        const code = u.searchParams.get('code')
        const error = u.searchParams.get('error')
        if ((!code && !error) || (code && (!/^[A-Za-z0-9._~-]{1,2048}$/.test(code))) || [...u.searchParams.keys()].some(k => !['state','code','error'].includes(k))) return null
        clear()
        const result = new URL('/auth/callback', origin)
        result.searchParams.set('desktop_return', '1')
        result.searchParams.set('desktop_state', pending.state)
        if (code) result.searchParams.set('code', code)
        if (error) result.searchParams.set('error', 'desktop_oauth_failed')
        return result.href
      } catch { return null }
    },
  }
}
module.exports = { createOAuth, TTL }
