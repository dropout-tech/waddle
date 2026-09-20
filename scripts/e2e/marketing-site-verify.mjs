/* eslint-disable no-console -- public marketing interaction regression */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base = process.env.E2E_BASE_URL || 'http://localhost:3190'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
let checks = 0
const check = (label, value) => { assert.ok(value, label); checks++; console.log('PASS', label) }
try {
 for (const prefix of ['', '/en']) {
  const en = !!prefix, path = `${prefix}/about`
  await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  await page.locator('h1').waitFor()
  const nav = page.getByRole('navigation', { name: en ? 'Main navigation' : '主要導覽' })
  for (const [i, target] of ['features', 'pricing', 'download'].entries()) {
   const link = nav.getByRole('link').nth(i)
   await link.click()
   check(`${path}: navigation reaches ${target}`, new URL(page.url()).hash === `#${target}` && await page.locator(`#${target}`).isVisible())
  }
  await nav.getByRole('link').last().click()
  await page.waitForURL(base + prefix + '/support')
  check(`${path}: support navigation opens the localized page`, await page.locator('h1').isVisible())
  await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  const tabs = page.getByRole('tablist'), first = tabs.getByRole('tab').nth(0), second = tabs.getByRole('tab').nth(1)
  await first.focus()
  await page.keyboard.press('ArrowRight')
  check(`${path}: right arrow selects and focuses the detail tab`, await second.getAttribute('aria-selected') === 'true' && await second.evaluate(el => el === document.activeElement))
  check(`${path}: detail panel shows actual editor capture`, (await page.getByRole('tabpanel').locator('img').getAttribute('src')).includes('whiteboard-detail-demo'))
  await page.keyboard.press('ArrowLeft')
  check(`${path}: left arrow restores whiteboard and focus`, await first.getAttribute('aria-selected') === 'true' && await first.evaluate(el => el === document.activeElement) && (await page.getByRole('tabpanel').locator('img').getAttribute('src')).includes('whiteboard-demo'))
  const faq = page.locator('section[aria-labelledby="faq-title"]')
  const details = faq.locator('details')
  check(`${path}: all five FAQs exist`, await details.count() === 5)
  for (let i = 0; i < 5; i++) {
   const entry = details.nth(i)
   await entry.locator('summary').focus()
   await page.keyboard.press('Enter')
   check(`${path}: FAQ ${i + 1} opens by keyboard`, await entry.evaluate(el => el.open) && await entry.locator('p').isVisible())
   await page.keyboard.press('Enter')
   check(`${path}: FAQ ${i + 1} closes by keyboard`, !(await entry.evaluate(el => el.open)))
  }
  for (const [i, destination] of ['terms', 'privacy', 'refunds', 'support'].entries()) {
   const footer = page.locator('footer nav')
   await footer.getByRole('link').nth(i).click()
   await page.waitForURL(base + prefix + '/' + destination)
   check(`${path}: ${destination} footer link renders localized content`, await page.locator('h1').isVisible() && (await page.locator('main').innerText()).length > 100)
   await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  }
  await page.getByRole('link', { name: en ? '切換為繁體中文' : 'Switch to English', exact: true }).click()
  await page.waitForURL(base + (en ? '/about' : '/en/about'))
  check(`${path}: language switch opens the counterpart`, await page.locator('h1').isVisible())
 }
 console.log(`Marketing site verification: ${checks} checks passed (${base}).`)
} finally { await context.close(); await browser.close() }
