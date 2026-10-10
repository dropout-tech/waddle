// 丟給企鵝 → 排進行事曆: rules R1–R8 of lib/brain-dump/schedule.ts, driven the
// way the app drives them (AI answer or local rules → drafts → scheduleDrafts).
// Run: node --test scripts/tests/brain-dump-schedule.test.mjs
// Pure functions only: lib/brain-dump/*.ts and components/brain-dump/brain-dump-utils.ts
// are transpiled with the project's TypeScript ('@/…' imports pointed at the
// transpiled copies); no network, no login, no clock — every "now" is fixed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ts = createRequire(import.meta.url)('typescript')
const dir = mkdtempSync(join(tmpdir(), 'huddle-brain-dump-schedule-'))
test.after(() => rmSync(dir, { recursive: true, force: true }))

const REWRITE = [
  [/from '\.\/(types|parse|plan|schedule|drafts)'/g, "from './$1.mjs'"],
  [/from '@\/lib\/calendar-utils'/g, "from './calendar-utils.mjs'"],
  [/from '@\/lib\/brain-dump\/(parse|schedule)'/g, "from './$1.mjs'"],
]
for (const [from, name] of [
  ['lib/brain-dump/types.ts', 'types'],
  ['lib/brain-dump/parse.ts', 'parse'],
  ['lib/brain-dump/plan.ts', 'plan'],
  ['lib/brain-dump/schedule.ts', 'schedule'],
  ['lib/brain-dump/drafts.ts', 'drafts'],
  ['lib/calendar-utils.ts', 'calendar-utils'],
  ['components/brain-dump/brain-dump-utils.ts', 'utils'],
]) {
  let src = readFileSync(from, 'utf8')
  for (const [re, to] of REWRITE) src = src.replace(re, to)
  writeFileSync(
    join(dir, `${name}.mjs`),
    ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText,
  )
}
const load = (name) => import(pathToFileURL(join(dir, `${name}.mjs`)).href)
const { parseBrainDump } = await load('parse')
const { scheduleDrafts, withManualTime, scheduleDateOf, partSearchWindow } = await load('schedule')
const { fromServerItems, localInboxDrafts } = await load('drafts')
const { collectBusy, formatDay, formatSlot } = await load('utils')

// Saturday 2026-10-10 10:00 local (Taipei in production; the tests don't depend on the zone).
const NOW = new Date(2026, 9, 10, 10, 0)
const TODAY = '2026-10-10'
const TOMORROW = '2026-10-11'
const at = (h, m = 0) => new Date(2026, 9, 10, h, m)
const min = (h, m = 0) => h * 60 + m

// What the (new) Edge Function answers for one item.
const aiItem = (o) => ({ title: '去銀行', dueDate: '', note: '', ...o })
const clock = (time) => ({ kind: 'clock', time })
const part = (p) => ({ kind: 'part', part: p })
// Schedule one AI answer / one piece of text; returns the outcomes in input order.
function planAi(items, { now = NOW, busy = {} } = {}) {
  const drafts = fromServerItems(items)
  const out = scheduleDrafts(drafts, { now, busy })
  return drafts.map((d) => out.get(d.id))
}
function planLocal(text, { now = NOW, busy = {} } = {}) {
  const drafts = localInboxDrafts(text, now, 'zh-TW')
  const out = scheduleDrafts(drafts, { now, busy })
  return drafts.map((d) => ({ ...out.get(d.id), draft: d }))
}
const span = (o) => o.slot && `${o.slot.date} ${o.slot.start}-${o.slot.end}`

// ───────────────────────── acceptance cases a–l ─────────────────────────

test('a 「下午三點去銀行」 → today 15:00–15:30 (30 min: the stated default, not the 45-min bank guess)', () => {
  assert.equal(span(planAi([aiItem({ dueDate: TODAY, time: clock('15:00') })])[0]), `${TODAY} 15:00-15:30`)
  assert.equal(span(planLocal('下午三點去銀行')[0]), `${TODAY} 15:00-15:30`)
})

