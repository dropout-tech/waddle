// Isolated Electron runtime; no real Google interaction, auth or data access.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright'
const base = process.env.E2E_BASE_URL || 'http://localhost:3186'
const temp = mkdtempSync(path.join(tmpdir(), 'huddle-electron-oauth-'))
const harness = path.join(temp, 'harness.cjs')
writeFileSync(harness, `const {app,shell}=require('electron'); app.setName('Huddle isolated OAuth verification'); app.setPath('userData',${JSON.stringify(path.join(temp,'profile'))}); app.setAsDefaultProtocolClient=()=>true; globalThis.opened=[]; shell.openExternal=async url=>{globalThis.opened.push(url)}; globalThis.start=()=>require(${JSON.stringify(path.resolve('desktop/main.cjs'))}); app.whenReady().then(()=>{});`)
const id = '00000000-0000-4000-8000-000000000001'
const user = { id, aud:'authenticated', role:'authenticated', email:'desktop-runtime@example.invalid', email_confirmed_at:new Date().toISOString(), app_metadata:{provider:'google',providers:['google']}, user_metadata:{full_name:'Desktop runtime'}, created_at:new Date().toISOString() }
const jwt = `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated',email:user.email})).toString('base64url')}.test-signature`
const session = {access_token:jwt,refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,user}
let app
const exchanges=[]; const unknown=[]
let passes=0
const check=(label,value)=>{assert.ok(value,label);console.log('PASS',label);passes++}
async function boot(coldUrl) {
 const application = await electron.launch({args:[harness],env:{...process.env,HUDDLE_APP_URL:base},timeout:30000})
 const context = application.context()
 await context.route('**/*.supabase.co/**',async route=>{
  const req=route.request(), u=new URL(req.url())
  if(u.pathname==='/auth/v1/token') {
   assert.equal(u.searchParams.get('grant_type'),'pkce')
   exchanges.push(req.postDataJSON())
   return route.fulfill({json:session})
  }
  if(u.pathname==='/auth/v1/user') return route.fulfill({json:user})
  if(u.pathname.startsWith('/rest/v1/')) {
   const table=u.pathname.split('/').pop()
   let body=[]
   if(table==='workspaces') body=[{id,name:'Desktop runtime workspace',color:'#63a995',icon:'📋',sort_order:0,is_default:true}]
   if(table==='categories') body=[{id,workspace_id:id,name:'Runtime category',sort_order:0,is_default:true}]
   if(table==='user_settings') body={onboarding_completed:true}
   return route.fulfill({json:body})
  }
  unknown.push(u.pathname); return route.abort()
 })
 await application.evaluate(({app},url)=>{globalThis.start(); if(url) app.emit('open-url',{preventDefault(){}},url)},coldUrl)
 const page=await application.firstWindow()
 await page.waitForLoadState('domcontentloaded')
 return {application,page}
}
try {
 let running=await boot(); app=running.application; let page=running.page
 await page.goto(base+'/login',{waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:/Google/}).click()
 await page.getByText('取消登入並重試').waitFor()
 await page.waitForFunction(()=>!!localStorage.getItem('huddle-desktop-oauth-pending'))
 await app.evaluate(()=>new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(globalThis.opened.length===1){clearInterval(timer);resolve()}else if(Date.now()-started>5000){clearInterval(timer);reject(new Error('External login did not open'))}},25)}))
 const urls=await app.evaluate(()=>globalThis.opened)
 assert.equal(urls.length,1)
 const authorize=new URL(urls[0]); const redirect=new URL(authorize.searchParams.get('redirect_to')); const state=redirect.searchParams.get('desktop_state')
 check('Real preload IPC opens external Google PKCE URL',authorize.hostname==='jnikcndiexjojgvicohf.supabase.co' && authorize.searchParams.get('provider')==='google' && authorize.searchParams.get('code_challenge_method')==='s256' && !!authorize.searchParams.get('code_challenge') && /^[a-f0-9]{64}$/.test(state))
 const deep=`huddle-desktop://auth/callback?state=${state}&code=mock-runtime-code`
 await app.evaluate(({app},url)=>app.emit('open-url',{preventDefault(){}},url),deep)
 await page.getByText('Desktop runtime workspace',{exact:true}).first().waitFor({timeout:30000})
 check('Desktop code exchanged exactly once with original PKCE verifier',exchanges.length===1 && exchanges[0].auth_code==='mock-runtime-code' && typeof exchanges[0].code_verifier==='string' && exchanges[0].code_verifier.length>=43)
 check('Signed-in main page loads and callback code is removed',new URL(page.url()).pathname==='/' && !page.url().includes('code='))
 let navigations=0; page.on('framenavigated',frame=>{if(frame===page.mainFrame()) navigations++})
 await app.evaluate(({app},url)=>app.emit('open-url',{preventDefault(){}},url),deep)
 await page.waitForTimeout(250)
 check('Replayed callback causes no navigation or second exchange',navigations===0 && exchanges.length===1)
 const popupPromise=app.waitForEvent('window')
 await page.evaluate(()=>window.open('/float/scratchpad','runtime-popout'))
 const popup=await popupPromise
 await popup.waitForLoadState('domcontentloaded')
 check('Same-origin whiteboard popout works in real Electron',new URL(popup.url()).pathname==='/float/scratchpad')
 const rejected=await popup.evaluate(async()=>{try{await window.huddleDesktop.beginOAuth();return false}catch{return true}})
 check('Popout cannot invoke main-window OAuth IPC',rejected)
 await popup.close()
 // Start another login, then restart the actual Electron process before callback.
 await app.context().clearCookies()
 await page.evaluate(()=>localStorage.clear())
 await page.goto(base+'/login',{waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:/Google/}).click()
 await page.getByText('取消登入並重試').waitFor()
 await app.evaluate(()=>new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(globalThis.opened.length===2){clearInterval(timer);resolve()}else if(Date.now()-started>5000){clearInterval(timer);reject(new Error('Second external login did not open'))}},25)}))
 const coldUrls=await app.evaluate(()=>globalThis.opened)
 const coldState=new URL(new URL(coldUrls.at(-1)).searchParams.get('redirect_to')).searchParams.get('desktop_state')
 await app.evaluate(async({session})=>session.defaultSession.cookies.flushStore())
 await app.close(); app=undefined
 running=await boot(`huddle-desktop://auth/callback?state=${coldState}&code=mock-cold-code`)
 app=running.application; page=running.page
 await page.getByText('Desktop runtime workspace',{exact:true}).first().waitFor({timeout:30000})
 check('Cold process launch resumes pending state and persisted PKCE verifier',exchanges.length===2 && exchanges[1].auth_code==='mock-cold-code' && exchanges[1].code_verifier.length>=43)
 check('All unexpected Supabase traffic blocked',unknown.length===0)
 console.log(`Electron runtime OAuth verification: ${passes} checks passed. Google, auth tokens and REST all mocked.`)
} finally { if(app) await app.close(); rmSync(temp,{recursive:true,force:true}) }
