/* eslint-disable no-console -- executable parser / planner regression */
// Brain dump (「丟給企鵝」) — parser + day planner regression.
// Run: node scripts/e2e/brain-dump-parse-verify.mjs
// Transpiles lib/brain-dump/{types,parse,plan}.ts with the project's
// TypeScript (same approach as meeting-availability-verify.mjs) and asserts
// on fixed "now" values, so it is timezone- and clock-independent.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(join(tmpdir(), 'huddle-brain-dump-'))
let checks = 0
let failures = 0
function check(label, fn) {
  try {
    fn()
    checks++
    console.log('PASS', label)
  } catch (e) {
    failures++
    console.log('FAIL', label, '\n   ', e.message.split('\n').slice(0, 6).join('\n    '))
  }
}

try {
  for (const name of ['types', 'parse', 'plan']) {
    const src = readFileSync(`lib/brain-dump/${name}.ts`, 'utf8').replace(/from '\.\/(types|parse|plan)'/g, "from './$1.mjs'")
    const out = ts.transpileModule(src, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText
    writeFileSync(join(dir, `${name}.mjs`), out)
  }
  const { parseBrainDump, splitFragments } = await import(pathToFileURL(join(dir, 'parse.mjs')).href)
  const { planDay, markConflicts, rebaseDrafts } = await import(pathToFileURL(join(dir, 'plan.mjs')).href)

  // Saturday 2026-10-03 08:30 local.
  const SAT = new Date(2026, 9, 3, 8, 30)
  // Wednesday 2026-10-07 14:10 local.
  const WED = new Date(2026, 9, 7, 14, 10)
  const pick = (drafts, title) => {
    const d = drafts.find((x) => x.title === title)
    assert.ok(d, `no draft titled 「${title}」 in ${JSON.stringify(drafts.map((x) => x.title))}`)
    return d
  }

  // ───── parser ─────
  check('01 spec example → 4 clean drafts', () => {
    const d = parseBrainDump('明天要回康庭的信、下午去銀行、週五前把報價改完 一小時、還有記得運動', SAT, 'zh-TW')
    assert.deepEqual(d.map((x) => x.title), ['回康庭的信', '去銀行', '把報價改完', '運動'])
    assert.equal(pick(d, '回康庭的信').day, 'tomorrow')
    assert.equal(pick(d, '回康庭的信').estimatedMinutes, 15)
    assert.equal(pick(d, '去銀行').preferredPart, 'afternoon')
    assert.equal(pick(d, '把報價改完').estimatedMinutes, 60)
    assert.equal(pick(d, '把報價改完').minutesGuessed, false)
    assert.equal(pick(d, '把報價改完').dueDate, '2026-10-09')
    assert.equal(pick(d, '運動').day, 'today')
  })
  check('02 newline list + 3點半', () => {
    const d = parseBrainDump('買牛奶\n3點半跟小美開會\n整理桌面', SAT)
    assert.deepEqual(d.map((x) => x.title), ['買牛奶', '跟小美開會', '整理桌面'])
    assert.equal(pick(d, '跟小美開會').fixedTime, '15:30')
  })
  check('03 早上10點 / 晚上8點 / 下午2點', () => {
    const d = parseBrainDump('早上10點看牙醫，晚上8點打給媽媽；下午2點交稿', SAT)
    assert.equal(pick(d, '看牙醫').fixedTime, '10:00')
    assert.equal(pick(d, '打給媽媽').fixedTime, '20:00')
    assert.equal(pick(d, '交稿').fixedTime, '14:00')
  })
  check('04 durations: 30分鐘 / 半小時 / 1.5h / 一個半小時', () => {
    const d = parseBrainDump('讀書30分鐘、冥想半小時、寫企劃 1.5h、整理照片一個半小時', SAT)
    assert.equal(pick(d, '讀書').estimatedMinutes, 30)
    assert.equal(pick(d, '冥想').estimatedMinutes, 30)
    assert.equal(pick(d, '寫企劃').estimatedMinutes, 90)
    assert.equal(pick(d, '整理照片').estimatedMinutes, 90)
  })
  check('05 後天 / 禮拜三 / 下週一', () => {
    const d = parseBrainDump('後天去郵局 然後禮拜三交報告 再來下週一跟客戶開會', SAT)
    assert.equal(pick(d, '去郵局').day, '2026-10-05')
    assert.equal(pick(d, '交報告').day, '2026-10-07')
    assert.equal(pick(d, '跟客戶開會').day, '2026-10-05')
  })
  check('06 deadline today counts as urgent-ish, 很急 → 8', () => {
    const d = parseBrainDump('今天前寄合約，很急：回覆廠商', SAT)
    assert.equal(pick(d, '寄合約').dueDate, '2026-10-03')
    assert.equal(pick(d, '寄合約').urgency, 7)
    assert.equal(pick(d, '回覆廠商').urgency, 8)
  })
  check('07 trailing duration fragment merges into the previous item', () => {
    const d = parseBrainDump('週五前把報價改完，一小時', SAT)
    assert.equal(d.length, 1)
    assert.equal(d[0].estimatedMinutes, 60)
    assert.equal(d[0].dueDate, '2026-10-09')
  })
  check('08 duration guesses: reply 15 / bank 45 / workout 60 / other 30', () => {
    const d = parseBrainDump('回信給 Amy、去銀行、運動、澆花', SAT)
    assert.deepEqual(d.map((x) => [x.title, x.estimatedMinutes, x.minutesGuessed]), [
      ['回信給 Amy', 15, true], ['去銀行', 45, true], ['運動', 60, true], ['澆花', 30, true],
    ])
  })
  check('09 「有點累」 is not 1 o\'clock, 中午 → 12:00', () => {
    const d = parseBrainDump('有點累先小睡、中午吃飯', SAT)
    assert.equal(pick(d, '有點累先小睡').fixedTime, undefined)
    assert.equal(pick(d, '吃飯').fixedTime, '12:00')
  })
  check('10 English example', () => {
    const d = parseBrainDump('Reply to Kang Ting tomorrow, go to the bank this afternoon, finish the quote by Friday 1 hour, and also work out', SAT, 'en')
    assert.deepEqual(d.map((x) => x.title), ['Reply to Kang Ting', 'Go to the bank', 'Finish the quote', 'Work out'])
    assert.equal(pick(d, 'Reply to Kang Ting').day, 'tomorrow')
    assert.equal(pick(d, 'Go to the bank').preferredPart, 'afternoon')
    assert.equal(pick(d, 'Finish the quote').estimatedMinutes, 60)
    assert.equal(pick(d, 'Finish the quote').dueDate, '2026-10-09')
    assert.equal(pick(d, 'Work out').estimatedMinutes, 60)
  })
  check('11 English clock + minutes: 3pm / at 10:30 / 45 min / half an hour', () => {
    const d = parseBrainDump('call mom at 3pm\nstandup at 10:30 for 15 min\nwrite blog post 45 min\nstretch for half an hour', SAT, 'en')
    assert.equal(pick(d, 'Call mom').fixedTime, '15:00')
    assert.equal(pick(d, 'Standup').fixedTime, '10:30')
    assert.equal(pick(d, 'Standup').estimatedMinutes, 15)
    assert.equal(pick(d, 'Write blog post').estimatedMinutes, 45)
    assert.equal(pick(d, 'Stretch').estimatedMinutes, 30)
  })
  check('12 English "and" keeps "Tom and Amy" together', () => {
    assert.deepEqual(splitFragments('email Tom and Amy and then buy milk'), ['email Tom and Amy', 'buy milk'])
    const d = parseBrainDump('need to email Tom and Amy and pick up the dry cleaning tonight', SAT, 'en')
    assert.deepEqual(d.map((x) => x.title), ['Email Tom and Amy', 'Pick up the dry cleaning'])
    assert.equal(pick(d, 'Pick up the dry cleaning').preferredPart, 'evening')
  })
  check('13 tomorrow morning / next Monday / on Wednesday', () => {
    const d = parseBrainDump('dentist tomorrow morning; gym next Monday; groceries on Wednesday', SAT, 'en')
    assert.equal(pick(d, 'Dentist').day, 'tomorrow')
    assert.equal(pick(d, 'Dentist').preferredPart, 'morning')
    assert.equal(pick(d, 'Gym').day, '2026-10-05')
    assert.equal(pick(d, 'Groceries').day, '2026-10-07')
  })
  check('14 10/9前 date deadline + 1h30m + urgent', () => {
    const d = parseBrainDump('10/9前送件、整理報表 2小時、ASAP fix the login bug 1h30m', SAT)
    assert.equal(pick(d, '送件').dueDate, '2026-10-09')
    assert.equal(pick(d, '整理報表').estimatedMinutes, 120)
    assert.equal(pick(d, 'Fix the login bug').estimatedMinutes, 90)
    assert.equal(pick(d, 'Fix the login bug').urgency, 8)
  })
  check('15 empty / whitespace / filler-only input → no drafts', () => {
    assert.equal(parseBrainDump('', SAT).length, 0)
    assert.equal(parseBrainDump('   \n  、，', SAT).length, 0)
    assert.equal(parseBrainDump('一小時', SAT).length, 0)
  })
  check('16 bullets and numbering are stripped', () => {
    const d = parseBrainDump('- 洗衣服\n- 倒垃圾\n1. 繳電話費', SAT)
    assert.deepEqual(d.map((x) => x.title), ['洗衣服', '倒垃圾', '繳電話費'])
  })
  check('17 今晚 → evening, 明早9點 → tomorrow 09:00', () => {
    const d = parseBrainDump('今晚看電影、明早9點晨會', SAT)
    assert.equal(pick(d, '看電影').preferredPart, 'evening')
    assert.equal(pick(d, '看電影').day, 'today')
    assert.equal(pick(d, '晨會').day, 'tomorrow')
    assert.equal(pick(d, '晨會').fixedTime, '09:00')
  })

  // ───── planner ─────
  const at = (items, title) => {
    const it = items.find((x) => x.draft.title === title)
    assert.ok(it, `no planned item 「${title}」`)
    return it
  }
  const noOverlap = (items, busy = []) => {
    const spans = items.filter((x) => x.status === 'scheduled').map((x) => [x.start, x.end, x.draft.title])
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        assert.ok(!(spans[i][0] < spans[j][1] && spans[i][1] > spans[j][0]), `overlap ${spans[i]} / ${spans[j]}`)
      }
      for (const b of busy) {
        const toM = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
        assert.ok(!(toM(spans[i][0]) < b.end && toM(spans[i][1]) > b.start), `overlaps busy ${spans[i]}`)
      }
    }
  }

  check('P1 spec example on an empty Saturday morning', () => {
    const drafts = parseBrainDump('明天要回康庭的信、下午去銀行、週五前把報價改完 一小時、還有記得運動', SAT)
    const plan = planDay(drafts, [], { now: SAT })
    assert.equal(plan.late, false)
    assert.equal(plan.full, false)
    const reply = at(plan.items, '回康庭的信')
    assert.equal(reply.status, 'pending')
    assert.equal(reply.date, '2026-10-04')
    assert.equal(reply.reason, 'future')
    const bank = at(plan.items, '去銀行')
    assert.equal(bank.status, 'scheduled')
    assert.equal(bank.start, '12:00')
    assert.equal(bank.end, '12:45')
    const quote = at(plan.items, '把報價改完')
    assert.deepEqual([quote.start, quote.end], ['09:00', '10:00'])
    const gym = at(plan.items, '運動')
    assert.deepEqual([gym.start, gym.end], ['10:15', '11:15'])
    noOverlap(plan.items)
    // scheduled-today first, by time; pending last
    assert.deepEqual(plan.items.map((x) => x.draft.title), ['把報價改完', '運動', '去銀行', '回康庭的信'])
  })
  check('P2 existing tasks / time blocks are avoided (with buffer)', () => {
    const drafts = parseBrainDump('寫週報 一小時、回信、整理桌面', SAT)
    const busy = [{ start: 9 * 60, end: 10 * 60 }, { start: 10 * 60 + 30, end: 12 * 60 }]
    const plan = planDay(drafts, busy, { now: SAT })
    noOverlap(plan.items, busy)
    assert.deepEqual([at(plan.items, '回信').start, at(plan.items, '回信').end], ['12:15', '12:30'])
    assert.equal(at(plan.items, '整理桌面').start, '12:45')
    assert.equal(at(plan.items, '寫週報').start, '13:30')
  })
  check('P3 starts from now rounded up to 15 min', () => {
    const plan = planDay(parseBrainDump('澆花', WED), [], { now: WED })
    assert.equal(plan.windowStart, 14 * 60 + 15)
    assert.equal(at(plan.items, '澆花').start, '14:15')
  })
  check('P4 fixed time goes exactly there; past fixed time → pending', () => {
    const plan = planDay(parseBrainDump('下午4點牙醫、早上10點晨跑', WED), [{ start: 16 * 60, end: 16 * 60 + 30 }], { now: WED })
    const dentist = at(plan.items, '牙醫')
    assert.deepEqual([dentist.start, dentist.end, dentist.conflict], ['16:00', '16:30', true])
    const run = at(plan.items, '晨跑')
    assert.equal(run.status, 'pending')
    assert.equal(run.reason, 'past-time')
  })
  check('P5 urgent first, then nearest deadline, then shorter', () => {
    const drafts = parseBrainDump('慢慢讀書 一小時、明天前交作業 一小時、很急 回電話', SAT)
    const plan = planDay(drafts, [], { now: SAT })
    assert.equal(at(plan.items, '回電話').start, '09:00')
    assert.equal(at(plan.items, '交作業').start, '09:30')
    assert.equal(at(plan.items, '慢慢讀書').start, '10:45')
  })
  check('P6 a full day → everything pending today, plan.full', () => {
    const plan = planDay(parseBrainDump('寫報告 兩小時、運動', SAT), [{ start: 0, end: 24 * 60 }], { now: SAT })
    assert.equal(plan.full, true)
    assert.ok(plan.items.every((x) => x.status === 'pending' && x.date === '2026-10-03' && x.reason === 'full'))
  })
  check('P7 late night (< 30 min left) → tomorrow pending, plan.late', () => {
    const night = new Date(2026, 9, 3, 21, 40)
    const plan = planDay(parseBrainDump('洗碗、明天去銀行', night), [], { now: night })
    assert.equal(plan.late, true)
    assert.equal(at(plan.items, '洗碗').date, '2026-10-04')
    assert.equal(at(plan.items, '洗碗').reason, 'late')
    assert.equal(at(plan.items, '去銀行').reason, 'future')
  })
  check('P8 afternoon part already gone → pending part-passed; evening still works', () => {
    const six = new Date(2026, 9, 3, 18, 20)
    const plan = planDay(parseBrainDump('下午去銀行、晚上運動', six), [], { now: six })
    assert.equal(at(plan.items, '去銀行').reason, 'part-passed')
    assert.equal(at(plan.items, '運動').start, '18:30')
  })
  check('P9 custom work window is respected', () => {
    const plan = planDay(parseBrainDump('寫程式 三小時、看書 一小時', SAT), [], { now: SAT, workStart: 13 * 60, workEnd: 16 * 60 })
    // shorter first: 看書 takes 13:00, the 3-hour block no longer fits
    assert.equal(at(plan.items, '看書').start, '13:00')
    assert.equal(at(plan.items, '寫程式').status, 'pending')
    assert.equal(at(plan.items, '寫程式').reason, 'full')
  })
  check('P10 future day with a fixed time keeps its time', () => {
    const plan = planDay(parseBrainDump('明天下午3點開會', SAT), [], { now: SAT })
    const m = at(plan.items, '開會')
    assert.deepEqual([m.status, m.date, m.start, m.end], ['scheduled', '2026-10-04', '15:00', '16:00'])
  })
  check('P11 markConflicts flags a hand-moved item', () => {
    const plan = planDay(parseBrainDump('澆花、掃地', SAT), [{ start: 13 * 60, end: 14 * 60 }], { now: SAT })
    const moved = plan.items.map((x) => x.draft.title === '掃地' ? { ...x, start: '13:15', end: '13:45' } : x)
    const marked = markConflicts(moved, [{ start: 13 * 60, end: 14 * 60 }], plan.today, () => true)
    assert.equal(marked.find((x) => x.draft.title === '掃地').conflict, true)
    assert.ok(!marked.find((x) => x.draft.title === '澆花').conflict)
  })
  check('P12 past midnight: rebaseDrafts moves yesterday\'s items to the new today and re-plans', () => {
    const late = new Date(2026, 9, 3, 23, 50)
    const plan = planDay(parseBrainDump('洗碗、明天去銀行、10/9前交報告', late), [], { now: late })
    assert.equal(plan.late, true)
    const after = new Date(2026, 9, 4, 0, 5)
    const drafts = rebaseDrafts(plan.items, after)
    assert.ok(drafts.every((d) => d.day === 'today'), JSON.stringify(drafts.map((d) => d.day)))
    const re = planDay(drafts, [], { now: after })
    assert.equal(re.today, '2026-10-04')
    assert.ok(re.items.every((x) => x.date === '2026-10-04' && x.status === 'scheduled'), JSON.stringify(re.items))
    // a later date stays put
    const far = rebaseDrafts([{ draft: { ...drafts[0] }, date: '2026-10-09', status: 'pending' }], after)
    assert.equal(far[0].day, '2026-10-09')
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\n${checks} passed, ${failures} failed`)
if (failures) process.exit(1)
