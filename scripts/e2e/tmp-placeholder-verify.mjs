#!/usr/bin/env node
/**
 * 記事本段落提示字移除驗證 — 2026-08-24。
 *  R1 空段落不再渲染「輸入文字，或輸入「/」加入區塊…」（data-placeholder 為空）
 *  R2 標題區塊的「標題」提示仍在（只拿掉段落的）
 *  R3 斜線選單照常打得開（拿掉提示不影響「/」功能）
 *  DB：建一則測試筆記，結尾刪除還原。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3185
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
try {
  for (let i = 0; i < 180; i++) { try { if ((await fetch(`${BASE}/login`)).ok) break } catch {} await sleep(1000) }
  browser = await chromium.launch()
  const page = await (await browser.newContext({ locale: 'zh-TW', viewport: { width: 900, height: 700 } })).newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor(); await sleep(1500)
  await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  for (let i = 0; i < 60; i++) { await sleep(1000); if (!(await page.evaluate(() => location.pathname)).includes('/login')) break }
  await sleep(3000)

  await page.goto(`${BASE}/notebook`, { waitUntil: 'domcontentloaded' })
  await sleep(6000)
  let createdNote = false
  if ((await page.locator('input[placeholder="無標題"]').count()) === 0) {
    await page.getByRole('button', { name: /建立第一篇|新增記事/ }).first().click()
    createdNote = true
    await sleep(3000)
  }

  // 在內文打字→Enter 產生空段落（重現截圖情境：既有文字下方一個空段落）
  const prose = page.locator('.nb-prose').first()
  await prose.click()
  await page.keyboard.type('九豆物流')
  await page.keyboard.press('Enter')
  await sleep(600)

  const r1 = await page.evaluate(() => {
    const empties = Array.from(document.querySelectorAll('.nb-prose p.is-empty, .nb-prose p.is-editor-empty'))
    return empties.map((e) => e.getAttribute('data-placeholder') ?? '')
  })
  check('R1 空段落沒有提示字', r1.every((s) => s === ''), `placeholders=${JSON.stringify(r1)}`)

  // 標題提示仍在：打 / 選標題……直接用 markdown 捷徑「# 」建 H1 空標題
  await page.keyboard.type('# ')
  await sleep(600)
  const r2 = await page.evaluate(() =>
    document.querySelector('.nb-prose h1.is-empty')?.getAttribute('data-placeholder') ?? null)
  check('R2 標題區塊仍有「標題」提示', r2 === '標題', `placeholder=${JSON.stringify(r2)}`)
  // 斜線選單照常——先 Enter 到一個乾淨的空段落再打「/」
  await page.keyboard.press('Enter')
  await sleep(300)
  await page.keyboard.type('/')
  await sleep(800)
  const menu = await page.getByText('待辦清單', { exact: false }).count()
  check('R3 斜線選單照常打得開', menu > 0, `items=${menu}`)
  await page.keyboard.press('Escape')

  if (createdNote) {
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
