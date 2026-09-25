#!/usr/bin/env node
/**
 * 懸浮工作站＋IME 修復 — 正式站驗收（https://waddle.zeabur.app）— 2026-08-19。
 *
 * 對真正上線的版本做關鍵路徑抽驗（本機已有三套完整綠燈，這裡驗「上線的
 * 就是修過的版」）：
 *  P1  /float/scratchpad、/float/note 路由存在（未登入顯示登入導向，不是 404）
 *  P2  登入 → 開始計時 → 膠囊上有 ⧉（新程式碼在跑的鐵證）
 *  P3  ⧉ → 置頂工作站開啟，三分頁齊全、計時卡在跑
 *  P4  切到白板分頁 → iframe 載入正式站白板
 *  P5  IME 修復在線上：組字中的 Enter 不送出（左側欄新增分類）
 *  P6  記事本彈窗開著時膠囊仍在最上層（z-toast 修復）
 *  P7  零 pageerror
 *
 * DB 寫入：無——IME 檢查只驗「沒送出」，最後 Escape 取消；計時不落日曆
 * （<1 分鐘會被 recordSessionToCalendar 跳過）。
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = 'https://waddle.zeabur.app'
const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), '.env.e2e.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

let passed = 0, failed = 0
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const pageErrors = []
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  // P1：路由存在
  for (const route of ['/float/scratchpad', '/float/note']) {
    const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await sleep(4000)
    const status = resp?.status()
    const body = await page.locator('body').innerText().catch(() => '')
    const ok = status === 200 && !/404|not found/i.test(body)
    check(`P1 ${route} 路由已上線`, ok, `HTTP ${status}`)
  }

  // 登入
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor(); await sleep(1500)
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    if (!(await page.evaluate(() => location.pathname)).includes('/login')) break
  }
  await sleep(6000)

  // P2：開始計時 → ⧉ 存在
  await page.locator('[data-tour="focus-timer"]').first().click()
  await sleep(1500)
  await page.getByRole('button', { name: /開始專注|Start focusing/ }).first().click()
  await sleep(3000)
  const floatBtn = page.locator('[data-timer-float-toggle]').first()
  check('P2 計時膠囊上有彈出鈕（新版程式在跑）', (await floatBtn.count()) > 0)

  // P3：開工作站
  await floatBtn.click()
  await sleep(2500)
  const hub = await page.evaluate(() => {
    const w = window.documentPictureInPicture?.window
    if (!w) return null
    return {
      tabs: w.document.querySelectorAll('[data-hub-tab]').length,
      time: w.document.querySelector('[data-floating-timer] span.font-mono')?.textContent ?? null,
    }
  })
  check('P3 置頂工作站開啟：三分頁＋計時卡', hub?.tabs === 3 && /^\d{1,2}:\d{2}/.test(hub?.time ?? ''), JSON.stringify(hub))

  // P4：白板分頁 iframe
  await page.evaluate(() => {
    window.documentPictureInPicture?.window?.document.querySelector('[data-hub-tab="scratchpad"]')?.click()
  })
  let padLoaded = false
  for (let i = 0; i < 25; i++) {
    await sleep(1000)
    padLoaded = await page.evaluate(() => {
      const w = window.documentPictureInPicture?.window
      const f = w?.document.querySelector('iframe[src="/float/scratchpad"]')
      try { return /白板|board/i.test(f?.contentDocument?.body?.innerText ?? '') } catch { return false }
    })
    if (padLoaded) break
  }
  check('P4 工作站白板分頁載入正式站白板', padLoaded)
  await page.evaluate(() => window.documentPictureInPicture?.window?.close())
  await sleep(800)

  // 結束計時（長按 0.6s），不留狀態
  const stopBtn = page.locator('button[aria-label^="長按結束"]').first()
  const box = await stopBtn.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down(); await sleep(1000); await page.mouse.up()
  }
  await sleep(4000)

  // P5：IME 修復（左側欄新增分類；不送出、Escape 取消，不寫 DB）
  const addBtn = page.locator('button[aria-label^="在「"]').first()
  await addBtn.waitFor({ timeout: 30000 })
  await addBtn.click()
  await sleep(800)
  const input = page.locator('input[placeholder="分類名稱..."]').first()
  await input.waitFor()
  await input.type('線上IME測試', { delay: 20 })
  await input.evaluate((el) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 229, which: 229,
      isComposing: true, bubbles: true, cancelable: true,
    }))
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: el.value }))
  })
  await sleep(800)
  const stillEditing = (await page.locator('input[placeholder="分類名稱..."]').count()) > 0
  const valueKept = stillEditing ? await input.inputValue() : null
  check('P5 線上：組字中的 Enter 不送出、草稿還在', stillEditing && valueKept === '線上IME測試', `editing=${stillEditing} value="${valueKept}"`)
  await page.keyboard.press('Escape')
  await sleep(500)

  // P6：記事本彈窗 vs 膠囊層級——需要計時中，開一段再測
  await page.locator('[data-tour="focus-timer"]').first().click()
  await sleep(1200)
  await page.getByRole('button', { name: /開始專注|Start focusing/ }).first().click()
  await sleep(2500)
  await page.locator('[data-tour="notebook-entry"]').first().click()
  await sleep(2500)
  const hit = await page.evaluate(() => {
    const dialog = document.querySelector('.z-modal')
    const pill = document.querySelector('[aria-label="專注計時迷你顯示"]')
    if (!pill) return { dialog: !!dialog, pill: false }
    const r = pill.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { dialog: !!dialog, pill: true, hitInPill: pill.contains(el) }
  })
  check('P6 記事本彈窗開著時膠囊仍在最上層', hit.dialog && hit.pill && hit.hitInPill === true, JSON.stringify(hit))
  await page.keyboard.press('Escape')
  await sleep(800)
  const stop2 = page.locator('button[aria-label^="長按結束"]').first()
  const b2 = await stop2.boundingBox()
  if (b2) {
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2)
    await page.mouse.down(); await sleep(1000); await page.mouse.up()
  }
  await sleep(4000)

  check('P7 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (err?.stack || err))
} finally {
  await browser.close().catch(() => {})
  console.log(`\n=== ${passed} passed / ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}
