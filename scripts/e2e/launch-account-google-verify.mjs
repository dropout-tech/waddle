// Fully mocked API/provider browser checks; no real invitations, payments or Google access.
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium} from 'playwright'
const base=process.env.E2E_BASE_URL||'http://localhost:3190',out='/tmp/huddle-launch-ui'
mkdirSync(out,{recursive:true})
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const makeUser=n=>({id:id(n),aud:'authenticated',role:'authenticated',email:`launch${n}@example.invalid`,app_metadata:{},user_metadata:{},created_at:new Date().toISOString()})
const session=user=>({user,access_token:`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})).toString('base64url')}.fake`,refresh_token:'mock-refresh',expires_in:3600,token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600})
let passed=0;const check=(label,value)=>{assert.ok(value,label);passed++;console.log('PASS',label)}
const browser=await chromium.launch()
try{for(const en of [false,true]){
 const locale=en?'en':'zh-TW',context=await browser.newContext({locale:en?'en-US':'zh-TW',timezoneId:'Asia/Taipei',viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.addInitScript(lang=>localStorage.setItem('waddle-language-v1',lang),locale)
 let user=makeUser(1),activePro=false,configured=false,connected=false,mode='partial',status='pending',tokenCalls=0,finishCalls=0
 const actions=[],unexpected=[]
 await context.route('https://accounts.google.com/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Mock Google consent</h1>'}))
 await context.route('**/*.supabase.co/**',async r=>{
  const req=r.request(),url=new URL(req.url()),name=url.pathname.split('/').pop(),body=req.postData()?req.postDataJSON():{}
  if(url.pathname==='/auth/v1/token'){tokenCalls++;return r.fulfill({json:session(user)})}
  if(url.pathname==='/auth/v1/user')return r.fulfill({json:user})
  if(url.pathname.includes('/functions/v1/')){
   if(name!=='google-calendar'){unexpected.push(name);return r.abort()}
   actions.push(body)
   if(body.action==='status')return r.fulfill({json:{configured,connected,status,time_zone:'Asia/Taipei',error:status==='conflict'?'google_conflict':null}})
   if(body.action==='start')return r.fulfill({json:{url:'https://accounts.google.com/o/oauth2/v2/auth?mock=1'}})
   if(body.action==='finish'){finishCalls++;connected=true;return r.fulfill({json:{connected:true,status:'pending'}})}
   if(body.action==='disconnect'){connected=false;return r.fulfill({json:{connected:false,revoked:false,calendar_preserved:true}})}
   if(body.action==='sync'){status=mode==='conflict'?'conflict':mode==='partial'?'partial':'connected';return r.fulfill({json:{status,remaining:mode==='partial'?5:0,conflicts:mode==='conflict'?1:0}})}
   unexpected.push(body.action);return r.abort()
  }
  if(!url.pathname.includes('/rest/v1/')){unexpected.push(url.pathname);return r.abort()}
  if(name==='get_my_referral')return r.fulfill({json:{code:'HUD-MOCK',campaign_enabled:false,has_redeemed:false,rewards:[]}})
  if(name==='billing_entitlements')return r.fulfill({json:{expires_at:new Date(Date.now()+(activePro?86400000:-86400000)).toISOString()}})
  if(name==='workspaces')return r.fulfill({json:[{id:id(50),name:'Demo studio',user_id:user.id,is_archived:false,sort_order:0}]})
  if(name==='user_settings')return r.fulfill({body:'null',contentType:'application/json'})
  if(req.method()!=='GET'){unexpected.push(`${req.method()} ${name}`);return r.abort()}
  return r.fulfill({json:[]})
 })
 const page=await context.newPage();await page.goto(base+'/login');await page.locator('#email').fill(user.email);await page.locator('#password').fill('Mock-password-123');await page.locator('button[type=submit]').click();await page.waitForURL(u=>u.pathname!=='/login')
 await page.goto(base+'/account');await page.getByText(en?'This activity is not open yet. No referral reward is being granted.':'活動尚未開放，目前不會發放推薦獎勵。').waitFor()
 check(locale+' expired entitlement is Free',await page.locator('#plan-heading').innerText().then(t=>t.includes(en?'Free':'免費版')))
 check(locale+' restore disabled on web',await page.getByRole('button',{name:en?'Restore purchases':'恢復購買'}).isDisabled())
 check(locale+' no redeem active',await page.getByRole('button',{name:en?'Redeem code':'兌換推薦碼',exact:true}).count()===0)
 activePro=true;await page.reload();await page.getByText(en?'Access until':'權益至',{exact:false}).waitFor();check(locale+' active entitlement Pro',await page.locator('#plan-heading').innerText().then(t=>t.includes('Pro')))
 await page.screenshot({path:`${out}/${locale}-account-desktop.png`,fullPage:true})
 // Supabase's standard same-origin auth broadcast mirrors another-tab sign-in.
 user=makeUser(2);activePro=false
 const cookies=await context.cookies(),cookie=cookies.find(c=>/^sb-.*-auth-token/.test(c.name));assert.ok(cookie,'session cookie exists')
 const channel=cookie.name.replace(/\.\d+$/,'')
 await page.evaluate(({channel,next})=>{const b=new BroadcastChannel(channel);b.postMessage({event:'SIGNED_IN',session:next});setTimeout(()=>b.close(),100)}, {channel,next:session(user)})
 await page.waitForFunction(label=>document.querySelector('#plan-heading')?.textContent?.includes(label),en?'Free':'免費版')
 check(locale+' account switch removes old Pro',!(await page.locator('#plan-heading').innerText()).includes('Pro'))
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/${locale}-account-mobile.png`,fullPage:true});check(locale+' account mobile no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.goto(base+'/settings/google-calendar');await page.getByText(en?'Google Calendar integration is not enabled yet.':'Google Calendar 整合尚未啟用。').waitFor();check(locale+' unconfigured integration no connect',await page.getByRole('button',{name:en?'Connect Google Calendar':'連結 Google Calendar',exact:true}).count()===0)
 configured=true;await page.reload();const connect=page.getByRole('button',{name:en?'Connect Google Calendar':'連結 Google Calendar',exact:true});await connect.waitFor();check(locale+' selection required',await connect.isDisabled());await page.getByLabel('Demo studio',{exact:true}).check();await connect.click();await page.waitForURL('https://accounts.google.com/**');check(locale+' connect sends selected workspace',actions.find(a=>a.action==='start')?.workspace_ids?.[0]===id(50))
 const before=tokenCalls;await page.goto(base+'/settings/google-calendar/callback?code=CALENDAR-ONLY&state=MOCKSTATE');await page.getByText(en?'Calendar connected. You can now synchronize your schedule.':'日曆已連結，可以開始同步行程。').waitFor();check(locale+' callback reaches calendar finish',finishCalls===1);check(locale+' callback never uses Supabase token exchange',tokenCalls===before);check(locale+' callback removes code from URL',!page.url().includes('code='))
 await page.goto(base+'/settings/google-calendar');const sync=page.getByRole('button',{name:en?'Sync now':'立即同步',exact:true});await sync.click();await page.getByText(en?'Some events are still pending. Select Sync now to continue.':'還有行程待同步，請再次點擊立即同步繼續。').waitFor();check(locale+' partial is not completed',!(await page.locator('main').innerText()).includes(en?'Synchronization completed.':'同步已完成。'))
 mode='conflict';await sync.click();const resolve=page.getByRole('button',{name:en?'Replace conflicting Google copies with Huddle events':'以 Huddle 行程覆寫 Google 衝突項目'});await resolve.waitFor();check(locale+' explicit conflict action present',await resolve.isVisible());mode='done';await resolve.click();await page.getByText(en?'Synchronization completed.':'同步已完成。',{exact:true}).waitFor();check(locale+' explicit conflict resolution passed',actions.some(a=>a.action==='sync'&&a.resolve_conflicts===true))
 await page.screenshot({path:`${out}/${locale}-google-mobile.png`,fullPage:true});check(locale+' google mobile no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:`${out}/${locale}-google-desktop.png`,fullPage:true})
 await page.getByRole('button',{name:en?'Disconnect':'取消連結',exact:true}).click();await page.getByRole('button',{name:en?'Confirm disconnect':'確認取消連結',exact:true}).click();await page.getByText(en?'Disconnected locally. Remove Huddle access in Google Account security settings too. Existing events remain.':'已停止連結。請另至 Google 帳號安全性設定移除 Huddle 權限；既有行程保留。').waitFor();check(locale+' revocation failure disclosed',true)
 check(locale+' no unexpected writes/provider calls',unexpected.length===0);await context.close()
}}finally{await browser.close()}
console.log(`${passed} passed; screenshots ${out}`)
