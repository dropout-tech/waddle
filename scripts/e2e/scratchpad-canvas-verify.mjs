/* eslint-disable no-console -- this executable regression script reports each check */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const env = Object.fromEntries(readFileSync('.env.e2e.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
const base=process.env.E2E_BASE_URL||'http://localhost:3172'
const server=process.env.E2E_BASE_URL?null:spawn('pnpm',['exec','next','dev','-p','3172'],{stdio:'ignore',detached:true})
const today=new Date().toLocaleDateString('en-CA')
let rows=[{id:'00000000-0000-4000-8000-000000000001',date:today,type:'text',content:'原本上方的筆記',sort_order:0,metadata:{preserved:'yes'},created_at:new Date().toISOString()}]
let writes=[],fail=false,browser,passes=0
const check=(name,ok)=>{assert.ok(ok,name);console.log('PASS',name);passes++}
try {
 for(let i=0;i<120;i++){try{if((await fetch(base+'/login')).ok)break}catch{}await sleep(1000)}
 browser=await chromium.launch();const context=await browser.newContext({locale:'zh-TW',viewport:{width:1280,height:1000}});const page=await context.newPage()
 await context.route('**/rest/v1/**',async route=>{
  const r=route.request(),u=new URL(r.url()),table=u.pathname.split('/').pop(),id=u.searchParams.get('id')?.replace('eq.','')
  if(table!=='scratchpad_items')return route.fulfill({json:[]})
  if(r.method()==='GET')return route.fulfill({json:rows})
  const body=r.postData()?r.postDataJSON():null;writes.push({method:r.method(),body,id})
  if(fail)return route.fulfill({status:500,json:{message:'Synthetic failure'}})
  if(r.method()==='POST')rows.push({...body,created_at:new Date().toISOString()})
  if(r.method()==='PATCH')rows=rows.map(x=>x.id===id?{...x,...body}:x)
  if(r.method()==='DELETE')rows=rows.filter(x=>x.id!==id)
  return route.fulfill({json:r.method()==='PATCH'?{id}:[]})
 })
 await page.goto(base+'/login');await page.locator('#email').fill(env.E2E_EMAIL);await page.locator('#password').fill(env.E2E_PASSWORD);await page.locator('button[type=submit]').click();await page.waitForURL(u=>!u.pathname.includes('/login'),{timeout:60000})
 await page.goto(base+'/float/scratchpad');await page.getByTestId('scratchpad-canvas').waitFor();await page.getByRole('paragraph').filter({hasText:'原本上方的筆記'}).waitFor()
 check('Legacy upper card retained',await page.getByRole('paragraph').filter({hasText:'原本上方的筆記'}).isVisible())
 await page.getByLabel('移入上方卡片').selectOption(rows[0].id);await sleep(500)
 check('Transfer retains id and metadata',rows.length===1&&rows[0].metadata.canvas&&rows[0].metadata.preserved==='yes')
 const card=page.getByTestId('canvas-item').first(),handle=card.getByTestId('canvas-drag-handle');await handle.scrollIntoViewIfNeeded()
 let b=await handle.boundingBox(),before=writes.length;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+120,b.y+b.height/2+35,{steps:8});check('Drag preview makes no writes',writes.length===before);await page.mouse.up();await sleep(400)
 check('Drag writes once on release',writes.length===before+1&&rows[0].metadata.canvas.x===120)
 const resize=card.getByTestId('canvas-resize-handle');b=await resize.boundingBox();await page.mouse.move(b.x+20,b.y+20);await page.mouse.down();await page.mouse.move(b.x+90,b.y+70,{steps:6});await page.mouse.up();await sleep(300)
 check('Resize geometry persisted',rows[0].metadata.canvas.width===350&&rows[0].metadata.canvas.height===270)
 await page.reload();await page.getByTestId('canvas-item').waitFor();check('Reload preserves placement',await card.evaluate(e=>e.style.left==='120px'&&e.style.width==='350px'))
 before=writes.length;for(let i=0;i<8;i++)await page.getByRole('button',{name:'縮小畫布',exact:true}).click();b=await handle.boundingBox();check('Move handle stays touch-sized when zoomed out',b.width>=40&&b.height>=40);await page.getByRole('button',{name:'顯示全部',exact:true}).click();check('Viewport changes do not write records',writes.length===before)
 await handle.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await sleep(350);check('Rapid keyboard movement keeps every step',rows[0].metadata.canvas.x===160)
 const previous=rows[0].metadata.canvas.x;fail=true;await handle.focus();await page.keyboard.press('ArrowRight');await sleep(500);fail=false;check('Failed move rolls back',await card.evaluate((e,x)=>e.style.left===x+'px',previous))
 await handle.focus();await page.keyboard.press('ArrowRight');await sleep(350);check('Movement after rollback starts from persisted geometry',rows[0].metadata.canvas.x===previous+20)
 await page.getByRole('button',{name:'待辦',exact:true}).click();await page.getByLabel('畫布內容').fill('長文字畫布待辦：'+ '測試'.repeat(100));await page.getByRole('button',{name:'儲存卡片',exact:true}).click();await sleep(300);check('Canvas todo created',rows.length===2&&rows[1].type==='todo')
 await page.getByLabel('完成畫布待辦').check();await sleep(300);check('Todo checked persists',rows[1].is_checked===true)
 const beforeDrop=rows.length;await page.evaluate(() => { const transfer=new DataTransfer();transfer.items.add(new File(['image'],'drop.png',{type:'image/png'}));const top=document.querySelector('input[placeholder*="記下"]');top.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));window.__canvasDropTransfer=transfer });await page.getByText('放開以新增圖片',{exact:true}).waitFor();await page.evaluate(() => { const canvas=document.querySelector('[data-testid="scratchpad-canvas"]');canvas.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:window.__canvasDropTransfer})) });await page.getByText('放開以新增圖片',{exact:true}).waitFor({state:'hidden'});await page.evaluate(() => { const canvas=document.querySelector('[data-testid="scratchpad-canvas"]');canvas.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__canvasDropTransfer}));delete window.__canvasDropTransfer });await sleep(300)
 check('Dropping over canvas clears upper overlay and creates one canvas image',rows.length===beforeDrop+1&&rows.at(-1).type==='image'&&rows.at(-1).metadata?.canvas)
 await page.getByRole('button',{name:'畫筆',exact:true}).click();const canvas=page.getByTestId('scratchpad-canvas');b=await canvas.boundingBox();await page.mouse.move(b.x+b.width-100,b.y+b.height-100);await page.mouse.down();await page.mouse.move(b.x+b.width-40,b.y+b.height-40,{steps:8});await page.mouse.up();await sleep(300)
 check('Pen stroke persists as a resizable canvas image',rows.some(row=>row.type==='image'&&row.title==='手寫筆記'&&row.metadata?.canvas))
 mkdirSync('/tmp/huddle-canvas-shots',{recursive:true})
 for(const width of [320,390,430,1280]){await page.setViewportSize({width,height:844});await page.getByTestId('scratchpad-canvas').scrollIntoViewIfNeeded();await sleep(100);check(`No document overflow at ${width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`/tmp/huddle-canvas-shots/${width}.png`,fullPage:true})}
 await page.setViewportSize({width:1280,height:1000});await page.locator(`[data-canvas-item="${rows[0].id}"]`).click({position:{x:100,y:100}});await page.getByRole('button',{name:'移回上方',exact:true}).click();await sleep(300);check('Transfer back retains original record',rows.length===4&&rows[0].metadata.canvas===null&&rows[0].metadata.preserved==='yes')
 console.log(`${passes} checks passed`)
} finally {await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM')}catch{}}
