#!/usr/bin/env node
/* eslint-disable no-console -- executable UI verification */
/**
 * 丟給企鵝 (AI split → 未分類 inbox) — end-to-end UI check.
 *
 *   pnpm exec next dev -p 3101        # in another shell
 *   node scripts/e2e/brain-dump-verify.mjs                        # AI mocked (page.route)
 *   BRAIN_DUMP_REAL_AI=1 node scripts/e2e/brain-dump-verify.mjs   # after deploy: real Edge Function
 *
 * Mocked mode intercepts `functions/v1/brain-dump` and checks the UI flow:
 * preview, untick, edit, write into 未分類 (due dates and notes read back
 * from the database), a failed insert kept for retry, the daily-limit and
 * AI-down fallbacks, unreadable input, English, dark mode, phone layout.
 * Real mode (BRAIN_DUMP_REAL_AI=1) skips the mocks and checks that the real
 * AI splits the example into sensible to-dos with resolved due dates, then
 * writes them.
 * Every task it created is deleted at the end (the e2e account talks to the
 * production Supabase project) — and the script verifies none remain.
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
const REAL_AI = process.env.BRAIN_DUMP_REAL_AI === '1'
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
const STARTED_AT = new Date(Date.now() - 60_000).toISOString()
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const NOW = new Date()
const TODAY = key(NOW)
const plus = (n) => key(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n))
// What the mocked AI answers (dates are already resolved by the server).
const MOCK_ZH = [
  { title: '回康庭的信', dueDate: plus(1), note: '' },
  { title: '去銀行', dueDate: TODAY, note: '記得帶存摺' },
  { title: '把報價改完', dueDate: plus(6), note: '大約一小時' },
  { title: '運動', dueDate: '', note: '' },
]
const MOCK_EN = [
  { title: 'Reply to Kang Ting', dueDate: plus(1), note: '' },
  { title: 'Go to the bank', dueDate: TODAY, note: '' },
  { title: 'Finish the quote', dueDate: plus(6), note: 'About an hour' },
  { title: 'Work out', dueDate: '', note: '' },
]
const EDITED = '去銀行存款'
// Everything a run may write — the cleanup deletes these (created after STARTED_AT).
const CLEAN_TITLES = [...MOCK_ZH.map((x) => x.title), EDITED, ...MOCK_EN.map((x) => x.title)]

let failures = 0
async function step(label, fn) {
  try {
    await fn()
    console.log('PASS', label)
  } catch (e) {
    failures++
    console.log('FAIL', label, '—', e?.message ?? e)
  }
}
const shot = async (page, name) => {
  const file = path.join(SHOT_DIR, `${name}.png`)
  await page.screenshot({ path: file })
  console.log('   shot', file)
}

/** AI mock: state.mode 'ok' | 'limit' | 'down' | 'empty'. */
async function mockAi(page, state) {
  if (REAL_AI) return
  await page.route('**/functions/v1/brain-dump', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const body = JSON.parse(route.request().postData() || '{}')
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (body.action === 'status') {
      if (state.mode === 'down') return json(503, { error: 'DATABASE_ERROR' })
      return json(200, state.mode === 'limit' ? { used: 20, limit: 20, remaining: 0, enabled: true } : { used: 3, limit: 20, remaining: 17, enabled: true })
    }
    state.lastBody = body
    if (state.mode === 'limit') return json(429, { error: 'DAILY_LIMIT', limit: 20 })
    if (state.mode === 'down') return json(502, { error: 'GENERATION_FAILED' })
    if (state.mode === 'empty') return json(200, { items: [], used: 4, limit: 20, remaining: 16 })
    return json(200, { items: body.lang === 'en' ? MOCK_EN : MOCK_ZH, used: 4, limit: 20, remaining: 16 })
  })
}

const readNotes = (page) => page.$$eval('[data-bd-note]', (els) => els.map((el) => ({
  title: el.querySelector('[data-bd-title]')?.textContent ?? '',
  due: el.getAttribute('data-bd-due') ?? '',
  failed: el.hasAttribute('data-bd-failed'),
})))

