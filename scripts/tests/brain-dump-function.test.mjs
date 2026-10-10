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
// The on-device parser (no '@/' imports) — only to prove it and the function agree on 24h conversion.
writeFileSync(join(dir, 'parse.mjs'), ts.transpileModule(readFileSync('lib/brain-dump/parse.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText)
const C = await import(pathToFileURL(join(dir, 'brain-dump/contract.mjs')).href)
const P = await import(pathToFileURL(join(dir, 'parse.mjs')).href)
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
  assert.deepEqual(s.required, [
    'title', 'note', 'due', 'dueEvidence', 'source', 'time', 'timeEvidence', 'durationMinutes', 'durationEvidence',
  ])
  // strict mode: every property is required (no optional keys)
  assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort())
  assert.equal(s.properties.due.anyOf.length, 4)
  assert.equal(s.properties.time.anyOf.length, 3)
  for (const branch of s.properties.time.anyOf) {
    assert.equal(branch.additionalProperties, false)
    assert.deepEqual([...branch.required].sort(), Object.keys(branch.properties).sort())
  }
  assert.deepEqual(s.properties.time.anyOf[2].properties.part.enum, ['morning', 'noon', 'afternoon', 'evening'])
  assert.deepEqual(s.properties.time.anyOf[1].properties.meridiem.enum, ['am', 'pm', 'none'])
  assert.deepEqual(s.properties.durationMinutes.type, ['integer', 'null'])
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

// ───────────────────────── time of day & duration (排進行事曆) ─────────────────────────

const tItem = (o) => item({ time: { kind: 'none' }, timeEvidence: '', durationMinutes: null, durationEvidence: '', ...o })
const clock = (hour, minute, meridiem) => ({ kind: 'clock', hour, minute, meridiem })
const run = (text, o) => C.validateItems({ items: [tItem({ title: 'x', source: text, ...o })] }, text, TODAY)[0]

test('a model answer without the new fields still parses (older prompt / cached output) → nothing scheduled', () => {
  const [x] = C.validateItems({ items: [item({ title: '去銀行', source: '下午去銀行' })] }, TEXT, TODAY)
  assert.deepEqual(x, { title: '去銀行', dueDate: '', note: '' })
  assert.ok(!('time' in x) && !('durationMinutes' in x))
})

test('clock time: spoken hour → 24h in code, with the 1–7 → afternoon rule when no 上午/下午', () => {
  assert.deepEqual(run('下午三點去銀行', { time: clock(3, 0, 'pm'), timeEvidence: '下午三點' }).time, { kind: 'clock', time: '15:00' })
  assert.deepEqual(run('三點回信', { time: clock(3, 0, 'none'), timeEvidence: '三點' }).time, { kind: 'clock', time: '15:00' })
  assert.deepEqual(run('9點開會', { time: clock(9, 0, 'none'), timeEvidence: '9點' }).time, { kind: 'clock', time: '09:00' })
  assert.deepEqual(run('早上9點半開會', { time: clock(9, 30, 'am'), timeEvidence: '早上9點半' }).time, { kind: 'clock', time: '09:30' })
  assert.deepEqual(run('晚上11點45分看書', { time: clock(11, 45, 'pm'), timeEvidence: '晚上11點45分' }).time, { kind: 'clock', time: '23:45' })
  assert.deepEqual(run('call mom at 15:00', { time: clock(15, 0, 'none'), timeEvidence: '15:00' }).time, { kind: 'clock', time: '15:00' })
  assert.deepEqual(run('call mom at 3pm', { time: clock(3, 0, 'pm'), timeEvidence: '3pm' }).time, { kind: 'clock', time: '15:00' })
  assert.deepEqual(run('中午12點吃飯', { time: clock(12, 0, 'pm'), timeEvidence: '中午12點' }).time, { kind: 'clock', time: '12:00' })
  assert.deepEqual(run('凌晨12點半睡', { time: clock(12, 30, 'am'), timeEvidence: '凌晨12點半' }).time, { kind: 'clock', time: '00:30' })
})

test('clock time: 「晚上12點」 is midnight, not noon; impossible hours/minutes drop the time', () => {
  assert.equal(run('晚上12點睡覺', { time: clock(12, 0, 'pm'), timeEvidence: '晚上12點' }).time, undefined)
  assert.equal(run('25點開會', { time: clock(25, 0, 'none'), timeEvidence: '25點' }).time, undefined)
  assert.equal(run('3點75分開會', { time: clock(3, 75, 'pm'), timeEvidence: '3點75分' }).time, undefined)
  assert.equal(run('3點開會', { time: clock(-1, 0, 'none'), timeEvidence: '3點' }).time, undefined)
})

test('part of day: kept only when the quote names that part', () => {
  assert.deepEqual(run('晚上打給媽媽', { time: { kind: 'part', part: 'evening' }, timeEvidence: '晚上' }).time, { kind: 'part', part: 'evening' })
  assert.deepEqual(run('中午吃飯', { time: { kind: 'part', part: 'noon' }, timeEvidence: '中午' }).time, { kind: 'part', part: 'noon' })
  assert.deepEqual(run('call mom tonight', { time: { kind: 'part', part: 'evening' }, timeEvidence: 'tonight' }).time, { kind: 'part', part: 'evening' })
  assert.deepEqual(run('this afternoon: clean room', { time: { kind: 'part', part: 'afternoon' }, timeEvidence: 'this afternoon' }).time, { kind: 'part', part: 'afternoon' })
  // model says afternoon but the quote is 晚上 → hallucinated classification → no time
  assert.equal(run('晚上打給媽媽', { time: { kind: 'part', part: 'afternoon' }, timeEvidence: '晚上' }).time, undefined)
})

test("time evidence: not a substring of the item's own source → no time (hallucination guard)", () => {
  assert.equal(run('去銀行', { time: clock(3, 0, 'pm'), timeEvidence: '下午三點' }).time, undefined)
  assert.equal(run('去銀行', { time: { kind: 'part', part: 'afternoon' }, timeEvidence: '' }).time, undefined)
  // present in the member's text but in ANOTHER item's source
  const text = '下午三點去銀行、買貓砂'
  const items = C.validateItems({
    items: [
      tItem({ title: '去銀行', source: '下午三點去銀行', time: clock(3, 0, 'pm'), timeEvidence: '下午三點' }),
      tItem({ title: '買貓砂', source: '買貓砂', time: clock(3, 0, 'pm'), timeEvidence: '下午三點' }),
    ],
  }, text, TODAY)
  assert.deepEqual(items.map((x) => x.time?.time), ['15:00', undefined])
  // a quote with no clock word is not a time ("3" alone could be anything)
  assert.equal(run('買3個杯子', { time: clock(3, 0, 'none'), timeEvidence: '3' }).time, undefined)
})

test('R6: deadline times (三點前 / 3pm 之前 / by 3pm) are never an appointment time', () => {
  assert.equal(run('三點前寄出報價', { time: clock(3, 0, 'none'), timeEvidence: '三點' }).time, undefined)
  assert.equal(run('三點前寄出報價', { time: clock(3, 0, 'none'), timeEvidence: '三點前' }).time, undefined)
  assert.equal(run('下午三點之前寄出報價', { time: clock(3, 0, 'pm'), timeEvidence: '下午三點' }).time, undefined)
  assert.equal(run('3點以前把報價寄出', { time: clock(3, 0, 'none'), timeEvidence: '3點' }).time, undefined)
  assert.equal(run('晚上之前寄出報價', { time: { kind: 'part', part: 'evening' }, timeEvidence: '晚上' }).time, undefined)
  assert.equal(run('send the quote by 3pm', { time: clock(3, 0, 'pm'), timeEvidence: '3pm' }).time, undefined)
  assert.equal(run('send the quote before 15:00', { time: clock(15, 0, 'none'), timeEvidence: '15:00' }).time, undefined)
  assert.equal(run('send the quote by 3pm', { time: clock(3, 0, 'pm'), timeEvidence: 'by 3pm' }).time, undefined)
  // 前往 / 前面 are other words that just start with 前
  assert.deepEqual(run('下午三點前往銀行', { time: clock(3, 0, 'pm'), timeEvidence: '下午三點' }).time, { kind: 'clock', time: '15:00' })
  // a "by" that belongs to something else is fine
  assert.deepEqual(run('meet Amy at 3pm', { time: clock(3, 0, 'pm'), timeEvidence: '3pm' }).time, { kind: 'clock', time: '15:00' })
})

test('duration: needs a quote from the source that is a length; bounded', () => {
  assert.equal(run('明天早上9點開會一小時', { durationMinutes: 60, durationEvidence: '一小時' }).durationMinutes, 60)
  assert.equal(run('讀書30分鐘', { durationMinutes: 30, durationEvidence: '30分鐘' }).durationMinutes, 30)
  assert.equal(run('冥想半小時', { durationMinutes: 30, durationEvidence: '半小時' }).durationMinutes, 30)
  assert.equal(run('for 2 hours write the doc', { durationMinutes: 120, durationEvidence: 'for 2 hours' }).durationMinutes, 120)
  // invented length (quote not in source / empty / not a length / out of range / not an integer)
  assert.equal(run('去銀行', { durationMinutes: 60, durationEvidence: '一小時' }).durationMinutes, undefined)
  assert.equal(run('去銀行', { durationMinutes: 60, durationEvidence: '' }).durationMinutes, undefined)
  assert.equal(run('買3個杯子', { durationMinutes: 3, durationEvidence: '3' }).durationMinutes, undefined)
  assert.equal(run('讀書30分鐘', { durationMinutes: 0, durationEvidence: '30分鐘' }).durationMinutes, undefined)
  assert.equal(run('讀書30分鐘', { durationMinutes: 5000, durationEvidence: '30分鐘' }).durationMinutes, undefined)
  assert.equal(run('讀書30分鐘', { durationMinutes: null, durationEvidence: '30分鐘' }).durationMinutes, undefined)
})

test('time and duration ride along without disturbing title / due / note', () => {
  const text = '明天下午三點開會一小時'
  const [x] = C.validateItems({
    items: [tItem({
      title: '開會', due: { kind: 'relative_days', days: 1 }, dueEvidence: '明天', source: text,
      time: clock(3, 0, 'pm'), timeEvidence: '下午三點', durationMinutes: 60, durationEvidence: '一小時',
    })],
  }, text, TODAY)
  assert.deepEqual(x, { title: '開會', dueDate: '2026-10-04', note: '', time: { kind: 'clock', time: '15:00' }, durationMinutes: 60 })
})

test('malformed time objects from the model are rejected, not guessed', () => {
  assert.throws(() => C.validateItems({ items: [tItem({ title: 'x', source: '下午', time: { kind: 'clock', hour: 3 } })] }, '下午', TODAY))
  assert.throws(() => C.validateItems({ items: [tItem({ title: 'x', source: '下午', time: { kind: 'part', part: 'night' } })] }, '下午', TODAY))
  assert.throws(() => C.validateItems({ items: [tItem({ title: 'x', source: '下午', time: { kind: 'clock', hour: 3, minute: 0, meridiem: 'noon' } })] }, '下午', TODAY))
})

test('clockTo24h agrees with the on-device parser (lib/brain-dump/parse.ts normaliseClock) for every hour', () => {
  for (let h = 0; h <= 23; h++) {
    for (const m of [0, 30]) {
      for (const meridiem of ['none', 'am', 'pm']) {
        const local = P.normaliseClock(h, m, undefined, meridiem === 'none' ? undefined : meridiem)
        const fn = C.clockTo24h(h, m, meridiem)
        assert.equal(fn, local, `${h}:${m} ${meridiem}: function=${fn} parser=${local}`)
      }
    }
  }
  assert.equal(C.clockTo24h(3, 0, 'none'), '15:00')
  assert.equal(C.clockTo24h(7, 59, 'none'), '19:59')
  assert.equal(C.clockTo24h(8, 0, 'none'), '08:00')
  assert.equal(C.clockTo24h(12, 0, 'none'), '12:00')
})
