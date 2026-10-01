#!/usr/bin/env node
/* eslint-disable no-console -- executable verification script */
/**
 * Onboarding-tour polish verification (2026-10-01).
 *
 * Walks every tour step on desktop 1280×800, desktop 1440×900 and phone
 * 390×844, in zh-TW and English, and asserts per step:
 *   - the card sits fully inside the viewport
 *   - 上一步／下一步 render on ONE line, un-squashed, inside the card
 *   - the progress indicator stays inside the card and clear of the buttons
 *   - 「略過導覽」 is on screen and does not overlap the card
 *   - the spotlight frame lines up with its target, and the target is on screen
 *   - the card does not cover the thing it is pointing at (when there is room)
 *   - copy: no banned jargon, no leftover Chinese in the English tour
 *   - phone: every tap target is at least 44px
 * Then proves the water reminder is *deferred* (not dropped) while the tour is
 * open, and still works afterwards.
 *
 * Safety: `.env.local` points at the production Supabase project, so
 *   - only the e2e test account logs in, and only on localhost
 *   - every non-GET request to the Supabase REST/storage/functions APIs is
 *     intercepted and answered locally — nothing is written
 *   - the tour is summoned by rewriting the *response* of the user_settings
 *     read (onboarding_completed → false); the row itself is never touched
 *
 * Run (dev server must already be up on :3111):
 *   node scripts/e2e/tour-polish-verify.mjs
 *   TOUR_SHOT_TAG=before node scripts/e2e/tour-polish-verify.mjs   # → before/ subfolder
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3111'
const TAG = process.env.TOUR_SHOT_TAG || ''
const OUT_DIR = path.join(process.cwd(), 'docs/reports/2026-10-01-tour-polish', TAG)
mkdirSync(OUT_DIR, { recursive: true })

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL)) {
  console.error(`[tour-verify] Refusing to run against ${BASE_URL} — localhost only.`)
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

const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('[tour-verify] Missing E2E_EMAIL/E2E_PASSWORD (.env.e2e.local)')
  process.exit(1)
}

const CASES = [
  { id: 'desktop-1280', viewport: { width: 1280, height: 800 }, mobile: false },
  { id: 'desktop-1440', viewport: { width: 1440, height: 900 }, mobile: false },
  { id: 'mobile-390', viewport: { width: 390, height: 844 }, mobile: true },
]
const LANGS = ['zh-TW', 'en']
// Desktop is 23 where the 懸浮小視窗 launcher exists (Chrome / Edge) and 22 elsewhere.
const EXPECTED_STEPS = { desktop: 23, desktopNoHub: 22, mobile: 15 }

const UI = {
  'zh-TW': { next: '下一步', prev: '上一步', skip: '略過導覽', close: '關閉導覽', water: '該喝水囉～', drink: '好，去喝水' },
  en: { next: 'Next', prev: 'Back', skip: 'Skip tour', close: 'Close tour', water: '該喝水囉～', drink: '好，去喝水' },
}

// Jargon / "we copied product X" wording the owner asked to remove. The
// quick-links steps name Notion purely as an example URL — that is allowed.
const BANNED = [/Notion\s*式/i, /Notion[- ]style/i, /\bchips?\b/i, /\bKPIs?\b/i, /\*\*/]
// English loanwords / leftover markup that must not show up in the Chinese tour.
const BANNED_ZH = [/\bsnooze\b/i, /[⇱⧉]/]
const CJK = /[㐀-鿿　-〿＀-￯]/

let pass = 0
let fail = 0
const failures = []
const warnings = []
function check(label, ok, detail = '') {
  if (ok) {
    pass += 1
    if (!process.env.QUIET) console.log(`PASS — ${label}`)
  } else {
    fail += 1
    const line = `FAIL — ${label}${detail ? ` — ${detail}` : ''}`
    failures.push(line)
    console.log(line)
  }
}
function warn(label, detail) {
  const line = `WARN — ${label} — ${detail}`
  warnings.push(line)
  console.log(line)
}

// JPEG keeps ~170 screenshots in the tens of MB (PNG at 2x was ~200MB).
const SHOT = { type: 'jpeg', quality: 82 }

const blockedWrites = []

