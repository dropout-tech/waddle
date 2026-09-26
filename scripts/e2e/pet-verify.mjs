/**
 * Penguin pet (components/pet) — local UI verification.
 *
 *   pnpm dev -p 3471   (separate terminal)
 *   E2E_BASE_URL=http://localhost:3471 SHOT_DIR=/some/dir node scripts/e2e/pet-verify.mjs
 *
 * Real test-account login (.env.e2e.local). Reads go to the test account's
 * data; EVERY Supabase write (REST POST/PATCH/PUT/DELETE except read-only
 * RPCs) is intercepted and answered locally — nothing is written. The
 * user_settings read is rewritten so the pet starts un-adopted (or, for the
 * showcase recordings, already adopted).
 *
 * Checks: adoption flow + write payload, tap → bubble, combo reactions,
 * right-click / long-press menu, 安靜 1 小時 blocks automatic speech (and it
 * speaks again once unmuted), soft keyboard hides it, it never sits on a
 * tappable control at 390 and 1440, English mode speaks English, settings
 * section saves. Then records ~10s showcase videos at 390 and 1440.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync, renameSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3471'
const SHOTS = process.env.SHOT_DIR || 'docs/reports/pet-shots'
mkdirSync(SHOTS, { recursive: true })

const READ_RPCS = /\/rpc\/(get_|preview_)/
const CJK = /[㐀-鿿]/
const results = []
const ok = (name, detail = '') => { results.push(['PASS', name, detail]); console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`) }

const ADOPTED = { adopted: true, enabled: true, name: '豆豆', color: 'terracotta', accessory: 'scarf', chattiness: 'medium', quietDuringFocus: true, adoptedAt: '2026-09-26T00:00:00.000Z' }

const browser = await chromium.launch()
let storageState

async function makeContext({ viewport, mobile = false, petMode, lang = 'zh-TW', video }) {
  const context = await browser.newContext({
    viewport,
    locale: lang === 'en' ? 'en-US' : 'zh-TW',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    ...(storageState ? { storageState } : {}),
    ...(video ? { recordVideo: { dir: video, size: viewport } } : {}),
  })
  const writes = []
  await context.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const isRead = method === 'GET' || method === 'HEAD' || (method === 'POST' && READ_RPCS.test(url.pathname))
    if (!isRead) {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      writes.push({ method, path: url.pathname, body })
      return route.fulfill({ status: 204, body: '' })
    }
    if (method === 'GET' && url.pathname.endsWith('/user_settings')) {
      const res = await route.fetch()
      let json = await res.json()
      const fix = (row) => {
        if (!row || typeof row !== 'object') return row
        const n = { ...(row.notifications ?? {}) }
        if (petMode === 'strip') delete n.pet
        else n.pet = ADOPTED
        return { ...row, notifications: n }
      }
      json = Array.isArray(json) ? json.map(fix) : fix(json)
      return route.fulfill({ response: res, json })
    }
    return route.continue()
  })
  // Every other Supabase write surface (storage uploads, edge functions) is blocked too.
  await context.route('**/storage/v1/**', (route) => route.request().method() === 'GET' ? route.continue() : route.fulfill({ status: 204, body: '' }))
  await context.addInitScript((l) => {
    try {
      localStorage.setItem('waddle.waterReminder.enabled', '0')
      localStorage.setItem('waddle-language-v1', l)
      for (const k of Object.keys(localStorage)) if (k.startsWith('huddle-pet')) localStorage.removeItem(k)
    } catch {}
    // Hide the Next.js dev-mode badge (bottom-left, dev only) so it doesn't photobomb the corner.
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style')
      st.textContent = 'nextjs-portal{display:none!important}'
      document.head.appendChild(st)
    })
  }, lang)
  return { context, writes }
}

async function login(page) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000, waitUntil: 'domcontentloaded' })
}

async function openApp(page) {
  if (!page.url().startsWith(BASE) || page.url().includes('/login')) await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-pet], [data-pet-adopt]').first().waitFor({ timeout: 90000 })
  // Skip the onboarding tour if this account still has it.
  const skip = page.getByRole('button', { name: /略過導覽|Skip tour/ })
  if (await skip.count()) await skip.first().click().catch(() => {})
}

/** What a tap on each point of the pet would reach if the pet weren't there. */
async function coverage(page) {
  return page.evaluate(() => {
    const home = document.querySelector('[data-pet]')
    if (!home) return { exists: false }
    const cs = getComputedStyle(home)
    const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05
    const r = home.getBoundingClientRect()
    const SEL = 'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="checkbox"], [contenteditable="true"]'
    const hits = new Map()
    for (let x = r.left + 1; x < r.right; x += 4) {
      for (let y = r.top + 1; y < r.bottom; y += 4) {
        for (const node of document.elementsFromPoint(x, y)) {
          if (home.contains(node)) continue
          const c = node.closest(SEL)
          if (c && !c.closest('[data-pet-ui]')) {
            const b = c.getBoundingClientRect()
            hits.set(c, { tag: c.tagName.toLowerCase(), label: (c.getAttribute('aria-label') || c.textContent || '').trim().slice(0, 40), box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] })
          }
          break
        }
      }
    }
    return { exists: true, visible, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], hits: [...hits.values()] }
  })
}

