#!/usr/bin/env node
/**
 * Deterministic real-browser check of the three "never lose data" fixes
 * (PR fix/131-residual-risks):
 *   S1  drafts of a notebook that was CLOSED while offline are re-sent when
 *       the connection returns (without reopening the notebook)
 *   S2  sign-out asks first when sticky-note text could not be saved
 *   S3  sign-out asks first when a closed notebook's draft could not be sent
 *
 * Run (server must already be listening, `next start` on 3397):
 *   node scripts/e2e/residual-risks-verify.mjs
 *   BASE_URL=http://localhost:3397 node scripts/e2e/residual-risks-verify.mjs
 *
 * Output is the evidence: one `PASS <name>` / `FAIL <name>: <why>` per
 * scenario, then `ALL PASSED` or `FAILED n`. Exit code 0 / 1.
 *
 * SAFETY: runs against whatever database the app points at (the real one).
 * It creates its own throw-away accounts (audit-20261002-residual-<n>@example.com),
 * only ever reads/writes rows of those accounts, never sends mail, and deletes
 * the accounts (and their rows) in `finally`. No key or password is printed.
 */
import { readFileSync, existsSync } from 'node:fs'
import crypto from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL || process.env.E2E_BASE_URL || 'http://localhost:3397'
const ADMIN_ENV =
  process.env.E2E_ADMIN_ENV ||
  '/Users/lazylazy/Desktop/琢奧科技/v0-task-management-ui/.env.admin.local'
const DRAFT_PREFIX = 'huddle:notebook-draft:'

// ── env / admin helpers ────────────────────────────────────────────────
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
const env = loadEnvFile(ADMIN_ENV)
const SB_URL = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!SB_URL || !SB_KEY) {
  console.log('FAIL setup: admin env missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  console.log('FAILED 1')
  process.exit(1)
}
const adminHeaders = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }

async function adminCreateUser(n) {
  const email = `audit-20261002-residual-${n}@example.com`
  const password = crypto.randomBytes(12).toString('base64url') + 'aA1!'
  const create = () =>
    fetch(SB_URL + '/auth/v1/admin/users', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true }),
    })
  let r = await create()
  if (r.status === 422) {
    // leftover of an earlier aborted run of THIS script: remove exactly that email, retry once
    const stale = await findUserIdByEmail(email)
    if (stale) {
      await adminDeleteUser(stale)
      r = await create()
    }
  }
  const j = await r.json()
  if (!j.id) throw new Error(`create user ${n} failed: HTTP ${r.status}`)
  // user_settings row is created by a DB trigger a moment later; mark the tour as done
  let patched = false
  for (let i = 0; i < 10 && !patched; i++) {
    await sleep(1000)
    const r2 = await fetch(`${SB_URL}/rest/v1/user_settings?user_id=eq.${j.id}`, {
      method: 'PATCH',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ onboarding_completed: true }),
    })
    const rows = r2.ok ? await r2.json() : []
    patched = Array.isArray(rows) && rows.length > 0
  }
  if (!patched) throw new Error(`user_settings row never appeared for account ${n}`)
  return { n, id: j.id, email, password }
}

async function findUserIdByEmail(email) {
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`${SB_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: adminHeaders })
    if (!r.ok) return null
    const j = await r.json()
    const hit = (j.users || []).find((u) => u.email === email)
    if (hit) return hit.id
    if (!j.users || j.users.length < 1000) return null
  }
  return null
}

async function adminDeleteUser(id) {
  // own rows first (in case FKs don't cascade), then the account
  for (const t of ['notebook_notes', 'sticky_notes']) {
    await fetch(`${SB_URL}/rest/v1/${t}?user_id=eq.${id}`, { method: 'DELETE', headers: adminHeaders }).catch(() => {})
  }
  const r = await fetch(`${SB_URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: adminHeaders })
  return r.ok
}

