#!/usr/bin/env node
/* eslint-disable no-console -- executable verification script */
/**
 * Verifies the three new onboarding-tour steps light up their real targets.
 *
 *   desktop : 🐧 丟給企鵝 (brain-dump) · 📔 人生年曆 (calendar-export) · 🧊 企鵝的冰屋 (pet)
 *   phone   : 🐧 丟給企鵝 (mobile-brain-dump) · 🧊 企鵝的冰屋 (pet) · 📔 人生年曆 (mobile-more)
 *
 * Rounds: desktop 1440x900 zh-TW, phone 390x844 (isMobile+touch) zh-TW,
 *         then the same two viewports in English.
 *
 * Per new step it asserts: title / body text, data-tour-target attribute,
 * the spotlight frame exists and encloses the target, the target is fully
 * inside the viewport, the card is not the centred (mascot) modal, and the
 * step sits right after the expected neighbour. Saves a screenshot per step.
 *
 * DB handling: the e2e test account's user_settings.onboarding_completed is
 * set to false through a supabase-js session, and ALWAYS restored to true in a
 * finally block (then read back and printed). The browser never writes: every
 * non-GET Supabase request from the page is answered locally.
 *
 * Run (dev server already up):  E2E_BASE_URL=http://localhost:3110 node scripts/e2e/tour-new-steps-verify.mjs
 * Screenshots: TOUR_SHOT_DIR (default ./tour-new-steps-shots)
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3110'
const SHOT_DIR = process.env.TOUR_SHOT_DIR || path.join(process.cwd(), 'tour-new-steps-shots')
mkdirSync(SHOT_DIR, { recursive: true })

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL)) {
  console.error(`Refusing to run against ${BASE_URL} — localhost only.`)
  process.exit(1)
}

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[line.slice(0, eq).trim()] = value
  }
  return out
}
const e2eEnv = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const appEnv = loadEnvFile(path.join(process.cwd(), '.env.local'))
const EMAIL = process.env.E2E_EMAIL || e2eEnv.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || e2eEnv.E2E_PASSWORD
const SUPABASE_URL = appEnv.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = appEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!EMAIL || !PASSWORD || !SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local) or Supabase env (.env.local)')
  process.exit(1)
}

const CJK = /[㐀-鿿　-〿＀-￯]/

// Expected copy. `after` is the zh-TW title of the step that must precede it.
const NEW_STEPS = {
  desktop: [
    { key: 'brain-dump', target: '[data-tour="brain-dump"]', after: '🤚 拖曳就是排程', zh: '🐧 丟給企鵝', en: '🐧 Toss it to the penguin' },
    { key: 'life-grid', target: '[data-tour="calendar-export"]', after: '📅 每日簽到', zh: '📔 人生年曆', en: '📔 Year in Days' },
    { key: 'igloo', target: '[data-tour="pet"]', after: '🐧 你的企鵝', zh: '🧊 企鵝的冰屋', en: "🧊 The penguin's igloo", petStep: true },
  ],
  mobile: [
    { key: 'brain-dump', target: '[data-tour="mobile-brain-dump"]', after: '新增任務', zh: '🐧 丟給企鵝', en: '🐧 Toss it to the penguin' },
    { key: 'igloo', target: '[data-tour="pet"]', after: '🐧 你的企鵝', zh: '🧊 企鵝的冰屋', en: "🧊 The penguin's igloo", petStep: true },
    { key: 'life-grid', target: '[data-tour="mobile-more"]', after: '📅 每日簽到 ＆ 會議轉任務', zh: '📔 人生年曆', en: '📔 Year in Days' },
  ],
}
const EN_BODY_START = {
  'brain-dump': 'When your head is full, tap "Toss it to the penguin"',
  igloo: 'Every task you finish and every focus session you complete',
  'life-grid': ['In the same menu, "Year in Days"', 'Under "⋯", "Year in Days"'],
}
const ZH_BODY_START = {
  'brain-dump': '腦袋很亂的時候，按「丟給企鵝」',
  igloo: '每做完一件事、每完成一次專注',
  'life-grid': ['同一個選單裡的「人生年曆」', '「⋯」裡的「人生年曆」'],
}

const ROUNDS = [
  { id: 'desktop-1440', kind: 'desktop', viewport: { width: 1440, height: 900 }, mobile: false, lang: 'zh-TW' },
  { id: 'mobile-390', kind: 'mobile', viewport: { width: 390, height: 844 }, mobile: true, lang: 'zh-TW' },
  { id: 'desktop-1440', kind: 'desktop', viewport: { width: 1440, height: 900 }, mobile: false, lang: 'en' },
  { id: 'mobile-390', kind: 'mobile', viewport: { width: 390, height: 844 }, mobile: true, lang: 'en' },
]
const LABELS = { 'zh-TW': { next: '下一步' }, en: { next: 'Next' } }

let pass = 0
let fail = 0
const failures = []
const notes = []
function check(label, ok, detail = '') {
  if (ok) { pass += 1; console.log(`PASS — ${label}${detail ? ` — ${detail}` : ''}`) }
  else { fail += 1; const l = `FAIL — ${label}${detail ? ` — ${detail}` : ''}`; failures.push(l); console.log(l) }
}
function note(line) { notes.push(line); console.log(`NOTE — ${line}`) }

const blockedWrites = []
async function installRoutes(context) {
  await context.route(/\/(rest|storage|functions)\/v1\//, async (route) => {
    const req = route.request()
    const method = req.method()
    if (method === 'GET' || method === 'HEAD') return route.continue()
    blockedWrites.push(`${method} ${new URL(req.url()).pathname}`)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

/** Snapshot of the tour step currently on screen. Runs in the page. */
function measure() {
  const tour = document.querySelector('[data-onboarding-tour]')
  if (!tour) return null
  const card = tour.querySelector('[data-tour-card]')
  if (!card) return null
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
  const targetSel = tour.getAttribute('data-tour-target')
  let target = null
  if (targetSel) {
    for (const el of document.querySelectorAll(targetSel)) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) { target = el; break }
    }
  }
  const spotlight = tour.querySelector('[data-tour-spotlight]')
  const moving = card.getAnimations().some((a) => a.playState === 'running')
    || (spotlight ? spotlight.getAnimations().some((a) => a.playState === 'running') : false)
  return {
    step: Number(tour.getAttribute('data-tour-step')),
    total: Number(tour.getAttribute('data-tour-total')),
    targetSel,
    title: card.querySelector('h3')?.textContent ?? '',
    body: card.querySelector('p')?.textContent ?? '',
    centered: !!card.querySelector('img'), // the mascot only renders on the centred modal
    card: rect(card),
    spotlight: rect(spotlight),
    target: rect(target),
    targetDomCount: targetSel ? document.querySelectorAll(targetSel).length : 0,
    moving,
    vw: window.innerWidth,
    vh: window.innerHeight,
  }
}

