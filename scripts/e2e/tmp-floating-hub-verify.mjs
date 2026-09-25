#!/usr/bin/env node
/**
 * 懸浮工作站（單一置頂視窗、三分頁）驗證 — 2026-08-19。
 *
 * 驗的是這一輪的新行為：計時器＋記事本＋白板共用唯一的置頂 PiP 視窗。
 * PiP 不是 Playwright 的 page，所以全部透過主視窗 evaluate 直接讀寫它的
 * DOM；記事本/白板分頁是同源 iframe，contentDocument 也摸得到。
 *
 *  H1  記事本的 ⇱ → 開出置頂工作站，分頁列 3 顆、記事本分頁 active
 *  H2  記事本 iframe 真的載入（body 有「記事本」字樣）
 *  H3  切到白板分頁 → 白板 iframe 載入；記事本 iframe 仍掛著（隱藏不卸載）
 *  H4  計時器分頁（沒在計時）→ 顯示快速開始，5 顆時長按鈕
 *  H5  按「番茄鐘」→ 計時直接開跑：卡片出現、主視窗角落出現迷你膠囊
 *  H6  工作站內按暫停 → 主視窗同步「繼續」（同一份狀態）
 *  H7  主視窗膠囊的 ⧉（已開且在計時器分頁）→ 收回工作站
 *  H8  白板的 ⇱ → 重開工作站直達白板分頁
 *  H9  計時結束回 idle → 工作站不關，計時器分頁回到快速開始
 *  H10 零 pageerror
 *
 * DB 寫入：無（計時只在記憶體；沒碰任何表單送出）。
 * 注意 H5 會留下一段 <1 分鐘的計時並手動結束——結束時長不足 1 分鐘，
 * recordSessionToCalendar 會跳過（durationMinutes < 1），不寫日曆。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3178
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
function check(name, ok, detail = '') {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const pageErrors = []
let browser
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
server.stdout.on('data', () => {})
server.stderr.on('data', () => {})

async function waitServer() {
  for (let i = 0; i < 180; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
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

/** 讀工作站狀態：分頁列、active 分頁、iframe 載入情形、計時卡。 */
const readHub = (page) => page.evaluate(() => {
  const w = window.documentPictureInPicture?.window
  if (!w) return null
  const d = w.document
  const tabs = Array.from(d.querySelectorAll('[data-hub-tab]')).map((b) => ({
    key: b.getAttribute('data-hub-tab'),
    selected: b.getAttribute('aria-selected') === 'true',
  }))
  const iframes = Array.from(d.querySelectorAll('iframe')).map((f) => {
    let bodyText = null
    try { bodyText = f.contentDocument?.body?.innerText?.slice(0, 120) ?? null } catch {}
    return { src: f.getAttribute('src'), hidden: f.classList.contains('hidden'), bodyText }
  })
  const card = d.querySelector('[data-floating-timer]')
  const presets = d.querySelectorAll('[data-hub-idle-preset]').length
  return {
    tabs,
    active: tabs.find((t) => t.selected)?.key ?? null,
    iframes,
    hasTimerCard: !!card,
    timeText: card?.querySelector('span.font-mono')?.textContent ?? null,
    // 計時進行中，「計時器」分頁標籤會換成倒數時間（沒在計時則為 null）
    tabTime: d.querySelector('[data-hub-tab-time]')?.textContent ?? null,
    idlePresets: presets,
  }
})

