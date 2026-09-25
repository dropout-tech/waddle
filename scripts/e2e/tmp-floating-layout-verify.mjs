#!/usr/bin/env node
/**
 * 懸浮視窗的版面與雙語檢查 — 2026-08-19。
 *
 * 前一支腳本（tmp-floating-verify.mjs）證明功能會動；這支專門盯「小視窗會不會
 * 破版」與「切成英文會不會殘留中文」，全部用量測數字判定，不靠看截圖。
 *
 *  C1  置頂計時卡在預設 260×300 沒有溢出（每個子元素都在視窗框內）
 *  C2  把懸浮視窗縮到很小 / 拉成很扁，仍然不溢出（cqw/cqh 版面的壓力測試）
 *  C3  便條紙視窗（記事本 420×560、白板 480×620）沒有水平捲動
 *  C4  英文模式下三個懸浮介面的可見文字沒有中文字
 *  截圖：便條紙視窗各存一張（PiP 不是 page，Playwright 截不到，改用量測）
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3177
const BASE = `http://localhost:${PORT}`
const SHOTS = path.join(process.cwd(), 'docs/reports/2026-08-19-floating-shots')
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

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const CJK = /[一-鿿]/

const pageErrors = []
let browser
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
server.stdout.on('data', () => {}); server.stderr.on('data', () => {})

async function waitServer() {
  for (let i = 0; i < 180; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready')
}

async function login(page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').waitFor({ timeout: 60000 })
    await sleep(1500)
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('button[type="submit"]').click()
    for (let i = 0; i < 60; i++) {
      await sleep(1000)
      if (!(await page.evaluate(() => location.pathname)).includes('/login')) return
    }
  }
  throw new Error('login failed')
}

/**
 * 量懸浮計時卡在指定尺寸下有沒有破版。
 *
 * ⚠️ headless Chromium 的 PiP 視窗會回報「開啟它的那個分頁」的尺寸
 * （實測 innerWidth/innerHeight 永遠是 1440×900，resizeTo 也不改變），
 * 所以不能靠視窗本身的大小測。改成把 PiP 的 <body> 夾成目標尺寸——卡片是
 * `h-full w-full`、版面用 container query 單位跟著自己的框走，夾住容器
 * 等同把視窗縮到那個大小。判定基準也改成卡片自己的框，不是視窗框。
 *
 * size = null 代表恢復成填滿。
 */
const measurePip = (page, size) => page.evaluate((size) => {
  const w = window.documentPictureInPicture?.window
  if (!w) return null
  const body = w.document.body
  if (size) {
    body.style.width = size[0] + 'px'
    body.style.height = size[1] + 'px'
  } else {
    body.style.width = ''
    body.style.height = ''
  }
  const card = w.document.querySelector('[data-floating-timer]')
  if (!card) return { hasCard: false }
  // 2026-08-19 起卡片上方多了工作站分頁列——卡片高＝視窗高−分頁列高。
  const tabBar = w.document.querySelector('[data-hub-tab]')?.parentElement
  const tabH = tabBar ? Math.round(tabBar.getBoundingClientRect().height) : 0
  const cr = card.getBoundingClientRect()
  const overflow = []
  for (const el of card.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.left < cr.left - 1 || r.top < cr.top - 1 || r.right > cr.right + 1 || r.bottom > cr.bottom + 1) {
      overflow.push(`${el.tagName.toLowerCase()} ${Math.round(r.left)},${Math.round(r.top)}→${Math.round(r.right)},${Math.round(r.bottom)}`)
    }
  }
  return {
    hasCard: true, tabH,
    W: Math.round(cr.width), H: Math.round(cr.height),
    overflow: overflow.slice(0, 4),
    scrollOverflow: card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1,
    text: card.innerText,
    tabText: tabBar?.innerText ?? '',
    labels: Array.from(card.querySelectorAll('button')).map((b) => b.getAttribute('aria-label')).join(' | '),
  }
}, size)

async function startTimerAndFloat(page) {
  await page.locator('[data-tour="focus-timer"]').first().click()
  await sleep(1200)
  await page.getByRole('button', { name: /開始專注|Start focusing/ }).first().click()
  await sleep(2500)
  await page.locator('[data-timer-float-toggle]').first().click()
  await sleep(2000)
}

