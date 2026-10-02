#!/usr/bin/env node
/* eslint-disable no-console -- CLI verification report */
/**
 * Verifies the legal pages' in-app-purchase wording switch (lib/legal/in-app-purchase.ts).
 *
 * Reads build output only (no server, no browser):
 *   --web-base <dir>  .next/server/app of a website build BEFORE the change (e.g. origin/main)
 *   --web-new  <dir>  .next/server/app of a website build WITH the change   (default .next/server/app)
 *   --cap-off  <dir>  out/ of `pnpm build:cap` without NEXT_PUBLIC_BILLING_ENABLED
 *   --cap-on   <dir>  out/ of `NEXT_PUBLIC_BILLING_ENABLED=true pnpm build:cap` (default out)
 * Any variant that is not passed (and whose default does not exist) is skipped.
 *
 * Asserts:
 *  1. Website: visible text of every legal page is identical before/after the change and keeps
 *     the "not on sale yet" wording; brand/footer links still go to /about.
 *  2. App build, flag on: no "not available for purchase" wording anywhere in the page files
 *     (HTML + RSC payload); new App Store wording present; SHOPLINE / 信用卡 / credit card /
 *     website prices only inside <WebOnly> paragraphs (hidden in the app after mount);
 *     no link to /about.
 *  3. App build, flag off: original wording kept (only the footer label changes); no /about link.
 *
 * Usage: node scripts/e2e/legal-iap-copy-verify.mjs --web-base A --web-new B --cap-off C --cap-on D
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []))
const dirs = {
  webBase: args['web-base'],
  webNew: args['web-new'] ?? (existsSync('.next/server/app') ? '.next/server/app' : undefined),
  capOff: args['cap-off'],
  capOn: args['cap-on'] ?? (existsSync('out') ? 'out' : undefined),
}

const PAGES = ['terms', 'privacy', 'refunds', 'support'].flatMap((p) => [p, `en/${p}`])
const SOURCES = PAGES.map((p) => `app/${p}/page.tsx`).concat('components/legal/legal-page.tsx')

let pass = 0
let fail = 0
const check = (ok, label) => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

// ------------------------------------------------------------------ helpers
const decode = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
const bodyOf = (html) => {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/)
  return (m ? m[1] : html).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<template[\s\S]*?<\/template>/g, '')
}
const textOf = (fragment) => decode(fragment.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const visible = (html) => textOf(bodyOf(html))
const norm = (s) => s.replace(/0988-493-026/g, '').replace(/\s+/g, '')
const metaDescription = (html) => decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] ?? '')

const webFile = (dir, page) => join(dir, `${page}.html`)
const capFile = (dir, page) => join(dir, page, 'index.html')
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

// Text that lives inside <WebOnly> in the sources (paragraphs + LegalSection titles).
const webOnlyCorpus = SOURCES.map((f) => readFileSync(f, 'utf8'))
  .flatMap((src) => [...src.matchAll(/<WebOnly>([\s\S]*?)<\/WebOnly>/g)].map((m) => m[1]))
  .map((seg) => [...seg.matchAll(/title="([^"]*)"/g)].map((t) => t[1]).join('') + seg.replace(/\{[^}]*\}/g, '').replace(/<[^>]+>/g, ''))
  .map(norm)
  .join('\n')

/**
 * Page body (whitespace-free) with everything that comes from a <WebOnly> removed: whole
 * blocks (<p>/<li>/<h2>) found in the WebOnly corpus, then inline WebOnly text inside a block.
 */
const webOnlySegments = webOnlyCorpus.split('\n').filter(Boolean)
const outsideWebOnly = (html) => {
  const body = bodyOf(html)
  let t = norm(textOf(body.replace(/<(p|li|h2)\b[^>]*>([\s\S]*?)<\/\1>/g, (whole, _tag, inner) => {
    const n = norm(textOf(inner))
    return n && webOnlyCorpus.includes(n) ? ' ' : whole
  })))
  for (const seg of webOnlySegments) t = t.split(seg).join('')
  return t
}

