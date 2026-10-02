#!/usr/bin/env node
/**
 * Verifies the legal pages (terms / privacy / refunds / support, zh + en) switch
 * wording only in the iOS App Store build.
 *
 *   pnpm build && cp -R .next/server/app $DIR/web                         # website
 *   pnpm build:cap && cp -R out $DIR/cap-off                              # app, purchase flag off
 *   NEXT_PUBLIC_BILLING_ENABLED=true pnpm build:cap && cp -R out $DIR/cap-on
 *   node scripts/e2e/legal-iap-copy-verify.mjs --web $DIR/web --cap-off $DIR/cap-off --cap-on $DIR/cap-on
 *
 * The pages' text lives in the serialized RSC payload inside each HTML file, so
 * the checks search the raw file (unescaped) rather than rendered tags.
 *
 * 1. website: original "not on sale" wording, links back to /about, no App Store wording
 * 2. app, flag on: App Store wording, R4 refund promise, no "not on sale" wording, no /about
 * 3. app, flag off: original wording kept, no /about
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).flatMap((v, i, a) => (v.startsWith('--') ? [[v.slice(2), a[i + 1]]] : [])))
const PAGES = ['terms', 'privacy', 'refunds', 'support'].flatMap((p) => [p, `en/${p}`])
const isEn = (page) => page.startsWith('en/')

let pass = 0
let fail = 0
const check = (ok, label) => {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

const read = (file) => readFileSync(file, 'utf8').replace(/\\"/g, '"').replace(/\\u0026/g, '&')
const files = {
  web: (page) => join(args.web, `${page}.html`),
  'cap-off': (page) => join(args['cap-off'], page, 'index.html'),
  'cap-on': (page) => join(args['cap-on'], page, 'index.html'),
}

const OLD_BANNER = { zh: 'Pro 訂閱尚未開放，註冊帳號', en: 'Pro subscriptions are not available for purchase' }
const NEW_BANNER = { zh: 'Huddle Pro 是選購的自動續訂訂閱', en: 'Huddle Pro is an optional auto-renewing subscription' }
const NOT_ON_SALE = ['沒有可購買', '尚未開放購買', 'Pro 訂閱尚未開放', 'not available for purchase']
const R4 = { zh: '不會以 Apple 的決定作為拒絕的理由', en: 'we will not rely on Apple’s decision as a reason to refuse' }
const ABOUT_HREF = /"href":"\/(en\/)?about\/?"/

for (const build of ['web', 'cap-off', 'cap-on']) {
  if (!args[build]) {
    check(false, `--${build} <dir> was not given`)
    continue
  }
  for (const page of PAGES) {
    const file = files[build](page)
    if (!existsSync(file)) {
      check(false, `${build} /${page}: ${file} exists`)
      continue
    }
    const raw = read(file)
    const lang = isEn(page) ? 'en' : 'zh'
    const tag = `${build} /${page}`
    if (build === 'cap-on') {
      check(raw.includes(NEW_BANNER[lang]), `${tag}: App Store banner present`)
      check(NOT_ON_SALE.every((s) => !raw.includes(s)), `${tag}: no "not on sale" wording`)
      check(!ABOUT_HREF.test(raw), `${tag}: no link to /about`)
      check(raw.includes(lang === 'en' ? '"children":"Back to Huddle"' : '"children":"回到 Huddle"'), `${tag}: footer returns to the app`)
      if (page.endsWith('refunds')) check(raw.includes(R4[lang]), `${tag}: R4 version A refund promise present`)
    } else {
      check(raw.includes(OLD_BANNER[lang]), `${tag}: original banner kept`)
      check(!raw.includes(NEW_BANNER[lang]) && !raw.includes(R4[lang]), `${tag}: no App Store launch wording`)
      if (build === 'web') {
        check(ABOUT_HREF.test(raw), `${tag}: still links to /about`)
        if (lang === 'zh') check(raw.includes('"children":"回到官網"'), `${tag}: footer still says 回到官網`)
      } else {
        check(!ABOUT_HREF.test(raw), `${tag}: no link to /about`)
      }
    }
  }
}

console.log(`\n${pass} PASS, ${fail} FAIL`)
process.exit(fail ? 1 : 0)
