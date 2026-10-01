/* eslint-disable no-console -- deterministic verification: stdout is the evidence */
// Verifies the 2026-10-02 website disclosure pass against a running server.
//   E2E_BASE_URL=http://localhost:3210 node scripts/e2e/website-disclosures-verify.mjs
// Screenshots -> docs/reports/2026-10-02-website-disclosures/
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = process.env.E2E_BASE_URL || 'http://localhost:3210'
const outDir = path.resolve('docs/reports/2026-10-02-website-disclosures')
fs.mkdirSync(outDir, { recursive: true })

const PHONE = '0988-493-026'
const PLACEHOLDER = /待老闆|【待|待填|TODO|工程師填|系統帶入|XXX|lorem/i
const OLD_PRICE = /1,290|1290/

let checks = 0
const check = (label, ok, detail = '') => { assert.ok(ok, `${label} ${detail}`); checks++; console.log('PASS', label) }
const bodyText = (page) => page.evaluate(() => document.body.innerText)

// [path, language tag for the filename, extra must-contain strings]
const legalPages = [
  ['/terms', 'zh', [PHONE, '臺灣新北地方法院', '2 週免費試用', 'SHOPLINE Payments', '2026 年 10 月 2 日更新', '網站購買目前尚未開放', '尚未開放']],
  ['/privacy', 'zh', [PHONE, 'SHOPLINE Payments', '2026 年 10 月 2 日更新']],
  ['/refunds', 'zh', [PHONE, '2 週免費試用', '試用期內取消，就不會被扣款', '7 天內', 'Apple', '2026 年 10 月 2 日更新']],
  ['/support', 'zh', [PHONE, '營運者型態：個人', '2026 年 10 月 2 日更新']],
  ['/en/terms', 'en', [PHONE, 'New Taipei District Court', '2-week free trial', 'SHOPLINE Payments', 'October 2, 2026', 'not available yet']],
  ['/en/privacy', 'en', [PHONE, 'SHOPLINE Payments', 'October 2, 2026']],
  ['/en/refunds', 'en', [PHONE, '2-week free trial', 'you will not be charged', '7 days', 'Apple', 'October 2, 2026']],
  ['/en/support', 'en', [PHONE, 'Operator type: individual', 'October 2, 2026']],
]
const marketingPages = [
  ['/about', 'zh', [PHONE, '2 週免費試用', '目前尚未開放購買', '營運者資訊']],
  ['/en/about', 'en', [PHONE, '2-week free trial', 'Purchases are not available yet', 'Operator information']],
]