async function noHorizontalOverflow(page) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  assert.ok(o.sw <= o.cw + 1, `horizontal overflow ${o.sw} > ${o.cw}`)
}

const panel = (page) => page.getByRole('dialog').filter({ has: page.locator('[data-brain-dump-panel]') })
async function openPanel(page, mobile) {
  if (mobile) await page.locator('[data-tour="mobile-brain-dump"]').click({ timeout: 30000 })
  else await page.locator('[data-tour="brain-dump"]').click({ timeout: 30000 })
  await panel(page).waitFor({ state: 'visible', timeout: 10000 })
}
async function submitText(page, text) {
  await page.locator('#brain-dump-text').fill(text)
  await panel(page).getByRole('button', { name: /交給企鵝|Hand it over/ }).click()
}
async function closePanel(page) {
  await page.keyboard.press('Escape')
  await panel(page).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
}

async function sb() {
  const client = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: E2E_EMAIL, password: E2E_PASSWORD })
  if (error) throw error
  return { client, uid: data.user.id }
}
// scope 'local': a global sign-out would also end the browser's session.
const signOut = (client) => client.auth.signOut({ scope: 'local' })

async function runMain(page, label, { mobile, failThird, state }) {
  const dialog = panel(page)
  await step(`${label}: open panel + empty submit hint + disclosure / quota line`, async () => {
    await openPanel(page, mobile)
    await page.locator('#brain-dump-text').fill('')
    await dialog.getByRole('button', { name: '交給企鵝' }).click()
    await dialog.getByText('先寫下幾件事，企鵝才有東西可以排。').waitFor({ timeout: 3000 })
    if (!REAL_AI) await dialog.locator('[data-bd-quota]').getByText('今天還能用 AI 整理 17 次').waitFor({ timeout: 5000 })
    await dialog.locator('[data-bd-disclosure]').getByText(/OpenAI/).waitFor({ timeout: 2000 })
  })
  let notes = []
  await step(`${label}: AI split → preview notes with resolved due dates`, async () => {
    state.mode = 'ok'
    await page.locator('#brain-dump-text').fill(EXAMPLE)
    await shot(page, `${label}-input`)
    await dialog.getByRole('button', { name: '交給企鵝' }).click()
    await dialog.getByText('企鵝在整理…').first().waitFor({ timeout: 3000 })
    await page.waitForTimeout(160)
    await page.$$eval('[data-bd-phase="thinking"] *', (els) => els.forEach((el) => { el.style.animationPlayState = 'paused' }))
    await shot(page, `${label}-thinking`)
    await page.$$eval('[data-bd-phase="thinking"] *', (els) => els.forEach((el) => { el.style.animationPlayState = 'running' }))
    await page.locator('[data-bd-phase="preview"]').waitFor({ timeout: 40000 })
    if (!REAL_AI) {
      assert.equal(state.lastBody.today, TODAY, 'client must send its local today')
      assert.equal(state.lastBody.lang, 'zh-TW')
    }
    await page.waitForTimeout(520)
    await page.$$eval('[data-bd-note], [data-bd-note] *', (els) => els.forEach((el) => { el.style.animationPlayState = 'paused' }))
    await shot(page, `${label}-preview-midflight`)
    await page.$$eval('[data-bd-note], [data-bd-note] *', (els) => els.forEach((el) => { el.style.animationPlayState = 'running' }))
    await page.waitForTimeout(1600)
    notes = await readNotes(page)
    if (REAL_AI) {
      assert.ok(notes.length >= 3 && notes.length <= 6, `real AI gave ${notes.length} notes: ${JSON.stringify(notes)}`)
      const reply = notes.find((n) => n.title.includes('康庭'))
      assert.ok(reply && reply.due === plus(1), `康庭 should be due tomorrow: ${JSON.stringify(notes)}`)
      assert.ok(notes.some((n) => n.title.includes('報價') && n.due && n.due >= TODAY), 'quote has a due date')
      assert.equal(await dialog.locator('[data-bd-notice]').count(), 0, 'real AI should not fall back')
    } else {
      assert.deepEqual(notes.map((n) => [n.title, n.due]), MOCK_ZH.map((x) => [x.title, x.dueDate]))
      assert.equal(await dialog.locator('[data-bd-notice]').count(), 0, 'no fallback notice on AI success')
    }
    for (const b of await dialog.getByRole('checkbox').all()) {
      const box = await b.boundingBox()
      assert.ok(box.width >= 44 && box.height >= 44, `tick target ${box.width}x${box.height}`)
    }
    await dialog.locator('[data-bd-inbox]').waitFor()
    await noHorizontalOverflow(page)
    await shot(page, `${label}-preview`)
  })
  if (REAL_AI) {
    await step(`${label}: real AI → write into 未分類`, async () => {
      CLEAN_TITLES.push(...notes.map((n) => n.title))
      await dialog.getByRole('button', { name: /放進排程/ }).click()
      await dialog.waitFor({ state: 'hidden', timeout: 15000 })
      await shot(page, `${label}-real-ai-after-write`)
    })
    return
  }
  await step(`${label}: untick, re-tick, edit title + due date`, async () => {
    await dialog.getByRole('checkbox', { name: /不要這件：運動/ }).click()
    await dialog.getByRole('button', { name: /放進排程（3）/ }).waitFor({ timeout: 2000 })
    await dialog.getByRole('checkbox', { name: /要這件：運動/ }).click()
    await dialog.getByRole('button', { name: /放進排程（4）/ }).waitFor({ timeout: 2000 })
    await dialog.getByRole('button', { name: '調整「去銀行」' }).click()
    await dialog.locator('[data-bd-edit-title]').fill(EDITED)
    await dialog.locator('[data-bd-edit-due]').fill(plus(2))
    await dialog.getByRole('button', { name: '完成', exact: true }).click()
    const edited = (await readNotes(page)).find((n) => n.title === EDITED)
    assert.equal(edited?.due, plus(2))
  })
  const expected = [
    [MOCK_ZH[0].title, MOCK_ZH[0].dueDate, null],
    [EDITED, plus(2), '記得帶存摺'],
    [MOCK_ZH[2].title, MOCK_ZH[2].dueDate, '大約一小時'],
    [MOCK_ZH[3].title, null, null],
  ]
  if (failThird) {
    await step(`${label}: 3rd insert fails → others written, failed note kept for retry`, async () => {
      let posts = 0
      await page.route('**/rest/v1/tasks*', async (route) => {
        if (route.request().method() === 'POST' && ++posts === 3) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'e2e: simulated outage', code: 'E2E' }) })
        } else await route.continue()
      })
      await dialog.getByRole('button', { name: /放進排程（4）/ }).click()
      await dialog.getByRole('button', { name: '再試一次（1）' }).waitFor({ timeout: 15000 })
      await dialog.getByText('已放進 3 件；還有 1 件沒放成功').waitFor({ timeout: 3000 })
      const left = await readNotes(page)
      assert.equal(left.length, 1, 'only the failed note should remain')
      assert.ok(left[0].failed, 'failed note not marked')
      await shot(page, `${label}-retry`)
      await page.unroute('**/rest/v1/tasks*')
      await dialog.getByRole('button', { name: '再試一次（1）' }).click()
    })
  } else {
    await step(`${label}: write`, async () => {
      await dialog.getByRole('button', { name: /放進排程（4）/ }).click()
    })
  }
  await step(`${label}: notes slide into the inbox → toast → saved in 未分類 with due dates`, async () => {
    await page.waitForTimeout(250)
    await shot(page, `${label}-stowing`)
    await dialog.waitFor({ state: 'hidden', timeout: 15000 })
    const toastEl = page.locator('[data-bd-toast]').last()
    await toastEl.getByText(/企鵝把 \d 件放進「未分類」/).waitFor({ timeout: 5000 })
    if (mobile) {
      const tb = await toastEl.boundingBox()
      for (const sel of ['[data-tour="mobile-add-task"]', '[data-tour="mobile-brain-dump"]']) {
        const fab = await page.locator(sel).boundingBox()
        if (fab) assert.ok(tb.y + tb.height <= fab.y + 1, `toast covers ${sel}`)
      }
    }
    await shot(page, `${label}-after-write`)
    const { client, uid } = await sb()
    const { data: rows, error } = await client.from('tasks')
      .select('title,due_date,notes,scheduled_date,scheduled_start_time,category_id,categories(name)')
      .eq('user_id', uid).in('title', expected.map((e) => e[0])).gte('created_at', STARTED_AT)
      .order('created_at', { ascending: false })
    if (error) throw error
    for (const [title, due, note] of expected) {
      const row = rows.find((r) => r.title === title)
      assert.ok(row, `no saved task ${title}`)
      assert.equal(row.due_date, due, `${title} due_date`)
      assert.equal(row.notes ?? null, note, `${title} notes`)
      assert.equal(row.scheduled_date, null, `${title} must not be scheduled`)
      assert.equal(row.scheduled_start_time, null)
      assert.equal(row.categories?.name, '未分類', `${title} category ${row.categories?.name}`)
    }
    await signOut(client)
  })
}

