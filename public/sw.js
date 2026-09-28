/*
 * Huddle service worker — web/PWA only (registered by components/pwa/pwa-setup.tsx,
 * never inside the Capacitor app or the Electron desktop shell).
 *
 * Strategy
 *  - Navigations (HTML): network-only, with the bilingual /offline.html as the
 *    fallback when the network fails. HTML is deliberately NOT served from
 *    cache: the board has no offline data layer, and a cached shell opened
 *    offline shows an EMPTY board after ~10 s (getUser fails → no rows), which
 *    reads as "my tasks are gone". The offline page reloads itself as soon as
 *    the connection returns. (Measured 2026-09-28, scripts/e2e/pwa-verify.mjs.)
 *    Because HTML always comes from the network, a new deploy is live on the
 *    very next launch — there is no stale-shell state to get stuck in.
 *  - /_next/static/*: cache-first. Content-hashed URLs can never be stale, so
 *    cold launches on a slow phone network skip re-downloading the JS/CSS.
 *    Old deploys' files are trimmed FIFO (STATIC_MAX).
 *  - Everything else is NOT intercepted: cross-origin requests (Supabase REST /
 *    auth / storage / realtime, Google, CDNs), non-GET, Range (video),
 *    Next RSC fetches, /auth/*, /api/*, and anything carrying Authorization.
 *    User data therefore never lands in Cache Storage.
 *
 * Updates: skipWaiting + clients.claim, no "reload" prompt. Bump VERSION only
 * when this file's logic changes; the page calls registration.update() when it
 * returns to the foreground, the new worker takes over immediately and drops
 * the old shell cache. Safe mid-session because hashed assets stay cached.
 *
 * Kill switch: replace this file with one that calls
 * self.registration.unregister() in `activate` and deploy.
 */
const VERSION = 'v1'
const SHELL = `huddle-shell-${VERSION}`
const STATIC = 'huddle-static'
const STATIC_MAX = 400
const OFFLINE_URL = '/offline.html'
const SHELL_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/app-icon-maskable-192.png',
  '/app-icon-maskable-512.png',
]
const SHELL_SET = new Set(SHELL_ASSETS)
// Auth callbacks and password resets carry one-time codes; leave them to the
// browser untouched.
const BYPASS_PREFIXES = ['/api/', '/auth/', '/reset-password', '/rest/', '/storage/', '/functions/']

const isStatic = (url) => url.pathname.startsWith('/_next/static/')
const bypass = (url) => BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p))

/** Every /_next/static asset referenced by an HTML document (tags + RSC payload). */
function assetsIn(html) {
  const out = new Set()
  const re = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)<>]+/g
  for (const m of html.match(re) || []) {
    out.add('/_next/' + m.replace(/^\/_next\//, ''))
  }
  return [...out]
}

async function trimStatic() {
  const cache = await caches.open(STATIC)
  const keys = await cache.keys()
  const extra = keys.length - STATIC_MAX
  for (let i = 0; i < extra; i++) await cache.delete(keys[i])
}

async function cacheStatic(urls) {
  const cache = await caches.open(STATIC)
  await Promise.allSettled(
    urls.map(async (u) => {
      const url = new URL(u, self.location.origin)
      if (url.origin !== self.location.origin || !isStatic(url)) return
      if (await cache.match(url.href)) return
      const res = await fetch(url.href)
      if (res.ok) await cache.put(url.href, res)
    })
  )
  await trimStatic()
}

async function precache() {
  const shell = await caches.open(SHELL)
  await shell.addAll(SHELL_ASSETS)
  // Warm the hashed JS/CSS of the start page. Failure must not block install.
  try {
    const res = await fetch('/', { cache: 'no-store', credentials: 'same-origin' })
    if (res.ok) await cacheStatic(assetsIn(await res.text()))
  } catch {
    /* offline during install — runtime caching fills in later */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((n) => n.startsWith('huddle-') && n !== SHELL && n !== STATIC).map((n) => caches.delete(n))
      )
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable() } catch { /* unsupported */ }
      }
      await self.clients.claim()
      await trimStatic()
    })()
  )
})

// The page reports the hashed assets it actually loaded (including lazy
// chunks fetched before this worker controlled it).
self.addEventListener('message', (event) => {
  const data = event.data
  if (data && data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
    event.waitUntil(cacheStatic(data.urls.slice(0, 500)))
  }
})

async function handleNavigation(event) {
  try {
    return (await event.preloadResponse) || (await fetch(event.request))
  } catch {
    const offline = await caches.match(OFFLINE_URL)
    return offline || Response.error()
  }
}

async function handleStatic(event) {
  const cache = await caches.open(STATIC)
  const hit = await cache.match(event.request, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(event.request)
  if (res.ok && res.type === 'basic') {
    event.waitUntil(cache.put(event.request, res.clone()).then(trimStatic))
  }
  return res
}

async function handleShellAsset(event) {
  try {
    return await fetch(event.request)
  } catch {
    const hit = await caches.match(event.request, { ignoreVary: true })
    return hit || Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase, Google, CDNs
  if (bypass(url)) return
  if (req.headers.has('authorization') || req.headers.has('range')) return
  if (req.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(event))
    return
  }
  if (isStatic(url)) {
    event.respondWith(handleStatic(event))
    return
  }
  if (SHELL_SET.has(url.pathname)) {
    event.respondWith(handleShellAsset(event))
  }
})
