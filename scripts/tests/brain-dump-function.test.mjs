// Pure logic of supabase/functions/brain-dump: contract validation, date
// resolution (meeting-import's resolveDue), quota helpers.
// Run: node --test scripts/tests/brain-dump-function.test.mjs
// The Deno sources import zod as "npm:zod@3.24.1"; here they are transpiled
// with the project's TypeScript and pointed at node_modules' zod.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { FREE_DAILY_LIMIT, MODEL, plausibleToday, quotaView, reservationError, taipeiDay, usageRecord } from '../../supabase/functions/brain-dump/quota.mjs'

const require = createRequire(import.meta.url)
const zod = pathToFileURL(require.resolve('zod')).href
const dir = mkdtempSync(join(tmpdir(), 'huddle-brain-dump-fn-'))
mkdirSync(join(dir, 'meeting-import'))
mkdirSync(join(dir, 'brain-dump'))
for (const [from, to] of [
  ['supabase/functions/meeting-import/contract.ts', 'meeting-import/contract.mjs'],
  ['supabase/functions/brain-dump/contract.ts', 'brain-dump/contract.mjs'],
]) {
  const src = readFileSync(from, 'utf8')
    .replaceAll('npm:zod@3.24.1', zod)
    .replace('../meeting-import/contract.ts', '../meeting-import/contract.mjs')
  writeFileSync(join(dir, to), ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText)
}
const C = await import(pathToFileURL(join(dir, 'brain-dump/contract.mjs')).href)
test.after(() => rmSync(dir, { recursive: true, force: true }))

const TEXT = '嗯…明天要回康庭的信、下午去銀行，週五前把報價改完 一小時，還有記得運動。Call mom by Friday'
// Saturday 2026-10-03
const TODAY = '2026-10-03'
const item = (o) => ({ title: '', note: '', due: { kind: 'none' }, dueEvidence: '', source: '', ...o })

test('valid model output → titles, notes and dates resolved in code', () => {
  const items = C.validateItems({
    items: [
      item({ title: '回康庭的信', due: { kind: 'relative_days', days: 1 }, dueEvidence: '明天', source: '明天要回康庭的信' }),
      item({ title: '去銀行', due: { kind: 'relative_days', days: 0 }, dueEvidence: '下午', source: '下午去銀行' }),
      item({ title: '把報價改完', note: '大約一小時', due: { kind: 'weekday', weekday: 5, week: 'this' }, dueEvidence: '週五前', source: '週五前把報價改完 一小時' }),
      item({ title: '運動', source: '記得運動' }),
      item({ title: 'Call mom', due: { kind: 'weekday', weekday: 5, week: 'this' }, dueEvidence: 'by Friday', source: 'Call mom by Friday' }),
    ],
  }, TEXT, TODAY)
  assert.deepEqual(items, [
    { title: '回康庭的信', dueDate: '2026-10-04', note: '' },
    { title: '去銀行', dueDate: '2026-10-03', note: '' },
    // Saturday: this week's Friday has passed → next Friday (resolveDue)
    { title: '把報價改完', dueDate: '2026-10-09', note: '大約一小時' },
    { title: '運動', dueDate: '', note: '' },
    { title: 'Call mom', dueDate: '2026-10-09', note: '' },
  ])
})

test('invented sources, fillers and duplicates are dropped', () => {
  const items = C.validateItems({
    items: [
      item({ title: '嗯', source: '嗯' }),
      item({ title: '買機票', source: '下週去東京買機票' }),
      item({ title: '去銀行', source: '下午去銀行' }),
      item({ title: '去 銀行', source: '去銀行' }),
      item({ title: '   ', source: '運動' }),
    ],
  }, TEXT, TODAY)
  assert.deepEqual(items.map((x) => x.title), ['去銀行'])
})

test('a due without matching evidence is discarded; vague wording never becomes a date', () => {
  const items = C.validateItems({
    items: [
      item({ title: '運動', due: { kind: 'relative_days', days: 3 }, dueEvidence: '', source: '記得運動' }),
      item({ title: '去銀行', due: { kind: 'relative_days', days: 2 }, dueEvidence: '幾天', source: '下午去銀行' }),
      item({ title: 'Call mom', due: { kind: 'relative_days', days: 3 }, dueEvidence: 'some', source: 'Call mom by Friday' }),
    ],
  }, TEXT + ' some', TODAY)
  assert.ok(items.every((x) => x.dueDate === ''), JSON.stringify(items))
})

