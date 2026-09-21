const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createNotifications } = require('./notifications.cjs')
function setup() {
  const calls = []; let focused = 0; let time = 0
  class Notification extends EventEmitter {
    static supported = true
    static isSupported() { return this.supported }
    constructor(options) { super(); this.options = options; calls.push(this) }
    show() { this.shown = true }
    close() { this.emit('close') }
  }
  const api = createNotifications({ Notification, trusted: e => e === 'main-frame', focus: () => focused++, now: () => time })
  return { api, calls, Notification, focused: () => focused, advance: ms => time += ms }
}
const payload = { kind: 'meeting', id: '123', title: ' Meeting\n now ', body: 'hello', url: 'https://evil.invalid', icon: '/secret' }
test('rejects untrusted frame before status or sending', () => {
  const { api, calls } = setup()
  assert.throws(() => api.status('iframe')); assert.throws(() => api.show('iframe', payload)); assert.equal(calls.length, 0)
})
test('validates bounded kind, text, id and sound', () => {
  const { api } = setup()
  for (const bad of [null, {}, {...payload, kind:'shell'}, {...payload,id:'x'.repeat(201)}, {...payload,title:''}, {...payload,body:'x'.repeat(501)}, {...payload,silent:'false'}]) assert.throws(() => api.show('main-frame', bad))
})
test('only sanitized display fields reach OS and click focuses app', () => {
  const { api, calls, focused } = setup()
  assert.equal(api.show('main-frame', payload).status, 'submitted')
  assert.deepEqual(calls[0].options, { title:'Meeting now', body:'hello', silent:false })
  calls[0].emit('click'); assert.equal(focused(),1)
  assert.equal(api.show('main-frame', payload).status, 'duplicate')
})
test('capability does not claim OS permission; failures reported', () => {
  const { api, calls, Notification } = setup()
  assert.equal(api.status('main-frame').permission, 'unknown')
  Notification.supported = false; assert.equal(api.show('main-frame',payload).status,'unsupported')
  Notification.supported = true; api.show('main-frame',payload); calls[0].emit('failed')
  assert.equal(api.status('main-frame').lastError,'delivery_failed')
})
test('bounds bursts and expires dedupe while honoring silent preference', () => {
  const { api, calls, advance } = setup()
  for(let i=0;i<5;i++) assert.equal(api.show('main-frame',{...payload,id:String(i),silent:true}).status,'submitted')
  assert.equal(api.show('main-frame',{...payload,id:'six'}).status,'rate_limited')
  calls.forEach(n=>n.close()); advance(86400001)
  assert.equal(api.show('main-frame',{...payload,id:'0'}).status,'submitted')
  assert.equal(calls[0].options.silent,true)
})