const ABOUT_LINK = /href="\/(en\/)?about\/?"/
// Must never be visible in the app outside <WebOnly> once purchase is live (Apple 3.1.1 / "not on sale" copy).
const APP_FORBIDDEN_OUTSIDE_WEBONLY = ['沒有可購買', '尚未開放', '開放後', '開放購買後適用', '目前沒有啟用', '日後透過 Apple', 'not available for purchase', 'not available yet', 'not currently enabled', 'once purchases open', '(once open)', 'through Apple in the future', 'SHOPLINE', '信用卡', 'credit card', 'NT$', 'TWD', 'planned']
// Must not appear anywhere in the app page files (HTML + RSC payload), WebOnly included.
const APP_FORBIDDEN_RAW = ['沒有可購買', '尚未開放購買', 'not available for purchase']

const ORIGINAL = {
  terms: ['目前沒有可購買的 Pro 訂閱', '免費使用與未來訂閱', '本頁不代表 Huddle 已開放收費'],
  'en/terms': ['Pro subscriptions are not currently available for purchase', 'Free access and planned subscriptions'],
  refunds: ['目前沒有 Huddle 訂閱扣款', 'Pro 尚未開放購買', '日後透過 Apple 購買時'],
  'en/refunds': ['Pro is not available for purchase', 'If you purchase through Apple in the future'],
  privacy: ['目前沒有啟用 Pro 付款流程', 'iPhone App 購買（App Store）——開放購買後適用'],
  'en/privacy': ['Pro payment flows are not currently enabled', 'applies once purchases open'],
  support: ['Huddle 尚未開放 Pro 訂閱'],
  'en/support': ['Pro subscriptions are not available yet'],
}
const BANNER_OLD = { zh: 'Pro 訂閱尚未開放，註冊帳號、下載或登入都不會自動收費', en: 'Pro subscriptions are not available for purchase.' }
const BANNER_NEW = { zh: 'Huddle Pro 是選購的自動續訂訂閱，可在 iPhone App 內透過 App Store 購買', en: 'Huddle Pro is an optional auto-renewing subscription that you can buy in the iPhone app through the App Store' }
// Phrases that exist only in the in-app-purchase version (never in the original wording).
const NEW = {
  terms: ['免費功能與 Huddle Pro 訂閱', '以你確認購買前 App Store 購買畫面顯示的為準', '要停止續訂，請在 Apple 帳號的訂閱設定中取消'],
  'en/terms': ['Free features and Huddle Pro subscriptions', 'are those shown on the App Store purchase screen before you confirm', 'To stop renewal, cancel in the subscription settings of your Apple Account'],
  refunds: ['Huddle Pro 怎麼扣款', '取消續訂與申請退款（Apple）', '由 Apple 審核；取消續訂本身不等同已提出退款申請'],
  'en/refunds': ['How Huddle Pro is billed', 'Cancelling renewal and requesting a refund (Apple)', 'Apple reviews refund requests'],
  privacy: ['Huddle Pro 可在 iPhone App 內透過 App Store 訂閱，相關資料的處理方式說明如下', '我們不會取得你的卡號或 Apple 帳號的付款資料'],
  'en/privacy': ['Huddle Pro is available as a subscription in the iPhone app through the App Store', 'how the related data is handled is described below'],
  support: ['Huddle Pro 可在 iPhone App 內透過 App Store 訂閱。取消續訂、申請退款與解除契約的說明'],
  'en/support': ['Huddle Pro is available as a subscription in the iPhone app through the App Store'],
}
const lang = (page) => (page.startsWith('en/') ? 'en' : 'zh')

