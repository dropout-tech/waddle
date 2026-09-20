// Real browser/SDK callback regression. All Supabase HTTP traffic is mocked;
// this verifies local behavior, not a user's Google consent or live session.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base=process.env.E2E_BASE_URL||'http://localhost:3190'
const browser=await chromium.launch()
let checks=0
const check=(name,result)=>{assert.ok(result,name);checks++;console.log('PASS',name)}
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'oauth@example.invalid',app_metadata:{provider:'google'},user_metadata:{},created_at:new Date().toISOString()}
const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})).toString('base64url')}.fake`
try {
 for(const mode of ['success','failure','stall']) {
  const context=await browser.newContext()
  let exchanges=0;let verifier=false;let release
  const gate=new Promise(resolve=>release=resolve)
  await context.route('**/*.supabase.co/**',async route=>{
   const u=new URL(route.request().url())
   if(u.pathname.endsWith('/authorize'))return route.fulfill({contentType:'text/html',body:'Mock OAuth provider'})
   if(u.pathname.endsWith('/token')) {
    exchanges++;verifier=!!route.request().postDataJSON().code_verifier
    if(mode==='stall')await gate
    return mode==='success'?route.fulfill({json:{access_token:token,refresh_token:'fake',token_type:'bearer',expires_in:3600,user}}):route.fulfill({status:400,json:{error:'invalid_grant',error_description:'Mock invalid code'}})
   }
   if(u.pathname.endsWith('/user'))return route.fulfill({json:user})
   if(u.pathname.includes('/rest/v1/'))return route.fulfill({json:[]})
   return route.abort()
  })
  const page=await context.newPage()
  await page.goto(base+'/login')
  await page.getByRole('button',{name:/Google/}).click()
  await page.waitForURL('**/auth/v1/authorize?**')
  await page.goto(base+`/auth/callback?code=mock-${mode}`)
  if(mode==='success') {
   await page.waitForURL(base+'/')
   check('Successful PKCE callback redirects using one exchange',exchanges===1&&verifier)
  } else {
   await page.getByRole('heading',{name:'登入未完成'}).waitFor({timeout:25000})
   check(mode==='stall'?'Stalled token exchange offers a recovery action after 20 seconds':'Failed code exchange shows actionable failure instead of spinning',await page.getByRole('link',{name:'返回登入頁'}).isVisible())
   check(`${mode}: duplicate effect never exchanges code twice`,exchanges===1)
   if(mode==='stall') {
    await page.evaluate(()=>{window.__oldCallbackDocument=true})
    await page.getByRole('link',{name:'返回登入頁'}).click()
    await page.waitForURL(base+'/login')
    check('Timeout recovery reloads the document and releases the old auth singleton',await page.evaluate(()=>!window.__oldCallbackDocument))
    check('Google login is usable after timeout recovery',await page.getByRole('button',{name:/Google/}).isEnabled())
   }
  }
  release(); await context.close()
 }
 const context=await browser.newContext()
 let exchanges=0
 await context.route('**/*.supabase.co/**',route=>{if(route.request().url().includes('/token'))exchanges++;return route.abort()})
 const page=await context.newPage()
 await page.goto(base+'/auth/callback?error=access_denied')
 await page.getByText('登入已取消，請返回登入頁重新選擇登入方式。').waitFor()
 check('Provider cancellation does not attempt a code exchange',exchanges===0)
 await page.goto(base+'/auth/callback?desktop=1&desktop_state='+'a'.repeat(64)+'&code=desktop-relay')
 await page.getByRole('link',{name:'開啟 Huddle'}).waitFor()
 check('External desktop relay never consumes the desktop code',exchanges===0)
 await context.close()
 console.log(`Web OAuth callback verification: ${checks} checks passed.`)
} finally {await browser.close()}