async function settle(page) {
  let prev = ''
  let stable = 0
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(150)
    const m = await page.evaluate(measure)
    if (!m) continue
    const sig = JSON.stringify([m.step, m.card, m.spotlight, m.target])
    if (sig === prev && !m.moving) stable += 1
    else stable = 0
    prev = sig
    if (stable >= 3 && i >= 4) return m
  }
  return page.evaluate(measure)
}

const inViewport = (r, vw, vh, tol = 1) =>
  r && r.x >= -tol && r.y >= -tol && r.x + r.width <= vw + tol && r.y + r.height <= vh + tol
const encloses = (outer, inner, tol = 1) =>
  outer && inner && outer.x <= inner.x + tol && outer.y <= inner.y + tol
  && outer.x + outer.width >= inner.x + inner.width - tol && outer.y + outer.height >= inner.y + inner.height - tol

async function walkRound(browser, storageState, round) {
  const tag = `${round.id}/${round.lang}`
  const context = await browser.newContext({
    storageState,
    viewport: round.viewport,
    locale: round.lang,
    ...(round.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  })
  await installRoutes(context)
  await context.addInitScript(([l]) => {
    try {
      localStorage.setItem('waddle-language-v1', l)
      localStorage.setItem('waddle.waterReminder.nextDueAt', String(Date.now() + 6 * 3600 * 1000))
    } catch {}
  }, [round.lang])
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-onboarding-tour]').waitFor({ state: 'visible', timeout: 60000 })
  await page.waitForTimeout(1500)

  const seen = [] // { n, title, target }
  const cjkSteps = []
  const hits = new Map() // key -> measure
  const expected = NEW_STEPS[round.kind]
  const zhTitleByIndex = []
  for (let guard = 0; guard < 40; guard += 1) {
    const m = await settle(page)
    if (!m) { check(`${tag} tour card measurable`, false); break }
    seen.push({ n: m.step, total: m.total, title: m.title, target: m.targetSel })
    if (round.lang === 'en' && CJK.test(m.title + m.body)) cjkSteps.push(`#${m.step} ${m.title}`)

    const hit = expected.find((e) => e.target === m.targetSel && m.title === e[round.lang === 'en' ? 'en' : 'zh'])
    if (hit) {
      const where = `${tag} 「${hit.zh}」(step ${m.step}/${m.total})`
      hits.set(hit.key, m)
      const prevTitle = seen.length >= 2 ? seen[seen.length - 2] : null
      check(`${where} title`, m.title === hit[round.lang === 'en' ? 'en' : 'zh'], `"${m.title}"`)
      check(`${where} data-tour-target`, m.targetSel === hit.target, m.targetSel)
      const starts = round.lang === 'en' ? EN_BODY_START[hit.key] : ZH_BODY_START[hit.key]
      const ok = (Array.isArray(starts) ? starts : [starts])
      const bodyHasStart = ok.some((s) => m.body.startsWith(s))
      check(`${where} body copy`, bodyHasStart, `"${m.body.slice(0, 60)}…"`)
      if (round.lang === 'en') check(`${where} no CJK in title/body`, !CJK.test(m.title + m.body))
      if (round.lang === 'zh-TW' && prevTitle) {
        check(`${where} follows 「${hit.after}」`, prevTitle.title === hit.after, `previous step = "${prevTitle.title}"`)
      }
      if (round.lang === 'en' && prevTitle) {
        const zhRound = zhTitleByIndex.find((z) => z.key === hit.key)
        check(`${where} same position as zh-TW run`, !zhRound || zhRound.n === m.step, `en step ${m.step} vs zh step ${zhRound?.n}`)
      }
      if (round.lang === 'zh-TW') zhTitleByIndex.push({ key: hit.key, n: m.step })
      const petAbsent = hit.petStep && m.targetDomCount === 0
      if (petAbsent) {
        note(`${where} no [data-tour="pet"] element in DOM for this account → tour falls back to centred modal by design; spotlight NOT verifiable here`)
        check(`${where} (pet absent) falls back to centred modal with the no-pet copy`, m.centered && !m.spotlight)
      } else {
        check(`${where} target element exists & visible`, !!m.target, JSON.stringify(m.target))
        check(`${where} target fully inside viewport`, inViewport(m.target, m.vw, m.vh), `target=${JSON.stringify(m.target)} vp=${m.vw}x${m.vh}`)
        check(`${where} spotlight present (not centred modal)`, !!m.spotlight && !m.centered, `spotlight=${JSON.stringify(m.spotlight)} centered=${m.centered}`)
        check(`${where} spotlight encloses target`, encloses(m.spotlight, m.target), `spotlight=${JSON.stringify(m.spotlight)}`)
        check(`${where} card inside viewport`, inViewport(m.card, m.vw, m.vh, 0.5), `card=${JSON.stringify(m.card)}`)
      }
      const shot = path.join(SHOT_DIR, `${round.id}-${round.lang === 'en' ? 'en' : 'zh'}-${String(m.step).padStart(2, '0')}-${hit.key}.png`)
      await page.screenshot({ path: shot })
      console.log(`SHOT — ${shot}`)
    }

    // Advance (stop at the last step: it has no 下一步 button).
    const next = page.getByRole('button', { name: LABELS[round.lang].next, exact: true })
    if (m.step >= m.total || (await next.count()) === 0) break
    await next.click()
    await page.waitForFunction((s) => Number(document.querySelector('[data-onboarding-tour]')?.getAttribute('data-tour-step')) === s + 1, m.step, { timeout: 8000 })
      .catch(() => {})
  }
  for (const e of expected) check(`${tag} 「${e.zh}」 reached during walk`, hits.has(e.key))
  check(`${tag} walked to the final step`, seen.length > 0 && seen[seen.length - 1].n === seen[seen.length - 1].total, `last step ${seen[seen.length - 1]?.n}/${seen[seen.length - 1]?.total}, ${seen.length} steps seen`)
  if (round.lang === 'en' && cjkSteps.length) note(`${tag} steps with Chinese text in the English tour: ${cjkSteps.join(' | ')}`)
  if (pageErrors.length) note(`${tag} pageerror(s): ${JSON.stringify(pageErrors.slice(0, 3))}`)
  await context.close()
  return seen
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (authErr || !auth.user) throw new Error(`supabase login failed: ${authErr?.message}`)
  const userId = auth.user.id
  const readFlag = async () => {
    const { data, error } = await sb.from('user_settings').select('onboarding_completed').eq('user_id', userId)
    if (error) throw new Error(`read flag: ${error.message}`)
    return data
  }
  console.log(`supabase host: ${new URL(SUPABASE_URL).host}  (e2e account only)`)
  console.log(`onboarding_completed BEFORE: ${JSON.stringify(await readFlag())}`)

  let browser
  try {
    const { error: upErr } = await sb.from('user_settings').update({ onboarding_completed: false }).eq('user_id', userId)
    if (upErr) throw new Error(`set false: ${upErr.message}`)
    console.log(`onboarding_completed SET FALSE: ${JSON.stringify(await readFlag())}`)

    browser = await chromium.launch()
    // Log in once in the browser, reuse the session for every round.
    const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' })
    await installRoutes(loginCtx)
    const lp = await loginCtx.newPage()
    await lp.goto(`${BASE_URL}/login?method=email`, { waitUntil: 'domcontentloaded' })
    await lp.locator('#email').fill(EMAIL)
    await lp.locator('#password').fill(PASSWORD)
    await lp.locator('button[type=submit]').click()
    await lp.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 })
    const storageState = await loginCtx.storageState()
    await loginCtx.close()

    for (const round of ROUNDS) {
      console.log(`\n=== ${round.id} / ${round.lang} ===`)
      await walkRound(browser, storageState, round)
    }
  } catch (e) {
    fail += 1
    failures.push(`EXCEPTION — ${e.stack || e.message}`)
    console.log(`EXCEPTION — ${e.stack || e.message}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
    const { error: restoreErr } = await sb.from('user_settings').update({ onboarding_completed: true }).eq('user_id', userId)
    if (restoreErr) console.log(`RESTORE ERROR: ${restoreErr.message}`)
    const after = await readFlag().catch((e) => `read error: ${e.message}`)
    console.log(`\nonboarding_completed AFTER RESTORE: ${JSON.stringify(after)}`)
    const restored = Array.isArray(after) && after.length > 0 && after.every((r) => r.onboarding_completed === true)
    if (!restored) { fail += 1; failures.push('onboarding_completed NOT restored to true') }
    console.log(`blocked browser writes (answered locally): ${blockedWrites.length} ${JSON.stringify([...new Set(blockedWrites)])}`)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  for (const f of failures) console.log(f)
  process.exit(fail ? 1 : 0)
}
main()
