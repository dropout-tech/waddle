import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'
const PORT = 3111, BASE = `http://localhost:${PORT}`
const env = Object.fromEntries(readFileSync('.env.e2e.local','utf8').split('\n').map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]))
const dev = spawn('pnpm',['exec','next','dev','-p',String(PORT)],{cwd:process.cwd(),detached:true,stdio:['ignore','ignore','ignore']})
for (let i=0;i<120;i++){try{const r=await fetch(BASE);if(r.status<500)break}catch{};await sleep(500)}
const browser = await chromium.launch()
const ctx = await browser.newContext({ locale: 'zh-TW', storageState: 'docs/reports/2026-07-22-share-p1-shots/stateA.json' })
const pg = await ctx.newPage()
const fails = []
pg.on('requestfailed', r => fails.push(`${r.failure()?.errorText} ${r.method()} ${r.url().slice(0,110)}`))
const errs = []
pg.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,100)) })
await pg.goto(`${BASE}/notebook`, { waitUntil: 'domcontentloaded' })
await sleep(8000)
console.log('request failures:', JSON.stringify(fails, null, 1).slice(0, 600))
console.log('console errors:', JSON.stringify(errs).slice(0, 300))
await browser.close()
try{process.kill(-dev.pid,'SIGTERM')}catch{}