test('b 「明天早上9點開會一小時」 → 10-11 09:00–10:00', () => {
  assert.equal(span(planAi([aiItem({ title: '開會', dueDate: TOMORROW, time: clock('09:00'), durationMinutes: 60 })])[0]), `${TOMORROW} 09:00-10:00`)
  const [local] = planLocal('明天早上9點開會一小時')
  assert.equal(span(local), `${TOMORROW} 09:00-10:00`)
  assert.equal(local.slot.minutes, 60)
})

test('c 「三點回信」 → 15:00 (a bare 3 reads as the afternoon; 30 min, not the 15-min reply guess)', () => {
  assert.equal(span(planAi([aiItem({ title: '回信', dueDate: TODAY, time: clock('15:00') })])[0]), `${TODAY} 15:00-15:30`)
  assert.equal(span(planLocal('三點回信')[0]), `${TODAY} 15:00-15:30`)
})

test('d 「晚上打給媽媽」 with 18:00–19:00 taken → the earliest evening gap that avoids it', () => {
  const busy = { [TODAY]: [{ start: min(18), end: min(19) }] }
  assert.equal(span(planAi([aiItem({ title: '打給媽媽', dueDate: TODAY, time: part('evening') })], { busy })[0]), `${TODAY} 19:00-19:30`)
  assert.equal(span(planLocal('晚上打給媽媽', { busy })[0]), `${TODAY} 19:00-19:30`)
  // a gap too small for it is skipped: 19:00–19:15 is free but the call needs 30 minutes
  const tight = { [TODAY]: [{ start: min(18), end: min(19) }, { start: min(19, 15), end: min(20) }] }
  assert.equal(span(planAi([aiItem({ title: '打給媽媽', dueDate: TODAY, time: part('evening') })], { busy: tight })[0]), `${TODAY} 20:00-20:30`)
  // nothing taken → the part starts at 18:00
  assert.equal(span(planAi([aiItem({ title: '打給媽媽', dueDate: TODAY, time: part('evening') })])[0]), `${TODAY} 18:00-18:30`)
})

test('e now 16:00 + 「下午三點去銀行」 → not scheduled, time has passed', () => {
  const [o] = planAi([aiItem({ dueDate: TODAY, time: clock('15:00') })], { now: at(16) })
  assert.equal(o.slot, undefined)
  assert.equal(o.reason, 'past')
  assert.equal(planLocal('下午三點去銀行', { now: at(16) })[0].reason, 'past')
  // exactly now is not "earlier than now"
  assert.equal(span(planAi([aiItem({ dueDate: TODAY, time: clock('15:00') })], { now: at(15) })[0]), `${TODAY} 15:00-15:30`)
})

test('f now 16:30 + 「下午整理房間」 → searched from 16:45 (next 15-min mark after now)', () => {
  const [o] = planAi([aiItem({ title: '整理房間', dueDate: TODAY, time: part('afternoon') })], { now: at(16, 30) })
  assert.equal(span(o), `${TODAY} 16:45-17:15`)
  assert.equal(span(planLocal('下午整理房間', { now: at(16, 30) })[0]), `${TODAY} 16:45-17:15`)
  // 16:31 → 16:45 as well; 16:46 → 17:00
  assert.equal(span(planAi([aiItem({ dueDate: TODAY, time: part('afternoon') })], { now: at(16, 31) })[0]), `${TODAY} 16:45-17:15`)
  assert.equal(span(planAi([aiItem({ dueDate: TODAY, time: part('afternoon') })], { now: at(16, 46) })[0]), `${TODAY} 17:00-17:30`)
})

test('g 「週五前把報價改完」 → not scheduled (a deadline), due date kept at 10-16', () => {
  const [o] = planAi([aiItem({ title: '把報價改完', dueDate: '2026-10-16' })])
  assert.deepEqual(Object.keys(o), ['id'])
  const [local] = planLocal('週五前把報價改完')
  assert.equal(local.slot, undefined)
  assert.equal(local.reason, undefined)
  assert.equal(local.draft.dueDate, '2026-10-16')
  assert.equal(local.draft.fixedTime, undefined)
})