async function fallbacks(page, label, { mobile, state }) {
  if (REAL_AI) return
  const dialog = panel(page)
  await step(`${label}: daily limit → gentle notice + simple splitter`, async () => {
    state.mode = 'limit'
    await openPanel(page, mobile)
    await dialog.locator('[data-bd-quota]').getByText('今天的 AI 整理用完了').waitFor({ timeout: 5000 })
    await submitText(page, EXAMPLE)
    await page.locator('[data-bd-phase="preview"]').waitFor({ timeout: 10000 })
    await dialog.locator('[data-bd-notice]').getByText('今天的 AI 整理用完了（每天 20 次）').waitFor({ timeout: 3000 })
    await page.waitForTimeout(1500)
    const notes = await readNotes(page)
    assert.equal(notes.length, 4, 'local fallback should still split the example')
    assert.ok(notes.find((n) => n.title === '回康庭的信')?.due === plus(1), 'local fallback: 明天 → due tomorrow')
    await shot(page, `${label}-limit`)
    await closePanel(page)
  })
  await step(`${label}: AI unreachable → "企鵝連不上 AI" + simple splitter`, async () => {
    state.mode = 'down'
    await openPanel(page, mobile)
    await submitText(page, EXAMPLE)
    await page.locator('[data-bd-phase="preview"]').waitFor({ timeout: 10000 })
    await dialog.locator('[data-bd-notice]').getByText('企鵝連不上 AI，先用簡單拆法。').waitFor({ timeout: 3000 })
    await page.waitForTimeout(1500)
    await shot(page, `${label}-ai-down`)
    await closePanel(page)
  })
  await step(`${label}: nothing to do → unreadable hint`, async () => {
    state.mode = 'empty'
    await openPanel(page, mobile)
    await submitText(page, '嗯……')
    await dialog.getByText('企鵝讀不太懂這段').waitFor({ timeout: 8000 })
    await shot(page, `${label}-unparsed`)
    await closePanel(page)
  })
  state.mode = 'ok'
}

