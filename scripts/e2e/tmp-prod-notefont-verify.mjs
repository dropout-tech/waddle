// 正式站驗收：懸浮記事本字級列＋段落提示字移除（PR #39）。
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = 'https://waddle.zeabur.app'
const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), '.env.e2e.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
let passed = 0, failed = 0
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const errs = []
const browser = await chromium.launch()
try {
  const page = await (await browser.newContext({ locale: 'zh-TW', viewport: { width: 900, height: 700 } })).newPage()
  page.setDefaultTimeout(60000)
  page.setDefaultNavigationTimeout(150000)
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').waitFor(); await sleep(1500)
  await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type="submit"]').click()
  for (let i = 0; i < 60; i++) { await sleep(1000); if (!(await page.evaluate(() => location.pathname)).includes('/login')) break }
  const afterLogin = await page.evaluate(() => location.pathname)
  if (afterLogin.includes('/login')) {
    const err = await page.locator('body').innerText().catch(() => '')
    throw new Error(`登入沒有成功（仍在 ${afterLogin}）。頁面：${err.slice(0, 150).replace(/\n/g, ' / ')}`)
  }
  await sleep(4000)

  await page.goto(`${BASE}/float/note`, { waitUntil: 'domcontentloaded' })
  // 輪詢等到三種畫面之一出現（編輯器／空狀態／筆記列表），最多 45 秒
  let createdNote = false
  let ready = null
  for (let i = 0; i < 45; i++) {
    await sleep(1000)
    if ((await page.locator('input[placeholder="無標題"]').count()) > 0) { ready = 'editor'; break }
    if ((await page.getByRole('button', { name: /建立第一篇|新增記事/ }).count()) > 0) { ready = 'empty'; break }
    if ((await page.locator('li button').count()) > 0) { ready = 'list'; break }
  }
  if (!ready) {
    console.log('DEBUG url=', page.url())
    console.log('DEBUG body=', (await page.locator('body').innerText().catch(() => '(unreadable)')).slice(0, 300).replace(/\n/g, ' / '))
    throw new Error('/float/note 45 秒內沒出現任何預期畫面')
  }
  if (ready === 'empty') {
    await page.getByRole('button', { name: /建立第一篇|新增記事/ }).first().click()
    createdNote = true
    await sleep(3500)
  } else if (ready === 'list') {
    await page.locator('li button').first().click()
    await sleep(2500)
  }

  const readState = () => page.evaluate(() => {
    const area = document.querySelector('[data-note-zoom-area]')
    const title = document.querySelector('input[placeholder="無標題"]')
    return {
      value: document.querySelector('[data-note-font-input]')?.value ?? null,
      zoom: area ? getComputedStyle(area).zoom : null,
      titleH: title ? Math.round(title.getBoundingClientRect().height * 10) / 10 : null,
    }
  })
  let s = readState && await readState()
  check('P1 字級列上線、預設 14', s.value === '14' && s.zoom != null && Math.abs(parseFloat(s.zoom) - 0.921) < 0.01, JSON.stringify(s))

  const h14 = s.titleH
  const input = page.locator('[data-note-font-input]')
  await input.fill('60'); await input.press('Enter'); await sleep(600)
  s = await readState()
  check('P2 設 60 → 實際放大', s.value === '60' && h14 != null && s.titleH > h14 * 3, `${h14} → ${s.titleH}`)
  await input.fill('14'); await input.press('Enter'); await sleep(400)

  // 段落提示字：打一行字→Enter 出空段落，data-placeholder 應為空
  const prose = page.locator('.nb-prose').first()
  await prose.click()
  await page.keyboard.type('線上驗收')
  await page.keyboard.press('Enter')
  await sleep(800)
  const placeholders = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.nb-prose p.is-empty, .nb-prose p.is-editor-empty'))
      .map((e) => e.getAttribute('data-placeholder') ?? ''))
  check('P3 空段落不再有提示字', placeholders.every((s) => s === ''), JSON.stringify(placeholders))

  if (createdNote) {
    await page.goto(`${BASE}/notebook`, { waitUntil: 'domcontentloaded' })
    await sleep(7000)
    await page.locator('button[aria-label="刪除記事"]').first().click({ timeout: 10000 }).catch(() => {})
    await sleep(500)
    await page.getByRole('button', { name: '刪除', exact: true }).first().click({ timeout: 10000 }).catch(() => {})
    await sleep(2500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(6000)
    const left = await page.locator('button[aria-label="拖曳排序或移到其他分類"]').count()
    check('P4 測試筆記已刪除還原', left === 0, `剩餘=${left}`)
  }
  check('P5 零 pageerror', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  failed++
  console.log('FAIL 執行錯誤 — ' + (e?.stack || e))
} finally {
  await browser.close().catch(() => {})
  console.log(`=== ${passed} passed / ${failed} failed ===`)
  process.exit(failed === 0 ? 0 : 1)
}