/** Read-only harness: GETs pass through, everything else is answered locally. */
async function installRoutes(context, { forceTour, noPet = false }) {
  await context.route(/\/(rest|storage|functions)\/v1\//, async (route) => {
    const req = route.request()
    const method = req.method()
    const url = new URL(req.url())
    if (method === 'GET' || method === 'HEAD') {
      if (url.pathname.endsWith('/rest/v1/user_settings')) {
        const resp = await route.fetch()
        let body = await resp.text()
        try {
          const json = JSON.parse(body)
          const patch = (row) => {
            if (!row || typeof row !== 'object' || !('onboarding_completed' in row)) return row
            const next = { ...row, onboarding_completed: !forceTour.value }
            // A brand-new account has no penguin yet (adoption comes after the tour).
            if (noPet && next.notifications && typeof next.notifications === 'object') {
              next.notifications = { ...next.notifications, pet: null }
            }
            return next
          }
          body = JSON.stringify(Array.isArray(json) ? json.map(patch) : patch(json))
        } catch { /* leave non-JSON bodies alone */ }
        return route.fulfill({ response: resp, body })
      }
      return route.continue()
    }
    blockedWrites.push(`${method} ${url.pathname}`)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

const round = (r) => r && { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }
const overlapArea = (a, b) => {
  if (!a || !b) return 0
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}
const inside = (inner, outer, tol = 0.75) =>
  inner.x >= outer.x - tol && inner.y >= outer.y - tol
  && inner.x + inner.width <= outer.x + outer.width + tol
  && inner.y + inner.height <= outer.y + outer.height + tol

/** Everything we need to know about the step currently on screen. */
function measureStep(labels) {
  const q = (sel, root = document) => root.querySelector(sel)
  const tour = q('[data-onboarding-tour]')
  if (!tour) return null
  const title = q('h3', tour)
  const card = q('[data-tour-card]', tour) || title?.closest('.bg-card')
  if (!card) return null
  const rect = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }
  const buttons = [...card.querySelectorAll('button')]
  const byText = (txt) => buttons.find((b) => b.textContent.trim() === txt)
  const lineCount = (el) => {
    if (!el) return 0
    const range = document.createRange()
    range.selectNodeContents(el)
    // Distinct text line boxes: icons sit on the same line, so only count
    // rects that are tall enough to be text and not horizontally nested.
    const tops = new Set()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue
      const r = document.createRange()
      r.selectNodeContents(node)
      for (const cr of r.getClientRects()) tops.add(Math.round(cr.top))
    }
    return tops.size
  }
  const next = byText(labels.next)
  const prev = byText(labels.prev)
  const skip = byText(labels.skip)
  const close = card.querySelector(`button[aria-label="${labels.close}"]`)
  const spotlight = q('[data-tour-spotlight]', tour)
    || [...tour.children].find((c) => c !== card && c.classList.contains('pointer-events-none') && c.style.width)
  const progress = q('[data-tour-progress]', card)
    || (next ? next.parentElement?.parentElement?.firstElementChild : null)
  const body = q('p', card)
  const moving = card.getAnimations({ subtree: false }).some((a) => a.playState === 'running')
    || (spotlight ? spotlight.getAnimations().some((a) => a.playState === 'running') : false)
  return {
    stepAttr: tour.getAttribute('data-tour-step'),
    totalAttr: tour.getAttribute('data-tour-total'),
    targetSel: tour.getAttribute('data-tour-target'),
    title: title?.textContent ?? '',
    body: body?.textContent ?? '',
    hint: card.querySelector('p.text-xs')?.textContent ?? '',
    allText: card.innerText,
    card: rect(card),
    next: rect(next),
    prev: rect(prev),
    skip: rect(skip),
    close: rect(close),
    progress: rect(progress),
    progressOverflow: progress ? progress.scrollWidth - progress.clientWidth : 0,
    progressText: progress ? progress.textContent.replace(/\s+/g, ' ').trim() : '',
    hasMascot: !!card.querySelector('img'),
    nextLines: lineCount(next),
    prevLines: lineCount(prev),
    titleLines: lineCount(title),
    spotlight: rect(spotlight),
    moving,
    viewport: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
    scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }
}

/** Wait until the card and spotlight have stopped moving (300ms transitions + a 100ms re-measure). */
async function settle(page, labels) {
  let prev = ''
  let stable = 0
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(120)
    const m = await page.evaluate(measureStep, labels)
    if (!m) continue
    const sig = JSON.stringify([round(m.card), round(m.spotlight), m.title])
    if (sig === prev && !m.moving) stable += 1
    else stable = 0
    prev = sig
    if (stable >= 3 && i >= 5) return m
  }
  return page.evaluate(measureStep, labels)
}