test('h 「三點前寄出報價」 → not scheduled (a deadline time, not an appointment)', () => {
  // the function drops the time (contract test); a function that did not would still be ignored here by the local rule
  assert.deepEqual(Object.keys(planAi([aiItem({ title: '寄出報價', dueDate: TODAY })])[0]), ['id'])
  const [local] = planLocal('三點前寄出報價')
  assert.deepEqual([local.slot, local.reason, local.draft.fixedTime, local.draft.title], [undefined, undefined, undefined, '寄出報價'])
  for (const text of ['下午三點前寄出報價', '3點半之前寄出報價', '15:00前寄出報價', 'send the quote by 3pm', 'send the quote before 15:00']) {
    const [o] = planLocal(text)
    assert.deepEqual([text, o.slot, o.reason], [text, undefined, undefined])
  }
  // 前往 is a word, not a deadline
  assert.equal(span(planLocal('下午3點前往銀行')[0]), `${TODAY} 15:00-15:30`)
})

test('i 「買貓砂」 → nothing said about time → not scheduled, no reason shown', () => {
  assert.deepEqual(Object.keys(planAi([aiItem({ title: '買貓砂' })])[0]), ['id'])
  assert.deepEqual(Object.keys(planLocal('買貓砂')[0]).filter((k) => k !== 'draft'), ['id'])
})

test('j two 「下午」 items in one batch never overlap (and avoid the calendar)', () => {
  const two = [
    aiItem({ title: '整理房間', dueDate: TODAY, time: part('afternoon') }),
    aiItem({ title: '洗衣服', dueDate: TODAY, time: part('afternoon') }),
  ]
  assert.deepEqual(planAi(two).map(span), [`${TODAY} 12:00-12:30`, `${TODAY} 12:30-13:00`])
  const busy = { [TODAY]: [{ start: min(12), end: min(12, 45) }] }
  assert.deepEqual(planAi(two, { busy }).map(span), [`${TODAY} 12:45-13:15`, `${TODAY} 13:15-13:45`])
  const local = planLocal('下午整理房間、下午洗衣服、下午寫報告 一小時')
  const ranges = local.map((o) => [Number(o.slot.start.slice(0, 2)) * 60 + Number(o.slot.start.slice(3)), Number(o.slot.end.slice(0, 2)) * 60 + Number(o.slot.end.slice(3))])
  assert.equal(ranges.length, 3)
  for (let i = 0; i < ranges.length; i++) for (let j = i + 1; j < ranges.length; j++) {
    assert.ok(ranges[i][1] <= ranges[j][0] || ranges[j][1] <= ranges[i][0], `overlap ${JSON.stringify(ranges)}`)
  }
})

test('k 「晚上11點45分看書一小時」 → cut at the end of the day (23:59); under 15 min left → not scheduled', () => {
  const [o] = planAi([aiItem({ title: '看書', dueDate: TODAY, time: clock('23:45'), durationMinutes: 60 })])
  assert.equal(span(o), `${TODAY} 23:45-23:59`)
  assert.equal(o.slot.minutes, 15)
  const [local] = planLocal('晚上11點45分看書一小時')
  assert.equal(span(local), `${TODAY} 23:45-23:59`)
  // 23:50 + cut = 10 minutes < 15 → no
  const [late] = planAi([aiItem({ title: '看書', dueDate: TODAY, time: clock('23:50'), durationMinutes: 60 })])
  assert.deepEqual([late.slot, late.reason], [undefined, 'no-room'])
  // not cut → a short stated duration near midnight is fine
  assert.equal(span(planAi([aiItem({ dueDate: TODAY, time: clock('23:50'), durationMinutes: 5 })])[0]), `${TODAY} 23:50-23:55`)
})