async function englishPass(page, label, { mobile, state }) {
  if (REAL_AI) return
  state.mode = 'ok'
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  const dialog = panel(page)
  await step(`${label}: English panel has no leftover Chinese`, async () => {
    await openPanel(page, mobile)
    await dialog.getByRole('button', { name: 'Use an example' }).click()
    await dialog.getByRole('button', { name: 'Hand it over' }).click()
    await page.locator('[data-bd-phase="preview"]').waitFor({ timeout: 10000 })
    assert.equal(state.lastBody.lang, 'en')
    await page.waitForTimeout(1600)
    const notes = await readNotes(page)
    assert.deepEqual(notes.map((n) => n.title), MOCK_EN.map((x) => x.title))
    const text = await dialog.innerText()
    const cjk = text.match(/[㐀-鿿　-〿！-｠]+/g)
    assert.equal(cjk, null, `Chinese left in English UI: ${JSON.stringify(cjk)}`)
    await noHorizontalOverflow(page)
    await shot(page, `${label}-english`)
    await closePanel(page)
  })
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
  await page.reload({ waitUntil: 'domcontentloaded' })
}

async function cleanup() {
  const { client, uid } = await sb()
  const titles = [...new Set(CLEAN_TITLES)]
  const { data: rows, error } = await client.from('tasks').select('id').eq('user_id', uid).in('title', titles).gte('created_at', STARTED_AT)
  if (error) throw error
  if (rows.length) {
    const { error: delErr } = await client.from('tasks').delete().in('id', rows.map((r) => r.id)).eq('user_id', uid)
    if (delErr) throw delErr
  }
  const { data: left } = await client.from('tasks').select('id').eq('user_id', uid).in('title', titles).gte('created_at', STARTED_AT)
  console.log(`cleanup: deleted ${rows.length} test task(s); remaining ${left?.length ?? '?'}`)
  assert.equal(left?.length, 0, 'test tasks left behind')
  await signOut(client)
}

