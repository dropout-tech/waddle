// Widget → app queue replay (lib/widgets/actions.ts) against a real supabase-js
// client whose fetch is mocked by URL path — nothing leaves this process.
// Run: node --test scripts/tests/widget-actions.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('@/'))return next(pathToFileURL(resolve(specifier.slice(2)+'.ts')).href,context);return next(specifier,context)}})
const {applyWidgetActions,withWatchFocus,WATCH_FOCUS_TTL_MS}=await import('../../lib/widgets/actions.ts')

const NOW=Date.UTC(2026,8,28,4,0,0)
function mockDb(rows){
  const calls=[]
  const fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url), method=(init.method??'GET').toUpperCase()
    const body=init.body?JSON.parse(init.body):undefined
    calls.push({method,path:url.pathname,query:Object.fromEntries(url.searchParams),body})
    if(url.pathname!=='/rest/v1/tasks') return new Response('{"message":"unexpected route"}',{status:404})
    const id=url.searchParams.get('id')?.replace(/^eq\./,''), row=rows[id]
    if(method==='GET'){
      const wantsObject=String(new Headers(init.headers).get('accept')??'').includes('vnd.pgrst.object')
      if(wantsObject) return row?Response.json(row):new Response('{"code":"PGRST116"}',{status:406})
      return Response.json(row?[row]:[])
    }
    if(method==='PATCH'){
      const matches=row && url.searchParams.get('updated_at')===`eq.${row.updated_at}`
      if(matches) Object.assign(row,body)
      return Response.json(matches?[{id}]:[])
    }
    return new Response('{}',{status:405})
  }
  return {db:createClient('https://mock.supabase.local','anon-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false}}),calls}
}
const row=(id,extra={})=>({id,is_completed:false,updated_at:'rev-1',is_recurring:false,is_archived:false,...extra})
function deps(db,over={}){
  const log={focus:[],water:[],notify:[]}
  return {log,deps:{db,source:'owner-a',epoch:'epoch-a',isCurrent:()=>true,now:()=>NOW,
    focus:(op,at)=>log.focus.push([op,at]),water:at=>log.water.push(at),notify:m=>log.notify.push(m),...over}}
}
const base={accountId:'owner-a',epoch:'epoch-a'}

test('legacy complete-only action still completes with an explicit SET guarded by revision',async()=>{
  const {db,calls}=mockDb({t1:row('t1')}), {deps:d}=deps(db)
  const r=await applyWidgetActions([{id:'a1',taskId:'t1',revision:'rev-1',...base}],d)
  assert.deepEqual(r,{handled:['a1'],aborted:false})
  const patch=calls.find(c=>c.method==='PATCH')
  assert.equal(patch.path,'/rest/v1/tasks')
  assert.deepEqual([patch.query.id,patch.query.user_id,patch.query.updated_at],['eq.t1','eq.owner-a','eq.rev-1'])
  assert.equal(patch.body.is_completed,true);assert.equal(patch.body.completed_at,new Date(NOW).toISOString())
})
test('untick from the widget clears completion',async()=>{
  const {db,calls}=mockDb({t1:row('t1',{is_completed:true})}), {deps:d}=deps(db)
  const r=await applyWidgetActions([{id:'a1',type:'task',taskId:'t1',revision:'rev-1',completed:false,...base}],d)
  assert.deepEqual(r.handled,['a1'])
  assert.deepEqual(calls.find(c=>c.method==='PATCH').body,{is_completed:false,completed_at:null})
})
test('stale revision is dropped with a notice, already-at-target is dropped silently, neither writes',async()=>{
  const {db,calls}=mockDb({t1:row('t1',{updated_at:'rev-2'}),t2:row('t2',{is_completed:true})}), {deps:d,log}=deps(db)
  const r=await applyWidgetActions([{id:'a1',type:'task',taskId:'t1',revision:'rev-1',completed:true,...base},{id:'a2',type:'task',taskId:'t2',revision:'rev-1',completed:true,...base}],d)
  assert.deepEqual(r.handled,['a1','a2'])
  assert.equal(calls.filter(c=>c.method==='PATCH').length,0)
  assert.equal(log.notify.length,1)
})
test('water taps re-arm the reminder at the tap time; future timestamps are clamped',async()=>{
  const {db,calls}=mockDb({}), {deps:d,log}=deps(db)
  const r=await applyWidgetActions([{id:'w1',type:'water',at:NOW-60_000,...base},{id:'w2',type:'water',at:NOW+3_600_000,...base}],d)
  assert.deepEqual(r.handled,['w1','w2']);assert.deepEqual(log.water,[NOW-60_000,NOW]);assert.equal(calls.length,0)
})
test('focus taps apply one per pass, in order; the rest wait for the next sync',async()=>{
  const {db}=mockDb({}), {deps:d,log}=deps(db)
  const q=[{id:'f1',type:'focus',op:'start',at:NOW-600_000,...base},{id:'f2',type:'focus',op:'pause',at:NOW-300_000,...base},{id:'f3',type:'focus',op:'explode',at:NOW,...base}]
  let r=await applyWidgetActions(q,d)
  assert.deepEqual(r.handled,['f1']);assert.deepEqual(log.focus,[['start',NOW-600_000]])
  r=await applyWidgetActions(q.filter(a=>!r.handled.includes(a.id)),d)
  assert.deepEqual(r.handled,['f2']);assert.deepEqual(log.focus.at(-1),['pause',NOW-300_000])
  r=await applyWidgetActions([q[2]],d)
  assert.deepEqual(r.handled,['f3'],'unknown op is dropped, not applied');assert.equal(log.focus.length,2)
})
test('other accounts / epochs are never replayed, and an account switch aborts mid-queue',async()=>{
  const {db,calls}=mockDb({t1:row('t1')})
  let {deps:d}=deps(db)
  let r=await applyWidgetActions([{id:'x',taskId:'t1',revision:'rev-1',accountId:'owner-b',epoch:'epoch-a'},{id:'y',type:'water',at:NOW,accountId:'owner-a',epoch:'old'}],d)
  assert.deepEqual(r.handled,[]);assert.equal(calls.length,0)
  ;({deps:d}=deps(db,{isCurrent:()=>false}))
  r=await applyWidgetActions([{id:'a1',taskId:'t1',revision:'rev-1',...base}],d)
  assert.deepEqual(r,{handled:[],aborted:true});assert.equal(calls.length,0)
})
test('water reminder: widget glass sets next reminder one interval later, never earlier than a newer one',async()=>{
  const store=new Map();globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}}
  const w=await import('../../lib/water-reminder.ts')
  w.setWaterReminderInterval(30)
  w.recordWaterFromWidget(NOW);assert.equal(w.getWaterNextDueAt(),NOW+30*60_000)
  w.recordWaterFromWidget(NOW-3_600_000);assert.equal(w.getWaterNextDueAt(),NOW+30*60_000)
  delete globalThis.window
})
test('watch focus command joins the widget focus path in time order; simultaneous pauses never double-flip',async()=>{
  const {db}=mockDb({})
  // Minimal timer with applyWidgetFocus's state guards (components/timer/focus-timer-provider.tsx).
  let state='running'; const applied=[]
  const {deps:d}=deps(db,{focus:(op,at)=>{applied.push([op,at]);if(op==='pause'&&state==='running')state='paused';else if(op==='resume'&&state==='paused')state='running'}})
  const widget=[{id:'w-pause',type:'focus',op:'pause',at:NOW-2_000,...base}]
  const watch={id:'watch-1',action:'pause',at:NOW-1_000,...base}
  let {queue,dropped}=withWatchFocus(widget,watch,'owner-a','epoch-a',NOW)
  assert.deepEqual(queue.map(a=>a.id),['w-pause','watch-1']);assert.deepEqual(dropped,[])
  let r=await applyWidgetActions(queue,d)
  assert.deepEqual(r.handled,['w-pause'],'watch pause waits for the next pass');assert.equal(state,'paused')
  ;({queue}=withWatchFocus([],watch,'owner-a','epoch-a',NOW))
  r=await applyWidgetActions(queue,d)
  assert.deepEqual(r.handled,['watch-1']);assert.equal(state,'paused','second pause is a no-op, not a resume')
  assert.deepEqual(applied.map(a=>a[0]),['pause','pause'])
  // An earlier watch tap is placed before a later widget tap.
  ;({queue}=withWatchFocus([{id:'w2',type:'focus',op:'resume',at:NOW,...base}],{...watch,at:NOW-5_000},'owner-a','epoch-a',NOW))
  assert.deepEqual(queue.map(a=>a.id),['watch-1','w2'])
})
test('stale or foreign watch focus commands are acknowledged without being applied',()=>{
  const cmd={id:'watch-old',action:'start',at:NOW-WATCH_FOCUS_TTL_MS,...base}
  assert.deepEqual(withWatchFocus([],cmd,'owner-a','epoch-a',NOW),{queue:[],dropped:['watch-old']})
  assert.deepEqual(withWatchFocus([],{...cmd,at:NOW,epoch:'old'},'owner-a','epoch-a',NOW),{queue:[],dropped:['watch-old']})
  assert.deepEqual(withWatchFocus([],undefined,'owner-a','epoch-a',NOW),{queue:[],dropped:[]})
})