test('l an OLD Edge Function answer (no time / duration fields) → nothing scheduled, nothing throws', () => {
  const old = [
    { title: '回康庭的信', dueDate: TOMORROW, note: '' },
    { title: '去銀行', dueDate: TODAY, note: '記得帶存摺' },
    { title: '把報價改完', dueDate: '2026-10-16', note: '大約一小時' },
    { title: '運動', dueDate: '', note: '' },
  ]
  const drafts = fromServerItems(old)
  assert.equal(drafts.length, 4)
  assert.ok(drafts.every((d) => d.fixedTime === undefined && d.preferredPart === undefined && d.minutesGuessed === true))
  const out = scheduleDrafts(drafts, { now: NOW, busy: {} })
  assert.ok(drafts.every((d) => Object.keys(out.get(d.id)).join() === 'id'))
  // a misbehaving answer is ignored too, not trusted
  const odd = fromServerItems([
    aiItem({ time: null }),
    aiItem({ title: 'b', time: { kind: 'clock' } }),
    aiItem({ title: 'c', time: { kind: 'clock', time: '25:99' } }),
    aiItem({ title: 'd', time: { kind: 'clock', time: '3pm' } }),
    aiItem({ title: 'e', time: { kind: 'part', part: 'midnight' } }),
    aiItem({ title: 'f', time: 'afternoon', durationMinutes: '60' }),
    aiItem({ title: 'g', durationMinutes: 0 }),
    aiItem({ title: 'h', durationMinutes: 99999 }),
  ])
  assert.equal(odd.length, 8)
  assert.ok(odd.every((d) => d.fixedTime === undefined && d.preferredPart === undefined && d.minutesGuessed === true))
  assert.doesNotThrow(() => scheduleDrafts(odd, { now: NOW, busy: {} }))
})

// ───────────────────────── the rest of the rules ─────────────────────────

test('R1 explicit time may overlap the calendar (flagged); R2 items then route around it', () => {
  const busy = { [TODAY]: [{ start: min(15), end: min(16) }] }
  const [o] = planAi([aiItem({ title: '開會', dueDate: TODAY, time: clock('15:00') })], { busy })
  assert.equal(span(o), `${TODAY} 15:00-15:30`)
  assert.equal(o.slot.conflict, true)
  assert.equal(span(planAi([aiItem({ dueDate: TODAY, time: clock('15:00') })])[0]), `${TODAY} 15:00-15:30`)
  assert.equal(planAi([aiItem({ dueDate: TODAY, time: clock('15:00') })])[0].slot.conflict, undefined)
})

test('explicit times are placed before day parts, whatever the order they were written in', () => {
  const [mom, dinner] = planAi([
    aiItem({ title: '打給媽媽', dueDate: TODAY, time: part('evening') }),
    aiItem({ title: '吃飯', dueDate: TODAY, time: clock('18:00') }),
  ])
  assert.equal(span(dinner), `${TODAY} 18:00-18:30`)
  assert.equal(span(mom), `${TODAY} 18:30-19:00`)
})

test('the date is the due date, else today; a later day ignores "now"', () => {
  const [tomorrow] = planAi([aiItem({ dueDate: TOMORROW, time: part('evening') })], { now: at(21) })
  assert.equal(span(tomorrow), `${TOMORROW} 18:00-18:30`)
  const [fri] = planAi([aiItem({ dueDate: '2026-10-16', time: clock('14:00') })], { now: at(21) })
  assert.equal(span(fri), '2026-10-16 14:00-14:30')
  const [noDate] = planAi([aiItem({ time: clock('15:00') })])
  assert.equal(span(noDate), `${TODAY} 15:00-15:30`)
  // busy time on ANOTHER day does not matter
  const [other] = planAi([aiItem({ dueDate: TOMORROW, time: part('afternoon') })], { busy: { [TODAY]: [{ start: min(12), end: min(18) }] } })
  assert.equal(span(other), `${TOMORROW} 12:00-12:30`)
  assert.equal(scheduleDateOf({ day: 'tomorrow' }, NOW), TOMORROW)
  assert.equal(scheduleDateOf({ day: 'today', dueDate: '2026-10-16' }, NOW), '2026-10-16')
})

