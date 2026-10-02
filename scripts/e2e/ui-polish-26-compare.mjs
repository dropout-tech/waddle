#!/usr/bin/env node
/**
 * Comparison shots for the two taste calls in 待辦 #26 (the boss picks):
 *   ④ bottom-tab whiteboard icon, ⑥ ink weight of the Huddle icons.
 * Captures the same crops for whatever icon build is currently served:
 *
 *   node scripts/e2e/ui-polish-26-compare.mjs <label>
 *
 * → docs/reports/2026-10-02-ui-polish-26/compare-<label>-{header,slash,mtoolbar,tabbar-en,tabbar-zh}.png
 * Needs the dev server (E2E_PORT, default 3147) and the login state cached by
 * ui-polish-26-verify.mjs. Creates one throwaway note and deletes it.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import os from 'node:os'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const LABEL = process.argv[2] || 'current'
const PORT = Number(process.env.E2E_PORT || 3147)
const BASE_URL = `http://localhost:${PORT}`
const SHOT_DIR = path.join(process.cwd(), 'docs/reports/2026-10-02-ui-polish-26')
const STATE = process.env.E2E_STATE || path.join(os.tmpdir(), 'huddle-ui-polish-26-state.json')
const out = (name) => path.join(SHOT_DIR, `compare-${LABEL}-${name}.png`)
const NOTE_TITLE = `UI驗證 ${Date.now() % 100000}`
const hideDev = 'nextjs-portal{display:none!important}'

async function setLang(page, lang) {
  await page.evaluate((l) => localStorage.setItem('waddle-language-v1', l), lang)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: hideDev })
  await sleep(2500)
}

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, storageState: STATE })
  ctx.setDefaultTimeout(180000)
  const p = await ctx.newPage()
  await p.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await setLang(p, 'zh-TW')
  await p.locator('[data-tour="scratchpad"]').first().waitFor({ state: 'visible' })
  await sleep(800)
  // Proof of which icon build the page is running: the served Settings path
  // must equal the one in components/icons/huddle-icons.tsx right now.
  const served = await p.locator('svg[data-ink-icon="Settings"] path').first().getAttribute('d')
  const src = readFileSync(path.join(process.cwd(), 'components/icons/huddle-icons.tsx'), 'utf8')
  const onDisk = /export const InkSettings = ink\(\n  'Settings',\n  '([^']+)'/.exec(src)?.[1]
  console.error(`compare ${LABEL}: served Settings path ${served === onDisk ? 'MATCHES' : 'DIFFERS FROM'} the file (${served?.length} chars)`)
  if (served !== onDisk) process.exitCode = 1
  await p.screenshot({ path: out('header'), clip: { x: 400, y: 0, width: 880, height: 110 } })

  // "/" menu on a throwaway note
  await p.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
  await p.addStyleTag({ content: hideDev })
  await p.getByRole('button', { name: '新增記事' }).first().click()
  const title = p.locator('input[placeholder="無標題"]')
  await title.waitFor({ state: 'visible' })
  await title.fill(NOTE_TITLE)
  await title.press('Enter')
  await sleep(600)
  await p.keyboard.type('/')
  const menu = p.locator('.nb-slash-menu [role="listbox"]')
  await menu.waitFor({ state: 'visible' })
  await p.addStyleTag({ content: '.nb-slash-menu [role="listbox"]{max-height:none!important}' })
  await sleep(300)
  await menu.screenshot({ path: out('slash') })
  await p.keyboard.press('Escape')
  await p.keyboard.press('Backspace')
  await sleep(1500)

  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, storageState: STATE })
  m.setDefaultTimeout(180000)
  const pm = await m.newPage()
  for (const [lang, tag] of [['en', 'en'], ['zh-TW', 'zh']]) {
    await pm.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await setLang(pm, lang)
    const bar = pm.locator('nav').filter({ has: pm.locator('svg[data-ink-icon="Calendar"]') }).last()
    await bar.waitFor({ state: 'visible' })
    await bar.screenshot({ path: out(`tabbar-${tag}`) })
  }
  await pm.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
  await pm.addStyleTag({ content: hideDev })
  await pm.getByText(NOTE_TITLE, { exact: true }).first().click()
  await pm.locator('.ProseMirror').first().click()
  const tb = pm.locator('[data-nb-keyboard-bar]')
  await tb.waitFor({ state: 'visible' })
  await sleep(400)
  await tb.screenshot({ path: out('mtoolbar') })
  await m.close()

  // cleanup
  await p.goto(`${BASE_URL}/notebook`, { waitUntil: 'domcontentloaded' })
  await p.getByRole('button', { name: '新增記事' }).first().waitFor({ state: 'visible' })
  await sleep(1200)
  const row = p.locator('div.group', { has: p.getByText(NOTE_TITLE, { exact: true }) })
  await row.hover()
  await row.getByRole('button', { name: '刪除記事' }).click()
  await sleep(250)
  await row.getByRole('button', { name: '刪除', exact: true }).click()
  await sleep(1500)
  const left = await p.getByText(NOTE_TITLE, { exact: true }).count()
  console.error(`compare ${LABEL}: shots written, throwaway note ${left === 0 ? 'deleted' : 'NOT deleted'}`)
  if (left) process.exitCode = 1
} finally {
  await browser.close()
}
