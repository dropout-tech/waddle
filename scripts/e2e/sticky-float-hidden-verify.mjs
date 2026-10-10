// 便條紙不該畫進懸浮工作站的記事本／白板（/float/note、/float/scratchpad）——
// 不論是工作站裡的 iframe 分頁，還是單獨開成小視窗；主畫面照常顯示。
// BASE_URL=http://localhost:3241 node scripts/e2e/sticky-float-hidden-verify.mjs
// Uses test account A (.env.e2e.local); the note it creates is deleted at the
// end and the account's own on-screen notes are restored.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
const BASE = process.env.BASE_URL || 'http://localhost:3241'
const SHOTS = process.env.SHOT_DIR || path.join(process.cwd(), 'docs/reports/sticky-float-hidden-shots')
mkdirSync(SHOTS, { recursive: true })
const load = (f) => { const o = {}; if (!existsSync(f)) return o; for (const l of readFileSync(f, 'utf8').split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const i = t.indexOf('='); if (i < 0) continue; let v = t.slice(i + 1).trim(); if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1); o[t.slice(0, i).trim()] = v } return o }
const cwd = process.cwd()
const env = { ...load(path.join(cwd, '.env.local')), ...load(path.join(cwd, '.env.e2e.local')) }
const admin = load(path.join(cwd, '.env.admin.local'))
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) fails++ }
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, admin.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: s, error: le } = await anon.auth.signInWithPassword({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD })
if (le) { console.error('login failed', le.message); process.exit(2) }
const uid = s.user.id
const TAG = `E2E跳窗${Date.now().toString().slice(-5)}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const noteRow = async () => (await svc.from('sticky_notes').select('*').eq('user_id', uid).contains('content', { content: [{ content: [{ text: TAG }] }] }).maybeSingle()).data
const { data: before } = await svc.from('sticky_notes').select('id').eq('user_id', uid).eq('on_screen', true)
const hidden = (before ?? []).map((r) => r.id)
if (hidden.length) await svc.from('sticky_notes').update({ on_screen: false }).in('id', hidden)
const NOTE = '[data-testid="sticky-note"]'
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'zh-TW' })
  // addInitScript runs in every frame, so the iframes see "便條紙開啟" too —
  // exactly the state that made notes leak into the hub.
  await ctx.addInitScript(() => { try { localStorage.setItem('huddle-sticky-notes-enabled-v1', '1'); if (!localStorage.getItem('waddle-language-v1')) localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor({ timeout: 90000 }); await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('#password').press('Enter')
  await page.waitForURL(`${BASE}/`, { timeout: 90000 })

  // 1. 主畫面：新增一張便條（確認便條功能本身是開著、會顯示的）
  await page.getByRole('button', { name: '新增便條紙', exact: true }).first().click()
  const card = page.locator(NOTE).last()
  await card.waitFor({ timeout: 20000 })
  await card.locator('[contenteditable="true"]').click(); await page.keyboard.type(TAG)
  await sleep(1800)
  ok(!!(await noteRow()), 'main window: note created and saved')
  ok((await page.locator(NOTE).count()) >= 1, 'main window: sticky note is visible')

  // 2. 模擬懸浮工作站：跟 floating-hub.tsx 一樣用 iframe 載入兩個分頁
  await page.evaluate(() => {
    const box = document.createElement('div')
    box.id = 'e2e-hub'
    box.style.cssText = 'position:fixed;right:24px;bottom:24px;width:560px;height:640px;z-index:2147483000;background:#fff;box-shadow:0 8px 40px rgba(0,0,0,.35);border-radius:16px;overflow:hidden'
    for (const [id, src] of [['e2e-note', '/float/note'], ['e2e-scratch', '/float/scratchpad']]) {
      const f = document.createElement('iframe'); f.id = id; f.src = src
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0' + (id === 'e2e-scratch' ? ';visibility:hidden' : '')
      box.appendChild(f)
    }
    document.body.appendChild(box)
  })
  const noteFrame = page.frameLocator('#e2e-note')
  const scratchFrame = page.frameLocator('#e2e-scratch')
  await noteFrame.getByText('記事本', { exact: true }).first().waitFor({ timeout: 60000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(5000) // 給便條紙 store 足夠時間載入（舊版會在這段時間畫出便條）
  ok(true, 'hub iframe: 記事本 page rendered')
  ok((await noteFrame.locator(NOTE).count()) === 0, 'hub iframe 記事本: no sticky note inside')
  const scratchText = await scratchFrame.locator('body').innerText({ timeout: 60000 }).catch(() => '')
  ok(scratchText.trim().length > 0, 'hub iframe: 白板 page rendered')
  ok((await scratchFrame.locator(NOTE).count()) === 0, 'hub iframe 白板: no sticky note inside')
  ok((await page.locator(NOTE).count()) >= 1, 'main window still shows its note while hub is open')
  await page.screenshot({ path: path.join(SHOTS, '1-main-with-hub-iframe.png') })

  // 3. 單獨開成小視窗（window.open('/float/note')）的情況
  const pop = await ctx.newPage()
  await pop.setViewportSize({ width: 520, height: 640 })
  pop.on('pageerror', (e) => errors.push(e.message))
  await pop.goto(`${BASE}/float/note`, { waitUntil: 'domcontentloaded' })
  await pop.getByText('記事本', { exact: true }).first().waitFor({ timeout: 60000 })
  await pop.waitForLoadState('networkidle').catch(() => {})
  await sleep(5000)
  ok((await pop.locator(NOTE).count()) === 0, 'popup /float/note: no sticky note')
  await pop.screenshot({ path: path.join(SHOTS, '2-popup-float-note.png') })
  await pop.goto(`${BASE}/float/scratchpad`, { waitUntil: 'domcontentloaded' })
  await pop.waitForLoadState('networkidle').catch(() => {}); await sleep(5000)
  ok((await pop.locator(NOTE).count()) === 0, 'popup /float/scratchpad: no sticky note')
  await pop.close()

  // 4. 回歸：主畫面重新整理後便條還在
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator(NOTE, { hasText: TAG }).first().waitFor({ timeout: 30000 }).catch(() => {})
  ok((await page.locator(NOTE, { hasText: TAG }).count()) === 1, 'main window after reload: note still shown')
  ok(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`)
} finally {
  await browser.close()
  const row = await noteRow()
  if (row) await svc.from('sticky_notes').delete().eq('id', row.id)
  if (hidden.length) await svc.from('sticky_notes').update({ on_screen: true }).in('id', hidden)
  console.log(`cleanup: test note ${row ? 'deleted' : 'not found'}, restored ${hidden.length} existing note(s)`)
}
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS')
process.exit(fails ? 1 : 0)
