// Google Calendar (read-only) core helpers: AES-GCM sealing, range guard,
// event projection. Keys are generated per run; no network.
//   node scripts/test/google-calendar-core-verify.mjs
import { randomBytes } from 'node:crypto'
import { SCOPE, MAX_RANGE_DAYS, seal, unseal, hash, parseRange, parseBusyRange, normalizeEvents } from '../../supabase/functions/google-calendar/core.mjs'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`) }
const rejects = async (p) => { try { await p; return false } catch { return true } }
const throws = (fn) => { try { fn(); return false } catch { return true } }

const secret = randomBytes(32).toString('base64url')
const userA = '00000000-0000-4000-8000-00000000000a', userB = '00000000-0000-4000-8000-00000000000b'
const token = 'refresh-' + randomBytes(16).toString('hex')
const sealed = await seal(token, secret, userA)
ok(await unseal(sealed, secret, userA) === token, 'seal → unseal round-trip returns the original token')
ok(!sealed.includes(token), 'ciphertext does not contain the plaintext')
ok(await seal(token, secret, userA) !== sealed, 'fresh IV per seal (two seals differ)')
ok(await rejects(unseal(sealed, secret, userB)), 'unseal with another user id as additionalData fails')
ok(await rejects(unseal(sealed, randomBytes(32).toString('base64url'), userA)), 'unseal with another key fails')
ok(await rejects(unseal(sealed.slice(0, -3) + 'abc', secret, userA)), 'tampered ciphertext fails')
ok(await rejects(seal(token, randomBytes(16).toString('base64url'), userA)), '16-byte key rejected (32 bytes required)')
ok((await hash('state')).length === 43 && !(await hash('state')).includes('='), 'hash is base64url SHA-256 (43 chars)')
ok(SCOPE === 'https://www.googleapis.com/auth/calendar.events.owned.readonly', 'SCOPE is calendar.events.owned.readonly')

const t0 = '2026-09-01T00:00:00+08:00'
const plus = (d) => new Date(Date.parse(t0) + d * 86400000).toISOString()
ok(parseRange(t0, plus(MAX_RANGE_DAYS)).timeMin === '2026-08-31T16:00:00.000Z', `${MAX_RANGE_DAYS}-day window accepted, normalised to UTC`)
ok(throws(() => parseRange(t0, plus(MAX_RANGE_DAYS + 0.01))), 'just over 120 days rejected')
ok(throws(() => parseRange('2026-09-01', plus(3))), 'date-only (no time/offset) rejected')
ok(throws(() => parseRange(plus(3), t0)), 'reversed window rejected')
ok(throws(() => parseRange(undefined, plus(3))), 'missing time_min rejected')

const now = new Date('2026-09-29T12:00:00+08:00'), at = (d) => new Date(now.getTime() + d * 86400000).toISOString()
ok(!throws(() => parseBusyRange(at(-0.5), at(14.5), now)), 'busy window: yesterday-evening → +14.5 days accepted')
ok(throws(() => parseBusyRange(at(-365), at(-351), now)), 'busy window: a past year rejected (no history paging)')
ok(throws(() => parseBusyRange(at(-1.01), at(5), now)), 'busy window: starting more than 1 day ago rejected')
ok(throws(() => parseBusyRange(at(300), at(310), now)), 'busy window: 300 days ahead rejected')
ok(throws(() => parseBusyRange(at(80), at(92.01), now)) && !throws(() => parseBusyRange(at(80), at(92), now)), 'busy window: horizon = 90 days + 2 slack')
ok(throws(() => parseBusyRange(at(1), at(17.01), now)) && !throws(() => parseBusyRange(at(1), at(17), now)), 'busy window: width ≤ 16 days')

const ev = normalizeEvents([
  { id: 'x', status: 'confirmed', summary: 'A', start: { dateTime: '2026-09-02T23:00:00+08:00' }, end: { dateTime: '2026-09-03T01:00:00+08:00' }, attendees: [{ self: true, responseStatus: 'tentative' }], description: 'secret notes', organizer: { email: 'boss@example.com' } },
  { id: 'bad', status: 'confirmed', start: { dateTime: 'nope' }, end: { dateTime: 'nope' } },
  { id: 'noend', status: 'confirmed', start: { date: '2026-09-02' } },
])
ok(ev.length === 1 && ev[0].response_status === 'tentative', 'malformed / end-less events skipped; tentative kept')
ok(!JSON.stringify(ev).includes('secret notes') && !JSON.stringify(ev).includes('boss@example.com'), 'description / organizer never projected')

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} — PASS ${pass} / FAIL ${fail} (Google Calendar core)`)
process.exit(fail ? 1 : 0)
