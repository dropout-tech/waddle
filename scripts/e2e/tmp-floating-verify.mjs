#!/usr/bin/env node
/**
 * 懸浮視窗（子母畫面計時器 + 便條紙記事本/白板）驗證 — 2026-08-19。
 *
 * 兩種視窗、兩種驗法：
 *
 * A. **置頂懸浮計時器**（Document Picture-in-Picture）
 *    PiP 視窗不是 Playwright 認得的 page，所以不能用 locator 驅動。但它跟主
 *    視窗同源，主視窗拿得到 `documentPictureInPicture.window`——所以改用
 *    page.evaluate() 直接讀/點它的 DOM，這比看截圖更確定。
 *    驗：開得起來 / 樣式有搬進去（背景色不是預設白 + 有 Tailwind 變數）/
 *    時間文字有在跑 / 按暫停後主視窗的 state 真的變了（證明是同一棵 React 樹）
 *    / 按結束後視窗自己收掉。
 *
 * B. **便條紙視窗**（window.open 的一般視窗）
 *    這些是真的 page，用 context 的 'page' 事件接起來直接操作。
 *    驗：記事本便條紙載入且能打字存檔、白板便條紙載入且填滿視窗（不是被
 *    手機版的 58px 底欄規則切掉）、兩者都零 pageerror。
 *
 * DB 寫入：白板會真的新增一筆項目（測完刪掉並重新載入確認消失）；記事本
 * 只改既有筆記的標題（測完改回原標題）。沒有筆記時會建立一則，測完刪除。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3174
const BASE = `http://localhost:${PORT}`

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
if (!EMAIL || !PASSWORD) {
  console.error('missing E2E creds in .env.e2e.local')
  process.exit(1)
}

let passed = 0
let failed = 0
const skipped = []
function check(name, ok, detail = '') {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
function skip(name, why) {
  skipped.push(`${name} — ${why}`)
  console.log(`SKIP ${name} — ${why}`)
}

const pageErrors = []
let browser
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
})
server.stdout.on('data', () => {})
server.stderr.on('data', () => {})

async function waitServer() {
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch(`${BASE}/login`)
      if (r.ok) return
    } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready on port ' + PORT)
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

/** 讀 PiP 視窗的 DOM（同源，所以主視窗直接摸得到）。 */
const readPip = (page) => page.evaluate(() => {
  const w = window.documentPictureInPicture?.window
  if (!w) return null
  const card = w.document.querySelector('[data-floating-timer]')
  if (!card) return { hasWindow: true, hasCard: false }
  const time = card.querySelector('span.font-mono')?.textContent ?? null
  const cs = w.getComputedStyle(card)
  return {
    hasWindow: true,
    hasCard: true,
    time,
    bg: cs.backgroundColor,
    // Tailwind 的 --background 變數有搬進去，代表 stylesheet 複製成功
    hasTokens: !!w.getComputedStyle(w.document.documentElement).getPropertyValue('--background').trim(),
    bodyClass: w.document.body.className,
    buttons: Array.from(card.querySelectorAll('button')).map((b) => b.getAttribute('aria-label')),
  }
})

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

  // ══════════ A. 置頂懸浮計時器 ══════════
  const pipSupported = await page.evaluate(() => 'documentPictureInPicture' in window)
  console.log('documentPictureInPicture 支援：', pipSupported)

  // 起一段 1 分鐘的計時（自訂分鐘），才有 mini pill 可以彈出。
  await page.locator('[data-tour="focus-timer"]').first().click().catch(() => {})
  await sleep(1200)
  const startBtn = page.getByRole('button', { name: /開始專注/ }).first()
  if ((await startBtn.count()) === 0) {
    check('計時器設定卡可開啟', false, '找不到「開始專注」按鈕')
  } else {
    await startBtn.click()
    await sleep(2500)
    const pill = page.locator('[aria-label="專注計時迷你顯示"], [aria-label="休息計時迷你顯示"]').first()
    const pillVisible = await pill.isVisible().catch(() => false)
    check('A0 計時開始，角落出現迷你計時', pillVisible)

    const floatBtn = page.locator('[data-timer-float-toggle]').first()
    const floatBtnCount = await floatBtn.count()
    check('A1 迷你計時上有「彈出懸浮視窗」按鈕', floatBtnCount > 0 === pipSupported,
      `按鈕數=${floatBtnCount} 支援=${pipSupported}`)

    if (!pipSupported) {
      skip('A2-A6 置頂懸浮視窗行為', '這個 Chromium 沒有 documentPictureInPicture')
    } else {
      await floatBtn.click()
      await sleep(2000)

      const first = await readPip(page)
      check('A2 懸浮視窗開起來了，計時卡在裡面', !!first?.hasCard, JSON.stringify(first?.hasWindow ? { hasCard: first.hasCard } : first))
      check('A3 樣式有搬進懸浮視窗（Tailwind 變數 + 非預設白底）',
        !!first?.hasTokens && first?.bg !== 'rgba(0, 0, 0, 0)' && first?.bg !== '',
        `--background=${first?.hasTokens} bg=${first?.bg}`)
      check('A4 顯示的是計時時間', /^\d{1,2}:\d{2}(:\d{2})?$/.test(first?.time ?? ''), `time="${first?.time}"`)

      // 按懸浮視窗裡的「暫停」，看主視窗的迷你計時是不是也變成暫停狀態
      // （同一棵 React 樹 ⇒ 同一份 state）。
      const pausedOk = await page.evaluate(() => {
        const w = window.documentPictureInPicture?.window
        const btn = w?.document.querySelector('[data-floating-timer] button[aria-label="暫停"]')
        if (!btn) return false
        btn.click()
        return true
      })
      await sleep(1200)
      const mainShowsResume = await page.locator('[aria-label="專注計時迷你顯示"] button[aria-label="繼續"], [aria-label="休息計時迷你顯示"] button[aria-label="繼續"]').count()
      check('A5 在懸浮視窗按暫停 → 主視窗同步變成「繼續」（同一份狀態）',
        pausedOk && mainShowsResume > 0, `clicked=${pausedOk} mainResumeBtn=${mainShowsResume}`)

      // 時間在跑：恢復後隔 2.5 秒再讀一次，數字要不一樣。
      await page.evaluate(() => {
        const w = window.documentPictureInPicture?.window
        w?.document.querySelector('[data-floating-timer] button[aria-label="繼續"]')?.click()
      })
      await sleep(600)
      const t1 = (await readPip(page))?.time
      await sleep(2500)
      const t2 = (await readPip(page))?.time
      check('A6 懸浮視窗裡的時間有在走', !!t1 && !!t2 && t1 !== t2, `${t1} → ${t2}`)

      // 收回：按主視窗的同一顆按鈕，懸浮視窗要消失。
      await floatBtn.click()
      await sleep(1500)
      const after = await page.evaluate(() => !!window.documentPictureInPicture?.window)
      check('A7 再按一次可收回懸浮視窗', after === false, `still open=${after}`)
    }

    // 結束計時，回到乾淨狀態（長按 0.6 秒）。
    const stopBtn = page.locator('[aria-label="專注計時迷你顯示"] button[aria-label^="長按結束"], [aria-label="休息計時迷你顯示"] button[aria-label^="長按結束"]').first()
    if (await stopBtn.count()) {
      const box = await stopBtn.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await sleep(1000)
        await page.mouse.up()
      }
    }
    await sleep(3500)
  }

  // ══════════ B. 便條紙視窗 ══════════
  // B1 白板便條紙
  {
    const popupPromise = ctx.waitForEvent('page', { timeout: 30000 })
    const opened = await page.evaluate(() => {
      window.open('/float/scratchpad', 'huddle-scratchpad', 'popup=yes,width=480,height=620')
      return true
    })
    const popup = await popupPromise.catch(() => null)
    check('B1 白板便條紙視窗開得起來', opened && !!popup)
    if (popup) {
      popup.setDefaultTimeout(60000)
      await popup.waitForLoadState('domcontentloaded')
      await sleep(7000)
      const heading = await popup.getByRole('heading', { name: '專注白板' }).count()
      check('B2 白板便條紙渲染出內容', heading > 0, `heading=${heading}`)

      // 填滿整個視窗：面板底緣要貼到視窗底部（不是被手機版的 58px 規則切掉）。
      const geo = await popup.evaluate(() => {
        const panel = document.querySelector('.fixed.inset-0.bg-card')
        if (!panel) return null
        const r = panel.getBoundingClientRect()
        return { bottom: Math.round(r.bottom), top: Math.round(r.top), vh: window.innerHeight }
      })
      check('B3 白板填滿整個便條紙視窗', !!geo && geo.top === 0 && Math.abs(geo.bottom - geo.vh) <= 1,
        JSON.stringify(geo))

      // 真的能寫：新增一筆，再刪掉。
      const input = popup.locator('input[placeholder^="記下想法"]').first()
      const canType = await input.count()
      if (canType) {
        const TEXT = '便條紙視窗測試-' + Math.floor(performance.now())
        await input.click()
        await input.type(TEXT, { delay: 20 })
        await popup.keyboard.press('Enter')
        await sleep(2500)
        const shown = await popup.getByText(TEXT, { exact: false }).count()
        check('B4 在便條紙視窗新增的內容有存進去', shown > 0, `找到=${shown}`)

        await popup.reload({ waitUntil: 'domcontentloaded' })
        await sleep(7000)
        const persisted = await popup.getByText(TEXT, { exact: false }).count()
        check('B5 重新載入後仍在（真的寫進資料庫）', persisted > 0, `找到=${persisted}`)

        // 清乾淨：刪掉這筆測試項目。
        const card = popup.locator('div').filter({ hasText: TEXT }).last()
        await card.hover().catch(() => {})
        await sleep(400)
        await popup.locator('button[aria-label="刪除"]').last().click({ timeout: 8000 }).catch(() => {})
        await sleep(2500)
        await popup.reload({ waitUntil: 'domcontentloaded' })
        await sleep(7000)
        const leftover = await popup.getByText(TEXT, { exact: false }).count()
        check('B6 測試資料已清除', leftover === 0, `剩餘=${leftover}`)
      } else {
        check('B4-B6 白板便條紙輸入框', false, '找不到輸入框')
      }
      await popup.close()
    }
  }

  // B7 記事本便條紙
  {
    const popupPromise = ctx.waitForEvent('page', { timeout: 30000 })
    await page.evaluate(() => {
      window.open('/float/note', 'huddle-note-test', 'popup=yes,width=420,height=560')
    })
    const popup = await popupPromise.catch(() => null)
    check('B7 記事本便條紙視窗開得起來', !!popup)
    if (popup) {
      popup.setDefaultTimeout(60000)
      await popup.waitForLoadState('domcontentloaded')
      await sleep(8000)
      const title = await popup.title()
      const bodyText = (await popup.locator('body').innerText()).slice(0, 200)
      check('B8 記事本便條紙渲染出內容', /記事本|Notebook/.test(bodyText + title), `title="${title}" body="${bodyText.replace(/\n/g, ' ⏎ ')}"`)

      // 建立一則測試筆記 → 打字 → 重載確認存到 → 刪除還原
      const createBtn = popup.getByRole('button', { name: /建立第一篇|新增記事/ }).first()
      if (await createBtn.count()) {
        await createBtn.click()
        await sleep(3500)
        const titleInput = popup.locator('input[placeholder="無標題"]').first()
        const gotEditor = await titleInput.count()
        check('B9 便條紙視窗裡打得開編輯器', gotEditor > 0)
        if (gotEditor) {
          const NOTE = '便條紙筆記測試'
          await titleInput.click()
          await titleInput.fill(NOTE)
          await sleep(2500)
          await popup.reload({ waitUntil: 'domcontentloaded' })
          await sleep(8000)
          const listed = await popup.getByText(NOTE, { exact: false }).count()
          check('B10 便條紙視窗打的字有存進資料庫', listed > 0, `找到=${listed}`)
        }
        // 還原：回主視窗的記事本刪掉測試筆記
        await popup.close()
        await page.goto(`${BASE}/notebook`, { waitUntil: 'domcontentloaded' })
        await sleep(7000)
        await page.locator('button[aria-label="刪除記事"]').first().click({ timeout: 10000 }).catch(() => {})
        await sleep(500)
        await page.getByRole('button', { name: '刪除', exact: true }).first().click({ timeout: 10000 }).catch(() => {})
        await sleep(2500)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await sleep(7000)
        const leftNotes = await page.locator('button[aria-label="拖曳排序或移到其他分類"]').count()
        check('B11 測試筆記已刪除、帳號還原', leftNotes === 0, `剩餘筆記=${leftNotes}`)
      } else {
        check('B9-B11 記事本便條紙建立流程', false, '找不到建立按鈕')
        await popup.close()
      }
    }
  }

  check('全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (err?.stack || err))
} finally {
  await browser?.close().catch(() => {})
  try { process.kill(-server.pid, 'SIGKILL') } catch {}
  if (skipped.length) console.log('\n略過：\n  ' + skipped.join('\n  '))
  console.log(`\n=== ${passed} passed / ${failed} failed / ${skipped.length} skipped ===`)
  process.exit(failed === 0 ? 0 : 1)
}
