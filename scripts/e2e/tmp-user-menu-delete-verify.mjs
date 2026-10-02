/* eslint-disable no-console -- executable regression checks */
// User menu → 刪除帳號 entry (App Store 5.1.1). Opens the confirm dialog and
// cancels; the delete-account Edge Function is intercepted and must never be
// called, so the test account is never at risk. Also checks the shared
// MascotLoader shows while the session resolves. Start the app separately:
//   E2E_BASE_URL=http://localhost:3187 node scripts/e2e/tmp-user-menu-delete-verify.mjs
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n')
  .filter(line => line.includes('=') && !line.startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const base = process.env.E2E_BASE_URL || 'http://localhost:3187'
const shots = process.env.E2E_SCREENSHOT_DIR || path.join(tmpdir(), 'huddle-user-menu-delete')
mkdirSync(shots, { recursive: true })

let passes = 0
const check = (label, condition) => { assert.ok(condition, label); passes++; console.log('PASS', label) }

const browser = await chromium.launch()
let deleteCalls = 0
const pageErrors = []

async function run({ name, viewport, lang }) {
  const context = await browser.newContext({ locale: 'zh-TW', viewport, serviceWorkers: 'block' })
  await context.route('**/functions/v1/delete-account**', route => { deleteCalls++; return route.abort() })
  if (lang) await context.addInitScript(l => { try { localStorage.setItem('waddle-language-v1', l) } catch {} }, lang)
  const page = await context.newPage()
  page.on('pageerror', e => pageErrors.push(`${name}: ${e.message}`))

  await page.goto(`${base}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.getByRole('button', { name: lang === 'en' ? 'Log in' : '登入', exact: true }).click()
  await page.waitForURL(`${base}/`, { timeout: 60000, waitUntil: 'commit' })

  // Shared MascotLoader: on a fresh load the penguin screen shows first.
  // (Only checked once — later runs reuse the same code path.)
  if (name === 'desktop-zh') {
    // 1) Slow reads → the bobbing penguin + 載入中 shows.
    const slow = async route => { await new Promise(r => setTimeout(r, 2500)); return route.fallback() }
    await page.route('**/rest/v1/**', slow)
    await page.reload({ waitUntil: 'commit' })
    const bob = page.locator('main .animate-waddle-bob')
    await bob.first().waitFor({ state: 'visible', timeout: 20000 })
    check(`${name}: MascotLoader bobs while loading`, await page.locator('main').getByText('載入中...').isVisible())
    await page.screenshot({ path: path.join(shots, `${name}-loader.png`) })
    await page.unroute('**/rest/v1/**', slow)
    // 2) A failed read (GET only, nothing is written) → still penguin + retry.
    const fail = route => route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { message: 'mocked' } }) : route.fallback()
    await page.route('**/rest/v1/tasks**', fail)
    await page.reload({ waitUntil: 'commit' })
    const alert = page.locator('main [role="alert"]')
    await alert.waitFor({ state: 'visible', timeout: 30000 })
    check(`${name}: load error keeps the penguin, stops bobbing`, await page.locator('main .animate-waddle-bob').count() === 0 && await page.locator('main img[src*="huddle-mascot"]').first().isVisible())
    await page.screenshot({ path: path.join(shots, `${name}-load-error.png`) })
    await page.unroute('**/rest/v1/tasks**', fail)
    await alert.getByRole('button', { name: '重試' }).click()
    await alert.waitFor({ state: 'hidden', timeout: 30000 })
    check(`${name}: 重試 recovers from the error screen`, true)
  }

  await page.addStyleTag({ content: '[data-pet-adopt]{display:none!important}' })
  const isMobile = viewport.width < 768
  const deleteLabel = lang === 'en' ? 'Delete account' : '刪除帳號'
  // Desktop: avatar top-right. Phone: calendar header「⋯」→「帳號」.
  const openMenu = async () => {
    if (isMobile) {
      await page.locator('[data-tour="mobile-more"]').filter({ visible: true }).first().click()
      await page.locator('[role="menuitem"][data-tour="user-menu"]').filter({ visible: true }).first().click()
    } else {
      await page.locator('[data-tour="user-menu"]').filter({ visible: true }).first().click()
    }
  }
  const firstTarget = isMobile ? '[data-tour="mobile-more"]' : '[data-tour="user-menu"]'
  await page.locator(firstTarget).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 30000 })
  await page.keyboard.press('Escape') // dismiss any first-run popover
  await openMenu()

  const item = page.getByTestId('user-menu-delete-account').filter({ visible: true }).first()
  await item.waitFor({ state: 'visible', timeout: 10000 })
  check(`${name}: menu shows "${deleteLabel}"`, (await item.innerText()).trim() === deleteLabel)
  const box = await item.boundingBox()
  check(`${name}: entry is a ≥44px touch target (${Math.round(box.height)}px)`, box.height >= 43.5)
  check(`${name}: entry fully inside viewport`, box.y + box.height <= viewport.height && box.x >= 0 && box.x + box.width <= viewport.width)
  await page.screenshot({ path: path.join(shots, `${name}-menu.png`) })

  await item.click()
  const dialog = page.getByRole('alertdialog')
  await dialog.waitFor({ state: 'visible', timeout: 10000 })
  const title = await dialog.getByRole('heading').innerText()
  check(`${name}: confirm dialog opens ("${title}")`, lang === 'en' ? !/[一-鿿]/.test(await dialog.innerText()) : title.includes('刪除帳號'))
  check(`${name}: menu closed behind the dialog`, await page.getByTestId('user-menu-delete-account').filter({ visible: true }).count() === 0)
  await page.screenshot({ path: path.join(shots, `${name}-dialog.png`) })

  await dialog.getByRole('button', { name: lang === 'en' ? 'Cancel' : '取消' }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 10000 })
  check(`${name}: cancel closes the dialog`, true)

  // Reopen and close with Escape, too.
  await openMenu()
  await page.getByTestId('user-menu-delete-account').filter({ visible: true }).first().click()
  await dialog.waitFor({ state: 'visible', timeout: 10000 })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden', timeout: 10000 })
  check(`${name}: Escape closes the dialog`, true)

  await context.close()
}

try {
  await run({ name: 'desktop-zh', viewport: { width: 1280, height: 900 } })
  await run({ name: 'desktop-en', viewport: { width: 1280, height: 900 }, lang: 'en' })
  await run({ name: 'phone-zh', viewport: { width: 390, height: 844 } })
  check('delete-account function never called', deleteCalls === 0)
  check(`no page errors${pageErrors.length ? ': ' + pageErrors.join(' | ') : ''}`, pageErrors.length === 0)
  console.log(`ALL PASSED (${passes}) — screenshots in ${shots}`)
} finally {
  await browser.close()
}
