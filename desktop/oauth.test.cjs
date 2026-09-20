const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createOAuth } = require('./oauth.cjs')
test('desktop OAuth state, PKCE, external opening, restart, cancellation, timeout, replay', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'huddle-oauth-'))
  let clock = 1000
  const opened = []
  const config = { file: path.join(dir,'pending.json'), origin:'https://waddle.zeabur.app', now: () => clock, openExternal: async url => opened.push(url) }
  const flow = createOAuth(config)
  const state = flow.begin()
  const redirect = `https://waddle.zeabur.app/auth/callback?desktop=1&desktop_state=${state}`
  const authorize = new URL('https://jnikcndiexjojgvicohf.supabase.co/auth/v1/authorize')
  for (const [k,v] of Object.entries({provider:'google',redirect_to:redirect,code_challenge:'test',code_challenge_method:'s256'})) authorize.searchParams.set(k,v)
  await flow.open(authorize.href)
  assert.equal(opened.length,1)
  await assert.rejects(flow.open(authorize.href.replace('jnikcndiexjojgvicohf.supabase.co','evil.supabase.co')))
  const deep = `huddle-desktop://auth/callback?state=${state}&code=auth-code`
  assert.equal(flow.consume(deep.replace(state,'wrong')),null)
  assert.equal(flow.consume(deep+'&access_token=secret'),null)
  assert.equal(flow.consume(deep.replace('://auth/','://evil/')),null)
  // A fresh process can consume the pending state without persisting credentials.
  const restarted = createOAuth(config)
  const result = new URL(restarted.consume(deep))
  assert.equal(result.searchParams.get('code'),'auth-code')
  assert.equal(result.searchParams.get('desktop_return'),'1')
  assert.equal(flow.consume(deep),null)
  const cancelled = flow.begin(); flow.cancel()
  assert.equal(flow.consume(`huddle-desktop://auth/callback?state=${cancelled}&code=x`),null)
  const expired = flow.begin(); clock += 300001
  assert.equal(flow.consume(`huddle-desktop://auth/callback?state=${expired}&code=x`),null)
  fs.rmSync(dir,{recursive:true})
})
