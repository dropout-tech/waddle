import type { Breadcrumb, ErrorEvent } from '@sentry/browser' // type-only: erased at build

/**
 * Privacy scrubbing for Sentry events. Pure functions (type-only Sentry import) so
 * they stay cheap to import and easy to reason about.
 *
 * Principle: Huddle holds private tasks / notes / calendar content. Error
 * reports may say WHAT broke and WHERE (error type, route path, platform,
 * version) but must never carry user content, tokens, emails, query strings,
 * request bodies or headers.
 */

/** Error / message text is truncated to this many characters. */
export const MAX_TEXT_LENGTH = 200

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// JWTs (Supabase access/refresh tokens) and long opaque tokens.
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/g
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g
// Anything quoted with CJK characters inside is very likely user content
// (task titles, note text) interpolated into an error message.
const QUOTED_CJK_RE = /(["'「『“‘`])[^"'」』”’`\n]*[㐀-鿿豈-﫿][^"'」』”’`\n]*(["'」』”’`])/g

/**
 * Conservative text scrub for error messages: redact emails / tokens / quoted
 * CJK text, then truncate. The error TYPE (e.g. "TypeError") is a separate
 * field and is untouched.
 */
export function scrubText(text: string | undefined | null): string | undefined {
  if (typeof text !== 'string') return undefined
  let out = text
    .replace(EMAIL_RE, '[email]')
    .replace(JWT_RE, '[token]')
    .replace(LONG_TOKEN_RE, (m) => (/^[0-9a-f-]{36}$/i.test(m) ? m : '[token]'))
    .replace(QUOTED_CJK_RE, '$1[text]$2')
  if (out.length > MAX_TEXT_LENGTH) out = `${out.slice(0, MAX_TEXT_LENGTH)}…[truncated]`
  return out
}

/** Keep origin + path only. Drops query string, hash, credentials. */
export function sanitizeUrl(raw: string | undefined | null): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  try {
    const u = new URL(raw)
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'capacitor:' || u.protocol === 'ionic:') {
      return `${u.origin === 'null' ? `${u.protocol}//${u.host}` : u.origin}${u.pathname}`
    }
    return `${u.protocol}${u.pathname}`
  } catch {
    // Relative path or odd string: cut at ? or #.
    return raw.split(/[?#]/)[0]
  }
}

/** Returns a cleaned breadcrumb, or null to drop it. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const category = crumb.category ?? ''
  // Console output and UI interaction crumbs can contain user content.
  if (category === 'console' || category.startsWith('ui.')) return null

  const out: Breadcrumb = { ...crumb }
  delete out.message
  if (crumb.data && typeof crumb.data === 'object') {
    const data: Record<string, unknown> = {}
    // Allow-list: only structural fields survive. Notably NOT request/response
    // bodies, headers, arguments, input values.
    for (const key of ['method', 'status_code', 'reason', 'url', 'from', 'to'] as const) {
      const v = crumb.data[key]
      if (v === undefined) continue
      data[key] = key === 'url' || key === 'from' || key === 'to' ? sanitizeUrl(String(v)) : v
    }
    out.data = data
  }
  return out
}

/** Returns a cleaned event. Never returns null (we keep every error). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const out: ErrorEvent = { ...event }

  if (out.message) out.message = scrubText(out.message)
  if (out.logentry?.message) out.logentry = { ...out.logentry, message: scrubText(out.logentry.message) }
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({ ...v, value: scrubText(v.value) })),
    }
  }

  if (out.request) {
    const keep: Record<string, string> = {}
    // User-Agent is needed for browser/device version; nothing else.
    for (const [k, v] of Object.entries(out.request.headers ?? {})) {
      if (k.toLowerCase() === 'user-agent') keep[k] = v
    }
    out.request = { url: sanitizeUrl(out.request.url), ...(Object.keys(keep).length ? { headers: keep } : {}) }
  }

  if (typeof out.transaction === 'string' && /^[a-z]+:\/\//i.test(out.transaction)) {
    out.transaction = sanitizeUrl(out.transaction)
  }

  if (out.breadcrumbs) {
    out.breadcrumbs = out.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter((b): b is Breadcrumb => b !== null)
  }

  delete out.user
  delete out.extra
  return out
}
