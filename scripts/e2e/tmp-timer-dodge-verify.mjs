#!/usr/bin/env node
/**
 * 計時膠囊「彈窗避讓」— 2026-08-24。
 *
 * 修的問題：膠囊 fixed 在右下角且 z 高於 modal，會壓住新增行程抽屜的送出按鈕。
 * 修法：任何 aria-modal 彈窗開著時（新手導覽除外），膠囊平滑滑到左下角。
 *
 * D1 開始計時 → 膠囊在右下角
 * D2 開設定彈窗 → 膠囊滑到左下
 * D3 關掉設定 → 膠囊回右下
 * D4 開新增任務抽屜 → 膠囊在左、與抽屜面板零重疊（桌面）
 * D5 關掉抽屜 → 膠囊回右下
 * D6 手機視口 390px：抽屜開著 → 膠囊在左側
 * D7 長按結束收乾淨 → 膠囊消失
 * D8 零 pageerror
 *
 * DB 寫入：無（正計時 <1 分鐘不落日曆；抽屜只開不存）。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3182
const BASE = `http://localhost:${PORT}`

function loadEnvFile(p) {
  const out = {}
  if (!existsSync(p)) return out
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[line.slice(0, eq).trim()] = v
  }
  return out
}
const env = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || env.E2E_PASSWORD

let passed = 0, failed = 0
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const pageErrors = []
let browser
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
server.stdout.on('data', () => {}); server.stderr.on('data', () => {})

async function waitServer() {
  for (let i = 0; i < 180; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready')
}

async function login(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').waitFor({ timeout: 60000 })
    await sleep(1500)
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('button[type="submit"]').click()
    for (let i = 0; i < 60; i++) {
      await sleep(1000)
      if (!(await page.evaluate(() => location.pathname)).includes('/login')) return
    }
  }
  throw new Error('login failed')
}

// 膠囊外層容器的實際位置（含 transform 之後）
const pillBox = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-waddle-mini-root]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, vw: window.innerWidth }
})

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  ctx.setDefaultNavigationTimeout(180000)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await login(page)
  await sleep(5000)

  // 用懸浮工作站的「正計時」快速開始一個 session，再收回 PiP → 主視窗剩膠囊
  await page.locator('[data-hub-launcher]').first().click()
  await sleep(2000)
  await page.evaluate(() => {
    window.documentPictureInPicture?.window?.document.querySelector('[data-hub-idle-stopwatch]')?.click()
  })
  await sleep(2000)
  await page.evaluate(() => window.documentPictureInPicture?.window?.close())
  await sleep(1500)

  // D1：右下角
  let box = await pillBox(page)
  check('D1 計時中，膠囊在右下角', !!box && box.vw - box.right <= 40 && box.right <= box.vw,
    box ? `right-gap=${(box.vw - box.right).toFixed(1)}px` : 'pill not found')

  // D2：開設定 → 滑到左下
  await page.locator('button[aria-label="設定"]').first().click()
  await sleep(1200)
  box = await pillBox(page)
  check('D2 設定彈窗開著 → 膠囊滑到左下', !!box && box.x <= 60 && box.right < box.vw / 2,
    box ? `x=${box.x.toFixed(1)}px` : 'pill not found')

  // D3：關掉 → 回右下
  await page.keyboard.press('Escape')
  await sleep(1200)
  box = await pillBox(page)
  check('D3 關掉設定 → 膠囊回右下', !!box && box.vw - box.right <= 40,
    box ? `right-gap=${(box.vw - box.right).toFixed(1)}px` : 'pill not found')

  // D4：開新增任務抽屜（點日曆空白時段）→ 膠囊在左、與抽屜面板零重疊
  const slot = page.locator('[title="點擊新增任務"]').first()
  let drawerOpened = false
  if (await slot.count()) {
    await slot.click({ force: true })
    await sleep(1500)
    drawerOpened = await page.evaluate(() =>
      !!document.querySelector('[role="dialog"][aria-modal="true"]:not([data-onboarding-tour])'))
  }
  if (drawerOpened) {
    box = await pillBox(page)
    const overlap = await page.evaluate(() => {
      const pill = document.querySelector('[data-waddle-mini-root]')
      const panel = document.querySelector('[role="dialog"][aria-modal="true"]:not([data-onboarding-tour])')
      if (!pill || !panel) return null
      const a = pill.getBoundingClientRect(), b = panel.getBoundingClientRect()
      return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    })
    check('D4 新增任務抽屜開著 → 膠囊在左、不壓到抽屜', !!box && box.x <= 60 && overlap === false,
      box ? `x=${box.x.toFixed(1)}px overlap=${overlap}` : 'pill not found')

    // D5：Escape 關抽屜 → 回右下
    await page.keyboard.press('Escape')
    await sleep(1500)
    box = await pillBox(page)
    check('D5 關掉抽屜 → 膠囊回右下', !!box && box.vw - box.right <= 40,
      box ? `right-gap=${(box.vw - box.right).toFixed(1)}px` : 'pill not found')
  } else {
    check('D4 新增任務抽屜開著 → 膠囊在左、不壓到抽屜', false, '找不到可點的空白時段（抽屜沒開成）')
    check('D5 關掉抽屜 → 膠囊回右下', false, '前置 D4 失敗')
  }

  // D6：手機視口——抽屜開著時膠囊在左側（桌面版設定鈕在手機隱藏，改點空白時段）
  await page.setViewportSize({ width: 390, height: 844 })
  await sleep(1500)
  const mobileSlot = page.locator('[title="點擊新增任務"]:visible').first()
  if (await mobileSlot.count()) {
    await mobileSlot.click({ force: true })
    await sleep(1500)
    box = await pillBox(page)
    check('D6 手機視口＋彈窗 → 膠囊在左側', !!box && box.x <= 40 && box.vw - box.right > box.x + 60,
      box ? `x=${box.x.toFixed(1)}px right-gap=${(box.vw - box.right).toFixed(1)}px` : 'pill not found')
  } else {
    check('D6 手機視口＋彈窗 → 膠囊在左側', false, '手機視口找不到可點的空白時段')
  }
  await page.keyboard.press('Escape')
  await sleep(1200)

  // D7：長按結束收乾淨
  await page.setViewportSize({ width: 1440, height: 900 })
  await sleep(1000)
  const stopBtn = '[data-waddle-mini-root] button[aria-label^="長按結束"]'
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  }, stopBtn)
  await sleep(1000)
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  }, stopBtn)
  await sleep(5000)
  const gone = await page.evaluate(() => !document.querySelector('[data-waddle-mini-root] [aria-label^="長按結束"]'))
  check('D7 長按結束 → 計時收乾淨', gone)

  check('D8 零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (err?.stack || err))
} finally {
  await browser?.close().catch(() => {})
  try { process.kill(-server.pid, 'SIGKILL') } catch {}
}
console.log(`\n結果：${passed} 通過 / ${failed} 失敗`)
process.exit(failed ? 1 : 0)