// ------------------------------------------------------------------ 1. website
if (dirs.webNew) {
  console.log(`\n# Website build: ${dirs.webNew}${dirs.webBase ? `  vs base ${dirs.webBase}` : ''}`)
  for (const page of PAGES) {
    const html = readFileSync(webFile(dirs.webNew, page), 'utf8')
    const text = visible(html)
    if (dirs.webBase) {
      const base = readFileSync(webFile(dirs.webBase, page), 'utf8')
      check(text === visible(base), `web /${page}: visible text identical to base (${text.length} chars)`)
      check(metaDescription(html) === metaDescription(base), `web /${page}: meta description identical to base`)
    }
    check(ORIGINAL[page].every((s) => text.includes(s)), `web /${page}: keeps original "not on sale" wording`)
    check(text.includes(BANNER_OLD[lang(page)]), `web /${page}: original banner`)
    check(!NEW[page].some((s) => text.includes(s)) && !text.includes(BANNER_NEW[lang(page)]), `web /${page}: no in-app-purchase wording`)
    check(ABOUT_LINK.test(html) && (lang(page) === 'en' || text.includes('回到官網')), `web /${page}: brand/footer still link to /about ("回到官網" on zh)`)
  }
}

// ------------------------------------------------------------------ 2. app, flag on
if (dirs.capOn) {
  console.log(`\n# App build, NEXT_PUBLIC_BILLING_ENABLED=true: ${dirs.capOn}`)
  for (const page of PAGES) {
    const html = readFileSync(capFile(dirs.capOn, page), 'utf8')
    const text = visible(html)
    const files = walk(join(dirs.capOn, page))
    const raw = files.map((f) => readFileSync(f, 'utf8')).join('\n')
    const rawHits = APP_FORBIDDEN_RAW.filter((s) => raw.includes(s))
    check(rawHits.length === 0, `app-on /${page}: 0 hits of ${APP_FORBIDDEN_RAW.join(' / ')} in ${files.length} page files${rawHits.length ? ` (found: ${rawHits})` : ''}`)
    const outside = outsideWebOnly(html)
    const hits = APP_FORBIDDEN_OUTSIDE_WEBONLY.filter((s) => outside.includes(norm(s)))
    check(hits.length === 0, `app-on /${page}: outside <WebOnly> none of [${APP_FORBIDDEN_OUTSIDE_WEBONLY.join(', ')}]${hits.length ? ` (found: ${hits})` : ''}`)
    const insideCount = ['SHOPLINE', '信用卡', 'credit card'].reduce((n, s) => n + text.split(s).length - 1, 0)
    console.log(`      (SHOPLINE/信用卡/credit card occurrences in static HTML, all inside <WebOnly>: ${insideCount})`)
    check(NEW[page].every((s) => text.includes(s)), `app-on /${page}: new App Store wording present`)
    check(text.includes(BANNER_NEW[lang(page)]) && !text.includes(BANNER_OLD[lang(page)]), `app-on /${page}: new banner, old banner gone`)
    check(!ABOUT_LINK.test(html) && /<a[^>]*href="\/"[^>]*>Huddle<\/a>/.test(html), `app-on /${page}: no /about link, brand links to /`)
    check(text.includes(lang(page) === 'en' ? 'Back to Huddle' : '回到 Huddle') && !text.includes('回到官網'), `app-on /${page}: footer says "${lang(page) === 'en' ? 'Back to Huddle' : '回到 Huddle'}"`)
  }
}

// ------------------------------------------------------------------ 3. app, flag off
if (dirs.capOff) {
  console.log(`\n# App build, flag off: ${dirs.capOff}`)
  for (const page of PAGES) {
    const html = readFileSync(capFile(dirs.capOff, page), 'utf8')
    const text = visible(html)
    check(ORIGINAL[page].every((s) => text.includes(s)) && text.includes(BANNER_OLD[lang(page)]), `app-off /${page}: original wording kept`)
    check(!NEW[page].some((s) => text.includes(s)) && !text.includes(BANNER_NEW[lang(page)]), `app-off /${page}: no in-app-purchase wording`)
    check(!ABOUT_LINK.test(html), `app-off /${page}: no /about link`)
    if (dirs.webNew) {
      const web = visible(readFileSync(webFile(dirs.webNew, page), 'utf8'))
      check(text.replace('回到 Huddle', '回到官網') === web, `app-off /${page}: visible text = website text except the footer label`)
    }
  }
}

console.log(`\n${pass} PASS, ${fail} FAIL`)
process.exit(fail ? 1 : 0)
