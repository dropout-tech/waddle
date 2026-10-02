#!/usr/bin/env node
/* eslint-disable no-console -- executable UI verification */
/**
 * 丟給企鵝 — end-to-end UI check against a running dev server.
 *
 *   pnpm exec next dev -p 3101        # in another shell
 *   node scripts/e2e/brain-dump-verify.mjs
 *
 * Logs in with the e2e test account (.env.e2e.local), then for desktop
 * (1440) and phone (390): open the panel → type the spec example → check the
 * preview (4 notes, sane slots) → write to the calendar → see the tasks on
 * the calendar → English UI pass (no Chinese left in the panel chrome).
 * Every task it created is deleted at the end (the test account talks to
 * the production Supabase project) — and the script verifies 0 remain.
 *
 * Env: BASE_URL (default http://localhost:3101), SHOT_DIR.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3101'
const SHOT_DIR = process.env.SHOT_DIR || path.join(process.cwd(), '.e2e-shots', 'brain-dump')
mkdirSync(SHOT_DIR, { recursive: true })

function loadEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}
const env = { ...loadEnv('.env.local'), ...loadEnv('.env.e2e.local'), ...process.env }
const { E2E_EMAIL, E2E_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env
if (!E2E_EMAIL || !E2E_PASSWORD || !NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('[brain-dump] missing E2E_EMAIL / E2E_PASSWORD / Supabase URL+anon key')
  process.exit(1)
}

const EXAMPLE = '明天要回康庭的信、下午去銀行、週五前把報價改完 一小時、還有記得運動'
const EXAMPLE_EN = 'Reply to Kang Ting tomorrow, go to the bank this afternoon, finish the quote by Friday 1 hour, and also work out'
const TITLES = ['回康庭的信', '去銀行', '把報價改完', '運動']
const STARTED_AT = new Date(Date.now() - 60_000).toISOString()

let failures = 0
const pass = (label) => console.log('PASS', label)
const fail = (label, e) => {
  failures++
  console.log('FAIL', label, '—', e?.message ?? e)
}
async function step(label, fn) {
  try {
    await fn()
    pass(label)
  } catch (e) {
    fail(label, e)
  }
}
const shot = async (page, name) => {
  const file = path.join(SHOT_DIR, `${name}.png`)
  await page.screenshot({ path: file })
  console.log('   shot', file)
}
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
const localKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Read the preview notes straight from their data attributes. */
async function readNotes(page) {
  return page.$$eval('[data-bd-note]', (els) => els.map((el) => ({
    title: el.querySelector('button[aria-expanded] span')?.textContent ?? '',
    status: el.getAttribute('data-bd-status'),
    date: el.getAttribute('data-bd-date'),
    start: el.getAttribute('data-bd-start'),
    end: el.getAttribute('data-bd-end'),
  })))
}

function assertPreview(notes) {
  const now = new Date()
  const today = localKey(now)
  const tomorrow = localKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  assert.equal(notes.length, 4, `expected 4 notes, got ${notes.length}`)
  assert.deepEqual([...notes.map((n) => n.title)].sort(), [...TITLES].sort())
  const by = Object.fromEntries(notes.map((n) => [n.title, n]))
  const reply = by['回康庭的信']
  assert.equal(reply.status, 'pending', '回康庭的信 should wait in tomorrow’s pending zone')
  assert.equal(reply.date, tomorrow)
  const late = now.getHours() * 60 + now.getMinutes() > 21 * 60 + 30
  for (const n of notes.filter((x) => x.status === 'scheduled')) {
    assert.equal(n.date, today)
    assert.ok(toMin(n.start) >= now.getHours() * 60 + now.getMinutes() - 1, `${n.title} starts in the past`)
  }
  const bank = by['去銀行']
  if (bank.status === 'scheduled') {
    assert.ok(toMin(bank.start) >= 12 * 60 && toMin(bank.end) <= 18 * 60, `去銀行 not in the afternoon: ${bank.start}`)
  }
  const quote = by['把報價改完']
  if (quote.status === 'scheduled') assert.equal(toMin(quote.end) - toMin(quote.start), 60, '報價 should be 1 hour')
  if (!late) assert.ok(notes.some((n) => n.status === 'scheduled'), 'nothing scheduled today')
  const timed = notes.filter((n) => n.status === 'scheduled')
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j]
      assert.ok(!(toMin(a.start) < toMin(b.end) && toMin(a.end) > toMin(b.start)), `${a.title} overlaps ${b.title}`)
    }
  }
  return timed
}

