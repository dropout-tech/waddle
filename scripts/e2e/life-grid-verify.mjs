#!/usr/bin/env node
/* eslint-disable no-console -- CLI test runner: stdout is the evidence */
/**
 * 人生年曆 end-to-end check against a running dev server (default
 * http://localhost:3103) with the e2e test account from .env.e2e.local.
 *
 *  1. seeds ~60 fake past days for the current year (screenshots look real)
 *  2. penguin evening question → tap bubble → grid opens with today's input
 *     focused (the browser time zone is picked so local time is ~21:00 now;
 *     "today" for the grid is still the Taipei day)
 *  3. write today's line + mood → cell lights up → reload → still there
 *  4. backfill a past day from the grid
 *  5. ⌘K → 開人生年曆 opens the pop-up
 *  6. share (Web Share disabled → download) → PNG must be 1080×1920
 *  7. English (no CJK left outside the user's own lines), dark mode,
 *     phone 390 (no horizontal overflow, month zoom picks a day)
 *  8. ALWAYS deletes every journal_entries row it wrote and checks the
 *     account is back to its starting row count.
 *
 * Run: BASE_URL=http://localhost:3103 node scripts/e2e/life-grid-verify.mjs
 * Shots: $LIFE_GRID_SHOTS (default <tmp>/life-grid-shots)
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { dateKey, parseDateKey, taipeiToday } from '../../lib/life-grid/compute.ts'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3103'
const SHOTS = process.env.LIFE_GRID_SHOTS || path.join(tmpdir(), 'life-grid-shots')
mkdirSync(SHOTS, { recursive: true })

function loadEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const env = { ...loadEnv('.env.local'), ...loadEnv('.env.e2e.local'), ...process.env }
const { NEXT_PUBLIC_SUPABASE_URL: SB_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: SB_KEY, E2E_EMAIL, E2E_PASSWORD } = env
if (!SB_URL || !SB_KEY || !E2E_EMAIL || !E2E_PASSWORD) {
  console.error('missing Supabase env or E2E_EMAIL/E2E_PASSWORD')
  process.exit(1)
}

let failures = 0
const results = []
let current = null // the page a step is driving — screenshotted on failure
async function step(name, fn) {
  try {
    const note = await fn()
    results.push(`PASS  ${name}${note ? ` — ${note}` : ''}`)
    console.log(`PASS  ${name}${note ? ` — ${note}` : ''}`)
  } catch (e) {
    failures++
    if (current) {
      const file = path.join(SHOTS, `FAIL-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`)
      await current.screenshot({ path: file }).catch(() => {})
      e.message = `${e.message.split('\n')[0]} (url ${current.url()})`
    }
    results.push(`FAIL  ${name} — ${e.message}`)
    console.log(`FAIL  ${name} — ${e.message.split('\n')[0]}`)
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }

// ── data setup (node-side client, same test account, RLS applies) ────────
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: E2E_EMAIL, password: E2E_PASSWORD })
if (authErr) throw authErr
const uid = auth.user.id
const countRows = async () => {
  const { count, error } = await sb.from('journal_entries').select('id', { count: 'exact', head: true }).eq('user_id', uid)
  if (error) throw error
  return count ?? 0
}
console.log(`supabase host: ${new URL(SB_URL).host}`)
const startCount = await countRows()
console.log(`journal_entries rows before: ${startCount}`)

const today = taipeiToday()
const t = parseDateKey(today)
const year = t.year
const shift = (date, days) => {
  const p = parseDateKey(date)
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}
const BACKFILL = shift(today, -10)
const touched = new Set([today, BACKFILL]) // every date this run may write

// Deterministic fake year: ~60 days spread before today.
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const MOODS = ['great', 'good', 'good', 'good', 'neutral', 'neutral', 'bad', 'terrible']
// 60 different, everyday lines — every seeded day gets its own (no repeats).
const LINES = [
  '傍晚沿著河堤散步，風很舒服', '讀到一句話：慢慢來，比較快', '和爸媽吃火鍋，聊到很晚', '終於把季報交出去了',
  '早上的咖啡特別香', '在公車上看完一集喜歡的節目', '幫鄰居奶奶搬了一箱水', '下雨天在家煮了一鍋湯',
  '跑完五公里，腿很痠但很開心', '和老朋友視訊，笑到肚子痛', '整理了衣櫃，丟掉三袋舊衣服', '第一次自己修好水龍頭',
  '午休時在公園曬太陽', '學會一道新菜：番茄炒蛋', '工作卡關，但最後找到解法', '在書店待了一個下午',
  '妹妹傳了小時候的照片', '騎腳踏車去海邊看夕陽', '把拖了很久的信回完了', '睡了一個很飽的午覺',
  '同事請大家喝手搖飲', '在路上看到一隻很胖的貓', '下班後去游泳，整個人放鬆', '和另一半一起逛市場',
  '寫完企劃書的第一版', '早起看日出，天空是粉紅色的', '把房間的植物都換了盆', '聽了一場很好聽的街頭演奏',
  '跟主管談完，心裡踏實多了', '一個人去看了一部電影', '媽媽寄來自己做的醬菜', '第一次試著冥想十分鐘',
  '雨後的空氣有青草味', '幫朋友搬家，累但很溫暖', '把相簿裡的照片整理好', '和團隊一起慶祝專案上線',
  '在咖啡廳寫了一整頁日記', '走錯路，卻發現一家好吃的麵店', '颱風天停班，在家拼拼圖', '跟爸爸一起去爬象山',
  '收到一張手寫的感謝卡', '重新開始練吉他', '早餐吃到剛出爐的蛋餅', '晚上在陽台看到很亮的月亮',
  '完成了一件拖延很久的工作', '和小姪子玩了一下午積木', '試穿了一件很喜歡的外套', '去市場買了當季的水果',
  '讀完一本小說，結局很好', '下班路上聽到喜歡的歌', '跟自己說今天辛苦了', '和朋友約好明年一起旅行',
  '在家做了一次大掃除', '第一次報名了線上課程', '吃到好吃的牛肉麵', '陪家裡的狗散步兩圈',
  '午餐和同事聊得很開心', '把書桌整理得乾乾淨淨', '泡了一壺新買的茶', '睡前讀了幾頁詩',
]
const seeds = []
const past = []
for (let d = shift(today, -1); d >= dateKey(year, 1, 1); d = shift(d, -1)) if (d !== BACKFILL) past.push(d)
for (const d of past) if (seeds.length < LINES.length && rand() < 0.3) seeds.push(d)
for (const d of seeds) touched.add(d)
const seedLine = new Map(seeds.map((d, i) => [d, LINES[i]]))

async function cleanup() {
  const dates = [...touched]
  const { data, error } = await sb.from('journal_entries').delete().eq('user_id', uid).in('date', dates).select('id')
  if (error) throw error
  const after = await countRows()
  return { deleted: data.length, after }
}

/** Poll the DB (≤10 s) for one day's row — the UI is optimistic, the DB is the truth. */
async function dbRow(date) {
  for (let i = 0; i < 20; i++) {
    const { data } = await sb.from('journal_entries').select('content,mood').eq('user_id', uid).eq('date', date)
    if (data?.length) return data[0]
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

const pngSize = (file) => {
  const b = readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

async function login(p) {
  await p.goto(`${BASE_URL}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await p.locator('#email').fill(E2E_EMAIL)
  await p.locator('#password').fill(E2E_PASSWORD)
  await p.getByRole('button', { name: /^(登入|Log in|Sign in)$/ }).click()
  await p.waitForURL(`${BASE_URL}/`, { timeout: 30000 })
  await p.locator('[data-tour="calendar-panel"], [data-life-grid]').first().waitFor({ timeout: 30000 }).catch(() => {})
}

/** The e2e account is shared with other test runs; a global sign-out there
 *  revokes this session. If a navigation bounces to /login, sign in again. */
async function gotoAuthed(p, url) {
  await p.goto(url, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  if (new URL(p.url()).pathname.startsWith('/login')) {
    console.log('      (session was revoked elsewhere — signing in again)')
    await login(p)
    await p.goto(url, { waitUntil: 'domcontentloaded' })
  }
}

let browser
try {
  const { error: seedErr } = await sb.from('journal_entries').upsert(
    seeds.map((date) => ({ user_id: uid, date, content: seedLine.get(date), mood: MOODS[Math.floor(rand() * MOODS.length)] })),
    { onConflict: 'user_id,date' },
  )
  if (seedErr) throw seedErr
  console.log(`seeded ${seeds.length} fake days (${new Set(seedLine.values()).size} distinct lines); today=${today}; backfill=${BACKFILL}`)

  browser = await chromium.launch()

  // Local evening right now: choose a fixed-offset zone where it is ~21:00.
  const utcH = new Date().getUTCHours()
  let off = ((21 - utcH) % 24 + 24) % 24
  if (off > 14) off -= 24
  const eveningTz = off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`

  const desktop = { viewport: { width: 1440, height: 900 }, locale: 'zh-TW' }
  const ctxA = await browser.newContext({ ...desktop, timezoneId: eveningTz })
  const page = await ctxA.newPage()
  current = page
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await step('login (e2e account)', async () => {
    await login(page)
  })
  // Supabase rotates refresh tokens: always hand the NEXT context the latest
  // session (taken right before closing the previous one), never a stale copy.
  let storage = await ctxA.storageState()

  await step(`penguin asks the evening question (browser tz ${eveningTz}) and the bubble opens today's input`, async () => {
    const action = page.locator('[data-pet-bubble-action]')
    await action.waitFor({ state: 'attached', timeout: 200000 })
    const bubbleText = await page.locator('[data-pet-bubble]').innerText()
    assert(bubbleText.includes('今天最想記住的是什麼'), `bubble says: ${bubbleText}`)
    await page.screenshot({ path: path.join(SHOTS, 'pet-evening-question.png') })
    await action.click({ timeout: 5000 }).catch(() => action.evaluate((el) => el.click()))
    await page.locator('[role="dialog"] [data-life-grid]').waitFor({ timeout: 10000 })
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-life-grid-input'), null, { timeout: 5000 })
    return `bubble: "${bubbleText.replace(/\s+/g, ' ').slice(0, 60)}"`
  })

  const TODAY_LINE = '今天把人生年曆做出來了'
  await step('write today\'s line + mood → the today cell lights up', async () => {
    const dlg = page.locator('[role="dialog"]')
    await page.waitForFunction(() => document.querySelectorAll('[data-life-grid] [data-written]').length > 0, null, { timeout: 15000 })
    await dlg.locator('[data-life-grid-input]').fill(TODAY_LINE)
    await dlg.locator('[data-mood="great"]').click()
    await page.screenshot({ path: path.join(SHOTS, 'overlay-today-input.png') })
    await dlg.locator('[data-life-grid-save]').click()
    const cell = dlg.locator(`[data-date="${today}"][data-written]`)
    await cell.waitFor({ timeout: 10000 })
    const bg = await cell.evaluate((el) => el.style.backgroundColor)
    assert(bg, 'today cell has no mood color')
    await dlg.locator('[data-life-grid-line]').filter({ hasText: TODAY_LINE }).waitFor({ timeout: 5000 })
    const row = await dbRow(today)
    assert(row?.content === TODAY_LINE && row.mood === 'great', `db row: ${JSON.stringify(row)}`)
    await page.screenshot({ path: path.join(SHOTS, 'overlay-today-saved.png') })
    return `cell color ${bg}; db row ok`
  })
  storage = await ctxA.storageState()
  await ctxA.close()

  // ── standalone /year, Web Share disabled so the share falls back to a download
  const ctxB = await browser.newContext({ ...desktop, storageState: storage, acceptDownloads: true })
  await ctxB.addInitScript(() => {
    try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }) } catch { /* noop */ }
    try { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }) } catch { /* noop */ }
  })
  const pb = await ctxB.newPage()
  current = pb
  pb.on('pageerror', (e) => pageErrors.push(e.message))
  const gotoYear = async (p) => {
    await gotoAuthed(p, `${BASE_URL}/year`)
    await p.locator('[data-life-grid]').waitFor({ timeout: 30000 })
    await p.waitForFunction(() => document.querySelectorAll('[data-life-grid] [data-written]').length > 0, null, { timeout: 20000 })
    await p.waitForTimeout(400)
  }

  await step('reload /year → today\'s line is still there; squares reveal one by one; letter line quotes the latest day', async () => {
    await gotoYear(pb)
    await pb.reload({ waitUntil: 'domcontentloaded' })
    await gotoYear(pb)
    const anim = await pb.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-life-grid-grid] [data-written]')]
      const delays = cells.map((c) => parseFloat(getComputedStyle(c).animationDelay) * 1000)
      return { n: cells.length, name: getComputedStyle(cells.at(-1)).animationName, max: Math.max(...delays) }
    })
    assert(/reveal/.test(anim.name), `no reveal animation (${anim.name})`)
    assert(anim.max <= 1100, `stagger too long: last delay ${anim.max}ms`)
    // layout size (offsetWidth) — boundingBox would include the reveal's scale()
    const size = await pb.locator(`[data-date="${today}"]`).evaluate((el) => ({ width: el.offsetWidth }))
    assert(size.width >= 20, `desktop cell only ${size.width}px`)
    const latestSeed = [...seeds].sort().at(-1)
    const letter = await pb.locator('[data-life-grid-letter]').innerText()
    assert(letter.includes(seedLine.get(latestSeed)), `letter line: ${letter}`)
    await pb.waitForTimeout(1600) // let the reveal finish before the screenshot
    await pb.locator(`[data-date="${today}"][data-written]`).waitFor({ timeout: 10000 })
    const line = await pb.locator('[data-life-grid-line]').innerText()
    assert(line === TODAY_LINE, `card shows "${line}"`)
    const lit = await pb.locator('[data-life-grid-grid] [data-written]').count()
    const summary = await pb.locator('[data-life-grid-summary]').innerText()
    await pb.screenshot({ path: path.join(SHOTS, 'desktop-1440-zh.png') })
    return `${lit} lit cells, cell ${size.width.toFixed(0)}px, reveal last delay ${anim.max}ms; summary: "${summary.replace(/\s+/g, ' ')}"; letter: "${letter}"`
  })

  await step(`backfill a past day (${BACKFILL}) from the grid`, async () => {
    await pb.locator(`[data-date="${BACKFILL}"]`).click()
    const card = pb.locator(`[data-life-grid-day="${BACKFILL}"]`)
    await card.getByText('這天還空著，想補一句嗎？').waitFor({ timeout: 5000 })
    await card.locator('[data-life-grid-input]').fill('補記：那天去爬山')
    await card.locator('[data-mood="good"]').click()
    await card.locator('[data-life-grid-save]').click()
    await pb.locator(`[data-date="${BACKFILL}"][data-written]`).waitFor({ timeout: 10000 })
    await card.locator('[data-life-grid-line]').waitFor({ timeout: 10000 }) // shown only after the write resolved
    const row = await dbRow(BACKFILL)
    assert(row?.mood === 'good' && row.content === '補記：那天去爬山', `db row: ${JSON.stringify(row)}`)
    await pb.screenshot({ path: path.join(SHOTS, 'desktop-1440-backfill.png') })
  })

  await step('share → downloads a 1080×1920 PNG', async () => {
    const [download] = await Promise.all([pb.waitForEvent('download', { timeout: 20000 }), pb.locator('[data-life-grid-share]').click()])
    const file = path.join(SHOTS, `share-${year}.png`)
    await download.saveAs(file)
    const { w, h } = pngSize(file)
    assert(w === 1080 && h === 1920, `got ${w}×${h}`)
    return `${download.suggestedFilename()} ${w}×${h}`
  })

  await step('⌘K → 開人生年曆 opens the pop-up over the board', async () => {
    await gotoAuthed(pb, `${BASE_URL}/`)
    await pb.getByRole('button', { name: '月檢視' }).waitFor({ timeout: 30000 })
    await pb.keyboard.press('Meta+k')
    await pb.getByRole('option', { name: '開人生年曆' }).click({ timeout: 10000 })
    await pb.locator('[role="dialog"] [data-life-grid]').waitFor({ timeout: 10000 })
    await pb.waitForFunction(() => document.querySelectorAll('[role="dialog"] [data-life-grid] [data-written]').length > 0, null, { timeout: 15000 })
    await pb.waitForTimeout(450)
    await pb.screenshot({ path: path.join(SHOTS, 'desktop-1440-overlay-reveal.png') }) // mid-animation
    await pb.waitForTimeout(1700)
    await pb.screenshot({ path: path.join(SHOTS, 'desktop-1440-overlay.png') })
  })

  await step('English: no Chinese left in the UI (user lines excluded)', async () => {
    await pb.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
    await gotoYear(pb)
    const leftovers = await pb.evaluate(() => {
      const root = document.querySelector('[data-life-grid]').cloneNode(true)
      root.querySelectorAll('[data-user-text]').forEach((n) => n.remove())
      const text = root.innerText || root.textContent
      const labels = [...document.querySelectorAll('[data-life-grid] [aria-label]')].map((n) => n.getAttribute('aria-label'))
      return [...(text.match(/[㐀-鿿]+/g) || []), ...labels.filter((l) => /[㐀-鿿]/.test(l))]
    })
    await pb.screenshot({ path: path.join(SHOTS, 'desktop-1440-en.png') })
    assert(leftovers.length === 0, `CJK left: ${JSON.stringify(leftovers.slice(0, 5))}`)
  })

  await step('dark mode renders', async () => {
    await pb.evaluate(() => { localStorage.setItem('waddle-language-v1', 'zh-TW'); localStorage.setItem('theme', 'dark') })
    await gotoYear(pb)
    const dark = await pb.evaluate(() => document.documentElement.classList.contains('dark'))
    assert(dark, 'html.dark not set')
    await pb.screenshot({ path: path.join(SHOTS, 'desktop-1440-dark.png') })
    await pb.evaluate(() => localStorage.setItem('theme', 'light'))
  })
  storage = await ctxB.storageState()
  await ctxB.close()

  const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-TW', storageState: storage })
  const pm = await ctxC.newPage()
  current = pm
  pm.on('pageerror', (e) => pageErrors.push(e.message))
  await step('phone 390: no horizontal overflow; month row → zoom → pick a day', async () => {
    await gotoYear(pm)
    const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    assert(ov.sw <= ov.cw + 1, `overflow ${ov.sw} > ${ov.cw}`)
    const dark = await pm.evaluate(() => document.documentElement.classList.contains('dark'))
    assert(!dark, 'phone page is in dark mode — expected light')
    await pm.waitForTimeout(1600)
    const col = await pm.locator('[data-life-grid-month="1"]').boundingBox()
    assert(col.width >= 28 && col.height >= 28, `month column ${col.width}×${col.height}`)
    await pm.screenshot({ path: path.join(SHOTS, 'mobile-390-zh.png') })
    await pm.locator('[data-life-grid-phone]').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await pm.waitForTimeout(300)
    await pm.screenshot({ path: path.join(SHOTS, 'mobile-390-zh-grid.png') })
    const month = Number(BACKFILL.slice(5, 7))
    await pm.locator(`[data-life-grid-month="${month}"]`).tap()
    await pm.locator(`[data-zoom-date="${BACKFILL}"]`).tap()
    await pm.locator(`[data-life-grid-day="${BACKFILL}"]`).waitFor({ timeout: 5000 })
    await pm.locator('[data-life-grid-zoom]').scrollIntoViewIfNeeded()
    await pm.screenshot({ path: path.join(SHOTS, 'mobile-390-zoom.png') })
    return `light mode; month column tap target ${col.width.toFixed(0)}×${col.height.toFixed(0)}px; zoom pick ok`
  })
  await step('phone 390 dark', async () => {
    await pm.evaluate(() => localStorage.setItem('theme', 'dark'))
    await gotoYear(pm)
    await pm.screenshot({ path: path.join(SHOTS, 'mobile-390-dark.png') })
    await pm.evaluate(() => localStorage.removeItem('theme'))
  })
  await ctxC.close()

  await step('no uncaught page errors', async () => {
    assert(pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)))
  })
} catch (e) {
  failures++
  console.log(`FAIL  setup — ${e.message}`)
} finally {
  if (browser) await browser.close().catch(() => {})
  try {
    const { deleted, after } = await cleanup()
    const ok = after === startCount
    console.log(`${ok ? 'PASS' : 'FAIL'}  cleanup — deleted ${deleted} journal_entries rows; rows now ${after} (started with ${startCount})`)
    if (!ok) failures++
  } catch (e) {
    failures++
    console.log(`FAIL  cleanup — ${e.message} (CHECK THE TEST ACCOUNT BY HAND)`)
  }
  console.log(`\nscreenshots: ${SHOTS}`)
  console.log(failures ? `${failures} failure(s)` : 'all passed')
  process.exit(failures ? 1 : 0)
}