test('R5 a part that is fully over → past; partly over but too short for the task → no room', () => {
  assert.equal(planAi([aiItem({ dueDate: TODAY, time: part('evening') })], { now: at(22, 30) })[0].reason, 'past')
  assert.equal(planAi([aiItem({ dueDate: TODAY, time: part('morning') })], { now: at(13) })[0].reason, 'past')
  assert.equal(planAi([aiItem({ dueDate: TODAY, time: part('afternoon') })], { now: at(17, 50) })[0].reason, 'past')
  const [short] = planAi([aiItem({ dueDate: TODAY, time: part('afternoon'), durationMinutes: 60 })], { now: at(17, 20) })
  assert.deepEqual([short.slot, short.reason], [undefined, 'no-room'])
  // the same words for tomorrow are never "past"
  assert.equal(span(planAi([aiItem({ dueDate: TOMORROW, time: part('morning') })], { now: at(22, 30) })[0]), `${TOMORROW} 09:00-09:30`)
})

test('R2 no gap in the part → no-room (and the draft keeps its date)', () => {
  const busy = { [TODAY]: [{ start: min(12), end: min(18) }] }
  const drafts = fromServerItems([aiItem({ dueDate: TODAY, time: part('afternoon') })])
  const o = scheduleDrafts(drafts, { now: NOW, busy }).get('bd-0')
  assert.deepEqual([o.slot, o.reason], [undefined, 'no-room'])
  assert.equal(drafts[0].dueDate, TODAY)
  // a 5-hour block cannot fit the 4-hour evening window at all
  assert.equal(planAi([aiItem({ time: part('evening'), durationMinutes: 300 })])[0].reason, 'no-room')
})

test('part windows follow plan.ts (morning from 09:00, evening to 22:00) plus lunchtime for 中午', () => {
  assert.deepEqual(partSearchWindow('morning'), [min(9), min(12)])
  assert.deepEqual(partSearchWindow('noon'), [min(11, 30), min(13, 30)])
  assert.deepEqual(partSearchWindow('afternoon'), [min(12), min(18)])
  assert.deepEqual(partSearchWindow('evening'), [min(18), min(22)])
  assert.equal(span(planAi([aiItem({ dueDate: TOMORROW, time: part('noon') })])[0]), `${TOMORROW} 11:30-12:00`)
  // 傍晚 / 早上 end where their window ends: a 3-hour morning task fits 09–12, a 4-hour one does not
  assert.equal(span(planAi([aiItem({ dueDate: TOMORROW, time: part('morning'), durationMinutes: 180 })])[0]), `${TOMORROW} 09:00-12:00`)
  assert.equal(planAi([aiItem({ dueDate: TOMORROW, time: part('morning'), durationMinutes: 240 })])[0].reason, 'no-room')
})

test('local rules: 中午 is 12:00 sharp, 晚間8點 is 20:00, English tonight / this afternoon', () => {
  assert.equal(span(planLocal('中午吃飯')[0]), `${TODAY} 12:00-12:30`)
  assert.equal(span(planLocal('晚間8點看劇')[0]), `${TODAY} 20:00-20:30`)
  assert.equal(span(planLocal('tonight call mom')[0]), `${TODAY} 18:00-18:30`)
  assert.equal(span(planLocal('go to the bank this afternoon')[0]), `${TODAY} 12:00-12:30`)
  assert.equal(span(planLocal('call mom at 3pm')[0]), `${TODAY} 15:00-15:30`)
  // 「晚上12點」 is midnight: no clock time is read, the evening part is used
  const [mid] = planLocal('晚上12點跑步')
  assert.equal(mid.draft.fixedTime, undefined)
})

test('local rules: a stated duration is kept, a guessed one is not used for the block', () => {
  assert.equal(span(planLocal('下午去銀行')[0]), `${TODAY} 12:00-12:30`)
  assert.equal(span(planLocal('下午運動 一個半小時')[0]), `${TODAY} 12:00-13:30`)
  assert.equal(span(planLocal('3點半讀書30分鐘')[0]), `${TODAY} 15:30-16:00`)
})