async function noHorizontalOverflow(page) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  assert.ok(o.sw <= o.cw + 1, `horizontal overflow ${o.sw} > ${o.cw}`)
}

async function runPanel(page, label, { mobile, write }) {
  const dialog = page.getByRole('dialog').filter({ has: page.locator('[data-brain-dump-panel]') })
  await step(`${label}: open panel`, async () => {
    if (mobile) await page.locator('[data-tour="mobile-brain-dump"]').click()
    else await page.getByRole('button', { name: '丟給企鵝', exact: true }).click()
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
  })
  await step(`${label}: empty submit shows a gentle hint`, async () => {
    await page.locator('#brain-dump-text').fill('')
    await dialog.getByRole('button', { name: '交給企鵝' }).click()
    await dialog.getByText('先寫下幾件事，企鵝才有東西可以排。').waitFor({ timeout: 3000 })
  })
  let timed = []
  await step(`${label}: preview with 4 notes in sane slots`, async () => {
    await page.locator('#brain-dump-text').fill(EXAMPLE)
    await shot(page, `${label}-input`)
    await dialog.getByRole('button', { name: '交給企鵝' }).click()
    await dialog.getByText('企鵝在整理…').first().waitFor({ timeout: 3000 })
    await page.waitForTimeout(160)
    await page.$$eval('[data-bd-phase="thinking"] *', (els) => els.forEach((el) => { el.style.animationPlayState = 'paused' }))
    await shot(page, `${label}-thinking`)
    await page.$$eval('[data-bd-phase="thinking"] *', (els) => els.forEach((el) => { el.style.animationPlayState = 'running' }))
    await page.locator('[data-bd-phase="preview"]').waitFor({ timeout: 10000 })
    // Mid-flight frame: freeze the drop animation before shooting.
    await page.waitForTimeout(520)
    await page.$$eval('[data-bd-note], [data-bd-note] *', (els) => els.forEach((el) => { el.style.animationPlayState = 'paused' }))
    await shot(page, `${label}-preview-midflight`)
    await page.$$eval('[data-bd-note], [data-bd-note] *', (els) => els.forEach((el) => { el.style.animationPlayState = 'running' }))
    await page.waitForTimeout(2000)
    timed = assertPreview(await readNotes(page))
    // Every note has a ≥44px tick target; the category picker defaults to something.
    for (const b of await dialog.getByRole('checkbox').all()) {
      const box = await b.boundingBox()
      assert.ok(box.width >= 44 && box.height >= 44, `tick target ${box.width}x${box.height}`)
    }
    assert.ok(await dialog.locator('[data-bd-category]').inputValue(), 'no default category')
    // The category picker sits in the always-visible footer, fully on screen.
    const cat = await dialog.locator('[data-bd-category]').boundingBox()
    const vp = page.viewportSize()
    assert.ok(cat.y >= 0 && cat.y + cat.height <= vp.height && cat.x + cat.width <= vp.width, `category picker off screen ${JSON.stringify(cat)}`)
    await noHorizontalOverflow(page)
    await shot(page, `${label}-preview`)
  })
  await step(`${label}: untick + edit a note`, async () => {
    const box = dialog.getByRole('checkbox', { name: /不要這件：運動/ })
    await box.click()
    await dialog.getByRole('button', { name: /放進行事曆（3）/ }).waitFor({ timeout: 2000 })
    await dialog.getByRole('checkbox', { name: /要這件：運動/ }).click()
    await dialog.getByRole('button', { name: /放進行事曆（4）/ }).waitFor({ timeout: 2000 })
    await dialog.getByRole('button', { name: '調整「去銀行」' }).click()
    await dialog.locator('[data-bd-editor]').waitFor({ timeout: 2000 })
    await dialog.getByRole('button', { name: '完成', exact: true }).click()
  })
  if (!write) return
  await step(`${label}: write to calendar → toast → tasks visible`, async () => {
    await dialog.getByRole('button', { name: /放進行事曆（4）/ }).click()
    const expected = timed.length === 4 ? '企鵝排好了 4 件事' : `企鵝排好了 ${timed.length} 件，${4 - timed.length} 件放進待排`
    const toastEl = page.locator('[data-bd-toast]')
    await toastEl.getByText(expected).waitFor({ timeout: 15000 })
    await dialog.waitFor({ state: 'hidden', timeout: 5000 })
    // The new blocks glow once (data-bd-glow is set for the ~600ms animation).
    await page.waitForSelector('[data-task-block][data-bd-glow]', { timeout: 3000 })
    if (mobile) {
      const tb = await toastEl.boundingBox()
      for (const sel of ['[data-tour="mobile-add-task"]', '[data-tour="mobile-brain-dump"]']) {
        const fab = await page.locator(sel).boundingBox()
        if (fab) assert.ok(tb.y + tb.height <= fab.y + 1, `toast covers ${sel} (toast bottom ${tb.y + tb.height}, button top ${fab.y})`)
      }
    }
    await page.waitForTimeout(500)
    await shot(page, `${label}-after-write`)
    await page.waitForTimeout(1000)
    for (const n of timed) {
      const block = page.locator('[data-task-block]').filter({ hasText: n.title })
      assert.ok(await block.count() > 0, `calendar has no block for ${n.title}`)
    }
  })
}