async function rowsOf(table, userId) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?user_id=eq.${userId}&select=id,content`, { headers: adminHeaders })
  if (!r.ok) throw new Error(`REST ${table} -> HTTP ${r.status}`)
  return r.json()
}
async function serverHas(table, userId, needle) {
  return JSON.stringify(await rowsOf(table, userId)).includes(needle)
}
async function waitServerHas(table, userId, needle, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await serverHas(table, userId, needle).catch(() => false)) return true
    await sleep(500)
  }
  return false
}

// ── browser helpers ────────────────────────────────────────────────────
const pageErrors = []
let lastPage = null
let lastCtx = null

async function newSession(browser, acct, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW' })
  const page = await context.newPage()
  lastPage = page
  lastCtx = context
  page.on('pageerror', (e) => pageErrors.push(`[${label}] ${e.message}`))
  return { context, page }
}

async function login(page, acct) {
  await page.goto(`${BASE_URL}/login?method=email`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor({ state: 'visible', timeout: 60000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let i = 0; i < 5; i++) {
    await page.locator('#email').fill(acct.email)
    await page.locator('#password').fill(acct.password)
    if ((await page.locator('#email').inputValue()) === acct.email &&
        (await page.locator('#password').inputValue()) === acct.password) break
    await sleep(600)
  }
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 60000 })
  await page.locator('[data-tour="user-menu"]').waitFor({ state: 'visible', timeout: 30000 })
  await sleep(1000)
}

/** Safety: the browser must be talking to the same database the admin key belongs to. */
async function assertSameDatabase(page) {
  const host = new URL(SB_URL).host
  const seen = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name))
  const sb = seen.filter((u) => u.includes('/auth/v1/') || u.includes('/rest/v1/'))
  if (!sb.length) throw new Error('could not observe any Supabase request to verify the database identity')
  const bad = sb.filter((u) => new URL(u).host !== host)
  if (bad.length) throw new Error(`app talks to a different Supabase host than the admin key (${new URL(bad[0]).host})`)
}

const draftKeys = (page, userId) =>
  page.evaluate(
    ([prefix, uid]) => Object.keys(localStorage).filter((k) => k.startsWith(prefix + uid + ':')),
    [DRAFT_PREFIX, userId],
  )

async function openNotebook(page) {
  await page.locator('[data-tour="notebook-entry"]:visible').first().click()
  const dialog = page.locator('[role="dialog"][aria-label="記事本"]')
  await dialog.waitFor({ state: 'visible', timeout: 15000 })
  await sleep(1000)
  return dialog
}
async function closeNotebook(page) {
  const dialog = page.locator('[role="dialog"][aria-label="記事本"]')
  await dialog.getByRole('button', { name: '關閉' }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 5000 })
}

/** Open the notebook, create one note, type `text`, wait until the server has it. */
async function createNoteWithBase(page, acct) {
  const dialog = await openNotebook(page)
  if ((await dialog.locator('.ProseMirror').count()) === 0) {
    await dialog.getByRole('button', { name: '新增記事' }).first().click()
  }
  const editor = dialog.locator('.ProseMirror').first()
  await editor.waitFor({ state: 'visible', timeout: 10000 })
  await editor.click()
  await page.keyboard.type('base', { delay: 40 })
  if (!(await waitServerHas('notebook_notes', acct.id, 'base', 15000))) throw new Error('base text never reached the server')
  return { dialog, editor }
}

async function clickSignOut(page) {
  await page.locator('[data-tour="user-menu"]').click()
  await page.locator('[role="menu"]').getByRole('button', { name: '登出' }).click()
}

/** Block write requests to a table with HTTP 500 while `state.block` is true. */
async function installBlocker(context, table, state) {
  await context.route(
    (url) => url.pathname.startsWith(`/rest/v1/${table}`),
    async (route) => {
      const req = route.request()
      if (state.block && ['PATCH', 'POST', 'PUT', 'DELETE'].includes(req.method())) {
        state.hits++
        const origin = req.headers()['origin'] || '*'
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' },
          body: JSON.stringify({ message: 'simulated outage' }),
        })
      }
      return route.fallback()
    },
  )
}

// ── scenarios ──────────────────────────────────────────────────────────
const results = []
function record(name, ok, why) {
  results.push(ok)
  console.log(ok ? `PASS ${name}` : `FAIL ${name}: ${why}`)
}
async function scenario(name, fn) {
  try {
    await fn()
    record(name, true)
  } catch (e) {
    if (process.env.E2E_SHOT_DIR && lastPage) {
      await lastPage.screenshot({ path: `${process.env.E2E_SHOT_DIR}/${name.slice(0, 2)}-fail.png` }).catch(() => {})
    }
    record(name, false, String(e?.message || e).split('\n').slice(0, process.env.E2E_DEBUG ? 6 : 1).join(' | '))
  } finally {
    await lastCtx?.close().catch(() => {})
    lastCtx = lastPage = null
  }
}

async function s1(browser, acct) {
  const { context, page } = await newSession(browser, acct, 'S1')
  try {
    await login(page, acct)
    await assertSameDatabase(page)
    await createNoteWithBase(page, acct)
    const marker = 'OFFLINE-S1-' + crypto.randomBytes(4).toString('hex')
    await context.setOffline(true)
    await page.keyboard.type(marker, { delay: 30 })
    await sleep(2000)
    const keys = await draftKeys(page, acct.id)
    if (keys.length < 1) throw new Error('no local draft was written while offline')
    if (await serverHas('notebook_notes', acct.id, marker)) throw new Error('marker already on server while offline (offline not effective)')
    await closeNotebook(page)
    await context.setOffline(false)
    // NOT reopening the notebook: the closed-notebook flusher must send it
    if (!(await waitServerHas('notebook_notes', acct.id, marker, 15000))) {
      throw new Error('draft text never reached notebook_notes within 15s after reconnect')
    }
    // draft is removed after the confirmed write (allow a beat for the cleanup)
    let left = await draftKeys(page, acct.id)
    for (let i = 0; i < 10 && left.length; i++) { await sleep(500); left = await draftKeys(page, acct.id) }
    if (left.length !== 0) throw new Error(`${left.length} local draft(s) remain after the server got the text`)
  } finally {
    /* context is closed by scenario() after the failure screenshot */
  }
}

async function s2(browser, acct) {
  const { context, page } = await newSession(browser, acct, 'S2')
  const state = { block: false, hits: 0 }
  try {
    await installBlocker(context, 'sticky_notes', state)
    await login(page, acct)
    await assertSameDatabase(page)
    await page.locator('[data-tour="user-menu"]').click()
    // enabling the layer triggers a one-time load of the user's notes; add the note only after it
    // finished, otherwise the load result can replace the freshly added note (a human is never this fast)
    const loaded = page.waitForResponse(
      (r) => r.url().includes('/rest/v1/sticky_notes') && r.request().method() === 'GET',
      { timeout: 20000 },
    )
    await page.locator('[role="menu"]').getByRole('menuitemcheckbox', { name: '顯示便條紙' }).click()
    await loaded
    await sleep(800)
    await page.locator('[role="menu"]').getByRole('menuitem', { name: '新增便條紙' }).click()
    const note = page.locator('[data-testid="sticky-note"]').first()
    await note.waitFor({ state: 'visible', timeout: 15000 })
    const editor = note.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.type('S2-base', { delay: 40 })
    if (!(await waitServerHas('sticky_notes', acct.id, 'S2-base', 15000))) {
      const shown = (await editor.innerText().catch(() => '?')).slice(0, 40)
      const rows = (await rowsOf('sticky_notes', acct.id)).length
      throw new Error(`first sticky text never reached the server (editor shows "${shown}", ${rows} sticky row(s) on server)`)
    }

    state.block = true
    await editor.click()
    await page.keyboard.type(' UNSENT-S2', { delay: 40 })
    await sleep(2000)
    if (await serverHas('sticky_notes', acct.id, 'UNSENT-S2')) throw new Error('blocked text reached the server (blocker not effective)')
    if (state.hits < 1) throw new Error('blocker never intercepted a sticky_notes write')

    await clickSignOut(page)
    await page.locator('[data-unsynced-signout]').waitFor({ state: 'visible', timeout: 8000 })
    if (page.url().includes('/login')) throw new Error('navigated to /login despite unsent sticky text')
    await page.getByRole('button', { name: '先不要登出' }).click()
    await page.locator('[data-unsynced-signout]').waitFor({ state: 'hidden', timeout: 5000 })

    state.block = false
    let saved = await waitServerHas('sticky_notes', acct.id, 'UNSENT-S2', 15000)
    if (!saved) {
      // nothing retries by itself without a trigger; a connectivity change is the real-world trigger
      await context.setOffline(true)
      await sleep(500)
      await context.setOffline(false)
      saved = await waitServerHas('sticky_notes', acct.id, 'UNSENT-S2', 15000)
      if (saved) console.log('NOTE S2: text only landed after an offline->online toggle (no timer-based retry)')
    }
    if (!saved) throw new Error('sticky text never reached sticky_notes after the outage ended')

    await clickSignOut(page)
    // must sign out directly: no confirm dialog, lands on /login
    await Promise.race([
      page.waitForURL(/\/login/, { timeout: 20000 }),
      page.locator('[data-unsynced-signout]').waitFor({ state: 'visible', timeout: 20000 }).then(() => { throw new Error('confirm dialog shown although everything was saved') }),
    ])
  } finally {
    /* context is closed by scenario() after the failure screenshot */
  }
}

async function s3(browser, acct) {
  const { context, page } = await newSession(browser, acct, 'S3')
  const state = { block: false, hits: 0 }
  try {
    await installBlocker(context, 'notebook_notes', state)
    await login(page, acct)
    await assertSameDatabase(page)
    await createNoteWithBase(page, acct)
    const marker = 'OFFLINE-S3-' + crypto.randomBytes(4).toString('hex')
    await context.setOffline(true)
    await page.keyboard.type(marker, { delay: 30 })
    await sleep(2000)
    if ((await draftKeys(page, acct.id)).length < 1) throw new Error('no local draft was written while offline')
    await closeNotebook(page)

    state.block = true // server "down" for writes
    await context.setOffline(false)
    await sleep(2500) // let the reconnect re-send attempt run and fail
    if (await serverHas('notebook_notes', acct.id, marker)) throw new Error('marker reached the server although writes were blocked')
    if ((await draftKeys(page, acct.id)).length < 1) throw new Error('draft vanished although it was never saved')

    await clickSignOut(page)
    await page.locator('[data-unsynced-signout]').waitFor({ state: 'visible', timeout: 12000 })
    if (page.url().includes('/login')) throw new Error('navigated to /login despite an unsent draft')
    await page.getByRole('button', { name: '先不要登出' }).click()
    await page.locator('[data-unsynced-signout]').waitFor({ state: 'hidden', timeout: 5000 })

    state.block = false
    await sleep(5000)
    await clickSignOut(page)
    await Promise.race([
      page.waitForURL(/\/login/, { timeout: 25000 }),
      page.locator('[data-unsynced-signout]').waitFor({ state: 'visible', timeout: 25000 }).then(() => { throw new Error('confirm dialog still shown after the outage ended') }),
    ])
    if (!(await waitServerHas('notebook_notes', acct.id, marker, 10000))) throw new Error('text not on the server after sign-out')
  } finally {
    /* context is closed by scenario() after the failure screenshot */
  }
}

// ── main ───────────────────────────────────────────────────────────────
async function waitForServer() {
  const end = Date.now() + 10 * 60 * 1000
  while (Date.now() < end) {
    try {
      const r = await fetch(BASE_URL + '/')
      if (r.status === 200) return true
    } catch {}
    await sleep(2000)
  }
  return false
}

const created = []
let browser
try {
  if (!(await waitForServer())) {
    console.log(`FAIL setup: ${BASE_URL}/ did not return 200 within 10 minutes`)
    console.log('FAILED 1')
    process.exitCode = 1
    throw new Error('__stop__')
  }
  console.log(`server up: ${BASE_URL}  (db host ${new URL(SB_URL).host})`)
  browser = await chromium.launch()
  const plan = [
    ['S1 closed-notebook draft is re-sent after reconnect', s1],
    ['S2 sticky text unsent -> sign-out asks first', s2],
    ['S3 closed-notebook draft unsendable -> sign-out asks first', s3],
  ]
  let n = 0
  for (const [name, fn] of plan) {
    n++
    let acct
    try {
      acct = await adminCreateUser(n)
      created.push(acct.id)
    } catch (e) {
      record(name, false, 'account setup: ' + String(e.message).split('\n')[0])
      continue
    }
    await scenario(name, () => fn(browser, acct))
  }
} catch (e) {
  if (e?.message !== '__stop__') {
    console.log(`FAIL setup: ${String(e?.message || e).split('\n')[0]}`)
    results.push(false)
  }
} finally {
  if (browser) await browser.close().catch(() => {})
  let cleaned = 0
  for (const id of created) if (await adminDeleteUser(id).catch(() => false)) cleaned++
  console.log(`cleanup: deleted ${cleaned}/${created.length} test accounts`)
  if (pageErrors.length) {
    console.log(`pageerror x${pageErrors.length} (informational):`)
    for (const m of [...new Set(pageErrors)].slice(0, 10)) console.log('  ' + m.slice(0, 200))
  } else {
    console.log('pageerror: none')
  }
  const failed = results.filter((x) => !x).length
  if (failed) console.log(`FAILED ${failed}`)
  else if (results.length) console.log('ALL PASSED')
  process.exitCode = failed || !results.length ? 1 : 0
}
