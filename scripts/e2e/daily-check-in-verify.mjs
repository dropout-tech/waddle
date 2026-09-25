/** Local UI verification. Real test-account login; all database requests mocked. */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i=l.indexOf('='); return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] }))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: {width:1280,height:850}, locale:'zh-TW' })
const page = await context.newPage()
const errors=[]
page.on('pageerror', e=>errors.push(e.message))
let saved=false, writes=0, failWrite=false, failRead=false
let failRanking=false
let registeredAt
page.on('response', async response => { if(response.url().includes('/auth/v1/token') && response.ok()) registeredAt=(await response.json()).user?.created_at })
let serverDate='2026-09-25'
const status=()=>({check_in_date:serverDate,checked_in:saved,total_points:saved?1:0,daily_points:1})
await context.route('**/rest/v1/**', async route => {
 const req=route.request(), url=new URL(req.url())
 if(url.pathname.endsWith('/rpc/get_check_in_leaderboard')) return route.fulfill({status:failRanking?503:200,json:failRanking?{message:'test unavailable'}:[{rank_position:1,penguin_alias:'123456abcdef',total_points:10,is_current_user:false,in_top_50:true},{rank_position:saved?2:null,penguin_alias:'abcdef123456',total_points:saved?1:0,is_current_user:true,in_top_50:saved}]})
 if(url.pathname.endsWith('/rpc/get_daily_check_in_status')) {
  return route.fulfill({status:failRead?503:200,json:failRead?{message:'test unavailable'}:status()})
 }
 if(url.pathname.endsWith('/rpc/claim_daily_check_in')) {
  assert.deepEqual(req.postDataJSON() ?? {}, {})
  writes++
  if(failWrite) return route.fulfill({status:503,json:{message:'test unavailable'}})
  saved=true
  return route.fulfill({status:200,json:status()})
 }
 return route.fulfill({status:200,json:[]})
})
await page.addInitScript(()=>{localStorage.setItem('waddle.waterReminder.enabled','0');if(!localStorage.getItem('waddle-language-v1'))localStorage.setItem('waddle-language-v1','zh-TW')})
mkdirSync('docs/reports/daily-check-in-shots',{recursive:true})
try {
 await page.goto(process.env.E2E_BASE_URL || 'http://localhost:3169/login', {waitUntil:'networkidle'})
 await page.locator('#email').fill(env.E2E_EMAIL)
 await page.locator('#password').fill(env.E2E_PASSWORD)
 await page.locator('button[type=submit]').click()
 await page.waitForURL(u=>!u.pathname.includes('/login'),{timeout:60000,waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:'使用者選單',exact:true}).click()
 assert(registeredAt)
 const registration=page.getByRole('menu').locator('time')
 await registration.waitFor()
 assert.equal(await registration.getAttribute('datetime'),registeredAt)
 assert.equal(await registration.innerText(),new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric'}).format(new Date(registeredAt)))
 await page.getByRole('button',{name:'使用者選單',exact:true}).click()
 await page.getByRole('button',{name:'更多工具',exact:true}).click({timeout:60000})
 await page.getByRole('menuitem',{name:'每日簽到',exact:true}).click()
 const section=page.getByRole('region',{name:'每日簽到'})
 await section.getByRole('button',{name:'簽到，開始今天'}).waitFor()
 await section.locator('img').evaluate(img=>img.decode())
 assert.equal(await section.getByText('成就收藏').count(),0)
 await section.getByText('簽到後，就能留下你的第一個分數。',{exact:false}).waitFor()
 assert.equal(writes,0)
 await page.screenshot({path:'docs/reports/daily-check-in-shots/desktop.png'})
 failWrite=true
 await section.getByRole('button',{name:'簽到，開始今天'}).click()
 await section.getByRole('alert').waitFor()
 assert.equal(await section.getByRole('button',{name:'今天已簽到'}).count(),0)
 failWrite=false
 await section.getByRole('button',{name:'簽到，開始今天'}).click()
 await section.getByRole('button',{name:'今天已簽到'}).waitFor()
 assert(await section.getByRole('button',{name:'今天已簽到'}).isDisabled())
 assert.equal(writes,2)
 await section.getByText('累積分數 1 分',{exact:true}).waitFor()
 assert.equal(await section.getByText(/兌換|可用積分/).count(),0)
 const ranking=section.getByRole('region',{name:'累積分數排行榜'})
 await ranking.getByText('你的名次：第 2 名',{exact:false}).waitFor()
 await ranking.getByText('（你）',{exact:true}).waitFor()
 failRanking=true
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await ranking.getByRole('alert').waitFor()
 failRanking=false
 await ranking.getByRole('button',{name:'重新讀取',exact:true}).click()
 await ranking.getByText('你的名次：第 2 名',{exact:false}).waitFor()
 await ranking.scrollIntoViewIfNeeded()
 await page.screenshot({path:'docs/reports/daily-check-in-shots/ranking-desktop.png'})
 await page.setViewportSize({width:390,height:844})
 await page.getByRole('heading',{name:'每日簽到',exact:true}).waitFor()
 await section.getByRole('button',{name:'今天已簽到'}).waitFor()
 await ranking.getByText('你的名次：第 2 名',{exact:false}).waitFor()
 await ranking.scrollIntoViewIfNeeded()
 await page.screenshot({path:'docs/reports/daily-check-in-shots/ranking-mobile.png'})
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.setViewportSize({width:1280,height:850})
 await page.getByRole('button',{name:'返回日曆',exact:true}).click()
 await page.getByRole('button',{name:'更多工具',exact:true}).click()
 await page.getByRole('menuitem',{name:'每日簽到',exact:true}).click()
 await section.getByRole('button',{name:'今天已簽到'}).waitFor()
 assert.equal(writes,2)
 saved=false; failRead=true
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await section.getByRole('alert').waitFor()
 assert(await section.getByRole('button',{name:'今天已簽到'}).isDisabled())
 failRead=false
 await section.getByRole('button',{name:'重新讀取',exact:true}).click()
 await section.getByRole('button',{name:'簽到，開始今天'}).waitFor()
 await page.emulateMedia({colorScheme:'dark'})
 await page.evaluate(()=>{document.documentElement.classList.add('dark')})
 await page.screenshot({path:'docs/reports/daily-check-in-shots/dark.png'})
 serverDate='2026-09-26'
 await page.clock.setFixedTime(new Date('2026-09-26T12:00:00+08:00'))
 await page.waitForFunction(()=>document.querySelector('time[datetime="2026-09-26"]'))
 await section.getByRole('button',{name:'簽到，開始今天'}).waitFor()
 await page.clock.setFixedTime(new Date())
 await page.evaluate(()=>localStorage.setItem('waddle-language-v1','en'))
 await page.reload()
 await page.getByRole('button',{name:'More tools',exact:true}).click()
 await page.getByRole('menuitem',{name:'Daily check-in',exact:true}).click()
 await page.getByRole('button',{name:'Check in for today',exact:true}).waitFor()
 assert.equal(await page.getByRole('region',{name:'Daily check-in'}).innerText().then(s=>/[一-鿿]/.test(s)),false)
 assert.deepEqual(errors,[])
 console.log('PASS: own Auth registration date, score ranking refresh, own row marker, leaderboard error/retry, no automatic writes, save failure/retry, one check-in, re-entry persistence, read error/retry, point balances, server RPC payload, Taipei rollover, English, desktop/mobile overflow, dark preview; no page errors. All DB traffic mocked.')
} finally {await browser.close()}
