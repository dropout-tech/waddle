#!/usr/bin/env node
/**
 * 懸浮記事本底部字級列（4–120 連續可調，預設 14）— 2026-08-24。
 *
 *  N1 開 /float/note → 底部有字級列，預設 14，zoom ≈ 14/15.2
 *  N2 ＋/− 步進（14→15→14）
 *  N3 字真的變大：標題輸入框的實際外框高度在 60px 檔明顯大於 14px 檔
 *  N4 直接輸入 999 → clamp 120；輸入 2 → clamp 4
 *  N5 重新整理後記得上次的值
 *  N6 全站 <html> 字級不受影響（原有的四段字級不動）
 *  （結尾還原 14、刪測試筆記）
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3183
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

let passed = 0, failed = 0
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const pageErrors = []
let browser
const server = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
server.stdout.on('data', () => {}); server.stderr.on('data', () => {})

async function waitServer() {
  for (let i = 0; i < 180; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) return } catch {}
    await sleep(1000)
  }
  throw new Error('dev server not ready')
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

try {
  await waitServer()
  browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'zh-TW', viewport: { width: 900, height: 700 } })
  ctx.setDefaultNavigationTimeout(180000)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await login(page)
  await sleep(3000)
  await page.goto(`${BASE}/float/note`, { waitUntil: 'domcontentloaded' })
  await sleep(7000)

  // 沒筆記就建一則（結尾刪）
  let createdNote = false
  if ((await page.locator('input[placeholder="無標題"]').count()) === 0) {
    const create = page.getByRole('button', { name: /建立第一篇|新增記事/ }).first()
    if (await create.count()) { await create.click(); createdNote = true; await sleep(3000) }
    else {
      // 有筆記列表 → 點第一則
      await page.locator('li button').first().click()
      await sleep(2500)
    }
  }

  const input = page.locator('[data-note-font-input]')
  const readState = () => page.evaluate(() => {
    const area = document.querySelector('[data-note-zoom-area]')
    const title = document.querySelector('input[placeholder="無標題"]')
    return {
      value: document.querySelector('[data-note-font-input]')?.value ?? null,
      zoom: area ? getComputedStyle(area).zoom : null,
      titleH: title ? Math.round(title.getBoundingClientRect().height * 10) / 10 : null,
      htmlFont: document.documentElement.style.fontSize || '(default)',
    }
  })

  let s = await readState()
  check('N1 底部字級列存在、預設 14、zoom≈0.921',
    s.value === '14' && s.zoom != null && Math.abs(parseFloat(s.zoom) - 14 / 15.2) < 0.01,
    JSON.stringify(s))

  await page.locator('[data-note-font-plus]').click()
  await sleep(400)
  s = await readState()
  check('N2a ＋ → 15', s.value === '15', `value=${s.value}`)
  await page.locator('[data-note-font-minus]').click()
  await sleep(400)
  s = await readState()
  check('N2b − → 14', s.value === '14', `value=${s.value}`)

  const h14 = s.titleH
  await input.fill('60')
  await input.press('Enter')
  await sleep(500)
  s = await readState()
  check('N3 設 60 → 標題實際高度明顯放大', s.value === '60' && h14 != null && s.titleH != null && s.titleH > h14 * 3,
    `14px 檔高 ${h14} → 60px 檔高 ${s.titleH}`)

  await input.fill('999')
  await input.press('Enter')
  await sleep(400)
  s = await readState()
  check('N4a 輸入 999 → clamp 120', s.value === '120', `value=${s.value}`)
  await input.fill('2')
  await input.press('Enter')
  await sleep(400)
  s = await readState()
  check('N4b 輸入 2 → clamp 4', s.value === '4', `value=${s.value}`)

  await input.fill('22')
  await input.press('Enter')
  await sleep(400)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(6000)
  if ((await page.locator('[data-note-font-input]').count()) === 0) {
    await page.locator('li button').first().click().catch(() => {})
    await sleep(2500)
  }
  s = await readState()
  check('N5 重新整理後記得 22', s.value === '22', `value=${s.value}`)
  check('N6 全站 html 字級不受影響', s.htmlFont === '(default)', `html=${s.htmlFont}`)

  // 還原預設
  await page.locator('[data-note-font-input]').fill('14')
  await page.locator('[data-note-font-input]').press('Enter')
  await sleep(400)
  s = await readState()
  check('N7 還原預設 14', s.value === '14', `value=${s.value}`)

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

  check('零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (err?.stack || err))
} finally {
  await browser?.close().catch(() => {})
  try { process.kill(-server.pid, 'SIGKILL') } catch {}
  console.log(`\n=== ${passed} passed / ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}
