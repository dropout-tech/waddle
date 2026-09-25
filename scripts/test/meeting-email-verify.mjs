// The retired email endpoint must never use credentials, a DB client or a network call.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const source = readFileSync(
  new URL(
    '../../supabase/functions/send-meeting-invitations/index.ts',
    import.meta.url,
  ),
  'utf8',
)
let handler
vm.runInNewContext(source, {
  Deno: {
    serve: (fn) => {
      handler = fn
    },
  },
  Response,
  JSON,
  fetch: () => {
    throw new Error('Email must never be sent')
  },
})
for (const method of ['POST', 'GET']) {
  const response = await handler(
    new Request('https://example.invalid', { method }),
  )
  assert.equal(response.status, 410)
  assert.deepEqual(await response.json(), {
    error: 'email_disabled',
    channel: 'in_app',
  })
}
assert.equal(
  (await handler(new Request('https://example.invalid', { method: 'OPTIONS' })))
    .status,
  200,
)
console.log(
  'PASS: retired email endpoint, POST/GET disabled, CORS, no network or credentials.',
)
