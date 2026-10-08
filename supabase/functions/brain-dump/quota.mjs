// Pure helpers for brain-dump (丟給企鵝), shared by index.ts (Deno) and
// scripts/tests/brain-dump-function.test.mjs (node --test). No I/O here.
//
// Model and cost accounting are meeting-import's — same model, same price
// table — so they are re-exported rather than copied.
export { MODEL, usageRecord } from '../meeting-import/quota.mjs'

/** Free members: AI splits per day. Pro (huddle_ops.has_pro): no daily cap. */
export const FREE_DAILY_LIMIT = 20

/** Asia/Taipei calendar date (YYYY-MM-DD) for an instant. */
export function taipeiDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}

/** The client sends its own local "today" (relative due dates hang off it).
 *  Accept it only within one day of the Taipei date, like the database does. */
export function plausibleToday(today, now = new Date()) {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false
  const t = Date.parse(today + 'T00:00:00Z')
  const base = Date.parse(taipeiDay(now) + 'T00:00:00Z')
  return Number.isFinite(t) && Math.abs(t - base) <= 86400000
}

// reserve_brain_dump error message → response code and HTTP status.
const RESERVATION_ERRORS = [
  ['DAILY_LIMIT', 429],
  ['RATE_LIMIT', 429],
  ['AI_PAUSED', 503],
  ['INVALID_INPUT', 400],
]
export function reservationError(message) {
  const text = String(message ?? '')
  const hit = RESERVATION_ERRORS.find(([code]) => text.includes(code))
  return hit ? { code: hit[0], status: hit[1] } : { code: 'DATABASE_ERROR', status: 503 }
}

/** What the reservation / status RPC returns → what the client is told. */
export function quotaView(raw) {
  const used = Number.isInteger(raw?.used) && raw.used >= 0 ? raw.used : 0
  const limit = raw?.limit === null ? null : Number.isInteger(raw?.limit) && raw.limit > 0 ? raw.limit : FREE_DAILY_LIMIT
  return { used, limit, remaining: limit === null ? null : Math.max(0, limit - used) }
}