/** States that are hard to reach naturally: unreadable input and late night (mocked clock). */
async function edgeStates(page, label) {
  const dialog = page.getByRole('dialog').filter({ has: page.locator('[data-brain-dump-panel]') })
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator(label === 'mobile' ? '[data-tour="mobile-brain-dump"]' : '[data-tour="brain-dump"]').waitFor({ timeout: 30000 })
  const open = async () => {
    if (label === 'mobile') await page.locator('[data-tour="mobile-brain-dump"]').click()
    else await page.getByRole('button', { name: '丟給企鵝', exact: true }).click()
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
  }
  await step(`${label}: unreadable input → gentle hint`, async () => {
    await open()
    await page.locator('#brain-dump-text').fill('一小時，，')
    await dialog.getByRole('button', { name: '交給企鵝' }).click()
    await dialog.getByText('企鵝讀不太懂這段').waitFor({ timeout: 5000 })
    await shot(page, `${label}-unparsed`)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  })
  await step(`${label}: late night → everything to tomorrow`, async () => {
    const d = new Date()
    await page.clock.setFixedTime(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21, 50))
    await open()
    await page.locator('#brain-dump-text').fill(EXAMPLE)
    await dialog.getByRole('button', { name: '交給企鵝' }).click()
    await page.locator('[data-bd-phase="preview"]').waitFor({ timeout: 10000 })
    await dialog.getByText('夜深了').waitFor({ timeout: 3000 })
    await page.waitForTimeout(2000)
    const notes = await readNotes(page)
    assert.ok(notes.every((n) => n.status === 'pending'), 'late night should schedule nothing today')
    await shot(page, `${label}-late`)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  })
}

async function englishPass(page, label, { mobile }) {
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  const dialog = page.getByRole('dialog').filter({ has: page.locator('[data-brain-dump-panel]') })
  await step(`${label}: English panel has no leftover Chinese`, async () => {
    if (mobile) await page.locator('[data-tour="mobile-brain-dump"]').click({ timeout: 30000 })
    else await page.getByRole('button', { name: 'Toss it to the penguin', exact: true }).click({ timeout: 30000 })
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
    await dialog.getByRole('button', { name: 'Use an example' }).click()
    assert.equal(await page.locator('#brain-dump-text').inputValue(), EXAMPLE_EN)
    await dialog.getByRole('button', { name: 'Hand it over' }).click()
    await page.locator('[data-bd-phase="preview"]').waitFor({ timeout: 10000 })
    await page.waitForTimeout(1900)
    const notes = await readNotes(page)
    assert.equal(notes.length, 4, `expected 4 English notes, got ${notes.length}`)
    // Existing calendar entries on the timeline are the user's own titles
    // (not UI chrome) — leave them out of the leftover-Chinese check.
    const text = await dialog.evaluate((el) => {
      const copy = el.cloneNode(true)
      copy.querySelectorAll('[data-bd-busy], [data-bd-category]').forEach((n) => n.remove())
      document.body.appendChild(copy)
      copy.style.position = 'fixed'
      copy.style.left = '-9999px'
      const out = copy.innerText
      copy.remove()
      return out
    })
    const cjk = text.match(/[㐀-鿿　-〿！-｠]+/g)
    assert.equal(cjk, null, `Chinese left in English UI: ${JSON.stringify(cjk)}`)
    await noHorizontalOverflow(page)
    await shot(page, `${label}-english`)
    await page.keyboard.press('Escape')
  })
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
}

