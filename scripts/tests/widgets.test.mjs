import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('@/'))return next(pathToFileURL(resolve(specifier.slice(2)+'.ts')).href,context);return next(specifier,context)}})
const mod=await import('../../lib/widgets/model.ts')
const {makeSnapshot,monthDays,parseWidgetURL,plainText,focusNoteExcerpt}=mod
const toKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
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

test('大型月曆 span: 21 days from this week\'s Monday, per-day cap with real total, timed first',()=>{
 const {spanStart,SPAN_DAYS,SPAN_ITEMS}=mod
 // Thu 2026-10-01 → Mon 2026-09-28; a Sunday belongs to the week that started six days earlier.
 assert.equal(toKey(spanStart(new Date(2026,9,1,9))),'2026-09-28')
 assert.equal(toKey(spanStart(new Date(2026,9,4,23))),'2026-09-28')
 assert.equal(toKey(spanStart(new Date(2026,8,28,0,5))),'2026-09-28')
 const day='2026-10-01'
 const tasks=Array.from({length:6},(_,i)=>({...base,id:`t${i}`,title:`任務${i}${'很長'.repeat(20)}`,scheduledDate:day,calendarColor:'#5A7D9A',isCompleted:i===0,...(i===5?{scheduledStartTime:'08:30',isMeeting:true}:{})}))
 const blocks=[{id:'b',date:day,startTime:'07:00',endTime:'08:00',label:'晨跑',color:'not-a-colour',type:'x',isRecurring:false}]
 const snap=makeSnapshot({...args,now:new Date(2026,9,1,9),tasks,blocks})
 assert.equal(snap.span.length,SPAN_DAYS);assert.equal(snap.span[0].date,'2026-09-28');assert.equal(snap.span[20].date,'2026-10-18')
 assert.equal(new Date(snap.span[0].date+'T12:00:00').getDay(),1)
 const d=snap.span.find(x=>x.date===day)
 assert.equal(d.total,7);assert.equal(d.items.length,SPAN_ITEMS)
 assert.deepEqual(d.items.slice(0,2).map(i=>[i.type,i.time]),[['block','07:00'],['event','08:30']])
 assert.equal(d.items[1].color,'#5a7d9a');assert.equal(d.items[0].color,'#b04f38')
 assert.ok(d.items.every(i=>i.title.length<=20))
 assert.ok(JSON.stringify(snap.span).length<12000)
})
test('便條紙 summaries: newest first, first line is the title, empty notes skipped, capped',()=>{
 const {stickySummaries,STICKY_LIMIT}=mod
 const doc=(...paras)=>({type:'doc',content:paras.map(p=>Array.isArray(p)?{type:'taskList',content:p.map(t=>({type:'taskItem',content:[{type:'paragraph',content:[{type:'text',text:t}]}]}))}:{type:'paragraph',content:p?[{type:'text',text:p}]:[]})})
 const notes=[
  {id:'old',content:doc('舊的'),color:'sage',updatedAt:'2026-09-01T00:00:00Z'},
  {id:'new',content:doc('買菜','',['牛奶','雞蛋']),color:'yellow',updatedAt:'2026-10-01T03:00:00Z'},
  {id:'empty',content:doc(''),color:'rose',updatedAt:'2026-10-01T05:00:00Z'},
  {id:'null',content:null,color:'rose',updatedAt:'2026-10-01T06:00:00Z'},
  ...Array.from({length:6},(_,i)=>({id:`n${i}`,content:doc(`第${i}張`),color:'cream',updatedAt:`2026-08-0${i+1}T00:00:00Z`})),
 ]
 const out=stickySummaries(notes)
 assert.equal(out.length,STICKY_LIMIT);assert.deepEqual(out.slice(0,2).map(n=>n.id),['new','old'])
 assert.deepEqual([out[0].title,out[0].body,out[0].color],['買菜','牛奶 雞蛋','yellow'])
 assert.equal(stickySummaries([{id:'x',content:doc('t'.repeat(90),'b'.repeat(400)),color:'yellow',updatedAt:'z'}])[0].title.length,40)
 assert.equal(makeSnapshot({...args,stickies:notes}).stickies.length,STICKY_LIMIT)
 assert.equal(makeSnapshot(args).stickies,undefined)
})
test('new widget kinds deep-link to real screens; sticky ids never become task ids',()=>{
 const {widgetPath}=mod
 assert.equal(parseWidgetURL('huddle://widget/month?date=2026-10-02')?.kind,'month')
 assert.equal(parseWidgetURL('huddle://widget/sticky?id=3f2a-11')?.id,'3f2a-11')
 assert.equal(widgetPath({kind:'sticky',id:'3f2a-11'}),'/?widget=sticky&note=3f2a-11')
 assert.equal(widgetPath({kind:'month'}),'/?widget=month')
})
test('快速新增任務 widget: huddle://widget/quick-add opens the bare capture sheet; stray id/date never leak into the path',async()=>{
 const {widgetPath}=mod
 assert.equal(parseWidgetURL('huddle://widget/quick-add')?.kind,'quick-add')
 assert.equal(widgetPath({kind:'quick-add'}),'/?widget=quick-add')
 assert.equal(widgetPath({kind:'quick-add',id:'new',date:'2026-10-02'}),'/?widget=quick-add')
 assert.equal(widgetPath(parseWidgetURL('huddle://widget/quick-add?id=abc&date=2026-10-02')),'/?widget=quick-add')
 assert.ok(mod.widgetKinds.includes('quick-add'));assert.equal(mod.widgetNames['quick-add'],'快速新增任務')
 assert.equal(parseWidgetURL('huddle://widget/quick-add/../../notebook'),null)
 const {quickAddTitles}=await import('../../lib/widgets/quick-add.ts')
 assert.deepEqual(quickAddTitles('  買牛奶  '),['買牛奶'])
 assert.deepEqual(quickAddTitles('第一行\n第二行'),['第一行\n第二行'])
 assert.deepEqual(quickAddTitles(''),[]);assert.deepEqual(quickAddTitles(' \n\t '),[])
})
test('water widgets are gone: no water kind; an old huddle://widget/water tap is ignored safely; snapshot keeps water for older widget builds',()=>{
 assert.ok(!mod.widgetKinds.includes('water'));assert.equal(mod.widgetNames.water,undefined)
 assert.equal(parseWidgetURL('huddle://widget/water'),null)
 assert.equal(parseWidgetURL('huddle://widget/water?accountId=a&epoch=e'),null)
 assert.deepEqual(makeSnapshot(args).water,{enabled:false,nextAt:null,count:0})
})
test('本週時間表 follows 每週開始日: 自動 = today forward, a picked day snaps back; 近期行程 stays today-forward',()=>{
 // Fri 2026-10-02. One slot on Mon 09-28 (earlier this week) and one on Thu 10-08.
 const blocks=[{id:'b1',date:'2026-09-28',startTime:'09:00',endTime:'10:00',label:'週一會',color:'#123456'},{id:'b2',date:'2026-10-08',startTime:'09:00',endTime:'10:00',label:'下週四',color:'#123456'}]
 const at=weekStartDay=>makeSnapshot({...args,now:new Date(2026,9,2,9),blocks,weekStartDay})
 const auto=at(null)
 assert.equal(auto.weekStart,'2026-10-02')
 assert.deepEqual(auto.week.map(s=>s.date),['2026-10-08'])
 const mon=at(1)
 assert.equal(mon.weekStart,'2026-09-28')
 assert.deepEqual(mon.week.map(s=>s.date),['2026-09-28'])
 assert.equal(at(0).weekStart,'2026-09-27')
 assert.equal(at(5).weekStart,'2026-10-02') // picked day is today
 assert.equal(at(9).weekStart,'2026-10-02') // junk value → 自動
 assert.equal(makeSnapshot({...args,now:new Date(2026,9,2,9),blocks}).weekStart,'2026-10-02') // omitted → 自動
 // The agenda never shows past days, whatever the setting.
 assert.deepEqual(mon.agenda.map(a=>a.date),['2026-10-08'])
})
