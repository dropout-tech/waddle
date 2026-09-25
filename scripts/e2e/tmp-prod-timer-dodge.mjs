#!/usr/bin/env node
// 正式站驗收：計時膠囊「彈窗避讓」（PR #40）。
// P1 右下 → P2 設定彈窗滑左下 → P3 關閉滑回 → P4 新增任務抽屜零重疊 →
// P5 長按結束收乾淨 → P6 零 pageerror。DB 寫入：無。
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
const errs = []
const browser = await chromium.launch()
try {
  const page = await (await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })).newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor(); await sleep(1500)
  await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  for (let i = 0; i < 60; i++) { await sleep(1000); if (!(await page.evaluate(() => location.pathname)).includes('/login')) break }
  await sleep(6000)

  const pillBox = () => page.evaluate(() => {
    const el = document.querySelector('[data-waddle-mini-root]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, right: r.right, vw: window.innerWidth }
  })

  // 開正計時 → 收回 PiP，留主視窗膠囊
  await page.locator('[data-hub-launcher]').first().click()
  await sleep(2500)
  await page.evaluate(() => {
    window.documentPictureInPicture?.window?.document.querySelector('[data-hub-idle-stopwatch]')?.click()
  })
  await sleep(2000)
  await page.evaluate(() => window.documentPictureInPicture?.window?.close())
  await sleep(1500)

  let box = await pillBox()
  check('P1 計時中，膠囊在右下角', !!box && box.vw - box.right <= 40,
    box ? `right-gap=${(box.vw - box.right).toFixed(1)}px` : 'pill not found（可能還是舊版）')

  await page.locator('button[aria-label="設定"]').first().click()
  await sleep(1200)
  box = await pillBox()
  check('P2 設定彈窗開著 → 膠囊滑到左下', !!box && box.x <= 60 && box.right < box.vw / 2,
    box ? `x=${box.x.toFixed(1)}px` : 'pill not found')

  await page.keyboard.press('Escape')
  await sleep(1200)
  box = await pillBox()
  check('P3 關掉設定 → 膠囊回右下', !!box && box.vw - box.right <= 40,
    box ? `right-gap=${(box.vw - box.right).toFixed(1)}px` : 'pill not found')

  const slot = page.locator('[title="點擊新增任務"]').first()
  if (await slot.count()) {
    await slot.click({ force: true })
    await sleep(1500)
    const overlap = await page.evaluate(() => {
      const pill = document.querySelector('[data-waddle-mini-root]')
      const panel = document.querySelector('[role="dialog"][aria-modal="true"]:not([data-onboarding-tour])')
      if (!pill || !panel) return null
      const a = pill.getBoundingClientRect(), b = panel.getBoundingClientRect()
      return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    })
    box = await pillBox()
    check('P4 新增任務抽屜開著 → 膠囊在左、不壓到抽屜', !!box && box.x <= 60 && overlap === false,
      box ? `x=${box.x.toFixed(1)}px overlap=${overlap}` : 'pill not found')
    await page.keyboard.press('Escape')
    await sleep(1200)
  } else {
    check('P4 新增任務抽屜開著 → 膠囊在左、不壓到抽屜', false, '找不到可點的空白時段')
  }

  // 收乾淨：長按結束
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
  check('P5 長按結束 → 計時收乾淨', gone)

  check('P6 零 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (err?.message || err))
} finally {
  await browser.close().catch(() => {})
}
console.log(`\n結果：${passed} 通過 / ${failed} 失敗`)
process.exit(failed ? 1 : 0)
