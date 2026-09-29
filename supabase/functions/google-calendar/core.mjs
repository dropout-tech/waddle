// Pure helpers for the read-only Google Calendar Edge Function. Plain ESM with
// Web Crypto only, so the same file runs in Deno (Edge runtime) and in Node
// (scripts/test/google-calendar-*-verify.mjs).

/** Narrowest scope that can read the primary calendar ("See the events on Google calendars you own"). */
export const SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned.readonly'
/** Largest [time_min, time_max) window one `events` call may ask for. */
export const MAX_RANGE_DAYS = 120
/** Hard stop on Google pagination (250 items per page → at most 5000 events). */
export const MAX_PAGES = 20
export const PAGE_SIZE = 250

const enc = new TextEncoder()
export const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
export async function hash(value) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))) }

// AES-GCM with the owner's user id as additional data: a ciphertext copied to
// another user's row cannot be decrypted.
export async function seal(value, secret, owner) {
  const raw = unb64(secret); if (raw.length !== 32) throw Error('configuration_invalid')
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']); const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(owner) }, key, enc.encode(value))
  return `${b64(iv)}.${b64(new Uint8Array(data))}`
}
export async function unseal(value, secret, owner) {
  const [iv, data] = value.split('.'); const key = await crypto.subtle.importKey('raw', unb64(secret), 'AES-GCM', false, ['decrypt'])
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(owner) }, key, unb64(data)))
}

/** Validates the requested window. Throws 'invalid_range' on anything odd. */
export function parseRange(timeMin, timeMax) {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/
  if (typeof timeMin !== 'string' || typeof timeMax !== 'string' || !iso.test(timeMin) || !iso.test(timeMax)) throw Error('invalid_range')
  const from = new Date(timeMin), to = new Date(timeMax)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw Error('invalid_range')
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86400000) throw Error('invalid_range')
  return { timeMin: from.toISOString(), timeMax: to.toISOString() }
}

const RESPONSES = new Set(['accepted', 'tentative', 'needsAction'])
const DATE = /^\d{4}-\d{2}-\d{2}$/
// Only Google's own calendar web links are passed through (never javascript: etc.).
const safeLink = (url) => {
  if (typeof url !== 'string') return null
  try { const u = new URL(url); return u.protocol === 'https:' && /(^|\.)google\.com$/.test(u.hostname) ? u.href : null } catch { return null }
}

/** Max people (caller included) per `busy` call — same cap as get_shared_meeting_busy. */
export const MAX_BUSY_PEOPLE = 11

/**
 * Google items → busy intervals for the free-slot search. Output is
 * {start, end} ONLY (ISO dateTime, or YYYY-MM-DD for all-day) — no title,
 * place, link or event id ever leaves this function. Skips cancelled events,
 * events the calendar owner declined, "show as available" (transparent)
 * events and working-location markers.
 */
export function normalizeBusy(items) {
  const out = []
  for (const ev of items || []) {
    if (!ev || ev.status === 'cancelled' || ev.transparency === 'transparent' || ev.eventType === 'workingLocation') continue
    const self = Array.isArray(ev.attendees) ? ev.attendees.find((a) => a && a.self) : undefined
    if (self?.responseStatus === 'declined') continue
    const allDay = !!(ev.start?.date && !ev.start?.dateTime)
    const start = allDay ? ev.start.date : ev.start?.dateTime
    const end = allDay ? ev.end?.date : ev.end?.dateTime
    if (typeof start !== 'string' || typeof end !== 'string') continue
    if (allDay ? !DATE.test(start) || !DATE.test(end) || end <= start : !(Date.parse(end) > Date.parse(start))) continue
    out.push({ start, end })
  }
  return out
}

/**
 * Google `events.list` items → the minimal read-only projection returned to
 * the browser. Drops cancelled events, events the user declined, and
 * working-location markers (a status, not a meeting). Nothing else leaves the
 * function: no attendees, organizer, description or conference data.
 */
export function normalizeEvents(items) {
  const out = []
  for (const ev of items || []) {
    if (!ev || typeof ev.id !== 'string' || ev.status === 'cancelled') continue
    if (ev.eventType === 'workingLocation') continue
    const self = Array.isArray(ev.attendees) ? ev.attendees.find((a) => a && a.self) : undefined
    if (self?.responseStatus === 'declined') continue
    const allDay = !!(ev.start?.date && !ev.start?.dateTime)
    const start = allDay ? ev.start.date : ev.start?.dateTime
    const end = allDay ? ev.end?.date : ev.end?.dateTime
    if (typeof start !== 'string' || typeof end !== 'string') continue
    if (allDay ? !DATE.test(start) || !DATE.test(end) : Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) continue
    out.push({
      id: ev.id,
      title: typeof ev.summary === 'string' ? ev.summary : '',
      start,
      end,
      all_day: allDay,
      location: typeof ev.location === 'string' && ev.location ? ev.location : null,
      response_status: RESPONSES.has(self?.responseStatus) ? self.responseStatus : null,
      html_link: safeLink(ev.htmlLink),
    })
  }
  return out
}