test('editor: typing a time replaces what the text said; clearing it un-schedules (R4/R5 re-applied)', () => {
  const [d] = fromServerItems([aiItem({ title: '打給媽媽', dueDate: TODAY, time: part('evening') })])
  const typed = withManualTime(d, '20:00')
  assert.deepEqual([typed.fixedTime, typed.preferredPart], ['20:00', undefined])
  assert.equal(span(scheduleDrafts([typed], { now: NOW }).get(d.id)), `${TODAY} 20:00-20:30`)
  // single-digit hour from a browser time field is normalised
  assert.equal(withManualTime(d, '9:05').fixedTime, '09:05')
  // already past → R5
  assert.equal(scheduleDrafts([withManualTime(d, '09:00')], { now: NOW }).get(d.id).reason, 'past')
  // at 23:50 → cut, under 15 minutes → R4
  assert.equal(scheduleDrafts([withManualTime(d, '23:50')], { now: NOW }).get(d.id).reason, 'no-room')
  // cleared (or half-typed) → no time at all
  for (const empty of ['', '12']) {
    const cleared = withManualTime(typed, empty)
    assert.deepEqual([cleared.fixedTime, cleared.preferredPart], [undefined, undefined])
    assert.deepEqual(Object.keys(scheduleDrafts([cleared], { now: NOW }).get(d.id)), ['id'])
  }
  // the original draft is untouched
  assert.deepEqual([d.fixedTime, d.preferredPart], [undefined, 'evening'])
  // a draft with no due date uses today
  const [plain] = fromServerItems([aiItem({ title: '買貓砂' })])
  assert.equal(span(scheduleDrafts([withManualTime(plain, '15:00')], { now: NOW }).get(plain.id)), `${TODAY} 15:00-15:30`)
  // the due date wins when there is one
  const [due] = fromServerItems([aiItem({ title: '買貓砂', dueDate: '2026-10-16' })])
  assert.equal(span(scheduleDrafts([withManualTime(due, '15:00')], { now: NOW }).get(due.id)), '2026-10-16 15:00-15:30')
})

test('busy lookup may be a function; zero-length / backwards spans are ignored', () => {
  const asked = []
  const out = scheduleDrafts(fromServerItems([aiItem({ dueDate: TOMORROW, time: part('afternoon') })]), {
    now: NOW,
    busy: (date) => {
      asked.push(date)
      return [{ start: min(12), end: min(12, 30) }, { start: min(13), end: min(13) }, { start: min(15), end: min(14) }]
    },
  })
  assert.equal(span(out.get('bd-0')), `${TOMORROW} 12:30-13:00`)
  assert.ok(asked.every((d) => d === TOMORROW))
})

test('every draft gets an outcome, in a fresh Map each call (no state carried over)', () => {
  const drafts = fromServerItems([aiItem({ title: 'a' }), aiItem({ title: 'b', time: clock('15:00') }), aiItem({ title: 'c', time: part('evening') })])
  const first = scheduleDrafts(drafts, { now: NOW })
  const second = scheduleDrafts(drafts, { now: NOW })
  assert.equal(first.size, 3)
  assert.deepEqual([...first.values()], [...second.values()])
  // unchecked notes are simply not passed in: the others don't avoid them
  const without = scheduleDrafts(drafts.filter((d) => d.title !== 'b'), { now: NOW })
  assert.equal(span(without.get('bd-2')), span(first.get('bd-2')))
})

// ───────────────────────── calendar read + labels ─────────────────────────

const task = (o) => ({
  id: 't', categoryId: 'c', workspaceId: 'w', workspaceName: 'W', workspaceColor: '#000', categoryName: 'C', title: 'task',
  taskType: 'one_time', urgency: 5, calendarColor: '#000', isCompleted: false, createdAt: '', updatedAt: '', ...o,
})
const ws = (tasks, over = {}) => ({ id: 'w', name: 'W', color: '#000', icon: '', sortOrder: 0, isArchived: false, isDefault: false, categories: [{ id: 'c', workspaceId: 'w', name: 'C', sortOrder: 0, isCollapsed: false, isArchived: false, isDefault: false, tasks }], ...over })

