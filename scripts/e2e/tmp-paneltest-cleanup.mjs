#!/usr/bin/env node
/** One-off: delete any leftover PANELTEST* categories on the test account,
 *  then reload and confirm they're really gone from the DB. */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const PORT = 3103
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`

function loadEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}
const envFile = loadEnvFile(path.join(process.cwd(), '.env.e2e.local'))
const EMAIL = process.env.E2E_EMAIL || envFile.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || envFile.E2E_PASSWORD

let devServer
function startDevServer() {
  devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'ignore', 'ignore'],
  })
}
function stopDevServer() {
  if (!devServer?.pid) return
  try { process.kill(-devServer.pid, 'SIGTERM') } catch {}
}
async function waitForServerReady() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE_URL); if (r.status < 500) return } catch {}
    await sleep(500)
  }
  throw new Error('dev server not ready')
}

async function main() {
  if (!process.env.E2E_BASE_URL) { startDevServer(); await waitForServerReady() }
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  await sleep(2000) // let workspaces hydrate

  let removed = 0
  for (let round = 0; round < 10; round++) {
    const leftover = page.getByText(/PANELTEST/).first()
    if (!(await leftover.isVisible().catch(() => false))) break
    const name = await leftover.innerText()
    const root = leftover.locator('xpath=ancestor::div[contains(@class,"mb-3")][1]')
    page.once('dialog', (d) => d.accept())
    await root.locator('button[aria-label*="刪除分類"]').click()
    await page.getByText(name, { exact: true }).waitFor({ state: 'detached', timeout: 10000 })
    console.log(`deleted leftover: ${name}`)
    removed++
    await sleep(1500) // give the DELETE round-trip time to land
  }
  console.log(`removed this pass: ${removed}`)

  // Reload — the real test: do they stay gone after a fresh fetch?
  await sleep(2500)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '月檢視' }).waitFor({ state: 'visible', timeout: 20000 })
  await sleep(3000)
  const stillThere = await page.getByText(/PANELTEST/).count()
  console.log(stillThere === 0
    ? 'CLEAN — no PANELTEST categories remain after reload'
    : `WARNING — ${stillThere} PANELTEST element(s) still present after reload (DB delete not sticking)`)
  await browser.close()
  process.exit(stillThere === 0 ? 0 : 1)
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1) }).finally(stopDevServer)