const browser = await chromium.launch()
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' })
  const page = await desktop.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  const dState = { mode: 'ok' }
  await mockAi(page, dState)
  await step('login', async () => {
    await page.goto(`${BASE_URL}/login?method=email`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))
    await page.locator('#email').fill(E2E_EMAIL)
    await page.locator('#password').fill(E2E_PASSWORD)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL(`${BASE_URL}/`, { timeout: 30000 })
    await page.locator('[data-tour="brain-dump"]').waitFor({ state: 'visible', timeout: 30000 })
  })
  await step('desktop: P shortcut opens the panel', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await page.keyboard.press('Escape')
    await page.keyboard.press('p')
    await page.locator('#brain-dump-text').waitFor({ state: 'visible', timeout: 5000 })
    await closePanel(page)
  })
  await runMain(page, 'desktop', { mobile: false, failThird: !REAL_AI, state: dState })
  if (!REAL_AI) {
    await step('desktop: dark mode preview', async () => {
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      await openPanel(page, false)
      await submitText(page, EXAMPLE)
      await page.locator('[data-bd-phase="preview"]').waitFor({ timeout: 10000 })
      await page.waitForTimeout(1600)
      await shot(page, 'desktop-preview-dark')
      await closePanel(page)
      await page.evaluate(() => document.documentElement.classList.remove('dark'))
    })
  }
  await fallbacks(page, 'desktop', { mobile: false, state: dState })
  await englishPass(page, 'desktop', { mobile: false, state: dState })
  const storage = await desktop.storageState()

  if (!REAL_AI) {
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 }, locale: 'zh-TW', isMobile: true, hasTouch: true, deviceScaleFactor: 2, storageState: storage,
    })
    const m = await phone.newPage()
    m.on('pageerror', (e) => pageErrors.push(e.message))
    const mState = { mode: 'ok' }
    await mockAi(m, mState)
    await step('mobile: app loads, FAB ≥44pt', async () => {
      await m.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
      await m.locator('[data-tour="mobile-brain-dump"]').waitFor({ state: 'visible', timeout: 30000 })
      const box = await m.locator('[data-tour="mobile-brain-dump"]').boundingBox()
      assert.ok(box.width >= 44 && box.height >= 44)
    })
    await runMain(m, 'mobile', { mobile: true, failThird: false, state: mState })
    await fallbacks(m, 'mobile', { mobile: true, state: mState })
    await englishPass(m, 'mobile', { mobile: true, state: mState })
  }
  await step('no uncaught page errors', async () => {
    assert.deepEqual(pageErrors, [])
  })
} finally {
  await browser.close()
  await step('cleanup test tasks', cleanup)
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nALL CHECKS PASSED')
process.exit(failures ? 1 : 0)