async function stopTimer(page) {
  const stop = page.locator('button[aria-label^="長按結束"], button[aria-label^="Hold to end"]').first()
  if (await stop.count()) {
    const box = await stop.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down(); await sleep(1000); await page.mouse.up()
    }
  }
  await sleep(3500)
}

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  ctx.setDefaultNavigationTimeout(180000)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push('[main] ' + e))
  ctx.on('page', (p) => p.on('pageerror', (e) => pageErrors.push('[popup] ' + e)))

  await login(page)
  await sleep(5000)

  // ── C1 / C2：置頂計時卡的版面壓力測試 ──
  await startTimerAndFloat(page)
  // 卡片高＝視窗高−分頁列高（工作站分頁列），寬不變。
  const fits = (m, w, h) =>
    !!m?.hasCard && m.W === w && m.H === h - m.tabH && m.tabH > 0 &&
    m.overflow.length === 0 && !m.scrollOverflow

  const m1 = await measurePip(page, [280, 360]) // 開計時器分頁時要求的預設尺寸
  check('C1 懸浮計時卡在預設尺寸 280×360 沒有溢出',
    fits(m1, 280, 360),
    `量到 ${m1?.W}×${m1?.H}（分頁列 ${m1?.tabH}）overflow=${JSON.stringify(m1?.overflow)} scroll=${m1?.scrollOverflow}`)

  for (const [w, h, name] of [[180, 140, '很小'], [420, 150, '很扁'], [200, 420, '很窄'], [560, 620, '拉大']]) {
    const m = await measurePip(page, [w, h])
    await sleep(300)
    check(`C2 懸浮計時卡在「${name}」(${w}×${h}) 不溢出`,
      fits(m, w, h),
      `量到 ${m?.W}×${m?.H}（分頁列 ${m?.tabH}）overflow=${JSON.stringify(m?.overflow)} scroll=${m?.scrollOverflow}`)
  }
  await measurePip(page, null)

  // ── C4a：英文模式的置頂計時卡 ──
  await page.evaluate(() => { localStorage.setItem('waddle-language-v1', 'en') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(7000)
  await startTimerAndFloat(page)
  const mEn = await measurePip(page, [280, 360])
  const enTextClean = !!mEn?.hasCard && !CJK.test(mEn.text) && !CJK.test(mEn.labels) && !CJK.test(mEn.tabText)
  check('C4a 英文模式：懸浮計時卡（含分頁列）沒有殘留中文', enTextClean,
    `text="${(mEn?.text ?? '').replace(/\n/g, ' / ')}" tabs="${(mEn?.tabText ?? '').replace(/\n/g, ' ')}" labels="${mEn?.labels}"`)
  await page.evaluate(() => window.documentPictureInPicture?.window?.close())
  await sleep(800)
  await stopTimer(page)

  // ── C3 / C4b：便條紙視窗 ──
  for (const [url, name, w, h] of [
    ['/float/scratchpad', 'scratchpad', 480, 620],
    ['/float/note', 'note', 420, 560],
  ]) {
    for (const lang of ['en', 'zh-TW']) {
      await page.evaluate((l) => localStorage.setItem('waddle-language-v1', l), lang)
      const popupPromise = ctx.waitForEvent('page', { timeout: 30000 })
      await page.evaluate(([u, w, h]) => {
        window.open(u, '_blank', `popup=yes,width=${w},height=${h}`)
      }, [url, w, h])
      const popup = await popupPromise
      await popup.waitForLoadState('domcontentloaded')
      await sleep(8000)

      const geo = await popup.evaluate(() => ({
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        scrollW: document.documentElement.scrollWidth,
        text: document.body.innerText,
      }))
      check(`C3 ${name} 便條紙視窗（${lang}）沒有水平溢出`,
        geo.scrollW <= geo.innerW + 1,
        `inner=${geo.innerW} scroll=${geo.scrollW}`)
      if (lang === 'en') {
        check(`C4b ${name} 便條紙視窗英文模式沒有殘留中文`,
          !CJK.test(geo.text),
          `text="${geo.text.replace(/\n/g, ' / ').slice(0, 160)}"`)
      }
      await popup.screenshot({ path: path.join(SHOTS, `${name}-${lang}.png`) })
      await popup.close()
    }
  }

  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
  check('全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (err?.stack || err))
} finally {
  await browser?.close().catch(() => {})
  try { process.kill(-server.pid, 'SIGKILL') } catch {}
  console.log(`\n截圖：${SHOTS}`)
  console.log(`=== ${passed} passed / ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}
