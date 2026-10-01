// Guards the 2026-09-25 → 10-01 regression: MainLayout wrapped the calendar's
// reschedule / unschedule callbacks in arrow functions that forwarded only the
// first few arguments. The week and day views pass (taskId, date, start, end,
// recurrenceChoice, targetDate); with `end` dropped, app/page.tsx read the
// date as the start time and the database rejected every drag with
// `invalid input syntax for type time: "2026-09-29"`.
//
//   node scripts/verify-reschedule-args.mjs
//
// Reads the real source files — no login, no network.
import { readFileSync } from 'node:fs'
import { classifyDbError } from '../lib/supabase/db-error-reason.ts'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ── 1. The wrappers, lifted verbatim out of main-layout.tsx and executed ──
const layout = read('components/layout/main-layout.tsx')
for (const prop of ['onRescheduleTask', 'onUnscheduleTask']) {
  const sources = [...layout.matchAll(new RegExp(`${prop}=\\{(\\(.*?\\) => \\{.*?\\})\\}\\n`, 'g'))].map((m) => m[1])
  check(`${prop}: both CalendarPanel render sites found`, sources.length === 2, `found ${sources.length}`)
  sources.forEach((src, i) => {
    const received = []
    const wrapper = new Function(prop, `return ${src}`)((...args) => received.push(args))
    const sent = ['task-1', '2026-10-02', '10:00', '10:30', 'only_this', '2026-10-01']
    wrapper(...sent)
    check(
      `${prop} #${i + 1}: every argument reaches the handler`,
      received.length === 1 && JSON.stringify(received[0]) === JSON.stringify(sent),
      `got ${JSON.stringify(received[0])}`,
    )
    wrapper('meeting:abc', '2026-10-02', '10:00', '10:30')
    check(`${prop} #${i + 1}: meeting blocks are still ignored`, received.length === 1)
  })
}

// ── 2. page.tsx's (date?, start, end) resolution, fed what the views send ──
const page = read('app/page.tsx')
const body = page.match(/const date = newEndOpt \? newStartOrDate : undefined\n\s+const newStart = .*\n\s+const newEnd = .*\n/)
check('app/page.tsx: argument resolution block found', !!body)
if (body) {
  const resolve = new Function(
    'newStartOrDate', 'newEndOrStart', 'newEndOpt',
    `${body[0]}; return { date, newStart, newEnd }`,
  )
  const week = resolve('2026-10-02', '10:00', '10:30')
  check(
    'week / day view call → date, start, end land in the right slots',
    week.date === '2026-10-02' && week.newStart === '10:00' && week.newEnd === '10:30',
    JSON.stringify(week),
  )
  const grid = resolve('10:00', '10:30', undefined)
  check(
    'single-day grid call (no date) still works',
    grid.date === undefined && grid.newStart === '10:00' && grid.newEnd === '10:30',
    JSON.stringify(grid),
  )
  const truncated = resolve('2026-09-29', '10:00', undefined)
  check(
    'reproduces the bug when the 4th argument is dropped (date becomes start time)',
    truncated.newStart === '2026-09-29',
    JSON.stringify(truncated),
  )
}

// ── 3. The hook refuses a non-time value before touching state or the DB ──
const hook = read('hooks/use-waddle-data.ts')
const clock = hook.match(/const CLOCK_TIME = (\/.*\/)\n/)
check('use-waddle-data.ts: CLOCK_TIME guard found', !!clock && hook.includes('!CLOCK_TIME.test(startTime) || !CLOCK_TIME.test(endTime)'))
if (clock) {
  const re = new Function(`return ${clock[1]}`)()
  const ok = ['00:00', '9:30', '09:30', '23:45', '24:00', '17:15:00']
  const bad = ['2026-09-29', '', 'NaN:NaN', 'undefined', '10', '10:0']
  check('guard accepts every time format the app produces', ok.every((t) => re.test(t)), ok.filter((t) => !re.test(t)).join(','))
  check('guard rejects dates and garbage', bad.every((t) => !re.test(t)), bad.filter((t) => re.test(t)).join(','))
}

// ── 4. The toast now says why ──
{
  const kind = (e) => classifyDbError(e).kind
  const dbReject = classifyDbError({ code: '22007', message: 'invalid input syntax for type time: "2026-09-29"' })
  check('the real production error → shown as error code 22007', dbReject.kind === 'code' && dbReject.code === '22007')
  check('guard refusal → shown as error code BAD_TIME', classifyDbError({ code: 'BAD_TIME' }).kind === 'code')
  check('expired login → auth', kind({ code: 'PGRST303', message: 'JWT expired' }) === 'auth')
  check('dropped connection → network', kind({ code: '', message: 'TypeError: Failed to fetch' }) === 'network' && kind({ code: '', message: 'TypeError: Load failed' }) === 'network')
  check('nothing usable → unknown', kind(null) === 'unknown' && kind({}) === 'unknown')
  const dict = read('lib/i18n/dict/data-layer.ts')
  const keys = ['儲存失敗：{op}（{reason}）', '登入已過期，請重新整理頁面', '網路連線不穩，請稍後再試', '錯誤代碼 {code}']
  check('all four new strings have an English entry', keys.every((k) => dict.includes(`'${k}': '`)), keys.filter((k) => !dict.includes(`'${k}': '`)).join(' / '))
  check('all four new strings are used by the hook', keys.every((k) => hook.includes(`'${k}'`)))
}

console.log(failed ? `\nRESULT: ${failed} FAILED` : '\nRESULT: all checks passed')
process.exit(failed ? 1 : 0)
