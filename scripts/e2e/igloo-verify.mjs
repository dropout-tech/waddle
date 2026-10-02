/* eslint-disable no-console -- CLI test script */
/**
 * 企鵝的冰屋 (components/igloo) — local UI verification against the real
 * e2e test account (.env.e2e.local ONLY).
 *
 *   pnpm exec next dev -p 3102   (separate terminal)
 *   E2E_BASE_URL=http://localhost:3102 SHOT_DIR=/some/dir node scripts/e2e/igloo-verify.mjs
 *
 * Flow (desktop 1440, zh-TW, real writes):
 *   open igloo from the pet menu / growth card → brick count matches the
 *   account's completed tasks → create + complete 2 tasks in a throwaway
 *   category → reopen → the 2 new bricks are replayed (frozen mid-flight for a
 *   screenshot) and the total is +2 → delete the throwaway category + tasks
 *   (UI first, then a REST backstop) and prove nothing is left.
 * Then read-only contexts (every Supabase write intercepted): phone 390,
 * English (no CJK left in the dialog), dark mode, and a mocked "away for
 * 4 days" account (task completion dates rewritten) → waiting penguin.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const readEnv = (file) => Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const env = readEnv('.env.e2e.local')
const pub = readEnv('.env.local')
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3102'
const SHOTS = process.env.SHOT_DIR || 'docs/reports/igloo-shots'
mkdirSync(SHOTS, { recursive: true })
const PREFIX = 'IGLOOTEST'
const CAT = `${PREFIX}分類${Date.now() % 100000}`
const TASKS = [`${PREFIX}任務一`, `${PREFIX}任務二`]
const CJK = /[㐀-鿿]/
const READ_RPCS = /\/rpc\/(get_|preview_)/
// The most recent 15:00 local that is already in the past (session tokens stay valid).
const DAYTIME = new Date(); DAYTIME.setHours(15, 0, 0, 0); if (DAYTIME.getTime() > Date.now()) DAYTIME.setDate(DAYTIME.getDate() - 1)

let failures = 0
const results = []
async function step(name, fn) {
  try {
    const detail = await fn()
    results.push(`PASS  ${name}${detail ? ' — ' + detail : ''}`)
    console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`)
  } catch (e) {
    failures++
    results.push(`FAIL  ${name} — ${e.message}`)
    console.log(`FAIL  ${name} — ${e.message}`)
  }
}

// REST client signed in as the same e2e account (count + cleanup backstop).
const sb = createClient(pub.NEXT_PUBLIC_SUPABASE_URL, pub.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: signIn, error: signErr } = await sb.auth.signInWithPassword({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD })
if (signErr) throw signErr
const uid = signIn.user.id

const browser = await chromium.launch()
let storageState

async function makeContext({ viewport, mobile = false, lang = 'zh-TW', dark = false, readOnly = false, awayDays = 0, fixedTime = null }) {
  const context = await browser.newContext({
    viewport,
    locale: lang === 'en' ? 'en-US' : 'zh-TW',
    colorScheme: dark ? 'dark' : 'light',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    ...(storageState ? { storageState } : {}),
  })
  // Daytime clock (Date only; timers keep running) so a night-time run still shows the daytime moods.
  if (fixedTime) await context.clock.setFixedTime(fixedTime)
  const nowMs = fixedTime ? fixedTime.getTime() : Date.now()
  if (readOnly) {
    await context.route('**/rest/v1/**', async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const method = req.method()
      const isRead = method === 'GET' || method === 'HEAD' || (method === 'POST' && READ_RPCS.test(url.pathname))
      if (!isRead) return route.fulfill({ status: 204, body: '' })
      if (awayDays && method === 'GET' && url.pathname.endsWith('/tasks')) {
        const res = await route.fetch()
        const json = await res.json()
        const away = new Date(nowMs - awayDays * 86400000).toISOString()
        const rows = Array.isArray(json) ? json.map((r) => (r.is_completed ? { ...r, completed_at: away } : r)) : json
        return route.fulfill({ response: res, json: rows })
      }
      return route.continue()
    })
    await context.route('**/storage/v1/**', (route) => route.request().method() === 'GET' ? route.continue() : route.fulfill({ status: 204, body: '' }))
  }
  await context.addInitScript(({ l, d }) => {
    try {
      localStorage.setItem('waddle.waterReminder.enabled', '0')
      localStorage.setItem('waddle-language-v1', l)
      localStorage.setItem('theme', d ? 'dark' : 'light')
      // Each context starts with no igloo memory and no pomodoros today.
      if (!sessionStorage.getItem('igloo-test-init')) {
        for (const k of Object.keys(localStorage)) if (k.startsWith('huddle-igloo') || k.startsWith('huddle-pomodoro') || k.startsWith('waddle-pomodoro')) localStorage.removeItem(k)
        sessionStorage.setItem('igloo-test-init', '1')
      }
    } catch {}
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style')
      st.textContent = 'nextjs-portal{display:none!important}'
      document.head.appendChild(st)
    })
  }, { l: lang, d: dark })
  return context
}

async function login(page) {
  await page.goto(BASE + '/login?method=email', { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000, waitUntil: 'domcontentloaded' })
}

async function openApp(page) {
  if (!page.url().startsWith(BASE) || page.url().includes('/login')) await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  const ready = page.locator('[data-tour="calendar-panel"], [data-tour="mobile-more"]').first()
  try {
    await ready.waitFor({ timeout: 60000 })
  } catch {
    // Dev server cold compile / slow startup read: one reload, then give up.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await ready.waitFor({ timeout: 90000 })
  }
  const skip = page.getByRole('button', { name: /略過導覽|Skip tour/ })
  if (await skip.count()) await skip.first().click().catch(() => {})
  // Adoption card (if the account has no pet yet) — postpone it.
  const later = page.locator('[data-pet-adopt] button', { hasText: /稍後|Later|先跳過|Skip/ })
  if (await later.count()) await later.first().click().catch(() => {})
  await page.waitForTimeout(1500)
}

const dialog = (page) => page.locator('[data-igloo-dialog]')

async function openViaEvent(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('huddle:open-igloo')))
  await dialog(page).waitFor({ timeout: 10000 })
}

async function waitReplayDone(page) {
  await page.waitForFunction(() => document.querySelector('[data-igloo-dialog]')?.getAttribute('data-igloo-replaying') === 'false', null, { timeout: 30000 })
  await page.waitForTimeout(400)
}

async function readDialog(page) {
  return dialog(page).evaluate((el) => ({
    total: Number(el.getAttribute('data-igloo-total')),
    shown: Number(el.getAttribute('data-igloo-shown')),
    mood: el.getAttribute('data-igloo-mood'),
    replayCount: Number(el.getAttribute('data-igloo-replay-count')),
    today: Number(el.getAttribute('data-igloo-today')),
    bubble: el.querySelector('[data-igloo-bubble]')?.textContent ?? '',
    progress: el.querySelector('[data-igloo-progress]')?.textContent ?? '',
    bricks: el.querySelectorAll('[data-igloo-scene] svg g[clip-path^="url(#dome"] > g').length,
  }))
}

async function shot(page, name, target) {
  const file = path.join(SHOTS, name)
  await (target ?? page).screenshot({ path: file })
  return file
}

async function closeDialog(page) {
  await page.keyboard.press('Escape')
  await dialog(page).waitFor({ state: 'detached', timeout: 5000 })
}

const countCompleted = async () => {
  const { count, error } = await sb.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('is_completed', true)
  if (error) throw error
  return count
}

// ─── 1) desktop, real account, real writes ────────────────────────────────
{
  const context = await makeContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await login(page)
  await openApp(page)
  storageState = await context.storageState()
  let n0 = 0

  await step('desktop: igloo opens from the pet menu (or event if no pet)', async () => {
    const petBtn = page.locator('[data-pet-button]')
    if (await petBtn.count() && await petBtn.isVisible()) {
      await petBtn.click({ button: 'right' })
      await page.locator('[data-pet-igloo]').click()
      await dialog(page).waitFor({ timeout: 10000 })
      return 'via 企鵝選單 → 去冰屋看看'
    }
    await openViaEvent(page)
    return 'pet not shown on this account → opened via huddle:open-igloo event'
  })

  await step('desktop: first-visit replay finishes and brick count matches completed tasks', async () => {
    await waitReplayDone(page)
    const d = await readDialog(page)
    n0 = d.total
    const db = await countCompleted()
    assert.equal(d.shown, d.total, 'shown == total after replay')
    assert.equal(d.total, db, `igloo total ${d.total} vs completed tasks in DB ${db}`)
    assert.equal(d.bricks, d.total % 35, 'bricks drawn on the current igloo')
    return `total=${d.total} (DB completed=${db}), drawn=${d.bricks}, mood=${d.mood}, progress="${d.progress}"`
  })
  await step('desktop 1440 screenshot', async () => shot(page, 'igloo-desktop-1440.png'))
  await closeDialog(page)

  await step('growth page shows the igloo card and it opens the igloo', async () => {
    await page.getByRole('button', { name: '更多工具' }).click()
    await page.getByRole('menuitem', { name: '每日簽到' }).click()
    const card = page.locator('[data-igloo-card]')
    await card.waitFor({ timeout: 15000 })
    await shot(page, 'igloo-growth-card-1440.png')
    await card.click()
    await dialog(page).waitFor({ timeout: 10000 })
    const d = await readDialog(page)
    assert.equal(d.replayCount, 0, 'nothing new → no replay')
    await closeDialog(page)
    await page.getByRole('button', { name: '返回日曆' }).click()
    return `no replay on second open (replayCount=${d.replayCount})`
  })

  const catRoot = () => page.getByText(CAT, { exact: true }).locator('xpath=ancestor::div[contains(@class,"mb-3")][1]')
  await step('create a throwaway category + 2 tasks and complete both', async () => {
    await page.locator('button[aria-label*="新增分類"]').first().click()
    await page.locator('input[placeholder="分類名稱..."]').fill(CAT)
    await page.keyboard.press('Enter')
    await page.getByText(CAT, { exact: true }).waitFor({ timeout: 10000 })
    await page.waitForTimeout(1500)
    for (const title of TASKS) {
      await catRoot().locator('button:has-text("新增任務")').click()
      await catRoot().locator('input[placeholder="輸入任務名稱..."]').fill(title)
      await page.keyboard.press('Enter')
      await catRoot().getByText(title).waitFor({ timeout: 8000 })
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(1200)
    }
    for (let i = 0; i < TASKS.length; i++) {
      await catRoot().locator('[role="checkbox"]:not([aria-checked="true"])').first().click()
      await page.waitForTimeout(1500)
    }
    // Let the writes land.
    for (let i = 0; i < 20 && (await countCompleted()) < n0 + 2; i++) await page.waitForTimeout(500)
    const db = await countCompleted()
    assert.equal(db, n0 + 2, `DB completed ${db} vs expected ${n0 + 2}`)
    return `DB completed now ${db}`
  })

  await step('reopen: the 2 new bricks are replayed, total +2, catch-up line', async () => {
    await openViaEvent(page)
    const first = await readDialog(page)
    assert.equal(first.replayCount, 2, `replayCount=${first.replayCount}`)
    // Freeze mid-flight (after the first brick lands, during the second).
    await page.waitForFunction((n) => Number(document.querySelector('[data-igloo-dialog]')?.getAttribute('data-igloo-shown')) >= n, n0 + 2, { timeout: 10000 })
    await page.waitForTimeout(220) // the next brick is mid-air now
    await page.evaluate(() => {
      document.querySelector('[data-igloo-scene]')?.setAttribute('data-frozen', '')
      for (const a of document.getAnimations()) a.pause()
    })
    await shot(page, 'igloo-replay-midflight-1440.png', dialog(page))
    await page.evaluate(() => {
      document.querySelector('[data-igloo-scene]')?.removeAttribute('data-frozen')
      for (const a of document.getAnimations()) a.play()
    })
    await waitReplayDone(page)
    const d = await readDialog(page)
    assert.equal(d.total, n0 + 2)
    assert.equal(d.shown, n0 + 2)
    assert.ok(d.bubble.includes('你不在的時候，我幫你搬了 2 塊'), `bubble="${d.bubble}"`)
    await shot(page, 'igloo-after-replay-1440.png')
    return `total ${n0} → ${d.total}; bubble="${d.bubble}"`
  })
  await closeDialog(page)

  await step('cleanup: delete the throwaway category (UI) + REST backstop, nothing left', async () => {
    page.once('dialog', (dlg) => dlg.accept())
    await catRoot().locator('button[aria-label*="刪除分類"]').click().catch(() => {})
    const confirm = page.getByRole('alertdialog').getByRole('button', { name: /刪除|確定/ })
    if (await confirm.count()) await confirm.first().click().catch(() => {})
    await page.waitForTimeout(2500)
    await sb.from('tasks').delete().eq('user_id', uid).like('title', `${PREFIX}%`)
    await sb.from('categories').delete().eq('user_id', uid).like('name', `${PREFIX}%`)
    const { count: t } = await sb.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', uid).like('title', `${PREFIX}%`)
    const { count: c } = await sb.from('categories').select('id', { count: 'exact', head: true }).eq('user_id', uid).like('name', `${PREFIX}%`)
    assert.equal(t, 0, 'leftover tasks')
    assert.equal(c, 0, 'leftover categories')
    return `leftover tasks=${t}, categories=${c}`
  })

  await step('bricks are not taken back after the tasks are deleted (ledger)', async () => {
    await page.waitForTimeout(1500)
    await openViaEvent(page)
    await waitReplayDone(page)
    const d = await readDialog(page)
    assert.equal(d.total, n0 + 2)
    await closeDialog(page)
    return `total stays ${d.total}`
  })
  await context.close()
}

// ─── 2) phone 390 (read-only) ─────────────────────────────────────────────
{
  const context = await makeContext({ viewport: { width: 390, height: 844 }, mobile: true, readOnly: true, fixedTime: DAYTIME })
  const page = await context.newPage()
  await openApp(page)
  await step('phone 390: growth card reachable via 更多 → 每日簽到, dialog fits', async () => {
    await page.locator('[data-tour="mobile-more"]').click()
    await page.getByRole('button', { name: '每日簽到' }).click()
    const card = page.locator('[data-igloo-card]')
    await card.waitFor({ timeout: 15000 })
    await shot(page, 'igloo-growth-card-390.png')
    await card.click()
    await dialog(page).waitFor({ timeout: 10000 })
    await waitReplayDone(page)
    const box = await dialog(page).boundingBox()
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `dialog box ${JSON.stringify(box)}`)
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(scroll <= 390, `page scrollWidth ${scroll}`)
    await shot(page, 'igloo-mobile-390.png')
    return `dialog ${Math.round(box.width)}×${Math.round(box.height)} at x=${Math.round(box.x)}`
  })
  await context.close()
}

// ─── 3) English (read-only) ───────────────────────────────────────────────
{
  const context = await makeContext({ viewport: { width: 1440, height: 900 }, lang: 'en', readOnly: true, fixedTime: DAYTIME })
  const page = await context.newPage()
  await openApp(page)
  await step('English: no Chinese left in the igloo dialog (pet name excluded)', async () => {
    await openViaEvent(page)
    await waitReplayDone(page)
    const text = await dialog(page).evaluate((el) => {
      const c = el.cloneNode(true)
      c.querySelectorAll('[data-igloo-bubble] strong').forEach((n) => n.remove())
      return `${c.textContent} ${el.querySelector('[data-igloo-scene]')?.getAttribute('aria-label') ?? ''}`
    })
    const name = await dialog(page).evaluate((el) => el.querySelector('[data-igloo-bubble] strong')?.textContent ?? '')
    const left = text.replaceAll(name, '')
    assert.ok(!CJK.test(left), `CJK found: ${left.match(/.{0,20}[㐀-鿿].{0,20}/)?.[0]}`)
    await shot(page, 'igloo-english-1440.png')
    return left.replace(/\s+/g, ' ').slice(0, 160)
  })
  await context.close()
}

// ─── 4) dark mode (read-only) ─────────────────────────────────────────────
{
  const context = await makeContext({ viewport: { width: 1440, height: 900 }, dark: true, readOnly: true, fixedTime: DAYTIME })
  const page = await context.newPage()
  await openApp(page)
  await step('dark mode screenshot', async () => {
    await openViaEvent(page)
    await waitReplayDone(page)
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    assert.ok(isDark, 'html.dark not set')
    return shot(page, 'igloo-dark-1440.png')
  })
  await context.close()
}

// ─── 5) away for 4 days (read-only, completion dates rewritten) ──────────
{
  const context = await makeContext({ viewport: { width: 390, height: 844 }, mobile: true, readOnly: true, awayDays: 4, fixedTime: DAYTIME })
  const page = await context.newPage()
  await openApp(page)
  await step('away 4 days → waiting penguin, gentle line, bricks all there', async () => {
    await openViaEvent(page)
    await waitReplayDone(page)
    const d = await readDialog(page)
    assert.equal(d.mood, 'waiting')
    assert.equal(d.today, 0)
    await page.evaluate(() => { for (const a of document.getAnimations()) a.pause() })
    await shot(page, 'igloo-waiting-390.png')
    return `mood=${d.mood}, today=${d.today}, total=${d.total}, bubble="${d.bubble}"`
  })
  await context.close()
}

await browser.close()
await sb.auth.signOut()
console.log('\n' + results.join('\n'))
console.log(`\n${results.length - failures}/${results.length} passed`)
process.exit(failures ? 1 : 0)