async function cleanup() {
  const sb = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: E2E_EMAIL, password: E2E_PASSWORD })
  if (authErr) throw authErr
  const uid = auth.user.id
  const { data: rows, error } = await sb.from('tasks').select('id,title,created_at')
    .eq('user_id', uid).in('title', TITLES).gte('created_at', STARTED_AT)
  if (error) throw error
  if (rows.length) {
    const { error: delErr } = await sb.from('tasks').delete().in('id', rows.map((r) => r.id)).eq('user_id', uid)
    if (delErr) throw delErr
  }
  const { data: left } = await sb.from('tasks').select('id').eq('user_id', uid).in('title', TITLES).gte('created_at', STARTED_AT)
  console.log(`cleanup: deleted ${rows.length} test task(s); remaining ${left?.length ?? '?'}`)
  assert.equal(left?.length, 0, 'test tasks left behind')
  await sb.auth.signOut()
}

const browser = await chromium.launch()
try {
  // ── desktop 1440 ──
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' })
  const page = await desktop.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await step('login', async () => {
    await page.goto(`${BASE_URL}/login?method=email`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
    await page.locator('#email').fill(E2E_EMAIL)
    await page.locator('#password').fill(E2E_PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 30000 })
    await page.getByRole('button', { name: '日檢視' }).waitFor({ state: 'visible', timeout: 30000 })
    await page.getByRole('button', { name: '日檢視' }).click()
  })
  await step('desktop: P shortcut opens the panel', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await page.keyboard.press('Escape')
    await page.keyboard.press('p')
    await page.locator('#brain-dump-text').waitFor({ state: 'visible', timeout: 5000 })
    await page.keyboard.press('Escape')
    await page.locator('#brain-dump-text').waitFor({ state: 'hidden', timeout: 5000 })
  })
  await runPanel(page, 'desktop', { mobile: false, write: true })

  await step('desktop: dark mode preview', async () => {
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.getByRole('button', { name: '丟給企鵝', exact: true }).click()
    await page.locator('#brain-dump-text').fill(EXAMPLE)
    await page.getByRole('button', { name: '交給企鵝' }).click()
    await page.locator('[data-bd-phase="preview"]').waitFor({ timeout: 10000 })
    await page.waitForTimeout(1900)
    await shot(page, 'desktop-preview-dark')
    await page.keyboard.press('Escape')
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
  })
  await englishPass(page, 'desktop', { mobile: false })
  const state = await desktop.storageState()
  await edgeStates(page, 'desktop')

  // ── phone 390 ──
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'zh-TW', isMobile: true, hasTouch: true, deviceScaleFactor: 2, storageState: state,
  })
  const m = await phone.newPage()
  m.on('pageerror', (e) => pageErrors.push(e.message))
  await step('mobile: app loads', async () => {
    await m.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await m.locator('[data-tour="mobile-brain-dump"]').waitFor({ state: 'visible', timeout: 30000 })
    const box = await m.locator('[data-tour="mobile-brain-dump"]').boundingBox()
    assert.ok(box.width >= 44 && box.height >= 44, `FAB too small ${box.width}x${box.height}`)
  })
  await step('mobile: floating buttons do not crowd each other', async () => {
    const boxes = []
    for (const sel of ['[data-tour="mobile-brain-dump"]', '[data-tour="mobile-add-task"]']) boxes.push(await m.locator(sel).boundingBox())
    const timer = m.getByText('專注計時').first()
    if (await timer.count()) boxes.push(await timer.boundingBox())
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        const gap = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height))
        assert.ok(gap >= 8 || a.x + a.width < b.x || b.x + b.width < a.x, `floating buttons ${i}/${j} only ${gap}px apart`)
      }
    }
    await shot(m, 'mobile-fabs')
  })
  await runPanel(m, 'mobile', { mobile: true, write: true })
  await englishPass(m, 'mobile', { mobile: true })
  await edgeStates(m, 'mobile')

  await step('no uncaught page errors', async () => {
    assert.deepEqual(pageErrors, [])
  })
} finally {
  await browser.close()
  await step('cleanup test tasks', cleanup)
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nALL CHECKS PASSED')
process.exit(failures ? 1 : 0)
