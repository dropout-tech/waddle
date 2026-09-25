import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('@/'))return next(pathToFileURL(resolve(specifier.slice(2)+'.ts')).href,context);return next(specifier,context)}})
const {makeSnapshot,monthDays,parseWidgetURL,plainText,focusNoteExcerpt}=await import('../../lib/widgets/model.ts')
const base={id:'task-a',title:'準備提案',categoryName:'工作',isCompleted:false,scheduledDate:'2026-09-25',sortOrder:0,updatedAt:'rev-1',showInTaskList:true}
const args={accountId:'owner-a',epoch:'epoch-a',tasks:[],blocks:[],boards:{},now:new Date(2026,8,25,12)}
test('42 day grid uses local dates, correct weekdays, leap month and year rollover',()=>{
 for(const date of [new Date(2026,8,25),new Date(2028,1,29),new Date(2026,11,31)]){
  const days=monthDays(date);assert.equal(days.length,42);assert.equal(new Date(days[0].date+'T12:00:00').getDay(),0);assert.equal(new Set(days.map(d=>d.date)).size,42)
 }
 assert.equal(monthDays(new Date(2028,1,20)).filter(d=>d.inMonth).length,29)
})
test('recurrences expand into agenda without allowing unsafe master completion',()=>{
 const snapshot=makeSnapshot({...args,tasks:[{...base,isRecurring:true,recurrence:{type:'daily',interval:1},scheduledStartTime:'14:00'}]})
 assert.equal(snapshot.agenda.length,7);assert.equal(snapshot.tasks[0].actionable,false)
})
test('archived tasks and private rich content never enter widget payload',()=>{
 const snapshot=makeSnapshot({...args,tasks:[base,{...base,id:'private',isArchived:true,title:'hidden'}],notes:[{id:'n',title:'note',content:{type:'doc',content:[{type:'image',attrs:{src:'SECRET_URL'}},{type:'paragraph',content:[{type:'text',text:'safe summary'}]}]},isArchived:false,updatedAt:'2026-09-25'}]})
 assert.equal(snapshot.tasks.length,1);assert.equal(snapshot.notes[0].subtitle,'safe summary');assert.ok(!JSON.stringify(snapshot).includes('SECRET_URL'));assert.ok(!JSON.stringify(snapshot).includes('hidden'))
})
test('deep links reject arbitrary schemes, OAuth routes, traversal and invalid dates',()=>{
 for(const raw of ['https://widget/calendar','huddle://auth/callback','huddle://widget/../../notebook','huddle://widget/tasks?id=../../x','huddle://widget/calendar?date=2026-02-31','huddle://user@widget/tasks','huddle://widget/tasks?id=<script>'])assert.equal(parseWidgetURL(raw),null,raw)
 assert.equal(parseWidgetURL('huddle://widget/focus-note')?.kind,'focus-note')
 assert.equal(parseWidgetURL('huddle://widget/calendar?date=2026-09-25')?.date,'2026-09-25')
})
test('summaries are bounded and handle corrupt rich text safely',()=>{assert.equal(plainText(null),'');assert.equal(plainText({text:'x'.repeat(500)}).length,160)})
test('all platform mascot assets are byte-identical to user approved original',()=>{
 const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
 const original=hash('public/huddle-mascot.png')
 for(const p of ['ios/App/HuddleWidgets/Assets.xcassets/Huddle.imageset/huddle-mascot.png','android/app/src/main/res/drawable/huddle_mascot.png']){assert.ok(existsSync(p));assert.equal(hash(p),original)}
})

test('focus excerpt belongs to current day and topic, excludes archived notes',()=>{
 const content=text=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]})
 const notes=[{title:'專注記事 · 2026-09-24 · 自由專注',content:content('yesterday')},{title:'專注記事 · 2026-09-25 · 自由專注',content:content('archived'),isArchived:true},{title:'專注記事 · 2026-09-25 · 自由專注',content:content('today')}]
 assert.equal(focusNoteExcerpt(notes,'2026-09-25'),'today')
 assert.equal(focusNoteExcerpt(notes,'2026-09-25','different'),'')
})
