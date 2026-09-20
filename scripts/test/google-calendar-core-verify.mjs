import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs'
import vm from 'node:vm'
import {SCOPE,seal,unseal,hash,eventId,occurs,desiredEvents,sameEvent,wallInstant} from '../../supabase/functions/google-calendar/core.mjs'
const require=createRequire(import.meta.url),ts=require('typescript')
const compiled=ts.transpileModule(fs.readFileSync(new URL('../../lib/calendar-utils.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const ctx={exports:{},Date};vm.runInNewContext(compiled,ctx)
let checks=0;const test=(name,fn)=>{fn();checks++}
const secret=Buffer.alloc(32,42).toString('base64url'),encrypted=await seal('refresh-secret',secret,'userA')
assert.equal(await unseal(encrypted,secret,'userA'),'refresh-secret');checks++
await assert.rejects(unseal(encrypted,secret,'userB'));checks++
await assert.rejects(unseal(encrypted.slice(0,-3)+'abc',secret,'userA'));checks++
assert.equal((await hash('state')).length,43);checks++
assert.match(await eventId('source'),/^[a-v0-9]{65}$/);checks++
assert.equal(await eventId('source'),await eventId('source'));checks++
assert.notEqual(await eventId('source'),await eventId('source2'));checks++
assert.equal(SCOPE,'https://www.googleapis.com/auth/calendar.app.created');checks++
for(const type of ['daily','weekly','monthly','custom'])for(const interval of [1,2,3]){
 const raw={scheduled_date:'2026-01-31',is_recurring:true,recurrence_type:type,recurrence_interval:interval,recurrence_days_of_week:[1,4],recurrence_end_date:'2026-08-31',exdates:['2026-02-02']}
 const task={scheduledDate:raw.scheduled_date,isRecurring:true,recurrence:{type,interval,daysOfWeek:[1,4],endDate:raw.recurrence_end_date},exdates:raw.exdates}
 for(let i=0;i<400;i++){const d=new Date(2026,0,1+i),day=ctx.exports.toDateString(d);assert.equal(occurs(raw,day),ctx.exports.taskOccursOnDate(task,d),type+day);checks++}
}
test('timezone conversion',()=>assert.equal(wallInstant('2026-09-21','09:00:00','Asia/Taipei'),'2026-09-21T01:00:00.000Z'))
test('DST gap rejected',()=>assert.throws(()=>wallInstant('2026-03-08','02:30:00','America/New_York')))
test('DST ambiguity rejected',()=>assert.throws(()=>wallInstant('2026-11-01','01:30:00','America/New_York')))
const task={id:'t1',workspace_id:'w1',title:'Own task',scheduled_date:'2026-09-21',scheduled_start_time:'23:00:00',scheduled_end_time:'01:00:00'},conn={workspace_ids:['w1'],time_zone:'Asia/Taipei'}
const snapshot={tasks:[task,{...task,id:'other',workspace_id:'w2'}],meetings:[],mappings:[]}
const result=desiredEvents(snapshot,conn,new Date('2026-09-21T00:00:00Z'))
test('only own selected workspace',()=>assert.equal(result.events.size,1))
const body=result.events.values().next().value
test('overnight exclusive end',()=>assert.equal(body.end.dateTime,'2026-09-21T17:00:00.000Z'))
test('same normalized Google response',()=>assert.equal(sameEvent({...body,start:{dateTime:'2026-09-21T23:00:00+08:00'},end:{dateTime:'2026-09-22T01:00:00+08:00'}},body),true))
test('external changes conflict',()=>assert.equal(sameEvent({...body,summary:'Google edited'},body),false))
test('no attendee sends',()=>assert.equal('attendees' in body,false))
test('completed retained',()=>assert.equal(desiredEvents({...snapshot,tasks:[{...task,is_completed:true}]},conn,new Date('2026-09-21')).events.size,1))
test('archived removed',()=>assert.equal(desiredEvents({...snapshot,tasks:[{...task,is_archived:true}]},conn,new Date('2026-09-21')).events.size,0))
test('unscheduled ignored',()=>assert.equal(desiredEvents({...snapshot,tasks:[{...task,scheduled_start_time:null,scheduled_end_time:null}]},conn,new Date('2026-09-21')).events.size,0))
test('partial missing schedule fails closed',()=>assert.throws(()=>desiredEvents({...snapshot,tasks:[{...task,scheduled_end_time:null}]},conn,new Date('2026-09-21'))))
test('old synced history retained',()=>assert.equal(desiredEvents({...snapshot,tasks:[{...task,scheduled_date:'2026-01-01'}],mappings:[{source_key:'task:t1:2026-01-01'}]},conn,new Date('2026-09-21')).events.size,1))
test('no initial old history export',()=>assert.equal(desiredEvents({...snapshot,tasks:[{...task,scheduled_date:'2026-01-01'}]},conn,new Date('2026-09-21')).events.size,0))
test('midnight end 24 normalized',()=>assert.equal(desiredEvents({...snapshot,tasks:[{...task,scheduled_end_time:'24:00:00'}]},conn,new Date('2026-09-21')).events.values().next().value.end.dateTime,'2026-09-21T16:00:00.000Z'))
console.log(`PASS ${checks} Google crypto, timezone, recurrence equivalence, privacy and reconciliation core assertions`)
