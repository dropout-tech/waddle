#!/usr/bin/env node
/** TEMP mobile (390px) check: notebook toolbar has a visible image button of
 *  usable size, and the details caret is tappable. Text output only. */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = `http://localhost:${process.env.E2E_PORT || 3124}`
function loadEnvFile(p) {
  const out = {}
  if (!existsSync(p)) return out
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const eq = l.indexOf('=')
    if (eq > 0 && !l.trim().startsWith('#')) out[l.slice(0, eq).trim()] = l.slice(eq + 1).trim()
  }
  return out
}
const env = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || env.E2E_PASSWORD

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-TW', hasTouch: true })
await context.addInitScript(() => {
  try { window.localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {}
})
const page = await context.newPage()
const fails = []
const check = (name, ok, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${note ? ' — ' + note : ''}`)
  if (!ok) fails.push(name)
}

await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('#email').waitFor({ state: 'visible', timeout: 90000 })
for (let i = 0; i < 5; i++) {
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  if ((await page.locator('#email').inputValue()) === EMAIL) break
  await page.waitForTimeout(600)
}
await page.getByRole('button', { name: '登入', exact: true }).click()
await page.waitForURL(`${BASE_URL}/`, { timeout: 60000 })
await page.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: '新增記事' }).first().click()
await page.locator('input[placeholder="無標題"]').waitFor({ state: 'visible', timeout: 15000 })
await page.locator('input[placeholder="無標題"]').fill(`MOBILE-CHECK ${Date.now() % 100000}`)
await page.locator('.ProseMirror').first().click()
await page.waitForTimeout(500)

// 1. image button in mobile toolbar
const imgBtn = page.locator('button[aria-label*="圖片"], button[title*="圖片"]').first()
const imgBtnVisible = await imgBtn.isVisible().catch(() => false)
check('mobile toolbar image button visible', imgBtnVisible)
if (imgBtnVisible) {
  const box = await imgBtn.boundingBox()
  check('image button size >= 36px', box && box.width >= 36 && box.height >= 36, box ? `${box.width}x${box.height}` : 'no box')
  const inViewport = box && box.x >= 0 && box.x + box.width <= 390
  check('image button within 390px viewport (no h-overflow)', !!inViewport, box ? `x=${box.x}` : '')
}

// 2. horizontal overflow overall
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
check('no horizontal page overflow', overflow <= 0, `delta=${overflow}`)

// 3. toggle caret tappable on mobile
await page.keyboard.type('/收合')
await page.locator('.nb-slash-menu [role="option"]').first().waitFor({ state: 'visible', timeout: 5000 })
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const details = page.locator('.ProseMirror .nb-details').first()
const caret = details.locator('> button').first()
const caretBox = await caret.boundingBox()
check('toggle caret has real size', caretBox && caretBox.width >= 16 && caretBox.height >= 16, caretBox ? `${Math.round(caretBox.width)}x${Math.round(caretBox.height)}` : 'no box')
const wasOpen = await details.evaluate((el) => el.classList.contains('is-open'))
await caret.tap()
await page.waitForTimeout(300)
const nowOpen = await details.evaluate((el) => el.classList.contains('is-open'))
check('toggle caret tap toggles state', wasOpen !== nowOpen, `${wasOpen} -> ${nowOpen}`)

await page.screenshot({ path: 'docs/reports/2026-07-21-notebook-image-shots/04-mobile-390.png' })

// cleanup
try {
  await page.getByRole('button', { name: '刪除記事' }).first().click()
  await page.getByRole('button', { name: '刪除', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(1500)
} catch (e) { console.log('cleanup issue:', e.message) }
await browser.close()
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS')
process.exit(fails.length ? 1 : 0)