const browser = await chromium.launch()
try {
  for (const width of [1280, 390]) {
    const height = width === 1280 ? 900 : 844
    const ctx = await browser.newContext({ viewport: { width, height } })
    await ctx.addInitScript(() => { try { localStorage.setItem('huddle-intro-seen', '1') } catch {} })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))

    for (const [p, tag, musts] of [...legalPages, ...marketingPages]) {
      await page.goto(base + p, { waitUntil: 'networkidle' })
      await page.locator('h1').first().waitFor()
      const text = await bodyText(page)
      for (const s of musts) check(`${width}px ${p}: contains "${s}"`, text.includes(s))
      check(`${width}px ${p}: no placeholder words`, !PLACEHOLDER.test(text))
      check(`${width}px ${p}: no 1,290 / 1290`, !OLD_PRICE.test(text))
      check(`${width}px ${p}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
      check(`${width}px ${p}: phone is a tel: link`, (await page.locator(`a[href="tel:+886988493026"]`).count()) > 0)
      // scroll to the very bottom (triggers lazy / reveal content) then shoot
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) } window.scrollTo(0, document.body.scrollHeight) })
      await page.waitForTimeout(400)
      const slug = p.replace(/^\/en\//, '').replace(/^\//, '')
      const name = `${slug}-${tag}-${width}`
      if (p.includes('about')) {
        await page.screenshot({ path: path.join(outDir, `${name}-bottom.jpg`), type: 'jpeg', quality: 70 })
        await page.locator('#pricing').scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
        await page.locator('#pricing').screenshot({ path: path.join(outDir, `${name}-pricing.jpg`), type: 'jpeg', quality: 70 })
      } else {
        await page.screenshot({ path: path.join(outDir, `${name}-full.jpg`), fullPage: true, type: 'jpeg', quality: 60 })
      }
    }

    // sign-in / sign-up consent line, Chinese and English UI
    for (const [lang, expectLoginText, expectSignupText, termsHref, privacyHref] of [
      ['zh-TW', '繼續即表示你同意 Huddle 的服務條款，並已閱讀隱私權政策。', '建立帳號即表示你同意 Huddle 的服務條款，並已閱讀隱私權政策。', '/terms', '/privacy'],
      ['en', 'By continuing, you agree to Huddle’s Terms of use and confirm that you have read the Privacy notice.', 'By creating an account, you agree to Huddle’s Terms of use and confirm that you have read the Privacy notice.', '/en/terms', '/en/privacy'],
    ]) {
      for (const [route, expected] of [['/login', expectLoginText], ['/signup', expectSignupText]]) {
        const c2 = await browser.newContext({ viewport: { width, height } })
        await c2.addInitScript((l) => { try { localStorage.setItem('waddle-language-v1', l) } catch {} }, lang)
        const pg = await c2.newPage()
        await pg.goto(base + route, { waitUntil: 'networkidle' })
        const consent = pg.locator('[data-legal-consent]')
        await consent.waitFor()
        await pg.waitForFunction((e) => document.querySelector('[data-legal-consent]')?.textContent === e, expected, { timeout: 5000 })
        check(`${width}px ${route} [${lang}]: consent sentence correct`, (await consent.textContent()) === expected)
        check(`${width}px ${route} [${lang}]: links ${termsHref} & ${privacyHref}`, (await consent.locator(`a[href="${termsHref}"]`).count()) === 1 && (await consent.locator(`a[href="${privacyHref}"]`).count()) === 1)
        const t = await bodyText(pg)
        check(`${width}px ${route} [${lang}]: no website-purchase wording`, !/官網購買|到官網|buy on the website|website purchase/i.test(t))
        check(`${width}px ${route} [${lang}]: no horizontal overflow`, await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
        await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await pg.screenshot({ path: path.join(outDir, `${route.slice(1)}-${lang === 'en' ? 'en' : 'zh'}-${width}.jpg`), type: 'jpeg', quality: 70 })
        await c2.close()
      }
    }
    check(`${width}px: no uncaught page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // iOS-shell simulation. Faking the WKWebView bridge makes unrelated native
  // plugins throw, so instead: load the page as a normal web page, flip
  // Capacitor.isNativePlatform() to true at runtime, then navigate client-side
  // (no reload) so every WebOnly / price-note component mounts fresh under the
  // "native" answer. Website-purchase wording must then be absent.
  const nctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await nctx.addInitScript(() => { try { localStorage.setItem('huddle-intro-seen', '1') } catch {} })
  const npage = await nctx.newPage()
  const NATIVE_BANNED = /SHOPLINE|網站購買|綁定信用卡|Website purchases|credit card is required|2-week free trial|2 週免費試用/
  for (const [startPath, order, prefix] of [['/terms', ['privacy', 'refunds', 'support', 'terms'], ''], ['/en/terms', ['privacy', 'refunds', 'support', 'terms'], '/en']]) {
    await npage.goto(base + startPath, { waitUntil: 'networkidle' })
    await npage.locator('h1').first().waitFor()
    const before = await bodyText(npage)
    check(`web control ${startPath}: website-purchase wording IS present before flipping`, NATIVE_BANNED.test(before))
    await npage.evaluate(() => { window.__spaMarker = 1; window.Capacitor.isNativePlatform = () => true })
    for (const slug of order) {
      await npage.locator(`header nav a[href="${prefix}/${slug}"]`).first().click()
      await npage.waitForURL(`**${prefix}/${slug}`)
      await npage.locator('h1').first().waitFor()
      await npage.waitForTimeout(300)
      check(`native shell ${prefix}/${slug}: reached by client-side navigation (no reload)`, await npage.evaluate(() => window.__spaMarker === 1))
      const t = await bodyText(npage)
      check(`native shell ${prefix}/${slug}: no SHOPLINE / website-purchase / trial wording`, !NATIVE_BANNED.test(t), (t.match(NATIVE_BANNED) || [''])[0])
      check(`native shell ${prefix}/${slug}: phone still shown`, t.includes(PHONE))
    }
  }
  // marketing page under the native answer
  await npage.goto(base + '/terms', { waitUntil: 'networkidle' })
  await npage.evaluate(() => { window.__spaMarker = 1; window.Capacitor.isNativePlatform = () => true })
  await npage.locator('footer a[href="/about"]').first().click()
  await npage.waitForURL('**/about')
  await npage.locator('#pricing').waitFor({ state: 'attached' })
  await npage.waitForTimeout(500)
  check('native shell /about: reached by client-side navigation', await npage.evaluate(() => window.__spaMarker === 1))
  check('native shell /about: price note hidden', (await npage.locator('[data-price-note]').count()) === 0)
  await nctx.close()
} finally {
  await browser.close()
}
console.log(`ALL ${checks} CHECKS PASSED`)