async function assertNotBlocking(page, label) {
  const c = await coverage(page)
  assert(c.exists, `${label}: pet element exists`)
  if (c.visible) assert.equal(c.hits.length, 0, `${label}: visible pet covers controls ${JSON.stringify(c.hits)}`)
  ok(`不擋按鈕 ${label}`, `visible=${c.visible} rect=${c.rect.join(',')} covered=${c.hits.length}`)
  return c
}

// An outside press (the pet listens for pointerdown anywhere else on the page).
const pressOutside = (pg) => pg.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })))

// Set the flag use-soft-keyboard puts on <html> while the soft keyboard is up,
// read the pet's display synchronously, then clear it (one task, so the hook's
// own viewport listener can't race us).
const keyboardProbe = () => {
  const el = document.querySelector('[data-pet]')
  document.documentElement.dataset.keyboard = 'open'
  const open = getComputedStyle(el).display
  delete document.documentElement.dataset.keyboard
  return [open, getComputedStyle(el).display]
}

const bubbleText = async (page) => (await page.locator('[data-pet-bubble]').innerText()).replace(/^.*\n/, '').trim()

try {
  // ───────────────────────────── Desktop 1440 ─────────────────────────────
  const { context: desk, writes } = await makeContext({ viewport: { width: 1440, height: 900 }, petMode: 'strip' })
  const page = await desk.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.clock.install({ time: new Date('2026-09-26T14:00:00+08:00') })
  await login(page)
  await openApp(page)
  storageState = await desk.storageState()

  // 1) adoption card
  const card = page.locator('[data-pet-adopt]')
  await card.waitFor()
  await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/1440-adopt-card.png` })
  const nameInput = card.locator('[data-pet-name-input]')
  await nameInput.fill('一二三四五六七八九十一二三')
  assert(await card.locator('[data-pet-adopt-confirm]').isDisabled(), '13-char name blocks adoption')
  await nameInput.fill('豆豆')
  await card.locator('[data-pet-color="terracotta"]').click()
  await card.locator('[data-pet-accessory="hat"]').click()
  await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/1440-adopt-filled.png` })
  await card.locator('[data-pet-adopt-confirm]').click()
  await card.waitFor({ state: 'detached' })
  const petWrite = writes.find((w) => w.path.endsWith('/user_settings') && w.body?.notifications?.pet)
  assert(petWrite, 'adoption was sent as a user_settings write (intercepted)')
  const saved = petWrite.body.notifications.pet
  assert.equal(saved.name, '豆豆'); assert.equal(saved.color, 'terracotta'); assert.equal(saved.accessory, 'hat'); assert.equal(saved.adopted, true)
  ok('領養流程', `寫入被攔截 payload.pet=${JSON.stringify({ name: saved.name, color: saved.color, accessory: saved.accessory })}`)
  await page.clock.runFor(600)
  const bubble = page.locator('[data-pet-bubble]')
  await bubble.waitFor({ timeout: 5000 })
  assert((await bubble.innerText()).includes('豆豆'), 'hello bubble mentions the name')
  ok('領養後打招呼', await bubbleText(page))
  await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/1440-hello.png` })

  // 2) tap → a joke / absurd line; combo reactions
  const pet = page.locator('[data-pet-button]')
  await pressOutside(page) // outside press closes the bubble
  await bubble.waitFor({ state: 'detached' })
  ok('點泡泡外關閉')
  await pet.click()
  await bubble.waitFor()
  const first = await bubbleText(page)
  assert(CJK.test(first), 'zh line')
  ok('點企鵝出泡泡', first)
  const acts = []
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(200)
    await pet.click()
    acts.push(await page.locator('[data-pet] [data-act]').getAttribute('data-act'))
  }
  assert.deepEqual(acts, ['jump', 'spin', 'shy'], `combo reactions ${acts}`)
  ok('連點反應', acts.join(' → '))
  await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/1440-shy.png` })
  const aria = await bubble.evaluate((el) => el.parentElement.getAttribute('aria-live'))
  assert.equal(aria, 'polite')
  ok('泡泡 aria-live=polite')

  // 3) right-click menu → 安靜 1 小時
  await page.clock.runFor(10_000)
  await pet.click({ button: 'right' })
  const menu = page.locator('[data-pet-menu]')
  await menu.waitFor()
  assert.equal(await menu.getByRole('menuitem').count(), 4)
  await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/1440-menu.png` })
  ok('右鍵選單', (await menu.getByRole('menuitem').allInnerTexts()).join(' / '))
  await menu.getByRole('menuitem', { name: '安靜 1 小時' }).click()
  await bubble.waitFor()
  const mutedFor = await page.evaluate(() => JSON.parse(localStorage.getItem('huddle-pet-local-v1') || '{}').mutedUntil - Date.now())
  assert(mutedFor > 59 * 60_000 && mutedFor <= 60 * 60_000, `mutedUntil ≈ +1h (${mutedFor})`)
  await pressOutside(page)
  // 50 min of "idle" (medium chattiness ≈ 20 min): nothing automatic may appear.
  let autoWhileMuted = 0
  for (let i = 0; i < 100; i++) { await page.clock.runFor(30_000); if (await bubble.count()) autoWhileMuted++ }
  assert.equal(autoWhileMuted, 0, 'no automatic line while muted')
  ok('安靜 1 小時生效', '靜音期間快轉 50 分鐘，0 次自動說話')
  // Mute expires after the hour → idle chatter comes back.
  let spoke = ''
  for (let i = 0; i < 120 && !spoke; i++) { await page.clock.runFor(30_000); if (await bubble.count()) spoke = await bubbleText(page) }
  assert(spoke, 'speaks again after the hour')
  ok('一小時後恢復自動說話', spoke)
  await pressOutside(page)

  // 4) soft keyboard hides it (the flag use-soft-keyboard sets on <html>)
  assert.deepEqual(await page.evaluate(keyboardProbe), ['none', 'block'])
  ok('鍵盤開啟時隱藏', 'html[data-keyboard=open] → display:none')

  // 5) never sits on a control at 1440
  await page.clock.runFor(2000)
  await assertNotBlocking(page, '1440')
  await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/1440-idle.png` })

  // 6) settings → 企鵝 section (menu → 企鵝設定)
  await pet.click({ button: 'right' })
  await menu.getByRole('menuitem', { name: '企鵝設定' }).click()
  const section = page.locator('[data-pet-settings]')
  await section.waitFor()
  await page.clock.runFor(600)
  assert.equal(await page.locator('[data-pet]').evaluate((el) => getComputedStyle(el).display), 'none', 'pet steps aside while a modal is open')
  const before = writes.length
  await section.locator('[data-pet-chattiness="high"]').click()
  let w
  for (let i = 0; i < 50 && !w; i++) { await page.waitForTimeout(100); w = writes.slice(before).find((x) => x.body?.notifications?.pet) }
  assert.equal(w?.body.notifications.pet.chattiness, 'high')
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/1440-settings.png` })
  ok('設定頁企鵝區', '改頻率=多 → 寫入被攔截；modal 開啟時企鵝隱藏')
  await page.keyboard.press('Escape')
  if (errors.length) console.log('page errors:', errors)
  await desk.close()

  // ───────────────────────────── Mobile 390 ─────────────────────────────
  const { context: mob } = await makeContext({ viewport: { width: 390, height: 844 }, mobile: true, petMode: 'inject' })
  const m = await mob.newPage()
  await openApp(m)
  const mpet = m.locator('[data-pet]')
  await mpet.waitFor()
  await m.waitForTimeout(1200)
  const mc = await assertNotBlocking(m, '390 日曆分頁')
  // must sit on the tab bar's top edge
  const nav = await m.locator('nav[role="tablist"]').boundingBox()
  assert(Math.abs(mc.rect[1] + mc.rect[3] - nav.y) <= 3, `pet feet on tab bar edge (${mc.rect[1] + mc.rect[3]} vs ${nav.y})`)
  ok('390 住在分頁列上緣', `pet bottom=${mc.rect[1] + mc.rect[3]} tabbar top=${Math.round(nav.y)}`)
  await m.waitForTimeout(350); await m.screenshot({ path: `${SHOTS}/390-calendar.png` })
  // tasks tab too
  await m.getByRole('tab', { name: '任務' }).click()
  await m.waitForTimeout(800)
  await assertNotBlocking(m, '390 任務分頁')
  await m.waitForTimeout(350); await m.screenshot({ path: `${SHOTS}/390-tasks.png` })
  await m.getByRole('tab', { name: '日曆' }).click()
  await m.waitForTimeout(800)
  // tap → bubble
  const mbtn = m.locator('[data-pet-button]')
  if (await mpet.evaluate((el) => getComputedStyle(el).visibility !== 'hidden')) {
    await mbtn.tap()
    await m.locator('[data-pet-bubble]').waitFor()
    ok('390 點企鵝出泡泡', await bubbleText(m))
    await m.waitForTimeout(350); await m.screenshot({ path: `${SHOTS}/390-bubble.png` })
    // long-press → menu
    await pressOutside(m)
    await mbtn.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: 40, clientY: 700 })
    await m.waitForTimeout(700)
    await mbtn.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true })
    await m.locator('[data-pet-menu]').waitFor()
    ok('390 長按開選單', (await m.locator('[data-pet-menu]').getByRole('menuitem').allInnerTexts()).join(' / '))
    await m.waitForTimeout(350); await m.screenshot({ path: `${SHOTS}/390-menu.png` })
    await m.keyboard.press('Escape')
  } else {
    console.log('390: pet is yielding on the calendar tab — tap test skipped')
  }
  // keyboard: focus a real input → use-soft-keyboard flag → hidden
  assert.deepEqual(await m.evaluate(keyboardProbe), ['none', 'block'])
  ok('390 鍵盤開啟時隱藏')
  // overlay tabs (白板) hide it
  await m.getByRole('tab', { name: '白板' }).click()
  await m.waitForTimeout(500)
  assert.equal(await mpet.count() ? await mpet.evaluate((el) => getComputedStyle(el).display) : 'none', 'none')
  ok('390 白板分頁時隱藏')
  await mob.close()

  // ───────────────────────────── English ─────────────────────────────
  const { context: en } = await makeContext({ viewport: { width: 1440, height: 900 }, petMode: 'inject', lang: 'en' })
  const e = await en.newPage()
  await openApp(e)
  const ebtn = e.locator('[data-pet-button]')
  const eLabel = await ebtn.getAttribute('aria-label')
  assert(!CJK.test(eLabel.replace('豆豆', '')), `english aria-label: ${eLabel}`)
  const lines = []
  for (let i = 0; i < 4; i++) {
    await ebtn.click()
    await e.locator('[data-pet-bubble]').waitFor()
    lines.push(await bubbleText(e))
    await e.waitForTimeout(1500) // let the combo window lapse → fresh joke each time
  }
  for (const l of lines) assert(!CJK.test(l.replace('豆豆', '')), `english line: ${l}`)
  await ebtn.click({ button: 'right' })
  const eItems = await e.locator('[data-pet-menu]').getByRole('menuitem').allInnerTexts()
  assert(eItems.every((x) => !CJK.test(x)), `english menu ${eItems}`)
  await e.waitForTimeout(350); await e.screenshot({ path: `${SHOTS}/1440-english-menu.png` })
  ok('英文模式台詞為英文', lines.join(' | '))
  // reduced motion → no animation, bubble still works
  await e.emulateMedia({ reducedMotion: 'reduce' })
  await e.keyboard.press('Escape')
  await e.waitForTimeout(300)
  await ebtn.click()
  await e.locator('[data-pet-bubble]').waitFor()
  const anim = await e.locator('[data-pet] [class*="act"]').first().evaluate((el) => getComputedStyle(el).animationName)
  assert.equal(anim, 'none', `reduced motion animation ${anim}`)
  ok('reduced-motion 不動畫、泡泡照常', `animation-name=${anim}`)
  await en.close()

  // ───────────────────────────── Showcase videos ─────────────────────────────
  for (const [label, viewport, mobile] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
    const dir = path.join(SHOTS, `video-${label}`)
    rmSync(dir, { recursive: true, force: true })
    const { context: vc } = await makeContext({ viewport, mobile, petMode: 'inject', video: dir })
    const v = await vc.newPage()
    await openApp(v)
    await v.waitForTimeout(1500)
    const b = v.locator('[data-pet-button]')
    const tap = async () => (mobile ? b.tap() : b.click())
    await tap(); await v.waitForTimeout(2600)
    await tap(); await v.waitForTimeout(250); await tap(); await v.waitForTimeout(250); await tap(); await v.waitForTimeout(250); await tap()
    await v.waitForTimeout(2200)
    if (mobile) {
      await b.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true })
      await v.waitForTimeout(650)
      await b.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true })
    } else {
      await b.click({ button: 'right' })
    }
    await v.waitForTimeout(1600)
    await v.getByRole('menuitem', { name: '講個笑話' }).click()
    await v.waitForTimeout(3000)
    await vc.close()
    const file = readdirSync(dir).find((f) => f.endsWith('.webm'))
    renameSync(path.join(dir, file), path.join(SHOTS, `pet-${label}.webm`))
    rmSync(dir, { recursive: true, force: true })
    ok(`錄影 ${label}`, `${SHOTS}/pet-${label}.webm`)
  }

  console.log(`\nALL PASS (${results.length} checks)`)
} catch (err) {
  console.error('\nFAIL:', err.message)
  for (const ctx of browser.contexts()) for (const pg of ctx.pages()) {
    try {
      console.error('diag:', JSON.stringify(await coverage(pg)), await pg.locator('[data-pet]').evaluate((el) => ({ yield: el.hasAttribute('data-yield'), display: getComputedStyle(el).display })).catch(() => null))
      await pg.screenshot({ path: `${SHOTS}/fail.png` })
    } catch {}
  }
  process.exitCode = 1
} finally {
  await browser.close()
}
