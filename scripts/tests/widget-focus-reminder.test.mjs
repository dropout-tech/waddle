// iOS 到點通知（lib/widgets/reminders.ts）: a pomodoro break ending must say
// 休息結束, never 專注完成 — the break counts down with the same endAt.
// Run: node --test scripts/tests/widget-focus-reminder.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const tsFile=base=>existsSync(base+'.ts')?base+'.ts':existsSync(resolve(base,'index.ts'))?resolve(base,'index.ts'):null
// Native-only module + platform check are stubbed: the plugin records what would be scheduled.
const STUBS={
  '@capacitor/local-notifications':'export const LocalNotifications=globalThis.__LN',
  '@/lib/platform':'export const isNative=()=>true;export const isDesktop=()=>false;export const getPlatform=()=>"ios"',
}
registerHooks({resolve(specifier,context,next){
  if(STUBS[specifier])return {url:'data:text/javascript,'+encodeURIComponent(STUBS[specifier]),shortCircuit:true}
  if(specifier.startsWith('@/'))return next(pathToFileURL(tsFile(resolve(specifier.slice(2)))).href,context)
  if(specifier.startsWith('.')&&context.parentURL&&!/\.[cm]?[jt]s$/.test(specifier)){
    const file=tsFile(fileURLToPath(new URL(specifier,context.parentURL)))
    if(file)return next(pathToFileURL(file).href,context)
  }
  return next(specifier,context)
}})
let scheduled=[]
globalThis.__LN={
  getPending:async()=>({notifications:[]}),
  cancel:async()=>{},
  checkPermissions:async()=>({display:'granted'}),
  requestPermissions:async()=>({display:'granted'}),
  schedule:async({notifications})=>{scheduled=notifications},
}
const store=new Map()
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}
const {clearWidgetReminders,enableWidgetReminders,syncWidgetReminders}=await import('../../lib/widgets/reminders.ts')
const {setLang}=await import('../../lib/i18n/index.ts')

const ACCOUNT='acct-1'
await clearWidgetReminders(ACCOUNT)
await enableWidgetReminders(ACCOUNT)
const snap=(focus)=>({accountId:ACCOUNT,pet:null,water:{enabled:false,nextAt:null,count:0},focus:{mode:'pomodoro',state:'running',title:'x',seconds:300,note:'',endAt:Date.now()+300_000,...focus}})
const focusNote=()=>scheduled.find(n=>n.id===2100000001)

test('work session → 專注完成 (unchanged)',async()=>{
  setLang('zh-TW')
  await syncWidgetReminders(snap({phase:'work'}))
  assert.equal(focusNote().title,'Huddle · 專注完成')
  assert.equal(focusNote().extra.destination,'focus-note')
})
test('break → 休息結束, never 專注',async()=>{
  setLang('zh-TW')
  await syncWidgetReminders(snap({phase:'break',endAt:Date.now()+300_001}))
  assert.equal(focusNote().title,'Huddle · 休息結束')
  assert.ok(!/專注完成/.test(focusNote().title+focusNote().body))
  assert.equal(focusNote().extra.destination,'focus')
})
test('break in English has no Chinese',async()=>{
  setLang('en')
  await syncWidgetReminders(snap({phase:'break',endAt:Date.now()+300_002}))
  assert.equal(focusNote().title,'Huddle · Break is over')
  assert.ok(!/[㐀-鿿]/.test(focusNote().title+focusNote().body),focusNote().body)
  setLang('zh-TW')
})
test('work → break with the same endAt still re-schedules (phase is part of the signature)',async()=>{
  setLang('zh-TW')
  const endAt=Date.now()+300_003
  await syncWidgetReminders(snap({phase:'work',endAt}))
  assert.equal(focusNote().title,'Huddle · 專注完成')
  await syncWidgetReminders(snap({phase:'break',endAt}))
  assert.equal(focusNote().title,'Huddle · 休息結束')
})
