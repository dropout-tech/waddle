// Real test-account login; every database and Edge Function request is mocked.
import {chromium} from 'playwright'
import {readFileSync,mkdirSync} from 'node:fs'
import {spawn} from 'node:child_process'
import assert from 'node:assert/strict'
const env=Object.fromEntries(readFileSync('.env.e2e.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
const server=spawn('node',['node_modules/next/dist/bin/next','start','-p','3172'],{stdio:'ignore'})
const browser=await chromium.launch()
const context=await browser.newContext({viewport:{width:1280,height:1000}})
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
const ws='00000000-0000-4000-8000-000000000001',cat='00000000-0000-4000-8000-000000000002',peer='00000000-0000-4000-8000-000000000003'
let meetings=[],used=0,imports=0,failImport=true,failRespond=true
const incoming=[0,1].map(i=>({id:`00000000-0000-4000-8000-00000000001${i}`,sender_id:peer,sender_name:'共享夥伴小林',title:i?'確認會議時間':'準備測試報價',due_date:null,source:'請協助準備測試報價。',meeting_title:'測試會議',meeting_date:'2026-09-25',status:'pending',task_id:null,created_at:new Date().toISOString()}))
await context.route('**/rest/v1/**',route=>{
 const path=new URL(route.request().url()).pathname
 let data=[]
 if(path.endsWith('/workspaces'))data=[{id:ws,name:'工作',color:'#9BBFAC',icon:'folder',sort_order:0,is_archived:false,is_default:true}]
 if(path.endsWith('/categories'))data=[{id:cat,workspace_id:ws,name:'待辦',sort_order:0,is_archived:false,is_default:true}]
 return route.fulfill({json:data})
})
await context.route('**/functions/v1/meeting-import',async route=>{
 const b=route.request().postDataJSON()
 if(b.action==='directory')return route.fulfill({json:{peers:[{peer_id:peer,display_name:'共享夥伴小林'}]}})
 if(b.action==='inbox')return route.fulfill({json:{assignments:incoming}})
 if(b.action==='respond'){
  if(failRespond)return route.fulfill({status:400,json:{error:'ASSIGNMENT_RESPONSE_FAILED'}})
  const a=incoming.find(a=>a.id===b.id)
  if(b.accept)assert.equal(b.categoryId,cat)
  a.status=b.accept?'accepted':'rejected';a.task_id=b.accept?crypto.randomUUID():null
  return route.fulfill({json:{assignment:a}})
 }
 if(b.action==='list')return route.fulfill({json:{meetings,used,pending:0,limit:20,month:'2026-09-01',enabled:true}})
 if(b.action==='generate'){
  assert.equal(b.context.meetingTime,'14:30');assert.equal(b.context.participants.length,2)
  assert.equal(b.context.autoSelf,true)
  used++
  const tasks=['核對自己的驗收清單','更新測試報價','確認未決問題'].map(title=>({title,owner:'',dueDate:'',source:'請確認驗收清單。',ownerParticipantId:'',assignmentConfidence:'uncertain',assignmentReason:'說話者待確認'}))
  tasks[0]={...tasks[0],owner:'測試本人',ownerParticipantId:b.context.participants[0].id,assignmentConfidence:'explicit',assignmentReason:'逐字稿明確交辦給本人'}
  const meeting={id:b.id,title:b.title,meeting_date:b.meetingDate,context:b.context,checklist:{},assignments:[],status:'succeeded',created_at:new Date().toISOString(),imported_tasks:{'0':crypto.randomUUID()},result:{summary:'確認驗收與後续報價。',decisions:['先完成驗收。'],questions:['期限待確認。'],tasks}}
  meetings=[meeting];return route.fulfill({json:{meeting}})
 }
 if(b.action==='import'){
  imports++
  if(failImport)return route.fulfill({status:400,json:{error:'IMPORT_FAILED'}})
  for(const t of b.tasks){
   meetings[0].checklist[t.index]=t
   if(t.assigneeId===peer)meetings[0].assignments.push({id:crypto.randomUUID(),source_index:t.index,recipient_id:peer,status:'pending'})
   else if(t.assigneeId)meetings[0].imported_tasks[t.index]=crypto.randomUUID()
  }
  return route.fulfill({json:{importedTasks:meetings[0].imported_tasks,checklist:meetings[0].checklist}})
 }
 throw new Error('Unexpected action')
})
await page.addInitScript(()=>{localStorage.setItem('waddle.waterReminder.enabled','0');localStorage.setItem('waddle-language-v1','zh-TW')})
mkdirSync('/tmp/huddle-meeting-shots',{recursive:true})
try{
 let ready=false
 for(let i=0;i<60;i++){try{if((await fetch('http://localhost:3172/login')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
 assert(ready,'Production server did not start')
 await page.goto('http://localhost:3172/login');await page.locator('#email').fill(env.E2E_EMAIL);await page.locator('#password').fill(env.E2E_PASSWORD)
 await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.includes('/login'),{timeout:60000})
 await page.goto('http://localhost:3172/meetings');await page.getByText('本月已用 0 / 20 次',{exact:false}).waitFor()
 await page.getByLabel('會議名稱',{exact:true}).fill('測試驗收會議');await page.getByLabel('會議日期',{exact:true}).fill('2026-09-25')
 await page.getByLabel('會議時間（台北時間，可留空）').fill('14:30')
 await page.getByRole('button',{name:'新增與會者'}).click();await page.getByLabel('與會者 1 姓名').fill('測試本人');await page.getByLabel('與會者 1 帳號').selectOption({label:'我'})
 await page.getByRole('button',{name:'新增與會者'}).click();await page.getByLabel('與會者 2 姓名').fill('小林');await page.getByLabel('與會者 2 帳號').selectOption(peer)
 await page.locator('input[type=file]').setInputFiles({name:'meeting.txt',mimeType:'text/plain',buffer:Buffer.from('請確認驗收清單。其他事項的負責人與期限，還要再討論。')})
 await page.getByRole('button',{name:'整理紀錄與任務',exact:true}).click();await page.getByText('本月已用 1 / 20 次',{exact:false}).waitFor()
 assert(await page.getByRole('checkbox',{name:'選取任務 1'}).isDisabled())
 await page.getByLabel('任務 2 指派給',{exact:true}).selectOption(peer)
 assert.equal(await page.getByLabel('任務 3 指派給',{exact:true}).inputValue(),'')
 await page.getByRole('button',{name:'儲存並處理 2 個待辦'}).click();await page.getByRole('alert').filter({hasText:'任務未能建立'}).waitFor()
 failImport=false;await page.getByRole('button',{name:'儲存並處理 2 個待辦'}).click()
 await page.getByText('已送出，等待接受',{exact:true}).waitFor();assert.equal(used,1)
 await page.locator('main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/tmp/huddle-meeting-shots/desktop.png'})
 await page.reload();await page.getByRole('button',{name:/測試驗收會議/}).click()
 assert(await page.getByRole('checkbox',{name:'選取任務 2'}).isDisabled())
 await page.getByLabel('任務 3 指派給',{exact:true}).selectOption({label:'我'})
 await page.getByRole('button',{name:'儲存並處理 1 個待辦'}).click()
 await page.getByText('已加入自己的任務',{exact:true}).nth(1).waitFor()
 assert.equal(imports,3)
 used=20;await page.getByRole('button',{name:'重新整理',exact:true}).click();await page.getByText('本月已用 20 / 20 次',{exact:false}).waitFor()
 await page.getByText('整理另一份會議',{exact:true}).click();assert(await page.getByRole('button',{name:'整理紀錄與任務',exact:true}).isDisabled())
 await page.goto('http://localhost:3172/assignments')
 await page.getByText('準備測試報價',{exact:true}).waitFor()
 await page.screenshot({path:'/tmp/huddle-meeting-shots/inbox-pending.png'})
 await page.getByRole('button',{name:'接受並加入任務'}).first().click();await page.getByText('未能處理指派，請確認共享關係與目標分類後重試。',{exact:true}).waitFor()
 failRespond=false;await page.getByRole('button',{name:'接受並加入任務'}).first().click();await page.getByText('已接受並加入你的任務清單。',{exact:true}).waitFor()
 await page.getByRole('button',{name:'拒絕',exact:true}).click();await page.getByText('已拒絕，不會建立任務。',{exact:true}).waitFor()
 assert.equal(incoming[0].status,'accepted');assert.equal(incoming[1].status,'rejected')
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/huddle-meeting-shots/mobile-inbox.png'})
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.goto('http://localhost:3172/meetings');await page.getByRole('button',{name:/測試驗收會議/}).click()
 await page.screenshot({path:'/tmp/huddle-meeting-shots/mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 assert.deepEqual(errors,[])
 console.log('PASS: participant metadata, own auto-task display, peer invitation, unassigned checklist persistence, manual self task, quota, inbox accept/reject/retry, reload and mobile')
}finally{await browser.close();server.kill()}