async function walkTour(browser, storageState, kase, lang, variant = null) {
  const tag = `${kase.id}/${lang}${variant ? `/${variant.id}` : ''}`
  const labels = UI[lang]
  const forceTour = { value: true }
  const context = await browser.newContext({
    storageState,
    viewport: kase.viewport,
    locale: lang,
    ...(kase.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  })
  await installRoutes(context, { forceTour, noPet: !!variant?.noPet })
  if (variant?.noPip) {
    // Safari / Firefox: no Document Picture-in-Picture, so no 懸浮小視窗 launcher.
    await context.addInitScript(() => {
      try { delete window.documentPictureInPicture } catch {}
      try { delete Window.prototype.documentPictureInPicture } catch {}
      try { Object.defineProperty(window, 'documentPictureInPicture', { value: undefined, configurable: true }) } catch {}
    })
  }
  await context.addInitScript(([l]) => {
    try {
      localStorage.setItem('waddle-language-v1', l)
      // Keep the water popup out of the layout walk; it has its own test below.
      localStorage.setItem('waddle.waterReminder.nextDueAt', String(Date.now() + 6 * 3600 * 1000))
    } catch {}
  }, [lang])
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-onboarding-tour]').waitFor({ state: 'visible', timeout: 60000 })
  await page.waitForTimeout(1200) // let the dashboard behind the tour finish its first paint

  const expected = kase.mobile ? EXPECTED_STEPS.mobile : variant?.noPip ? EXPECTED_STEPS.desktopNoHub : EXPECTED_STEPS.desktop
  const seenSteps = []
  let index = 0
  for (; index < 40; index += 1) {
    const m = await settle(page, labels)
    const n = String(index + 1).padStart(2, '0')
    const where = `${tag} step ${n}「${m?.title ?? '?'}」`
    if (!m) { check(`${where} measurable`, false, 'tour card not found'); break }
    seenSteps.push({ n: index + 1, target: m.targetSel ?? null, title: m.title, body: m.body, hint: m.hint || null })
    const isLast = !m.next

    // ── Card inside the viewport ─────────────────────────────
    check(`${where} card inside viewport`, inside(m.card, m.viewport, 0.5),
      `card=${JSON.stringify(round(m.card))} viewport=${m.viewport.width}x${m.viewport.height}`)
    check(`${where} no horizontal page scroll`, m.scrollX <= 1, `scrollX=${m.scrollX}`)
    if (!isLast && m.stepAttr) {
      check(`${where} progress reads ${index + 1} / ${expected}`, m.progressText === `${index + 1} / ${expected}`, `shows "${m.progressText}"`)
    }

    // ── Buttons ──────────────────────────────────────────────
    if (!isLast) {
      check(`${where} 下一步 on one line`, m.nextLines === 1, `lines=${m.nextLines} rect=${JSON.stringify(round(m.next))}`)
      check(`${where} 下一步 inside card`, inside(m.next, m.card), `btn=${JSON.stringify(round(m.next))} card=${JSON.stringify(round(m.card))}`)
      check(`${where} 下一步 not squashed`, m.next.width >= 56 && m.next.height <= 48, `w=${Math.round(m.next.width)} h=${Math.round(m.next.height)}`)
      if (index > 0) {
        check(`${where} 上一步 present`, !!m.prev)
        if (m.prev) {
          check(`${where} 上一步 on one line`, m.prevLines === 1, `lines=${m.prevLines} rect=${JSON.stringify(round(m.prev))}`)
          check(`${where} 上一步 inside card`, inside(m.prev, m.card), `btn=${JSON.stringify(round(m.prev))}`)
          check(`${where} 上一步 / 下一步 do not overlap`, overlapArea(m.prev, m.next) === 0)
        }
      }
      if (m.progress) {
        check(`${where} progress inside card`, inside(m.progress, m.card) && m.progressOverflow <= 1,
          `progress=${JSON.stringify(round(m.progress))} overflow=${m.progressOverflow}`)
        check(`${where} progress clear of buttons`, overlapArea(m.progress, m.next) === 0 && overlapArea(m.progress, m.prev) === 0)
      }
      // ── Skip link ──────────────────────────────────────────
      check(`${where} 略過導覽 present`, !!m.skip)
      if (m.skip) {
        check(`${where} 略過導覽 inside viewport`, inside(m.skip, m.viewport, 0.5), `skip=${JSON.stringify(round(m.skip))}`)
        const skipInsideCard = inside(m.skip, m.card)
        check(`${where} 略過導覽 not overlapping card edge`, skipInsideCard || overlapArea(m.skip, m.card) === 0,
          `skip=${JSON.stringify(round(m.skip))} card=${JSON.stringify(round(m.card))}`)
        check(`${where} 略過導覽 clear of buttons`, overlapArea(m.skip, m.next) === 0 && overlapArea(m.skip, m.prev) === 0 && overlapArea(m.skip, m.progress) === 0)
      }
    }
    check(`${where} title ≤ 2 lines`, m.titleLines >= 1 && m.titleLines <= 2, `lines=${m.titleLines}`)

    // ── Touch targets (phone) ────────────────────────────────
    if (kase.mobile) {
      for (const [name, r] of [['下一步', m.next], ['上一步', m.prev], ['略過導覽', m.skip], ['關閉', m.close]]) {
        if (!r) continue
        check(`${where} ${name} tap target ≥44px`, r.height >= 43.5 && r.width >= 43.5, `w=${Math.round(r.width)} h=${Math.round(r.height)}`)
      }
    }

    // ── Spotlight vs target ──────────────────────────────────
    if (m.targetSel) {
      const target = await page.evaluate((sel) => {
        // Same rule as the app: first match that is actually laid out.
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) return { x: r.x, y: r.y, width: r.width, height: r.height }
        }
        return null
      }, m.targetSel)
      const expectMissing = !!variant?.noPet && m.targetSel === '[data-tour="pet"]'
      if (expectMissing) {
        check(`${where} [new user] penguin not on screen yet`, !target)
        check(`${where} [new user] falls back to a centred card`, !m.spotlight && m.hasMascot)
        check(`${where} [new user] copy talks about adopting, not "this penguin"`,
          lang === 'en' ? /adopt/i.test(m.body) && !/in the corner is yours/i.test(m.body) : /領養/.test(m.body) && !/角落這隻/.test(m.body), m.body)
      } else {
        check(`${where} target exists (${m.targetSel})`, !!target, 'not on screen')
      }
      if (target) {
        check(`${where} target on screen`, overlapArea(target, m.viewport) >= 0.9 * target.width * target.height,
          `target=${JSON.stringify(round(target))}`)
        check(`${where} spotlight drawn`, !!m.spotlight)
        if (m.spotlight) {
          // The frame hugs the target with a small uniform padding (0–8px).
          const dx = target.x - m.spotlight.x
          const dy = target.y - m.spotlight.y
          const dr = (m.spotlight.x + m.spotlight.width) - (target.x + target.width)
          const db = (m.spotlight.y + m.spotlight.height) - (target.y + target.height)
          const aligned = [dx, dy, dr, db].every((d) => d >= -0.75 && d <= 8.75) && Math.max(dx, dy, dr, db) - Math.min(dx, dy, dr, db) <= 1.5
          check(`${where} spotlight aligned to target`, aligned, `pad L${dx.toFixed(1)} T${dy.toFixed(1)} R${dr.toFixed(1)} B${db.toFixed(1)}`)
          const covered = overlapArea(m.card, m.spotlight)
          const targetArea = m.spotlight.width * m.spotlight.height
          // A whole panel on a phone fills the screen: the card has to sit on
          // it somewhere, so the bar there is "leave most of it visible".
          const fullPanel = targetArea >= 0.45 * m.viewport.width * m.viewport.height
          if (!fullPanel) {
            check(`${where} card does not cover its target`, covered === 0, `covered=${Math.round(covered)}px² of ${Math.round(targetArea)}px²`)
            if (m.skip) check(`${where} 略過導覽 does not sit on the target`, overlapArea(m.skip, m.spotlight) === 0, `skip=${JSON.stringify(round(m.skip))} spotlight=${JSON.stringify(round(m.spotlight))}`)
          } else {
            check(`${where} card leaves most of a full-panel target visible`, covered / targetArea <= 0.5, `covers ${(100 * covered / targetArea).toFixed(0)}%`)
            if (covered > 0) warn(`${where} card sits on a full-panel target`, `${(100 * covered / targetArea).toFixed(0)}% covered (the panel fills the screen)`)
          }
        }
      }
    } else if (m.stepAttr) {
      check(`${where} centred card has no stray spotlight`, !m.spotlight)
    }

    // ── Copy ────────────────────────────────────────────────
    const text = `${m.title}\n${m.allText}`
    for (const re of BANNED) check(`${where} copy free of ${re}`, !re.test(text), text.match(re)?.[0])
    if (lang === 'zh-TW') for (const re of BANNED_ZH) check(`${where} copy free of ${re}`, !re.test(text), text.match(re)?.[0])
    if (variant?.noPip) check(`${where} [no PiP] floating-window step is dropped`, m.targetSel !== '[data-hub-launcher]')
    if (lang === 'en') check(`${where} no leftover Chinese`, !CJK.test(text), text.match(new RegExp(`.{0,12}${CJK.source}.{0,12}`))?.[0])
    if (lang === 'zh-TW') {
      // Lists use 「、」; the only slash left is the literal 「/」 key in the notebook step.
      const prose = (m.title + m.body).replace(/「\/」/g, '')
      check(`${where} no slash-separated lists`, !/[\/／]/.test(prose), prose.match(/.{0,6}[\/／].{0,6}/)?.[0])
    }

    await page.screenshot({ path: path.join(OUT_DIR, `${kase.id}_${lang}${variant ? `_${variant.id}` : ''}_${n}.jpg`), ...SHOT })
    if (isLast) { index += 1; break }
    await page.getByRole('button', { name: labels.next, exact: true }).click()
    await page.waitForFunction(([t]) => document.querySelector('[data-onboarding-tour] h3')?.textContent !== t, [m.title], { timeout: 5000 })
      .catch(() => check(`${where} advances on 下一步`, false, 'title did not change'))
  }
  check(`${tag} step count = ${expected}`, index === expected, `walked ${index}`)
  check(`${tag} no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
  console.log(`[${tag}] walked ${index} steps`)
  await context.close()
  return seenSteps
}

async function waterReminderTest(browser, storageState) {
  const labels = UI['zh-TW']
  const forceTour = { value: true }
  const context = await browser.newContext({ storageState, viewport: { width: 1280, height: 800 }, locale: 'zh-TW' })
  await installRoutes(context, { forceTour })
  const DUE = Date.now() - 5 * 60 * 1000
  await context.addInitScript(([due]) => {
    try {
      localStorage.setItem('waddle-language-v1', 'zh-TW')
      localStorage.setItem('waddle.waterReminder.enabled', '1')
      // Only seed once per tab: later reloads must keep whatever the app wrote.
      if (!sessionStorage.getItem('tour-verify-seeded')) {
        sessionStorage.setItem('tour-verify-seeded', '1')
        localStorage.setItem('waddle.waterReminder.nextDueAt', String(due))
      }
    } catch {}
  }, [DUE])
  const page = await context.newPage()
  const waterModal = page.getByText(labels.water, { exact: false }).first()
  const due = () => page.evaluate(() => Number(localStorage.getItem('waddle.waterReminder.nextDueAt')))
  const pokeChecks = () => page.evaluate(() => {
    // The hook re-checks on tab-visible, on a storage event, and on the
    // home-screen widget's open event — fire all three instead of waiting 30s.
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new StorageEvent('storage', { key: 'waddle.waterReminder.nextDueAt' }))
    window.dispatchEvent(new Event('huddle-water-open'))
  })

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-onboarding-tour]').waitFor({ state: 'visible', timeout: 60000 })
  await page.waitForTimeout(1500)
  check('water: overdue reminder stays hidden when the tour opens', !(await waterModal.isVisible()))
  await pokeChecks()
  await page.waitForTimeout(800)
  check('water: stays hidden after forced re-checks + widget open event', !(await waterModal.isVisible()))
  await page.getByRole('button', { name: labels.next, exact: true }).click()
  await page.waitForTimeout(600)
  await pokeChecks()
  await page.waitForTimeout(600)
  check('water: still hidden on a later tour step', !(await waterModal.isVisible()))
  check('water: due time untouched while deferred (not swallowed)', (await due()) === DUE, `nextDueAt=${await due()} seeded=${DUE}`)
  await page.screenshot({ path: path.join(OUT_DIR, 'water_during-tour.jpg'), ...SHOT })

  // End the tour (the PATCH that persists it is intercepted — nothing is written).
  await page.getByRole('button', { name: labels.skip, exact: true }).click()
  await page.locator('[data-onboarding-tour]').waitFor({ state: 'detached', timeout: 5000 })
  const appeared = await waterModal.waitFor({ state: 'visible', timeout: 35000 }).then(() => true).catch(() => false)
  check('water: reminder shows up once the tour is closed', appeared)
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT_DIR, 'water_after-tour.jpg'), ...SHOT })
  if (appeared) {
    const before = Date.now()
    await page.getByRole('button', { name: new RegExp(labels.drink) }).first().click()
    await page.waitForTimeout(400)
    const next = await due()
    check('water: 「好，去喝水」 re-arms the normal interval', next >= before + 29 * 60 * 1000, `nextDueAt is ${Math.round((next - before) / 60000)} min out`)
    check('water: popup closes after 「好，去喝水」', !(await waterModal.isVisible()))
  }

  // Control: an account that already finished the tour still gets the popup on load.
  forceTour.value = false
  await page.evaluate(() => localStorage.setItem('waddle.waterReminder.nextDueAt', String(Date.now() - 1000)))
  await page.reload({ waitUntil: 'domcontentloaded' })
  const control = await waterModal.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false)
  check('water: control — no tour, overdue reminder pops on load as before', control)
  check('water: control — tour really is closed', (await page.locator('[data-onboarding-tour]').count()) === 0)
  await context.close()
}

async function main() {
  try {
    const res = await fetch(`${BASE_URL}/login`)
    if (res.status >= 500) throw new Error(`status ${res.status}`)
  } catch (e) {
    console.error(`[tour-verify] Dev server not reachable at ${BASE_URL} (${e.message}). Start it with: pnpm exec next dev -p 3111`)
    process.exit(1)
  }

  const browser = await chromium.launch()
  // One login, reused via storageState — Supabase rate-limits repeated password logins.
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-TW' })
  await installRoutes(loginCtx, { forceTour: { value: false } })
  const loginPage = await loginCtx.newPage()
  await loginPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await loginPage.locator('#email').fill(EMAIL)
  await loginPage.locator('#password').fill(PASSWORD)
  await loginPage.locator('button[type=submit]').click()
  await loginPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 })
  await loginPage.waitForTimeout(2500)
  const storageState = await loginCtx.storageState()
  await loginCtx.close()
  console.log('[tour-verify] logged in with the e2e test account (localhost only)')

  const only = process.env.TOUR_ONLY // e.g. "desktop-1280/zh-TW"
  const steps = {}
  for (const kase of CASES) {
    for (const lang of LANGS) {
      if (only && only !== 'water' && only !== `${kase.id}/${lang}`) continue
      if (only === 'water') continue
      steps[`${kase.id}/${lang}`] = await walkTour(browser, storageState, kase, lang)
    }
  }
  // Brand-new account in a browser without the floating window (Safari /
  // Firefox): no penguin adopted yet, no 懸浮小視窗 launcher.
  const NEW_USER = { id: 'newuser', noPet: true, noPip: true }
  for (const lang of LANGS) {
    if (only && only !== `desktop-1280/${lang}/newuser`) continue
    steps[`desktop-1280/${lang}/newuser`] = await walkTour(browser, storageState, CASES[0], lang, NEW_USER)
  }
  if (!only || only === 'water') await waterReminderTest(browser, storageState)
  await browser.close()

  const uniqueWrites = [...new Set(blockedWrites)]
  console.log(`\n[tour-verify] intercepted (never sent) ${blockedWrites.length} write request(s): ${uniqueWrites.join(', ') || 'none'}`)
  writeFileSync(path.join(OUT_DIR, 'verify-summary.json'), JSON.stringify({ pass, fail, failures, warnings, steps, blockedWrites: uniqueWrites }, null, 2))
  console.log(`\n==== ${fail === 0 ? 'ALL PASS' : 'FAILED'} — ${pass} passed, ${fail} failed, ${warnings.length} warning(s) ====`)
  console.log(`screenshots: ${OUT_DIR}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('[tour-verify] crashed:', e)
  process.exit(1)
})
