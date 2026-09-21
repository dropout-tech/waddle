const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = ts.transpileModule(fs.readFileSync('lib/desktop-notifications.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function setup() {
  const data = new Map(); const calls = []; const exports = {}; let now = 100
  const bridge = {showNotification: async p => { calls.push(p); return { status: 'submitted' } }, clearNotifications: async () => calls.push('clear') }
  vm.runInNewContext(source, { exports, window: {huddleDesktop:bridge}, localStorage: {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}, Date:{now:()=>now} })
  return {api:exports,calls,bridge,advance:()=>now+=100}
}
const payload = {kind:'water',id:'due',title:'Water',body:'Drink'}
test('default-off and logged-out never send native notifications', async()=>{
  const {api,calls}=setup()
  api.setDesktopNotificationAccount('A')
  assert.equal(await api.notifyDesktop(payload),false)
  api.setDesktopNotificationsEnabled(true)
  assert.equal(await api.notifyDesktop(payload),true)
  api.setDesktopNotificationAccount(null)
  assert.equal(await api.notifyDesktop(payload),false)
  assert.equal(calls.filter(x=>typeof x==='object').length,1)
})
test('account changes clear visible notifications and fence prior focus sessions',async()=>{
  const {api,calls,advance}=setup()
  api.setDesktopNotificationAccount('A');api.setDesktopNotificationsEnabled(true)
  const focus={...payload,kind:'focus',startedAt:100}
  assert.equal(await api.notifyDesktop(focus),true)
  advance();api.setDesktopNotificationAccount('B')
  assert.equal(await api.notifyDesktop(focus),false)
  assert.equal(await api.notifyDesktop({...focus,startedAt:201}),true)
  api.setDesktopNotificationsEnabled(false)
  assert.equal(await api.notifyDesktop(payload),false)
  assert.equal(calls.filter(x=>x==='clear').length,3)
})
test('native failure returns false and long fields are bounded',async()=>{
 const {api,bridge,calls}=setup();api.setDesktopNotificationAccount('A');api.setDesktopNotificationsEnabled(true)
 await api.notifyDesktop({...payload,title:'t'.repeat(500),body:'b'.repeat(999)})
 assert.equal(calls.at(-1).title.length,160);assert.equal(calls.at(-1).body.length,500)
 bridge.showNotification=async()=>{throw Error('IPC unavailable')}
 assert.equal(await api.notifyDesktop(payload),false)
})
test('stale meeting closure cannot send previous-account content after auth changes',async()=>{
  const {api,calls}=setup()
  api.setDesktopNotificationAccount('A');api.setDesktopNotificationsEnabled(true)
  const fromA={kind:'meeting',id:'A-meeting',title:'Private A',body:'A details',expectedAccount:'A'}
  assert.equal(await api.notifyDesktop(fromA),true)
  api.setDesktopNotificationAccount('B')
  assert.equal(await api.notifyDesktop(fromA),false)
  assert.equal(await api.notifyDesktop({...fromA,expectedAccount:undefined}),false)
  assert.equal(await api.notifyDesktop({...fromA,expectedAccount:'B',title:'B meeting',body:'B details'}),true)
  const sent=calls.filter(x=>typeof x==='object')
  assert.equal(sent.length,2);assert.equal(sent[1].title,'B meeting')
})
