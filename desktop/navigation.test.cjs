const { test } = require('node:test')
const assert = require('node:assert/strict')
const { windowOpenPolicy } = require('./navigation.cjs')
test('same-origin floating panels open with the hardened preload and sandbox', () => {
  const result = windowOpenPolicy('https://huddle.lazy72.com/float/scratchpad', 'https://huddle.lazy72.com', '/app/desktop/preload.cjs')
  assert.equal(result.action, 'allow')
  assert.deepEqual(result.overrideBrowserWindowOptions.webPreferences, {
    preload:'/app/desktop/preload.cjs',contextIsolation:true,nodeIntegration:false,sandbox:true,
  })
})
test('cross-origin, deceptive host, script and malformed popouts are denied', () => {
  for (const url of ['https://evil.test/float/scratchpad','https://huddle.lazy72.com.evil.test','javascript:alert(1)','not a url','http://huddle.lazy72.com']) {
    assert.equal(windowOpenPolicy(url,'https://huddle.lazy72.com','preload').action,'deny')
  }
})
test('only the same-origin floating host is always on top; arbitrary blank windows remain denied', () => {
  const origin = 'https://huddle.lazy72.com'
  assert.equal(windowOpenPolicy(origin + '/floating-host.html', origin, 'preload').overrideBrowserWindowOptions.alwaysOnTop, true)
  assert.equal(windowOpenPolicy(origin + '/about', origin, 'preload').overrideBrowserWindowOptions.alwaysOnTop, undefined)
  assert.equal(windowOpenPolicy('https://evil.test/floating-host.html', origin, 'preload').action, 'deny')
  assert.equal(windowOpenPolicy('about:blank', origin, 'preload').action, 'deny')
})
test('on macOS only the floating host becomes a panel so it can float above full-screen apps', () => {
  const origin = 'https://huddle.lazy72.com'
  assert.equal(windowOpenPolicy(origin + '/floating-host.html', origin, 'preload', 'darwin').overrideBrowserWindowOptions.type, 'panel')
  assert.equal(windowOpenPolicy(origin + '/float/note', origin, 'preload', 'darwin').overrideBrowserWindowOptions.type, undefined)
  assert.equal(windowOpenPolicy(origin + '/floating-host.html', origin, 'preload', 'win32').overrideBrowserWindowOptions.type, undefined)
})
