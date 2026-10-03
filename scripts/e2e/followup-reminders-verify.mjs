// Native follow-up reminders (lib/notifications syncFollowupReminders), no browser / no network.
//   node scripts/e2e/followup-reminders-verify.mjs
// Runs the real lib/notifications/index.ts under Node with a fake Capacitor LocalNotifications
// and a loader that resolves the "@/..." alias and extensionless .ts imports.
import { register } from 'node:module'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const hooks = `
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
const root = ${JSON.stringify(root)}
const stubs = {
  '@/lib/platform': 'export const isNative=()=>true; export const isDesktop=()=>false',
  '@/lib/desktop-notifications': 'export const desktopNotificationsEnabled=()=>false',
  '@/lib/meeting-reminder': 'export const ensureNotificationPermission=async()=>true; export const meetingStartAsDate=()=>null',
  '@capacitor/local-notifications': 'export const LocalNotifications=globalThis.__LN',
}
const tryFile = (base) => [base, base+'.ts', base+'/index.ts'].find((f) => existsSync(f) && !(f===base && !/\\.[a-z]+$/.test(base)))
export async function resolve(spec, ctx, next) {
  if (stubs[spec]) return { url: 'stub:' + spec, shortCircuit: true }
  let base = null
  if (spec.startsWith('@/')) base = path.join(root, spec.slice(2))
  else if (spec.startsWith('.') && ctx.parentURL?.startsWith('file:')) base = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec)
  if (base) { const f = tryFile(base); if (f) return { url: pathToFileURL(f).href, shortCircuit: true } }
  return next(spec, ctx)
}
export async function load(url, ctx, next) {
  if (url.startsWith('stub:')) return { format: 'module', source: ${'`'}\${stubs[url.slice(5)]}${'`'}, shortCircuit: true }
  return next(url, ctx)
}
`
register('data:text/javascript,' + encodeURIComponent(hooks), pathToFileURL(root + '/'))

// Fake plugin: remembers what is pending / scheduled.
let pending = []
const scheduled = []
globalThis.__LN = {
  getPending: async () => ({ notifications: pending }),
  cancel: async ({ notifications }) => { const ids = new Set(notifications.map((n) => n.id)); pending = pending.filter((n) => !ids.has(n.id)) },
  checkPermissions: async () => ({ display: globalThis.__perm ?? 'granted' }),
  schedule: async ({ notifications }) => { scheduled.push(...notifications); pending.push(...notifications) },
  addListener: async () => ({ remove() {} }),
}
globalThis.window = { localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'zh-TW' }, location: { pathname: '/', assign() {} }, addEventListener() {} }
globalThis.document = { documentElement: {} }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-TW' }, configurable: true })

const { syncFollowupReminders } = await import(pathToFileURL(path.join(root, 'lib/notifications/index.ts')).href)
let n = 0
const ok = (c, m) => { assert(c, m); n++; console.log('PASS: ' + m) }
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (k) => ymd(new Date(Date.now() + k * 86400000))
const item = (task_id, k, extra = {}) => ({ task_id, title: '報價單 ' + task_id, due_date: k === null ? null : day(k), is_completed: false, counterpart: '王經理', ...extra })

// A meeting reminder and a widget reminder already pending: must survive every follow-up sync.
pending = [{ id: 111, extra: { kind: 'meeting' } }, { id: 2100000001, extra: { kind: 'huddle-widget' } }]
await syncFollowupReminders([item('a', 1), item('b', 3), item('c', null), item('d', 2, { is_completed: true }), item('e', -2)])
const mine = () => pending.filter((p) => p.extra?.kind === 'followup')
ok(mine().length === 2, 'only dated, open, future follow-ups scheduled (a, b); undated / done / past skipped')
const first = mine()[0]
ok(first.body === '今天要追：王經理 — 報價單 a', 'body reads 今天要追：<對象> — <事項>: ' + first.body)
ok(new Date(first.schedule.at).getHours() === 9 && new Date(first.schedule.at).getMinutes() === 0 && ymd(new Date(first.schedule.at)) === day(1), 'fires at 09:00 on the due date')
ok(pending.some((p) => p.id === 111) && pending.some((p) => p.id === 2100000001), 'meeting and widget reminders untouched')
ok(mine().every((p) => p.id > 2000000000 && p.id < 2100000000), 'follow-up ids sit in their own range (2,000,000,001 .. 2,099,999,999), disjoint from meeting (<= 2e9) and widget (>= 2.1e9) ids')
// Re-sync after task b completed and a's due date moved: batch replaced.
await syncFollowupReminders([item('a', 5), item('b', 3, { is_completed: true })])
ok(mine().length === 1 && ymd(new Date(mine()[0].schedule.at)) === day(5), 'resync cancels finished task and re-times the moved one')
await syncFollowupReminders([])
ok(mine().length === 0 && pending.length === 2, 'empty list (all done / deleted / RPC missing) clears follow-up reminders only')
// Cap
await syncFollowupReminders(Array.from({ length: 30 }, (_, i) => item('x' + i, i + 1)))
ok(mine().length === 10, 'capped at 10 follow-up reminders (iOS 64 pending limit)')
// No permission: cancels but does not schedule
globalThis.__perm = 'denied'
await syncFollowupReminders([item('z', 1)])
ok(mine().length === 0, 'without notification permission nothing is scheduled (and it never asks)')
console.log(`PASS: all ${n} assertions`)
