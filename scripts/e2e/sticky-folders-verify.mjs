// Sticky-note put-away drawer + folders (PR: feat/sticky-note-folders).
// BASE_URL=http://localhost:3107 node scripts/e2e/sticky-folders-verify.mjs
// Uses test account A (.env.e2e.local); every note/folder it creates is
// deleted at the end with the service role.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
const BASE = process.env.BASE_URL || 'https://waddle.zeabur.app'
const SHOTS = process.env.SHOT_DIR || path.join(process.cwd(), 'docs/reports/sticky-folders-shots')
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
const TAG = `E2E便條${Date.now().toString().slice(-5)}`
const FOLDER = `E2E夾${Date.now().toString().slice(-5)}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const noteRow = async () => (await svc.from('sticky_notes').select('*').eq('user_id', uid).contains('content', { content: [{ content: [{ text: TAG }] }] }).maybeSingle()).data
// Pre-existing on-screen notes of the test account are put away (restored at the end) so ours is unobstructed.
const { data: before } = await svc.from('sticky_notes').select('id').eq('user_id', uid).eq('on_screen', true)
const hidden = (before ?? []).map((r) => r.id)
if (hidden.length) await svc.from('sticky_notes').update({ on_screen: false }).in('id', hidden)
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'zh-TW' })
  await ctx.addInitScript(() => { try { localStorage.setItem('huddle-sticky-notes-enabled-v1', '1'); if (!localStorage.getItem('waddle-language-v1')) localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor({ timeout: 90000 }); await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('#password').press('Enter')
  await page.waitForURL(`${BASE}/`, { timeout: 90000 })

  // 1. create a note and type
  await page.getByRole('button', { name: '新增便條紙', exact: true }).first().click()
  const card = page.locator('[data-testid="sticky-note"]').last()
  await card.waitFor({ timeout: 20000 })
  await card.locator('[contenteditable="true"]').click(); await page.keyboard.type(TAG)
  await sleep(1800)
  let row = await noteRow(); ok(!!row && row.on_screen === true && row.folder_id === null, 'new note saved, on screen, 未分類')
  await page.screenshot({ path: path.join(SHOTS, '1-note-on-screen.png') })

  // 2. put it away
  await card.locator('[data-testid="sticky-note-stow"]').click(); await sleep(1500)
  ok((await page.locator('[data-testid="sticky-note"]').count()) === 0, 'note left the screen after 收起')
  row = await noteRow(); ok(row?.on_screen === false, 'DB on_screen=false after 收起 (not deleted)')

  // 3. open drawer, note is listed under 未分類
  await page.locator('[data-testid="sticky-drawer-toggle"]').click()
  const drawer = page.locator('[data-testid="sticky-notes-drawer"]')
  await drawer.waitFor({ timeout: 15000 })
  const item = drawer.locator('[data-testid="sticky-drawer-item"]', { hasText: TAG })
  await item.waitFor({ timeout: 15000 }); ok(true, 'put-away note listed in drawer under 未分類')

  // 4. new folder, move note into it
  await drawer.getByRole('button', { name: '新增資料夾' }).click()
  await drawer.getByRole('textbox', { name: '資料夾名稱' }).fill(FOLDER)
  await drawer.getByRole('textbox', { name: '資料夾名稱' }).press('Enter'); await sleep(1500)
  const { data: frow } = await svc.from('sticky_note_folders').select('*').eq('user_id', uid).eq('name', FOLDER).maybeSingle()
  ok(!!frow, 'folder saved to DB')
  await drawer.getByRole('button', { name: '未分類', exact: false }).first().click()
  await item.locator('select').selectOption(frow.id); await sleep(1500)
  row = await noteRow(); ok(row?.folder_id === frow.id, 'note moved into the folder (DB)')
  await drawer.getByRole('button', { name: FOLDER }).click()
  await item.waitFor({ timeout: 5000 }); ok(true, 'note shows inside the folder tab')
  await page.screenshot({ path: path.join(SHOTS, '2-drawer-folder.png') })

  // 5. pin it back
  await item.locator('[data-testid="sticky-drawer-restore"]').click(); await sleep(1500)
  ok((await page.locator('[data-testid="sticky-note"]', { hasText: TAG }).count()) === 1, 'note pinned back on screen')
  row = await noteRow(); ok(row?.on_screen === true && row?.folder_id === frow.id, 'DB on_screen=true, still in folder')
  await page.screenshot({ path: path.join(SHOTS, '3-pinned-back.png') })

  // 6. delete folder → note falls back to 未分類, not deleted
  page.once('dialog', (d) => d.accept())
  await drawer.getByRole('button', { name: '刪除資料夾' }).click(); await sleep(1500)
  const { data: gone } = await svc.from('sticky_note_folders').select('id').eq('id', frow.id)
  row = await noteRow()
  ok((gone ?? []).length === 0 && !!row && row.folder_id === null, 'folder deleted, note kept and moved to 未分類')

  // 7. reload persists; English has no leftover Chinese in the drawer
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload(); await page.locator('[data-testid="sticky-drawer-toggle"]').waitFor({ timeout: 60000 })
  ok((await page.locator('[data-testid="sticky-note"]', { hasText: TAG }).count()) === 1, 'still on screen after reload')
  await page.locator('[data-testid="sticky-drawer-toggle"]').click(); await drawer.waitFor()
  const txt = (await drawer.innerText()).replace(TAG, '')
  ok(!/[一-鿿]/.test(txt), `English drawer has no Chinese (${JSON.stringify(txt.slice(0, 80))})`)
  await page.screenshot({ path: path.join(SHOTS, '4-drawer-en.png') })

  // 8. phone width
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(800)
  const bb = await drawer.boundingBox()
  ok(bb && bb.x >= 0 && bb.x + bb.width <= 390, `drawer fits 390px (${bb && Math.round(bb.x)}..${bb && Math.round(bb.x + bb.width)})`)
  await page.screenshot({ path: path.join(SHOTS, '5-drawer-390.png') })
  ok(errors.length === 0, `no page errors (${errors.join(' | ').slice(0, 200)})`)
} finally {
  await browser.close()
  const r = await noteRow(); if (r) await svc.from('sticky_notes').delete().eq('id', r.id)
  await svc.from('sticky_note_folders').delete().eq('user_id', uid).like('name', 'E2E夾%')
  if (hidden.length) await svc.from('sticky_notes').update({ on_screen: true }).in('id', hidden)
  console.log(`cleanup done (restored ${hidden.length} pre-existing notes)`)
}
console.log(fails ? `RESULT: ${fails} FAIL` : 'RESULT: ALL PASS'); process.exit(fails ? 1 : 0)
