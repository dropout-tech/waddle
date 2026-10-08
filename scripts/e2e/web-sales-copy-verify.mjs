#!/usr/bin/env node
/* eslint-disable no-console -- deterministic verification: stdout is the evidence */
// Website "on sale" copy (lib/legal/web-sales.ts), real browser against a running
// production server (`pnpm build && pnpm start -p <port>`). No backend is needed:
// every Supabase / SHOPLINE request is intercepted, and any call to an Edge
// Function (functions/v1) is counted and must be zero.
//
//   MODE=on  E2E_BASE_URL=http://localhost:3231 node scripts/e2e/web-sales-copy-verify.mjs
//   MODE=off E2E_BASE_URL=http://localhost:3232 DUMP_DIR=$TMPDIR/off node scripts/e2e/web-sales-copy-verify.mjs
//
//   MODE=on  : build had NEXT_PUBLIC_WEB_BILLING_ENABLED=true and NO SHOPLINE keys.
//              Asserts the sales wording, forbids the "not on sale" wording.
//   MODE=off : only dumps each page's text to DUMP_DIR (to diff against origin/main).
// Screenshots (MODE=on) -> docs/reports/2026-10-08-web-sales-copy/ (not committed).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = process.env.E2E_BASE_URL || 'http://localhost:3231'
const mode = process.env.MODE || 'on'
const dumpDir = process.env.DUMP_DIR ? path.resolve(process.env.DUMP_DIR) : null
const outDir = path.resolve('docs/reports/2026-10-08-web-sales-copy')
if (mode === 'on') fs.mkdirSync(outDir, { recursive: true })
if (dumpDir) fs.mkdirSync(dumpDir, { recursive: true })

const PHONE = '0988-493-026'
const EMAIL = 'hi@lazy72.com'
const FORBIDDEN = /尚未開放|目前尚未|尚未上線|準備中|not yet available|not available yet|not available for purchase|coming soon|1,290|1290|預計提供|planned (Pro )?pric|未來訂閱/i
const PAGES = ['/about', '/terms', '/privacy', '/refunds', '/support', '/en/about', '/en/terms', '/en/privacy', '/en/refunds', '/en/support', '/billing']
const isEn = (p) => p.startsWith('/en')

let checks = 0
const check = (label, ok, detail = '') => { assert.ok(ok, `${label} ${detail}`); checks++; console.log('PASS', label) }
const bodyText = (page) => page.evaluate(() => document.body.innerText)

