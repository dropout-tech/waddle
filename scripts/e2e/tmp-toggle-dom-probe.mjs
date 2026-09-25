#!/usr/bin/env node
/** TEMP probe: what does a Tiptap Details block actually render as, and is
 *  the toggle button clickable? Text-only output, no screenshots needed. */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = `http://localhost:${process.env.E2E_PORT || 3104}`
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
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
await context.addInitScript(() => {
  try { window.localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {}
})
const page = await context.newPage()
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
await page.locator('input[placeholder="無標題"]').fill(`TOGGLE-PROBE ${Date.now() % 100000}`)
const pm = page.locator('.ProseMirror').first()
await pm.click()
await page.keyboard.type('/收合')
await page.locator('.nb-slash-menu [role="option"]').first().waitFor({ state: 'visible', timeout: 5000 })
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.keyboard.type('摘要文字')
await page.waitForTimeout(200)

const info = await page.evaluate(() => {
  const d = document.querySelector('.ProseMirror .nb-details') || document.querySelector('.ProseMirror [data-type="details"]')
  if (!d) return { found: false, editorHTML: document.querySelector('.ProseMirror')?.innerHTML?.slice(0, 800) }
  const btn = d.querySelector('button')
  const btnRect = btn ? btn.getBoundingClientRect() : null
  const btnStyle = btn ? getComputedStyle(btn) : null
  return {
    found: true,
    tag: d.tagName,
    outerHTML: d.outerHTML.slice(0, 900),
    openAttr: d.getAttribute('open'),
    button: btn ? {
      text: JSON.stringify(btn.textContent),
      rect: { w: btnRect.width, h: btnRect.height },
      display: btnStyle.display,
      visibility: btnStyle.visibility,
    } : null,
  }
})
console.log(JSON.stringify(info, null, 2))
// cleanup: delete the probe note
try {
  await page.getByRole('button', { name: '刪除記事' }).first().click()
  await page.getByRole('button', { name: '刪除', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(800)
} catch (e) { console.log('cleanup failed:', e.message) }
await browser.close()
