#!/usr/bin/env node
/**
 * PROBE (throwaway): does the English settings modal show the "30/60/90/120
 * min" row cut by the tab bar at a given scroll offset? Run against any
 * base URL so the same measurement can be taken on origin/main (read-only
 * worktree, port 3152) and on the working tree (port 3151).
 *
 *   E2E_BASE_URL=http://localhost:3152 TAG=main node scripts/e2e/tmp-probe-sticky-compare.mjs
 *
 * Measures: tab bar rect, scroll container rect, the interval-button row's
 * rect, at scrollTop=1026 (the offset my verify run landed on).
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3151'
const TAG = process.env.TAG || 'mine'
const SCROLL = Number(process.env.SCROLL || 1026)
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-11-picker-polish-shots')
mkdirSync(SHOTS, { recursive: true })

function loadEnvFile(p) {
  const out = {}
  if (!existsSync(p)) return out
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[line.slice(0, eq).trim()] = v
  }
  return out
}
const env = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || env.E2E_PASSWORD

async function fillStable(page, selector, value) {
  for (let i = 0; i < 5; i++) {
    await page.fill(selector, value)
    await sleep(150)
    if ((await page.inputValue(selector)) === value) return
  }
  throw new Error(`fill unstable: ${selector}`)
}

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  await page.addInitScript(() => { try { localStorage.setItem('waddle-language-v1', 'en') } catch {} })
  await page.addInitScript(() => {
    const apply = () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none !important;}'; document.head?.appendChild(s) }
    if (document.head) apply(); else document.addEventListener('DOMContentLoaded', apply)
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('button[type="submit"]').waitFor({ timeout: 30000 })
  await sleep(3000)
  await fillStable(page, 'input[type="email"]', EMAIL)
  await fillStable(page, 'input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 })
  await sleep(5000)
  await page.locator('[aria-label="設定"], [aria-label="Settings"]').first().click()
  await sleep(1800)

  const geo = await page.evaluate((scrollTo) => {
    const dialog = document.querySelector('[role="dialog"]')
    const scroller = dialog.querySelector('.overflow-y-auto')
    scroller.scrollTop = scrollTo
    const tabBar = dialog.children[1]
    // The water-reminder interval row: the button labelled "60 min"/"60 分鐘"
    const btn = [...dialog.querySelectorAll('button')].find((b) => /^(60 min|60 分鐘)$/.test(b.textContent.trim()))
    const row = btn?.parentElement
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) } }
    return {
      scrollTop: scroller.scrollTop, scrollH: scroller.scrollHeight, clientH: scroller.clientHeight,
      tabBar: r(tabBar), scroller: r(scroller), row: r(row), rowText: row?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? null,
      overlap: tabBar && scroller ? +(tabBar.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top).toFixed(1) : null,
    }
  }, SCROLL)
  await sleep(700)
  console.log(`===== ${TAG} (${BASE}) =====`)
  console.log('scrollTop/scrollH/clientH :', geo.scrollTop, geo.scrollH, geo.clientH)
  console.log('tabBar                    :', JSON.stringify(geo.tabBar))
  console.log('scroller                  :', JSON.stringify(geo.scroller))
  console.log('interval row              :', JSON.stringify(geo.row), '|', geo.rowText)
  console.log('tabBar.bottom - scroller.top (>0 就是真重疊) :', geo.overlap)
  if (geo.row && geo.scroller) {
    console.log('interval row 被容器上緣裁切 :', geo.row.top < geo.scroller.top,
      `(rowTop=${geo.row.top} scrollerTop=${geo.scroller.top}, 露出 ${(geo.row.bottom - geo.scroller.top).toFixed(1)}px / 共 ${geo.row.h}px)`)
  }
  await page.screenshot({ path: path.join(SHOTS, `8-${TAG}-en-scroll${SCROLL}.png`) })
  console.log('shot →', path.join(SHOTS, `8-${TAG}-en-scroll${SCROLL}.png`))
  await ctx.close()
} catch (e) {
  console.log('FATAL', e?.stack || e)
} finally {
  await browser.close()
}
