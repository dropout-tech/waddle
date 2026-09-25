// Historical probe: use an isolated test project; may write/delete test data.
if (!process.env.E2E_SECONDARY_EMAIL || !process.env.E2E_SECONDARY_PASSWORD) throw new Error('Set E2E_SECONDARY_EMAIL and E2E_SECONDARY_PASSWORD for an isolated test account');
#!/usr/bin/env node
/**
 * P1 acceptance: calendar-sharing invite flow through the real UI.
 * A (e2e account) mints an invite in Settings→共享; B (dedicated share-test
 * account) opens the link logged-out, is bounced through /login, accepts,
 * then both sides see each other and A dissolves the share.
 * One password login per account (Supabase throttles rapid repeats); the
 * mobile check reuses A's storageState. Not committed (tmp- convention).
 * Run: node scripts/e2e/tmp-share-invite-ui-verify.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3107
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-07-22-share-p1-shots')
mkdirSync(SHOT_DIR, { recursive: true })

function loadEnvFile(p) {
  const out = {}
  if (!existsSync(p)) return out
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}
const env = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const A_EMAIL = env.E2E_EMAIL
const A_PASS = env.E2E_PASSWORD
const B_EMAIL = process.env.E2E_SECONDARY_EMAIL
const B_PASS = process.env.E2E_SECONDARY_PASSWORD
if (!A_EMAIL || !A_PASS) { console.error('missing .env.e2e.local'); process.exit(1) }

let devServer
let exitCode = 0
const pageErrors = []

async function waitReady(timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE_URL); if (r.status < 500) return } catch {}
    await sleep(500)
  }
  throw new Error('dev server not ready')
}

async function step(name, fn) {
  try { await fn(); console.log(`PASS — ${name}`) }
  catch (e) { console.log(`FAIL — ${name} — ${e.message.split('\n')[0]}`); exitCode = 1 }
}

async function hydratedFill(page, sel, value) {
  for (let i = 0; i < 5; i++) {
    await page.locator(sel).fill(value)
    if ((await page.locator(sel).inputValue()) === value) return
    await sleep(400)
  }
  throw new Error(`fill ${sel} lost to hydration race`)
}

async function ensureZh(page) {
  try {
    await page.getByRole('button', { name: '登入', exact: true }).waitFor({ state: 'visible', timeout: 3000 })
  } catch {
    const zh = page.getByRole('button', { name: '中文' })
    if (await zh.isVisible().catch(() => false)) { await zh.click(); await sleep(600) }
  }
}

async function login(page, email, pass) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').waitFor({ state: 'visible', timeout: 20000 })
    await ensureZh(page)
    await hydratedFill(page, '#email', email)
    await hydratedFill(page, '#password', pass)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    try {
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
      return
    } catch {
      const body = await page.evaluate(() => document.body.innerText).catch(() => '')
      console.log(`  [login retry ${attempt}] still on ${page.url()} — ${body.slice(0, 120).replace(/\n/g, ' ')}`)
      await sleep(45000) // likely Supabase password-grant throttling; back off
    }
  }
  throw new Error('login failed after retries (rate limit?)')
}

const stateFileA = path.join(SHOT_DIR, 'stateA.json')
async function contextWithSession(browser, opts, stateFile, email, pass) {
  if (existsSync(stateFile)) {
    const ctx = await browser.newContext({ locale: 'zh-TW', storageState: stateFile, ...opts })
    const pg = await ctx.newPage()
    await pg.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    try {
      await pg.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 15000 })
      return { ctx, pg }
    } catch { await ctx.close() }
  }
  const ctx = await browser.newContext({ locale: 'zh-TW', ...opts })
  const pg = await ctx.newPage()
  await login(pg, email, pass)
  await pg.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 25000 })
  writeFileSync(stateFile, JSON.stringify(await ctx.storageState()))
  return { ctx, pg }
}

async function dismissTourIfAny(page) {
  const skip = page.getByRole('button', { name: '略過導覽' })
  try { await skip.waitFor({ state: 'visible', timeout: 3000 }); await skip.click() } catch {}
}

async function openSharingTab(page) {
  await dismissTourIfAny(page)
  await page.getByRole('button', { name: '設定', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.waitFor({ state: 'visible', timeout: 10000 })
  await dlg.getByText('共享', { exact: true }).first().click()
  await sleep(600) // tab content + peers/invites fetch
  return dlg
}

async function main() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitReady()

  const browser = await chromium.launch()
  let ctxA, A
  let inviteUrl = null

  await step('A 登入', async () => {
    const r = await contextWithSession(browser, { viewport: { width: 1280, height: 900 } }, stateFileA, A_EMAIL, A_PASS)
    ctxA = r.ctx; A = r.pg
    A.on('pageerror', (e) => { pageErrors.push(`A:${e.message}`); console.log(`[pageerror A] ${e.message}`) })
  })

  await step('A 設定 → 共享分頁 → 產生邀請連結', async () => {
    const dlg = await openSharingTab(A)
    await dlg.getByRole('button', { name: '產生邀請連結' }).first().waitFor({ state: 'visible', timeout: 10000 })
    await A.screenshot({ path: path.join(SHOT_DIR, '01-a-sharing-tab.png') })
    await dlg.getByRole('button', { name: '產生邀請連結' }).first().click()
    const linkInput = dlg.getByLabel('邀請連結')
    await linkInput.waitFor({ state: 'visible', timeout: 10000 })
    inviteUrl = await linkInput.inputValue()
    if (!/\/share\/invite#t=[A-Za-z0-9_-]+/.test(inviteUrl)) throw new Error(`bad invite url: ${inviteUrl}`)
    await A.screenshot({ path: path.join(SHOT_DIR, '02-a-invite-created.png') })
  })

  const ctxB = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  const B = await ctxB.newPage()
  B.on('pageerror', (e) => { pageErrors.push(`B:${e.message}`); console.log(`[pageerror B] ${e.message}`) })

  await step('B 未登入開連結 → 被導去 /login', async () => {
    await B.goto(inviteUrl, { waitUntil: 'domcontentloaded' })
    await B.waitForURL(/\/login/, { timeout: 15000 })
  })

  await step('B 登入 → 自動接手回邀請頁 → 顯示邀請卡', async () => {
    await B.locator('#email').waitFor({ state: 'visible', timeout: 20000 })
    await ensureZh(B)
    await hydratedFill(B, '#email', B_EMAIL)
    await hydratedFill(B, '#password', B_PASS)
    await B.getByRole('button', { name: '登入', exact: true }).click()
    try {
      await B.waitForURL(/\/share\/invite/, { timeout: 25000 })
    } catch {
      const bodyText = await B.evaluate(() => document.body.innerText).catch(() => '?')
      throw new Error(`stuck at URL=${B.url()} BODY=${bodyText.slice(0, 250).replace(/\n/g, ' | ')}`)
    }
    await B.getByText('邀請你互相共享行事曆', { exact: false }).waitFor({ state: 'visible', timeout: 15000 })
    await B.screenshot({ path: path.join(SHOT_DIR, '03-b-invite-card.png') })
  })

  await step('B 接受邀請 → 回主畫面', async () => {
    await B.getByRole('button', { name: '接受邀請' }).click()
    await B.waitForURL(`${BASE_URL}/`, { timeout: 25000 })
  })

  await step('B 設定 → 共享：看得到 A（有解除共享鈕）', async () => {
    await B.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 25000 })
    const dlg = await openSharingTab(B)
    await dlg.getByRole('button', { name: '解除共享' }).first().waitFor({ state: 'visible', timeout: 10000 })
    await B.screenshot({ path: path.join(SHOT_DIR, '04-b-sees-peer.png') })
    await B.keyboard.press('Escape')
  })

  await step('A 重載後共享分頁看得到 B', async () => {
    await A.keyboard.press('Escape')
    await A.reload({ waitUntil: 'domcontentloaded' })
    await A.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 25000 })
    const dlg = await openSharingTab(A)
    await dlg.getByRole('button', { name: '解除共享' }).first().waitFor({ state: 'visible', timeout: 10000 })
    await A.screenshot({ path: path.join(SHOT_DIR, '05-a-sees-peer.png') })
    await A.keyboard.press('Escape')
  })

  await step('手機 390px：共享分頁無水平溢出、按鈕觸控目標足夠', async () => {
    const ctxM = await browser.newContext({ locale: 'zh-TW', storageState: await ctxA.storageState(), viewport: { width: 390, height: 844 } })
    const M = await ctxM.newPage()
    M.on('pageerror', (e) => pageErrors.push(`M:${e.message}`))
    await M.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    // dev-mode nextjs-portal can eat 390px taps (known); remove it
    await sleep(2000)
    await M.evaluate(() => document.querySelector('nextjs-portal')?.remove())
    await dismissTourIfAny(M)
    // mobile: settings lives behind 日曆 tab → 「更多」 overflow menu
    const calTab = M.getByRole('tab', { name: '日曆' })
    if (await calTab.isVisible().catch(() => false)) { await calTab.click(); await sleep(800) }
    const direct = M.getByRole('button', { name: '設定', exact: true })
    if (await direct.isVisible().catch(() => false)) {
      await direct.click()
    } else {
      await M.getByRole('button', { name: '更多' }).click()
      await M.getByText('設定', { exact: true }).first().click()
    }
    const dlg = M.getByRole('dialog')
    await dlg.waitFor({ state: 'visible', timeout: 10000 })
    await dlg.getByText('共享', { exact: true }).first().click()
    await sleep(600)
    const overflowW = await M.evaluate(() => document.documentElement.scrollWidth)
    if (overflowW > 390) throw new Error(`horizontal overflow: ${overflowW}`)
    const btn = dlg.getByRole('button', { name: '產生邀請連結' }).first()
    await btn.waitFor({ state: 'visible', timeout: 10000 })
    const box = await btn.boundingBox()
    if (!box || box.height < 36) throw new Error(`generate button too small: ${JSON.stringify(box)}`)
    await M.screenshot({ path: path.join(SHOT_DIR, '06-mobile-390-sharing.png') })
    await ctxM.close()
  })

  await step('A 解除共享（二次確認）→ 列表清空', async () => {
    const dlg = await openSharingTab(A)
    await dlg.getByRole('button', { name: '解除共享' }).first().click()
    const alert = A.getByRole('alertdialog')
    await alert.waitFor({ state: 'visible', timeout: 5000 })
    await alert.getByRole('button', { name: /解除/ }).click()
    await sleep(1500)
    const count = await dlg.getByRole('button', { name: '解除共享' }).count()
    if (count !== 0) throw new Error(`peer still listed after dissolve (${count})`)
    await A.screenshot({ path: path.join(SHOT_DIR, '07-a-dissolved.png') })
  })

  await step('清理：撤銷殘留邀請', async () => {
    const dlg = A.getByRole('dialog')
    for (let i = 0; i < 10; i++) {
      const revoke = dlg.getByRole('button', { name: '撤銷' }).first()
      if (!(await revoke.isVisible().catch(() => false))) break
      await revoke.click()
      await sleep(900)
    }
    const left = await dlg.getByRole('button', { name: '撤銷' }).count()
    if (left !== 0) throw new Error(`${left} invites left`)
  })

  await step('B 重載後共享分頁為空狀態', async () => {
    await B.reload({ waitUntil: 'domcontentloaded' })
    await B.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 25000 })
    const dlg = await openSharingTab(B)
    const count = await dlg.getByRole('button', { name: '解除共享' }).count()
    if (count !== 0) throw new Error('B still sees a peer after dissolve')
  })

  await step('無 page error', async () => {
    if (pageErrors.length) throw new Error(pageErrors.join(' | '))
  })

  await sleep(1500) // let in-flight writes land before teardown (lesson)
  await browser.close()
}

main()
  .catch((e) => { console.error(e); exitCode = 1 })
  .finally(() => {
    if (devServer?.pid) { try { process.kill(-devServer.pid, 'SIGTERM') } catch {} }
    console.log(exitCode === 0 ? '\nALL PASS' : '\nSOME FAILED')
    process.exit(exitCode)
  })
