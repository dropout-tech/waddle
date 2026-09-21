const { test } = require('node:test')
const assert = require('node:assert/strict')
const { windowOpenPolicy } = require('./navigation.cjs')
test('same-origin floating panels open with the hardened preload and sandbox', () => {
  const result = windowOpenPolicy('https://waddle.zeabur.app/float/scratchpad', 'https://waddle.zeabur.app', '/app/desktop/preload.cjs')
  assert.equal(result.action, 'allow')
  assert.deepEqual(result.overrideBrowserWindowOptions.webPreferences, {
    preload:'/app/desktop/preload.cjs',contextIsolation:true,nodeIntegration:false,sandbox:true,
  })
})
test('cross-origin, deceptive host, script and malformed popouts are denied', () => {
  for (const url of ['https://evil.test/float/scratchpad','https://waddle.zeabur.app.evil.test','javascript:alert(1)','not a url','http://waddle.zeabur.app']) {
    assert.equal(windowOpenPolicy(url,'https://waddle.zeabur.app','preload').action,'deny')
  }
})
test('only the same-origin floating host is always on top; arbitrary blank windows remain denied', () => {
  const origin = 'https://waddle.zeabur.app'
  assert.equal(windowOpenPolicy(origin + '/floating-host.html', origin, 'preload').overrideBrowserWindowOptions.alwaysOnTop, true)
  assert.equal(windowOpenPolicy(origin + '/about', origin, 'preload').overrideBrowserWindowOptions.alwaysOnTop, undefined)
  assert.equal(windowOpenPolicy('https://evil.test/floating-host.html', origin, 'preload').action, 'deny')
  assert.equal(windowOpenPolicy('about:blank', origin, 'preload').action, 'deny')
})