test('never a due date before today; literal dates and "next" weekdays', () => {
  const text = '10/9 交件、9/1 繳費、下週一開會'
  const items = C.validateItems({
    items: [
      item({ title: '交件', due: { kind: 'date', date: '2026-10-09' }, dueEvidence: '10/9', source: '10/9 交件' }),
      item({ title: '繳費', due: { kind: 'date', date: '2026-09-01' }, dueEvidence: '9/1', source: '9/1 繳費' }),
      item({ title: '開會', due: { kind: 'weekday', weekday: 1, week: 'next' }, dueEvidence: '下週一', source: '下週一開會' }),
    ],
  }, text, TODAY)
  assert.deepEqual(items.map((x) => x.dueDate), ['2026-10-09', '', '2026-10-05'])
})

test('at most 20 items; oversized or malformed output is rejected', () => {
  const many = Array.from({ length: 30 }, (_, i) => item({ title: `事情${i}`, source: TEXT.slice(0, 5) }))
  assert.equal(C.validateItems({ items: many }, TEXT, TODAY).length, 20)
  assert.throws(() => C.validateItems({ tasks: [] }, TEXT, TODAY))
  assert.throws(() => C.validateItems({ items: [{ title: 'x' }] }, TEXT, TODAY))
})

test('request schemas: text 1–4000 chars, valid date, known language', () => {
  assert.ok(C.splitRequest.safeParse({ action: 'split', text: '買牛奶', today: TODAY }).success)
  assert.equal(C.splitRequest.parse({ action: 'split', text: 'x', today: TODAY }).lang, 'zh-TW')
  assert.ok(!C.splitRequest.safeParse({ action: 'split', text: '   ', today: TODAY }).success)
  assert.ok(!C.splitRequest.safeParse({ action: 'split', text: 'x'.repeat(4001), today: TODAY }).success)
  assert.ok(!C.splitRequest.safeParse({ action: 'split', text: 'x', today: '2026-02-30' }).success)
  assert.ok(!C.splitRequest.safeParse({ action: 'split', text: 'x', today: TODAY, lang: 'fr' }).success)
  assert.ok(C.statusRequest.safeParse({ action: 'status', today: TODAY }).success)
})

test('json schema is strict and reuses meeting-import due shape', () => {
  const s = C.outputSchema.properties.items.items
  assert.equal(s.additionalProperties, false)
  assert.deepEqual(s.required, ['title', 'note', 'due', 'dueEvidence', 'source'])
  assert.equal(s.properties.due.anyOf.length, 4)
  assert.match(C.todayWeekday(TODAY), /星期六 \/ Saturday/)
})

test('quota helpers', () => {
  assert.equal(FREE_DAILY_LIMIT, 20)
  assert.equal(MODEL, 'gpt-4.1-mini')
  assert.equal(usageRecord(undefined).model, MODEL)
  // Taipei day flips at 16:00 UTC
  assert.equal(taipeiDay(new Date('2026-10-03T15:59:59Z')), '2026-10-03')
  assert.equal(taipeiDay(new Date('2026-10-03T16:00:00Z')), '2026-10-04')
  const now = new Date('2026-10-03T04:00:00Z')
  assert.ok(plausibleToday('2026-10-03', now))
  assert.ok(plausibleToday('2026-10-02', now))
  assert.ok(plausibleToday('2026-10-04', now))
  assert.ok(!plausibleToday('2026-10-05', now))
  assert.ok(!plausibleToday('nope', now))
  assert.deepEqual(reservationError('ERROR: DAILY_LIMIT'), { code: 'DAILY_LIMIT', status: 429 })
  assert.deepEqual(reservationError('RATE_LIMIT'), { code: 'RATE_LIMIT', status: 429 })
  assert.deepEqual(reservationError('AI_PAUSED'), { code: 'AI_PAUSED', status: 503 })
  assert.deepEqual(reservationError('boom'), { code: 'DATABASE_ERROR', status: 503 })
  assert.deepEqual(quotaView({ used: 3, limit: 20 }), { used: 3, limit: 20, remaining: 17 })
  assert.deepEqual(quotaView({ used: 99, limit: null }), { used: 99, limit: null, remaining: null })
  assert.deepEqual(quotaView({ used: 25, limit: 20 }), { used: 25, limit: 20, remaining: 0 })
  assert.deepEqual(quotaView(null), { used: 0, limit: 20, remaining: 20 })
})