test('collectBusy: timed tasks (incl. recurring + assigned to me) and time blocks of that day only', () => {
  const day = '2026-10-12' // a Monday
  const workspaces = [
    ws([
      task({ title: 'meeting', scheduledDate: day, scheduledStartTime: '14:00', scheduledEndTime: '15:00' }),
      task({ title: 'unscheduled', dueDate: day }),
      task({ title: 'date only', scheduledDate: day }),
      task({ title: 'archived', scheduledDate: day, scheduledStartTime: '09:00', scheduledEndTime: '10:00', isArchived: true }),
      task({ title: 'other day', scheduledDate: '2026-10-13', scheduledStartTime: '11:00', scheduledEndTime: '12:00' }),
      task({ title: 'daily standup', scheduledDate: '2026-10-05', scheduledStartTime: '10:00', scheduledEndTime: '10:15', isRecurring: true, recurrence: { type: 'daily', interval: 1 } }),
      task({ title: 'late night', scheduledDate: day, scheduledStartTime: '23:00', scheduledEndTime: '01:00' }),
    ]),
    ws([task({ title: 'in archived workspace', scheduledDate: day, scheduledStartTime: '16:00', scheduledEndTime: '17:00' })], { isArchived: true }),
  ]
  const assigned = [task({ title: 'assigned to me', scheduledDate: day, scheduledStartTime: '17:00', scheduledEndTime: '18:00' })]
  const blocks = [
    { id: 'b1', date: day, startTime: '12:00', endTime: '13:00', type: 'focus', label: 'focus', color: '#000', isRecurring: false },
    { id: 'b2', date: '2026-10-13', startTime: '12:00', endTime: '13:00', type: 'focus', label: 'tomorrow', color: '#000', isRecurring: false },
  ]
  const busy = collectBusy(workspaces, assigned, blocks, day)
  assert.deepEqual(
    busy.map((b) => [b.label, b.start, b.end]).sort((a, b) => a[1] - b[1]),
    [
      ['daily standup', min(10), min(10, 15)],
      ['focus', min(12), min(13)],
      ['meeting', min(14), min(15)],
      ['assigned to me', min(17), min(18)],
      ['late night', min(23), 1440],
    ],
  )
  // and it feeds the scheduler: an afternoon to-do goes around the 14:00 meeting
  const out = scheduleDrafts(fromServerItems([aiItem({ dueDate: day, time: part('afternoon'), durationMinutes: 120 })]), {
    now: NOW,
    busy: (date) => collectBusy(workspaces, assigned, blocks, date),
  })
  // 12:00–13:00 focus, 14:00–15:00 meeting, 17:00 assigned → the first 2-hour gap is 15:00–17:00
  assert.equal(span(out.get('bd-0')), `${day} 15:00-17:00`)
})

test('labels: 今天 15:00–15:30 / 明天 / M/D（週）', () => {
  const t = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k])
  const slot = (date) => ({ date, start: '15:00', end: '15:30', minutes: 30 })
  assert.equal(formatSlot(slot(TODAY), NOW, 'zh-TW', (s, v) => ({ '今天': '今天', '明天': '明天' }[s] ?? t(s, v))), '今天 15:00–15:30')
  assert.equal(formatDay(TOMORROW, NOW, 'zh-TW', (s) => s), '明天')
  assert.equal(formatDay('2026-10-16', NOW, 'zh-TW', (s) => s), '10/16（五）')
  assert.equal(formatDay('2026-10-16', NOW, 'en', (s) => s), 'Fri 10/16')
})

// ───────────────────────── local parser: R6 + hour reading ─────────────────────────

test('parser: deadline times are cut out of the title; real times still parse', () => {
  const titles = (text) => parseBrainDump(text, NOW).map((d) => [d.title, d.fixedTime])
  assert.deepEqual(titles('三點前寄出報價'), [['寄出報價', undefined]])
  assert.deepEqual(titles('下午三點半之前寄出報價'), [['寄出報價', undefined]])
  assert.deepEqual(titles('Send the quote by 3pm'), [['Send the quote', undefined]])
  assert.deepEqual(titles('三點寄出報價'), [['寄出報價', '15:00']])
  assert.deepEqual(titles('早上9點開會'), [['開會', '09:00']])
  assert.deepEqual(titles('Call mom at 10:30'), [['Call mom', '10:30']])
})