const browser = await chromium.launch()
const failedFn = []
try {
  for (const [w, h, tag] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    await ctx.addInitScript(() => { try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch { /* ignore */ } })
    // Nothing leaves the machine: Supabase + SHOPLINE are answered locally.
    await ctx.route(/supabase\.co|shoplinepayments|shopline/i, (route) => {
      if (/functions\/v1/.test(route.request().url())) failedFn.push(route.request().url())
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    })
    const page = await ctx.newPage()
    const consoleErrors = []
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
    page.on('request', (r) => { if (/functions\/v1/.test(r.url())) failedFn.push(r.url()) })

    for (const p of PAGES) {
      await ctx.addInitScript((lang) => { try { localStorage.setItem('waddle-language-v1', lang) } catch { /* ignore */ } }, isEn(p) ? 'en' : 'zh-TW')
      await page.goto(base + p, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      // Reveal-on-scroll sections: scroll through the page so lazy/observed blocks render.
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) } window.scrollTo(0, 0) })
      // <details> (FAQ) text is in the DOM but hidden when closed; open all so innerText includes it.
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true }))
      const text = await bodyText(page)
      const html = await page.content()
      const name = p.replace(/\//g, '_') || '_'
      if (dumpDir && tag === 'desktop') fs.writeFileSync(path.join(dumpDir, `${name}.txt`), text)
      if (mode !== 'on') continue
      const tagp = `${tag} ${p}`
      check(`${tagp}: no "not on sale" wording`, !FORBIDDEN.test(text), (text.match(FORBIDDEN) || [''])[0])
      if (tag === 'mobile') check(`${tagp}: no horizontal overflow at 390px`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
      check(`${tagp}: not in raw HTML either`, !/NT\$\s?1,290/.test(html))
      if (p === '/billing') continue
      check(`${tagp}: operator name + email + phone`, text.includes(isEn(p) ? 'Liao Sih-Ming' : '廖思明') && text.includes(EMAIL) && text.includes(PHONE))
      if (/about$/.test(p)) check(`${tagp}: NT$150 and NT$990`, /NT\$\s?150/.test(text) && /NT\$\s?990/.test(text))
      if (/terms$/.test(p)) check(`${tagp}: 150 / 990 TWD, tax included`, /(NT\$\s?|新台幣 |TWD )150/.test(text) && /990/.test(text) && (isEn(p) ? /including any applicable tax/.test(text) : /已含稅/.test(text)))
      if (/refunds$/.test(p)) check(`${tagp}: refund wording`, isEn(p) ? /7 days/.test(text) && /refund/i.test(text) : /7 天/.test(text) && /退款/.test(text))
      if (p === '/about' || p === '/en/about') {
        check(`${tagp}: tax-inclusive + plan contents`, isEn(p) ? /include any applicable tax/.test(text) && /Google Calendar/.test(text) : /已含稅/.test(text) && /Google 日曆/.test(text))
        check(`${tagp}: cancel + refund in FAQ`, isEn(p) ? /How do I cancel Pro/.test(text) && /Can I get a refund/.test(text) : /Pro 怎麼取消/.test(text) && /可以退款嗎/.test(text))
        check(`${tagp}: no address placeholder`, !/地址|Address:|待填|TODO/.test(text.replace(/IP address/gi, '')))
      }
      if (tag === 'desktop' || tag === 'mobile') {
        if (p === '/about' || p === '/en/about') {
          if (p === '/about') {
            const price = page.locator('[data-penguin-stop="price"]').first()
            await price.scrollIntoViewIfNeeded()
            await page.waitForTimeout(700)
            await page.screenshot({ path: path.join(outDir, `price-${tag}.png`), fullPage: false })
          }
        }
        if (p === '/terms') {
          await page.locator('#operator').scrollIntoViewIfNeeded()
          await page.waitForTimeout(500)
          await page.screenshot({ path: path.join(outDir, `terms-operator-${tag}.png`), fullPage: false })
        }
      }
    }

    if (mode === 'on') {
      // Purchase flow: marketing page -> upgrade button -> /billing shows "coming soon".
      await ctx.addInitScript(() => { try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch { /* ignore */ } })
      await page.goto(base + '/about', { waitUntil: 'networkidle' })
      await page.evaluate(() => { try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch { /* ignore */ } })
      const upgrade = page.getByTestId('pro-upgrade')
      await upgrade.scrollIntoViewIfNeeded()
      await upgrade.click()
      await page.waitForURL('**/billing', { timeout: 15000 })
      await page.getByTestId('billing-coming-soon').waitFor({ timeout: 15000 })
      const t = await bodyText(page)
      check(`${tag}: upgrade button -> /billing shows 付款功能即將開通`, t.includes('付款功能即將開通'))
      check(`${tag}: /billing shows NT$150 / NT$990`, /150/.test(t) && /990/.test(t))
      check(`${tag}: pay button disabled (no card form)`, await page.getByTestId('billing-submit').isDisabled())
      await page.screenshot({ path: path.join(outDir, `billing-${tag}.png`), fullPage: false })
      const bad = consoleErrors.filter((e) => !/Failed to load resource.*(404|net::)/i.test(e) && !/supabase/i.test(e))
      check(`${tag}: no unhandled console/page errors`, bad.length === 0, bad.join(' | ').slice(0, 300))
    }
    await ctx.close()
  }
  if (mode === 'on') check('no request to functions/v1 at all', failedFn.length === 0, failedFn.join(','))
} finally {
  await browser.close()
}
console.log(`\n${mode === 'on' ? `ALL ${checks} CHECKS PASSED` : 'DUMP DONE'}`)
