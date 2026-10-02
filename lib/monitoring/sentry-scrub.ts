import type { Breadcrumb, ErrorEvent, Stacktrace } from '@sentry/browser' // type-only: erased at build

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
const NON_ASCII_RE = /[^\x00-\x7F]/
// Non-ASCII text that is not inside quotes: any run of 2+ letters (accented
// Latin, Cyrillic, Arabic, ...) or any CJK / kana / hangul / pictograph.
const NON_ASCII_RUN_RE =
  /(?:(?![\x00-\x7F])[\p{L}\p{M}]){2,}|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/gu

const QUOTE_PAIRS: Record<string, string> = {
  '"': '"',
  "'": "'",
  '`': '`',
  '「': '」',
  '『': '』',
  '“': '”',
  '‘': '’',
}
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

/**
 * Quoted fragments in an error message are very likely user content (task
 * titles, note text) interpolated into it. A quoted fragment is replaced with
 * `[text]` when it contains whitespace or any non-ASCII character; a single
 * ASCII token such as "tasks_pkey" is kept (useful identifier, not prose).
 * An unclosed quote (e.g. ProseMirror's truncated `<paragraph("今天要…`) with
 * non-ASCII text after it swallows everything to the end of the string.
 */
function scrubQuoted(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    const close = QUOTE_PAIRS[ch]
    // An apostrophe inside a word (can't, user's) is not an opening quote.
    if (!close || (ch === "'" && isWordChar(text[i - 1]))) {
      out += ch
      i++
      continue
    }
    let j = i + 1
    while (j < text.length && !(text[j] === close && (close !== "'" || !isWordChar(text[j + 1])))) j++
    if (j < text.length) {
      const inner = text.slice(i + 1, j)
      out += NON_ASCII_RE.test(inner) || /\s/.test(inner) ? `${ch}[text]${close}` : `${ch}${inner}${close}`
      i = j + 1
    } else if (NON_ASCII_RE.test(text.slice(i + 1))) {
      out += `${ch}[text]`
      break
    } else {
      out += ch
      i++
    }
  }
  return out
}

/**
 * Conservative, best-effort text scrub for error messages: redact emails /
 * tokens / quoted text / non-ASCII prose, then truncate. The error TYPE (e.g.
 * "TypeError") is a separate field and is untouched. Free-form text cannot be
 * scrubbed with certainty, so this lowers the chance of leaking content; it
 * does not guarantee it.
 */
export function scrubText(text: string | undefined | null): string | undefined {
  if (typeof text !== 'string') return undefined
  let out = text
    .replace(EMAIL_RE, '[email]')
    .replace(JWT_RE, '[token]')
    .replace(LONG_TOKEN_RE, (m) => (/^[0-9a-f-]{36}$/i.test(m) ? m : '[token]'))
  out = scrubQuoted(out).replace(NON_ASCII_RUN_RE, '[text]')
  if (out.length > MAX_TEXT_LENGTH) out = `${out.slice(0, MAX_TEXT_LENGTH)}…[truncated]`
  return out
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const PATH_TOKEN_RE = /[A-Za-z0-9_-]{32,}/g

/** Replace identifiers in a URL path: UUIDs (e.g. `<user id>/<uuid>.png`) and long opaque tokens. */
function scrubPath(path: string): string {
  return path.replace(UUID_RE, ':id').replace(PATH_TOKEN_RE, ':token')
}

/**
 * Keep origin + path only (no query string, hash, credentials), with UUIDs and
 * long tokens in the path masked. Non-web schemes (data:, blob:, file:,
 * javascript:, about:, ...) keep only the scheme: their "path" is the payload.
 */
export function sanitizeUrl(raw: string | undefined | null): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  try {
    const u = new URL(raw)
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'capacitor:' || u.protocol === 'ionic:') {
      return `${u.origin === 'null' ? `${u.protocol}//${u.host}` : u.origin}${scrubPath(u.pathname)}`
    }
    return `${u.protocol}[redacted]`
  } catch {
    // Relative path or odd string: cut at ? or #.
    return scrubPath(raw.split(/[?#]/)[0])
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

/**
 * Frame file names are normally script URLs, but when the SDK has no real
 * stack (e.g. `throw 'string'`) it falls back to location.href, which can
 * carry `?code=...` — so they go through sanitizeUrl too. Source-context
 * lines are dropped.
 */
function scrubStacktrace(st: Stacktrace | undefined): Stacktrace | undefined {
  if (!st?.frames) return st
  return {
    ...st,
    frames: st.frames.map((f) => {
      const frame = { ...f }
      if (frame.filename) frame.filename = sanitizeUrl(frame.filename)
      if (frame.abs_path) frame.abs_path = sanitizeUrl(frame.abs_path)
      delete frame.vars
      delete frame.context_line
      delete frame.pre_context
      delete frame.post_context
      return frame
    }),
  }
}

/** Returns a cleaned event. Never returns null (we keep every error). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const out: ErrorEvent = { ...event }

  if (out.message) out.message = scrubText(out.message)
  if (out.logentry?.message) out.logentry = { ...out.logentry, message: scrubText(out.logentry.message) }
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({
        ...v,
        value: scrubText(v.value),
        ...(v.stacktrace ? { stacktrace: scrubStacktrace(v.stacktrace) } : {}),
      })),
    }
  }
  if (out.threads?.values) {
    out.threads = {
      ...out.threads,
      values: out.threads.values.map((t) => (t.stacktrace ? { ...t, stacktrace: scrubStacktrace(t.stacktrace) } : t)),
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
