import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
const PORT = 3107, BASE = `http://localhost:${PORT}`
const parse = f => Object.fromEntries(readFileSync(f,'utf8').split('\n').map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]))
const e2e = parse('.env.e2e.local'), adm = parse('.env.admin.local')
const signIn = async (email, password) => {
  const r = await fetch(`${adm.SUPABASE_URL}/auth/v1/token?grant_type=password`, {method:'POST',headers:{apikey:adm.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})}).then(x=>x.json())
  return { jwt: r.access_token, id: r.user.id }
}
const api = async (jwt, method, p, body) => fetch(`${adm.SUPABASE_URL}/rest/v1/${p}`, {method, headers:{apikey:adm.SUPABASE_ANON_KEY,Authorization:`Bearer ${jwt}`,'Content-Type':'application/json',Prefer:'return=representation'}, ...(body?{body:JSON.stringify(body)}:{})}).then(async r=>({status:r.status, body: await r.json().catch(()=>null)}))
const A = await signIn(e2e.E2E_EMAIL, e2e.E2E_PASSWORD)
const today = new Intl.DateTimeFormat('sv-SE').format(new Date())
const share = (await api(A.jwt,'GET',`calendar_shares?select=id&or=(user_lo.eq.${A.id},user_hi.eq.${A.id})`)).body[0]
const ws = (await api(A.jwt,'GET','workspaces?select=id&limit=1')).body[0].id
const cat = (await api(A.jwt,'GET',`categories?select=id&workspace_id=eq.${ws}&limit=1`)).body[0].id
await api(A.jwt,'POST','calendar_share_grants',{share_id:share.id,owner_id:A.id,kind:'workspace',ref:ws,detail:'full'})
const task = (await api(A.jwt,'POST','tasks',{user_id:A.id,workspace_id:ws,category_id:cat,title:'P2-PROBE-TITLE',scheduled_date:today,scheduled_start_time:'11:00',scheduled_end_time:'11:30'})).body[0]
const dev = spawn('pnpm',['exec','next','dev','-p',String(PORT)],{cwd:process.cwd(),detached:true,stdio:['ignore','ignore','ignore']})
for (let i=0;i<120;i++){try{const r=await fetch(BASE);if(r.status<500)break}catch{};await sleep(500)}
const browser = await chromium.launch()
const ctx = await browser.newContext({ locale:'zh-TW', storageState:'docs/reports/2026-07-22-share-p1-shots/stateB.json', viewport:{width:1280,height:900} })
const pg = await ctx.newPage()
pg.on('console', m => { const t = m.text(); if(m.type()==='error' || t.includes('SHARE-DEBUG')) console.log('[pg]', t.slice(0,200)) })
const rpcCalls = []
pg.on('response', async r => {
  if (r.url().includes('get_shared_calendar')) {
    const body = await r.text().catch(()=> '?')
    console.log('[rpc response]', r.status(), body.slice(0, 250))
    rpcCalls.push('get_shared_calendar')
  }
  if (r.url().includes('get_share_peers')) rpcCalls.push('get_share_peers')
})
await pg.goto(BASE,{waitUntil:'domcontentloaded'})
await sleep(4000)
console.log('rpc calls so far:', JSON.stringify(rpcCalls))
const toolbarBtns = await pg.locator('[role="toolbar"] button').evaluateAll(els => els.map(e => e.getAttribute('aria-label') || e.textContent.trim()).filter(Boolean))
console.log('toolbar buttons:', JSON.stringify(toolbarBtns))
const ls = await pg.evaluate(() => localStorage.getItem('huddle-visible-share-peers-v1'))
console.log('visiblePeers LS:', ls)
await pg.getByRole('button',{name:'日檢視'}).click(); await sleep(2500)
console.log('rpc calls after day view:', JSON.stringify(rpcCalls))
console.log('probe title visible:', await pg.getByText('P2-PROBE-TITLE').first().isVisible().catch(()=>false))
const pe = await pg.evaluate(() => {
  const els = [...document.querySelectorAll('[data-peer-event]')]
  return els.map(e => ({ txt: e.textContent, rect: e.getBoundingClientRect().toJSON(), detail: e.getAttribute('data-peer-event') }))
})
console.log('peer-event elements:', JSON.stringify(pe).slice(0, 400))
console.log('page has PEER text?', (await pg.evaluate(() => document.body.innerText)).includes('P2-PROBE'))
await api(A.jwt,'DELETE',`tasks?id=eq.${task.id}`)
await api(A.jwt,'DELETE','tasks?title=eq.P2-PROBE-TITLE')
await api(A.jwt,'DELETE',`calendar_share_grants?share_id=eq.${share.id}&owner_id=eq.${A.id}`)
await browser.close()
try{process.kill(-dev.pid,'SIGTERM')}catch{}
