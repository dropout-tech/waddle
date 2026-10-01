// fetchAllRows (lib/supabase/fetch-all-rows.ts) paging and stop conditions,
// against an in-memory page function — nothing leaves this process.
// Run: node --test scripts/tests/fetch-all-rows.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
const { fetchAllRows, FETCH_PAGE_SIZE } = await import('../../lib/supabase/fetch-all-rows.ts')

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: i }))
function source(rows, { withCount = true, maxCalls = 20 } = {}) {
  const calls = []
  const page = async (from, to) => {
    calls.push([from, to])
    assert.ok(calls.length <= maxCalls, 'fetchAllRows kept paging: would loop forever')
    return { data: rows.slice(from, to + 1), error: null, count: withCount ? rows.length : null }
  }
  return { page, calls }
}

test('stops once the exact count is reached', async () => {
  const { page, calls } = source(makeRows(FETCH_PAGE_SIZE + 5))
  const { data, error } = await fetchAllRows(page)
  assert.equal(error, null)
  assert.equal(data.length, FETCH_PAGE_SIZE + 5)
  assert.equal(calls.length, 2)
})

test('no total count: a short page ends the loop instead of paging forever', async () => {
  const { page, calls } = source(makeRows(7), { withCount: false })
  const { data, error } = await fetchAllRows(page)
  assert.equal(error, null)
  assert.equal(data.length, 7)
  assert.equal(calls.length, 1)
})

test('no total count and a mock that ignores the range (always the same rows): still terminates', async () => {
  const calls = []
  const page = async (from, to) => {
    calls.push([from, to])
    assert.ok(calls.length <= 5, 'fetchAllRows kept paging: would loop forever')
    return { data: makeRows(7), error: null, count: null }
  }
  const { data, error } = await fetchAllRows(page)
  assert.equal(error, null)
  assert.equal(data.length, 7)
  assert.equal(calls.length, 1)
})

test('no total count: full pages continue, the first short page stops', async () => {
  const { page, calls } = source(makeRows(FETCH_PAGE_SIZE + 3), { withCount: false })
  const { data } = await fetchAllRows(page)
  assert.equal(data.length, FETCH_PAGE_SIZE + 3)
  assert.equal(calls.length, 2)
})

test('empty result returns an empty list', async () => {
  const { page } = source([], { withCount: false })
  const { data, error } = await fetchAllRows(page)
  assert.equal(error, null)
  assert.deepEqual(data, [])
})

test('an error is returned, never a partial list', async () => {
  const boom = { code: 'X', message: 'boom' }
  const { data, error } = await fetchAllRows(async () => ({ data: null, error: boom, count: null }))
  assert.equal(data, null)
  assert.equal(error, boom)
})
