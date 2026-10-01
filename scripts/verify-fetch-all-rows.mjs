// Guards the "tasks vanish past row 1000" bug: PostgREST returns at most
// `max_rows` rows per request (1000, local and hosted) and gives no error when
// it truncates, and hooks/use-waddle-data.ts read every task with one
// unranged select. An account with more than 1000 tasks (completed ones
// included) silently lost the rest.
//
//   node scripts/verify-fetch-all-rows.mjs
//
// No login, no network: a stand-in for PostgREST that truncates the same way.
// The live counterpart is scripts/e2e/task-pagination-live-verify.mjs.
import { readFileSync } from 'node:fs'
import { fetchAllRows, FETCH_PAGE_SIZE } from '../lib/supabase/fetch-all-rows.ts'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// A table of `total` rows behind a server that never returns more than
// `maxRows` at once. Mirrors PostgREST: no range → first maxRows rows, no
// error; with an exact count, a range starting past the end → PGRST103.
const fakeTable = (total, maxRows, { withCount = true } = {}) => {
  const table = Array.from({ length: total }, (_, i) => ({ id: `row-${i}` }))
  const calls = []
  const select = async (from = 0, to = Infinity) => {
    calls.push([from, to])
    if (withCount && from > 0 && from >= table.length) {
      return { data: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' }, count: null }
    }
    const data = table.slice(from, Math.min(to + 1, from + maxRows))
    return { data, error: null, count: withCount ? table.length : null }
  }
  return { table, calls, select }
}
const sameRows = (got, table) =>
  got.length === table.length && got.every((r, i) => r.id === table[i].id)

// ── 1. The bug: one unranged request against a 1000-row server ──
{
  const { select } = fakeTable(1050, 1000)
  const { data, error } = await select()
  check('unranged select of 1050 rows is cut to 1000 with no error (the bug)',
    data.length === 1000 && error === null, `got ${data.length} rows, error=${error}`)
}

// ── 2. fetchAllRows returns every row, in order, without repeats ──
for (const total of [0, 1, 999, 1000, 1001, 1050, 2500]) {
  const { table, calls, select } = fakeTable(total, 1000)
  const { data, error } = await fetchAllRows(select)
  const expectedCalls = Math.max(1, Math.ceil(total / 1000))
  check(`fetchAllRows: ${total} rows → all ${total} returned`,
    error === null && sameRows(data, table), `got ${data?.length}`)
  check(`fetchAllRows: ${total} rows → ${expectedCalls} request(s), no extra round trip`,
    calls.length === expectedCalls, `made ${calls.length}`)
}

// ── 3. It must not depend on the server limit matching the page size ──
{
  const { table, select } = fakeTable(1050, 300)
  const { data, error } = await fetchAllRows(select)
  check('server limit lowered to 300 → still all 1050 rows',
    error === null && sameRows(data, table), `got ${data?.length}`)
}
{
  const { table, select } = fakeTable(2500, 1000, { withCount: false })
  const { data, error } = await fetchAllRows(select)
  check('no count reported → pages until an empty page, all 2500 rows',
    error === null && sameRows(data, table), `got ${data?.length}`)
}

// ── 4. Failures ──
{
  const { select } = fakeTable(2500, 1000)
  let n = 0
  const flaky = (from, to) => (++n === 2
    ? Promise.resolve({ data: null, error: { code: '', message: 'TypeError: Failed to fetch' }, count: null })
    : select(from, to))
  const { data, error } = await fetchAllRows(flaky)
  check('second page fails → error surfaced, no partial list passed off as complete',
    data === null && error?.message === 'TypeError: Failed to fetch')
}
{
  const failing = () => Promise.resolve({ data: null, error: { code: 'PGRST103', message: 'x' }, count: null })
  const { data, error } = await fetchAllRows(failing)
  check('PGRST103 on the very first page is still an error', data === null && error?.code === 'PGRST103')
}

// ── 5. Another device writes while we are between two pages ──
// `mutate` runs right after page 1 is served, `times` times in total.
const racing = (total, mutate, times = 1) => {
  const fake = fakeTable(total, 1000)
  let left = times
  let n = 0
  const select = async (from, to) => {
    const res = await fake.select(from, to)
    if (from === 0 && left-- > 0) mutate(fake.table, n++)
    return res
  }
  return { ...fake, select }
}
const distinct = (rows) => new Set(rows.map((r) => r.id)).size
{
  // A task is added ahead of the boundary: without a re-read, row 999 would
  // come back twice and the new task not at all.
  const { table, select } = racing(1050, (t) => t.unshift({ id: 'new-task' }))
  const { data, error } = await fetchAllRows(select)
  check('task added elsewhere between pages → re-read, no repeat, new task present',
    error === null && sameRows(data, table) && distinct(data) === 1051, `got ${data?.length} rows, ${distinct(data ?? [])} distinct`)
}
{
  // A task is deleted ahead of the boundary: without a re-read, row 1000 would be skipped.
  const { table, select } = racing(1050, (t) => t.shift())
  const { data, error } = await fetchAllRows(select)
  check('task deleted elsewhere between pages → re-read, nothing skipped',
    error === null && sameRows(data, table) && data.length === 1049, `got ${data?.length}`)
}
{
  // 1001 rows when page 1 was read; two are deleted before page 2, so page 2 starts past the end.
  const { table, select } = racing(1001, (t) => t.splice(-2, 2))
  const { data, error } = await fetchAllRows(select)
  check('rows deleted so the next range is past the end (PGRST103) → re-read, ends cleanly',
    error === null && sameRows(data, table) && data.length === 999, `got ${data?.length}, error=${error?.code}`)
}
{
  // The table keeps changing on every pass: re-read once only, then finish.
  const { calls, select } = racing(2500, (t, n) => t.unshift({ id: `new-${n}` }), Infinity)
  const { data, error } = await fetchAllRows(select)
  check('table changing on every pass → still terminates (one re-read at most)',
    error === null && data.length >= 2500 && calls.length <= 5, `got ${data?.length} rows in ${calls.length} requests`)
}

// ── 6. The hook actually uses it, for both the initial load and the refetch ──
const hook = readFileSync(new URL('../hooks/use-waddle-data.ts', import.meta.url), 'utf8')
const tasksRead = hook.match(/fetchAllRows\(\(from, to\) => supabase\.from\('tasks'\)[\s\S]*?\.range\(from, to\)\)/)?.[0] ?? ''
check('use-waddle-data: tasks are read through fetchAllRows', tasksRead !== '')
check('use-waddle-data: tasks read asks for an exact count', tasksRead.includes("{ count: 'exact' }"))
check('use-waddle-data: tasks read orders by sort_order, then created_at, then the unique id',
  /order\('sort_order'[^)]*\)\s*\.order\('created_at'[^)]*\)\s*\.order\('id'/.test(tasksRead))
check('use-waddle-data: no unranged bulk tasks read is left',
  !/supabase\.from\('tasks'\)\.select\('\*'\)\.order\(/.test(hook))
check('use-waddle-data: the foreground refetch goes through the same loadData',
  /void loadData\(\{ initial: false \}\)/.test(hook) && (hook.match(/const readAll = /g) ?? []).length === 1)
// reads[2] must be the tasks entry of readAll's Promise.all for the guard to guard anything.
const readAllEntries = (/const readAll = [^\n]*\n([\s\S]*?)\n\s*\]\)/.exec(hook)?.[1] ?? '')
  .split('\n').map((l) => l.trim()).filter((l) => !l.startsWith('//') && !l.startsWith('.'))
check('use-waddle-data: a failed tasks read on a background refresh keeps the current list',
  /if \(!initial && reads\[2\]\.error\) return/.test(hook) && readAllEntries[2]?.includes("from('tasks')"),
  `reads[2] is: ${readAllEntries[2]?.slice(0, 60)}`)
check('FETCH_PAGE_SIZE is 1000', FETCH_PAGE_SIZE === 1000)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