const clickInHub = (page, selector) => page.evaluate((sel) => {
  const w = window.documentPictureInPicture?.window
  const el = w?.document.querySelector(sel)
  if (!el) return false
  el.click()
  return true
}, selector)

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1440, height: 900 } })
  ctx.setDefaultNavigationTimeout(180000)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push('[main] ' + e))

  await login(page)
  await sleep(5000)

  // ── H0：日曆工具列的常駐 ⧉ ——**沒在計時**也能開懸浮工作站 ──
  {
    const launcher = page.locator('[data-hub-launcher]').first()
    check('H0a 日曆工具列有常駐的懸浮視窗按鈕', (await launcher.count()) > 0)
    await launcher.click()
    await sleep(2000)
    let h = await readHub(page)
    check('H0b 閒置時點開 → 工作站開啟，計時器分頁顯示快速開始',
      !!h && h.active === 'timer' && h.idlePresets === 5 && !h.hasTimerCard,
      h ? `active=${h.active} presets=${h.idlePresets}` : '沒開起來')
    await launcher.click() // 再按一次＝收回
    await sleep(1200)
    const open = await page.evaluate(() => !!window.documentPictureInPicture?.window)
    check('H0c 再按一次收回', open === false, `open=${open}`)
  }

  // ── H1/H2：從記事本彈出 → 記事本分頁 ──
  await page.goto(`${BASE}/notebook`, { waitUntil: 'domcontentloaded' })
  await sleep(6000)
  // 記事本可能沒有筆記（⇱ 只在開著某則筆記時出現）——先建一則。
  let createdNote = false
  if ((await page.locator('[data-float-out]').count()) === 0) {
    const create = page.getByRole('button', { name: /建立第一篇|新增記事/ }).first()
    if (await create.count()) {
      await create.click()
      createdNote = true
      await sleep(3000)
    }
  }
  await page.locator('[data-float-out]').first().click()
  await sleep(2500)

  let hub = await readHub(page)
  check('H1 工作站開啟：3 顆分頁、記事本分頁 active',
    !!hub && hub.tabs.length === 3 && hub.active === 'note',
    JSON.stringify(hub?.tabs))

  // iframe 載入要等一下
  for (let i = 0; i < 20 && !(hub?.iframes.some((f) => f.bodyText)); i++) {
    await sleep(1000)
    hub = await readHub(page)
  }
  const noteFrame = hub?.iframes.find((f) => f.src?.startsWith('/float/note'))
  check('H2 記事本 iframe 載入完成', !!noteFrame && /記事本|無標題|Notebook/.test(noteFrame.bodyText ?? ''),
    `src=${noteFrame?.src} body="${(noteFrame?.bodyText ?? '').replace(/\n/g, ' / ').slice(0, 60)}"`)

  // ── H3：切到白板分頁 ──
  await clickInHub(page, '[data-hub-tab="scratchpad"]')
  await sleep(1000)
  hub = await readHub(page)
  for (let i = 0; i < 20; i++) {
    const f = hub?.iframes.find((f) => f.src === '/float/scratchpad')
    if (f?.bodyText && /白板|board/i.test(f.bodyText)) break
    await sleep(1000)
    hub = await readHub(page)
  }
  const padFrame = hub?.iframes.find((f) => f.src === '/float/scratchpad')
  const noteStillMounted = hub?.iframes.some((f) => f.src?.startsWith('/float/note') && f.hidden)
  check('H3 白板分頁載入、記事本 iframe 隱藏但沒被拆掉',
    hub?.active === 'scratchpad' && !!padFrame && /白板|board/i.test(padFrame.bodyText ?? '') && !!noteStillMounted,
    `active=${hub?.active} pad="${(padFrame?.bodyText ?? '').replace(/\n/g, ' ').slice(0, 40)}" noteMounted=${noteStillMounted}`)

  // ── H4/H5：計時器分頁的快速開始 ──
  await clickInHub(page, '[data-hub-tab="timer"]')
  await sleep(800)
  hub = await readHub(page)
  check('H4 沒在計時 → 顯示快速開始（5 顆時長）',
    hub?.active === 'timer' && hub?.idlePresets === 5 && !hub?.hasTimerCard,
    `presets=${hub?.idlePresets} card=${hub?.hasTimerCard}`)

  await clickInHub(page, '[data-hub-idle-preset="0"]') // 番茄鐘 25 分
  await sleep(2500)
  hub = await readHub(page)
  const pill = await page.locator('[aria-label="專注計時迷你顯示"]').count()
  check('H5 快速開始：計時卡出現、主視窗角落出現迷你膠囊',
    !!hub?.hasTimerCard && /^\d{1,2}:\d{2}/.test(hub?.timeText ?? '') && pill > 0,
    `time="${hub?.timeText}" pill=${pill}`)

  // ── H6：工作站內暫停 → 主視窗同步 ──
  await clickInHub(page, '[data-floating-timer] button[aria-label="暫停"]')
  await sleep(1200)
  const mainResume = await page.locator('[aria-label="專注計時迷你顯示"] button[aria-label="繼續"]').count()
  check('H6 工作站按暫停 → 主視窗同步變「繼續」', mainResume > 0, `resumeBtn=${mainResume}`)
  await clickInHub(page, '[data-floating-timer] button[aria-label="繼續"]')
  await sleep(600)

  // ── H7：主視窗 ⧉ 收回 ──
  await page.locator('[data-timer-float-toggle]').first().click()
  await sleep(1500)
  const stillOpen = await page.evaluate(() => !!window.documentPictureInPicture?.window)
  check('H7 膠囊的 ⧉ 在計時器分頁時＝收回工作站', stillOpen === false, `open=${stillOpen}`)

  // ── H8：白板 ⇱ 直達白板分頁 ──
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await sleep(6000)
  await page.locator('[data-tour="scratchpad"]').first().click()
  await sleep(1500)
  await page.locator('[data-float-out]').first().click()
  await sleep(2500)
  hub = await readHub(page)
  check('H8 白板的 ⇱ → 工作站直達白板分頁', hub?.active === 'scratchpad', `active=${hub?.active}`)

  // ── H9：在工作站內長按結束 → 工作站不關、計時器分頁回到快速開始 ──
  // （H8 的 goto 是整頁重載，H5 那段計時已隨記憶體重置——從工作站重新快速
  //   開始一段，全程不離開工作站。）
  await clickInHub(page, '[data-hub-tab="timer"]')
  await sleep(800)
  await clickInHub(page, '[data-hub-idle-preset="0"]')
  await sleep(2000)
  hub = await readHub(page)
  const restarted = !!hub?.hasTimerCard

  // ── H9a：主視窗開「記事本彈窗」→ 角落膠囊不被蓋住（z-toast > z-modal）──
  // 先點背景遮罩收掉白板面板（H8 開的），露出日曆頁頂的記事本入口。
  await page.locator('div.fixed.inset-0.bg-black\\/20').first()
    .click({ position: { x: 20, y: 820 } }).catch(() => {})
  await sleep(800)
  await page.locator('[data-tour="notebook-entry"]').first().click()
  await sleep(2500)
  const overlayCheck = await page.evaluate(() => {
    const dialog = document.querySelector('.z-modal')
    const pill = document.querySelector('[aria-label="專注計時迷你顯示"]')
    if (!pill) return { dialog: !!dialog, pill: false }
    const r = pill.getBoundingClientRect()
    // 命中測試：在膠囊中心點取最上層元素，必須仍屬於膠囊（沒被彈窗蓋住）
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { dialog: !!dialog, pill: true, hitInPill: pill.contains(hit) }
  })
  check('H9a 記事本彈窗開著時，角落計時膠囊仍在最上層可點',
    overlayCheck.dialog && overlayCheck.pill && overlayCheck.hitInPill === true,
    JSON.stringify(overlayCheck))
  await page.keyboard.press('Escape')
  await sleep(800)

  // ── H9b：人在記事本分頁時，「計時器」分頁標籤變成活的倒數 ──
  await clickInHub(page, '[data-hub-tab="note"]')
  await sleep(800)
  hub = await readHub(page)
  const tab1 = hub?.tabTime
  await sleep(2500)
  hub = await readHub(page)
  const tab2 = hub?.tabTime
  check('H9b 記事本分頁下，計時器分頁標籤顯示倒數且在走',
    hub?.active === 'note' && /^\d{1,2}:\d{2}/.test(tab1 ?? '') && /^\d{1,2}:\d{2}/.test(tab2 ?? '') && tab1 !== tab2,
    `active=${hub?.active} ${tab1} → ${tab2}`)
  await clickInHub(page, '[data-hub-tab="timer"]')
  await sleep(600)
  // 長按結束是 pointer 事件：pointerdown → 持續 1 秒 → pointerup
  await page.evaluate(() => {
    const w = window.documentPictureInPicture?.window
    const btn = w?.document.querySelector('[data-floating-timer] button[aria-label^="長按結束"]')
    btn?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
  await sleep(1000)
  await page.evaluate(() => {
    const w = window.documentPictureInPicture?.window
    const btn = w?.document.querySelector('[data-floating-timer] button[aria-label^="長按結束"]')
    btn?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await sleep(4000) // 溫柔收尾 1.4s + 淡出 0.4s + 緩衝
  hub = await readHub(page)
  check('H9 工作站內長按結束 → 工作站還在，計時器分頁回到快速開始',
    restarted && !!hub && hub.idlePresets === 5 && !hub.hasTimerCard,
    hub ? `restarted=${restarted} presets=${hub.idlePresets} card=${hub.hasTimerCard}` : '工作站被關掉了')

  await page.evaluate(() => window.documentPictureInPicture?.window?.close())
  await sleep(800)

  // 還原：刪掉 H1 建立的測試筆記
  if (createdNote) {
    await page.goto(`${BASE}/notebook`, { waitUntil: 'domcontentloaded' })
    await sleep(6000)
    await page.locator('button[aria-label="刪除記事"]').first().click({ timeout: 10000 }).catch(() => {})
    await sleep(500)
    await page.getByRole('button', { name: '刪除', exact: true }).first().click({ timeout: 10000 }).catch(() => {})
    await sleep(2500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(6000)
    const left = await page.locator('button[aria-label="拖曳排序或移到其他分類"]').count()
    check('還原：測試筆記已刪除', left === 0, `剩餘=${left}`)
  }

  check('H10 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (err?.stack || err))
} finally {
  await browser?.close().catch(() => {})
  try { process.kill(-server.pid, 'SIGKILL') } catch {}
  console.log(`\n=== ${passed} passed / ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}
