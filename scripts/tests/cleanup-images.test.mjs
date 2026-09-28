// node --test scripts/tests/cleanup-images.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { candidates, createHandler, referenceKey, selectDeletions, MAX_DELETE } from '../../supabase/functions/cleanup-images/core.mjs'

const me = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
const other = 'a33d985b-4bcb-456f-9658-9cc1085185ab'
const DAY = 24 * 60 * 60 * 1000
const now = Date.parse('2026-09-28T12:00:00Z')
const at = (msAgo) => new Date(now - msAgo).toISOString()
const img = (uuid, msAgo, ext = 'png') => ({ id: `obj-${uuid}`, name: `${uuid}.${ext}`, created_at: at(msAgo) })
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const U3 = '33333333-3333-4333-8333-333333333333'

test('only unreferenced objects older than 24 hours are deleted', () => {
  const objects = [img(U1, DAY + 1000), img(U2, DAY - 1000), img(U3, 3 * DAY)]
  const paths = selectDeletions({ ownerId: me, objects, referencedKeys: [`${me}/${U3}`], now })
  assert.deepEqual(paths, [`${me}/${U1}.png`])
})

test('an object uploaded within the last 24 hours is never deleted', () => {
  const objects = [img(U1, 0), img(U2, DAY - 1)]
  assert.deepEqual(selectDeletions({ ownerId: me, objects, referencedKeys: [], now }), [])
})

test('a reference from a row owned by someone else keeps the image', () => {
  // The DB lookup is owner-agnostic: e.g. B uploaded into A's task notes.
  const objects = [img(U1, 2 * DAY)]
  assert.deepEqual(selectDeletions({ ownerId: me, objects, referencedKeys: [`${me}/${U1}`], now }), [])
})

test('references match on the object uuid, whatever the extension looks like', () => {
  const objects = [img(U1, 2 * DAY, 'JPG'), img(U2, 2 * DAY, 'fi le')]
  const paths = selectDeletions({ ownerId: me, objects, referencedKeys: [`${me}/${U1}`, `${me}/${U2}`], now })
  assert.deepEqual(paths, [])
})

test('paths are always inside the caller prefix; unknown names and folders are skipped', () => {
  const objects = [
    { id: null, name: U1, created_at: null },                       // a sub-folder
    { id: 'x', name: `../${other}/${U2}.png`, created_at: at(2 * DAY) },
    { id: 'y', name: `${U3}/nested.png`, created_at: at(2 * DAY) },
    { id: 'z', name: 'avatar.png', created_at: at(2 * DAY) },
    { id: 'w', name: `${U2}.png`, created_at: 'not a date' },
  ]
  assert.deepEqual(selectDeletions({ ownerId: me, objects, referencedKeys: [], now }), [])
  assert.equal(referenceKey('not-a-uuid', `${U1}.png`), null)
  assert.deepEqual(candidates({ ownerId: 'not-a-uuid', objects: [img(U1, 2 * DAY)], now }), [])
})

test('deletions are capped per run', () => {
  const objects = Array.from({ length: MAX_DELETE + 50 }, (_, i) =>
    img(`${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, 2 * DAY))
  assert.equal(selectDeletions({ ownerId: me, objects, referencedKeys: [], now }).length, MAX_DELETE)
})

test('a missing reference list is an error, not "nothing is referenced"', () => {
  assert.throws(() => selectDeletions({ ownerId: me, objects: [img(U1, 2 * DAY)], referencedKeys: undefined, now }))
})

function setup(overrides = {}) {
  const calls = { list: [], lookup: [], remove: [] }
  const handler = createHandler({
    getCallerId: async () => me,
    listObjects: async (owner) => { calls.list.push(owner); return [img(U1, 2 * DAY), img(U2, 2 * DAY), img(U3, 60 * 1000)] },
    findReferencedKeys: async (owner, keys) => { calls.lookup.push([owner, keys]); return [`${me}/${U2}`] },
    removeObjects: async (paths) => { calls.remove.push(paths); return paths.length },
    now: () => now,
    log: () => {},
    ...overrides,
  })
  const post = (body) => new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer t' }, body })
  return { handler, calls, post }
}

test('handler scans only the JWT caller folder and ignores the request body', async () => {
  const { handler, calls, post } = setup()
  const res = await handler(post(JSON.stringify({ userId: other, prefix: `${other}/` })))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { scanned: 3, deleted: 1 })
  assert.deepEqual(calls.list, [me])
  assert.deepEqual(calls.lookup, [[me, [`${me}/${U1}`, `${me}/${U2}`]]])
  assert.deepEqual(calls.remove, [[`${me}/${U1}.png`]])
})

test('no valid session means nothing is listed or deleted', async () => {
  const { handler, calls, post } = setup({ getCallerId: async () => null })
  assert.equal((await handler(post())).status, 401)
  assert.equal(calls.list.length + calls.remove.length, 0)
})

test('a failed reference lookup deletes nothing and hides internals', async () => {
  const { handler, calls, post } = setup({ findReferencedKeys: async () => { throw new Error('relation secret_table does not exist') } })
  const res = await handler(post())
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: 'Cleanup failed' })
  assert.equal(calls.remove.length, 0)
})

test('nothing old enough skips the database lookup entirely', async () => {
  const { handler, calls, post } = setup({ listObjects: async () => [img(U1, 1000)] })
  assert.deepEqual(await (await handler(post())).json(), { scanned: 1, deleted: 0 })
  assert.equal(calls.lookup.length, 0)
})

test('GET is rejected and OPTIONS answers CORS', async () => {
  const { handler } = setup()
  assert.equal((await handler(new Request('https://example.test', { method: 'GET' }))).status, 405)
  assert.equal((await handler(new Request('https://example.test', { method: 'OPTIONS' }))).status, 200)
})
