// Browser-side mapping of Google events → calendar overlay pieces
// (lib/google-calendar.ts: mapGoogleEvents / clampToGrid), run in Node with
// the viewer's clock pinned to Asia/Taipei. No network.
//   node scripts/test/google-calendar-map-verify.mjs
process.env.TZ = 'Asia/Taipei'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compile = (rel) => ts.transpileModule(fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const load = (rel, modules) => { const ctx = { exports: {}, require: (id) => { if (!(id in modules)) throw Error('unexpected import ' + id); return modules[id] }, Date, Number, Math, String, Map, Set, Intl }; vm.runInNewContext(compile(rel), ctx); return ctx.exports }
const utils = load('lib/calendar-utils.ts', {})
const gc = load('lib/google-calendar.ts', { '@/lib/calendar-utils': utils, '@/lib/supabase/client': { createClient: () => ({}) } })

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else fail++; console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`) }
const base = { location: null, response_status: 'accepted', html_link: null }
const pieces = (ev) => gc.mapGoogleEvents([{ ...base, ...ev }]).map((p) => `${p.scheduledDate} ${p.scheduledStartTime ?? 'ALLDAY'}-${p.scheduledEndTime ?? ''}`)

ok(pieces({ id: 'a', title: 'A', start: '2026-09-29T02:00:00Z', end: '2026-09-29T03:00:00Z', all_day: false }).join('|') === '2026-09-29 10:00-11:00', 'UTC dateTime converted to local (Taipei) wall time')
ok(pieces({ id: 'b', title: 'B', start: '2026-09-29T09:00:00-07:00', end: '2026-09-29T10:00:00-07:00', all_day: false }).join('|') === '2026-09-30 00:00-01:00', 'foreign offset lands on the right local day')
ok(pieces({ id: 'c', title: 'C', start: '2026-09-29T22:30:00+08:00', end: '2026-09-30T01:30:00+08:00', all_day: false }).join('|') === '2026-09-29 22:30-24:00|2026-09-30 00:00-01:30', 'overnight event split at local midnight')
ok(pieces({ id: 'd', title: 'D', start: '2026-09-29T22:00:00+08:00', end: '2026-09-30T00:00:00+08:00', all_day: false }).join('|') === '2026-09-29 22:00-24:00', 'ending exactly at midnight → no empty next-day piece')
ok(pieces({ id: 'e', title: 'E', start: '2026-09-29T20:00:00+08:00', end: '2026-10-02T09:00:00+08:00', all_day: false }).join('|') === '2026-09-29 20:00-24:00|2026-09-30 ALLDAY-|2026-10-01 ALLDAY-|2026-10-02 00:00-09:00', 'multi-day timed event: full middle days become all-day chips')
ok(pieces({ id: 'f', title: 'F', start: '2026-09-29', end: '2026-09-30', all_day: true }).join('|') === '2026-09-29 ALLDAY-', 'one-day all-day event (exclusive end) → one chip')
ok(pieces({ id: 'g', title: 'G', start: '2026-09-29', end: '2026-10-02', all_day: true }).join('|') === '2026-09-29 ALLDAY-|2026-09-30 ALLDAY-|2026-10-01 ALLDAY-', 'three-day all-day event → three chips')
ok(pieces({ id: 'h', title: 'H', start: 'garbage', end: 'x', all_day: false }).length === 0 && pieces({ id: 'i', title: 'I', start: '2026-09-29', end: 'nope', all_day: true }).length === 0, 'malformed events skipped, no throw')
ok(pieces({ id: 'j', title: 'J', start: '2026-09-29T10:00:00+08:00', end: '2026-09-29T10:00:00+08:00', all_day: false }).join('|') === '2026-09-29 10:00-10:15', 'zero-length event still renders a short block')
ok(pieces({ id: 'k', title: 'K', start: '2020-01-01', end: '2030-01-01', all_day: true }).length === 62, 'absurdly long event capped at 62 day pieces')
const [p] = gc.mapGoogleEvents([{ ...base, id: 'z', title: '', start: '2026-09-29T10:00:00+08:00', end: '2026-09-29T11:00:00+08:00', all_day: false, response_status: 'needsAction', html_link: 'https://www.google.com/calendar/event?eid=z' }])
ok(p.id.startsWith('gcal:') && p.isPeerEvent === true && p.google.responseStatus === 'needsAction' && p.google.htmlLink.endsWith('eid=z') && p.title === '', 'overlay piece: gcal: id prefix, peer-shaped, carries reply + link')
const ids = gc.mapGoogleEvents([{ ...base, id: 'c', title: 'C', start: '2026-09-29T22:30:00+08:00', end: '2026-09-30T01:30:00+08:00', all_day: false }]).map((x) => x.id)
ok(new Set(ids).size === ids.length, 'split pieces have unique ids (React keys / column packing)')
ok(JSON.stringify(gc.clampToGrid('22:30', '24:00', 7, 23)) === '{"start":"22:30","end":"23:00"}' && gc.clampToGrid('00:00', '01:30', 7, 23) === null && JSON.stringify(gc.clampToGrid('06:00', '08:00', 7, 23)) === '{"start":"07:00","end":"08:00"}', 'clampToGrid trims to the visible hours, null when fully outside')

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} — PASS ${pass} / FAIL ${fail} (Google overlay mapping, TZ=Asia/Taipei)`)
process.exit(fail ? 1 : 0)
