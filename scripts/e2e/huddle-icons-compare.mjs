#!/usr/bin/env node
/**
 * Stitches the before/after screenshots in docs/reports/2026-10-01-block-icons/
 * into one side-by-side sheet (compare-before-after.png) plus a 4× close-up of
 * the "/" menu (closeup-menu-4x.png). No dev server needed.
 *
 *   node scripts/e2e/huddle-icons-compare.mjs
 */
import { writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const DIR = path.join(process.cwd(), 'docs/reports/2026-10-01-block-icons')
const url = (name) => {
  const f = path.join(DIR, `${name}.png`)
  if (!existsSync(f)) throw new Error(`missing screenshot: ${name}.png`)
  return pathToFileURL(f).href
}
const img = (name, w, extra = '') => `<img src="${url(name)}" style="width:${w}px;${extra}">`
const pair = (title, before, after) => `
  <section><h2>${title}</h2><div class="row">
    <figure><figcaption class="b">改前</figcaption>${before}</figure>
    <figure><figcaption class="a">改後</figcaption>${after}</figure>
  </div></section>`
const crop = (name, w, h) => `<div style="width:${w}px;height:${h}px;overflow:hidden;border-radius:10px">${img(name, w)}</div>`
const stack = (names, w) => `<div class="stack">${names.map((n) => img(n, w)).join('')}</div>`

const css = `
  body{margin:0;padding:28px 32px 36px;background:#ece7d8;color:#292b24;font:14px/1.5 "PingFang TC","Noto Sans TC",sans-serif;width:1180px}
  h1{font-size:22px;margin:0 0 2px} p.lead{margin:0 0 18px;color:#66645a}
  h2{font-size:15px;margin:22px 0 8px;padding-top:14px;border-top:1px solid #d6cdb2}
  .row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}
  figure{margin:0} figcaption{font-size:12px;font-weight:600;margin-bottom:6px;letter-spacing:.04em}
  figcaption.b{color:#8a8676} figcaption.a{color:#b8482a}
  img{display:block;border-radius:10px;box-shadow:0 1px 0 #d6cdb2}
  .stack{display:flex;flex-direction:column;gap:6px}
`
const compare = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<h1>Huddle 手繪墨線圖示 — 改前 vs 改後</h1>
<p class="lead">左／上是原本的 Lucide 線條圖示，右／下是 Huddle 手繪版。全部是實機截圖（Retina 兩倍）。</p>
${pair('記事本「/」區塊選單（淺色）', img('before-menu-light-dpr2', 240), img('after-menu-light-dpr2', 240))
  .replace('</div></section>', `<figure><figcaption class="b">改前（深色）</figcaption>${img('before-menu-dark-dpr2', 240)}</figure><figure><figcaption class="a">改後（深色）</figcaption>${img('after-menu-dark-dpr2', 240)}</figure></div></section>`)}
<section><h2>行事曆上方工具列（桌機 1280，整排）</h2><div class="stack">
  <figure><figcaption class="b">改前</figcaption>${img('before-header-1280-light', 876)}</figure>
  <figure><figcaption class="a">改後</figcaption>${img('after-header-1280-light', 876)}</figure>
  <figure><figcaption class="b">改前（深色）</figcaption>${img('before-header-1280-dark', 876)}</figure>
  <figure><figcaption class="a">改後（深色）</figcaption>${img('after-header-1280-dark', 876)}</figure>
</div></section>
${pair('工具列「▾」選單展開', img('before-header-1280-light-menu-open', 520), img('after-header-1280-light-menu-open', 520))}
${pair('手機 390：「⋯」選單（淺色）', crop('before-header-390-light-more-open', 390, 690), crop('after-header-390-light-more-open', 390, 690))}
${pair('手機 390：「⋯」選單（深色）', crop('before-header-390-dark-more-open', 390, 690), crop('after-header-390-dark-more-open', 390, 690))}
${pair('手機記事本：鍵盤上方工具列（三段橫向捲動）',
    stack(['before-mobile-toolbar-light-a', 'before-mobile-toolbar-light-b', 'before-mobile-toolbar-light-c'], 390),
    stack(['after-mobile-toolbar-light-a', 'after-mobile-toolbar-light-b', 'after-mobile-toolbar-light-c'], 390))}
`
const closeup = `<!doctype html><meta charset="utf-8"><style>${css} body{width:1000px}</style>
<h1>「/」選單放大 4 倍</h1><p class="lead">左：淺色；右：深色。第一列是選中狀態。</p>
<div class="row">${img('after-menu-light-zoom4x', 480)}${img('after-menu-dark-zoom4x', 480)}</div>`

// Toolbar-only strips. 1x = the DPR1 screenshots at their native pixels (no
// scaling — the page itself is rendered at DPR1); 2x = the Retina screenshots.
const strip = (suffix) => `<!doctype html><meta charset="utf-8"><style>${css}
  body{width:876px;padding:14px 16px 18px} figcaption{margin:10px 0 4px} img{border-radius:0;box-shadow:none}</style>
<figure><figcaption class="b">改前（淺色）</figcaption>${img(`before-header-1280-light${suffix}`, 876)}</figure>
<figure><figcaption class="a">改後（淺色）</figcaption>${img(`after-header-1280-light${suffix}`, 876)}</figure>
<figure><figcaption class="b">改前（深色）</figcaption>${img(`before-header-1280-dark${suffix}`, 876)}</figure>
<figure><figcaption class="a">改後（深色）</figcaption>${img(`after-header-1280-dark${suffix}`, 876)}</figure>`

const browser = await chromium.launch()
for (const [name, html, w, dpr] of [
  ['compare-before-after', compare, 1244, 2], ['closeup-menu-4x', closeup, 1064, 2],
  ['toolbar-before-after-1x', strip('-dpr1'), 908, 1], ['toolbar-before-after-2x', strip(''), 908, 2],
]) {
  const file = path.join(os.tmpdir(), `huddle-icons-${name}.html`)
  writeFileSync(file, html)
  const page = await browser.newPage({ viewport: { width: w, height: 200 }, deviceScaleFactor: dpr })
  await page.goto(pathToFileURL(file).href)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true })
  console.log('wrote', `${name}.png`)
  await page.close()
}
await browser.close()
