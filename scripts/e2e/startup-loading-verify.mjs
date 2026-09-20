/* eslint-disable no-console -- executable regression checks */
// Uses real test-account authentication, but intercepts EVERY REST request.
// No application data reads/writes reach Supabase. Start the app separately.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n')
  .filter(line => line.includes('=') && !line.startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const base = process.env.E2E_BASE_URL || 'http://localhost:3183'
const datasets = ['categories', 'tasks', 'time_blocks', 'user_settings', 'slot_types', 'scratchpad_items']
const workspaceId = '00000000-0000-4000-8000-000000000001'
const categoryId = '00000000-0000-4000-8000-000000000002'
const workspace = { id: workspaceId, name: '啟動回歸工作區', color: '#63a995', icon: '📋', sort_order: 0, is_archived: false, is_default: true }
const category = { id: categoryId, workspace_id: workspaceId, name: '啟動回歸分類', sort_order: 0, is_collapsed: false, is_archived: false, is_default: true }
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve }); return { promise, release } }
const until = async (predicate, label) => {
  const deadline = Date.now() + 15000
  while (!predicate() && Date.now() < deadline) await sleep(25)
  assert.ok(predicate(), label)
}
let passes = 0
const check = (label, condition) => { assert.ok(condition, label); passes++; console.log('PASS', label) }
const browser = await chromium.launch()
const context = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' })
const page = await context.newPage()
const workspaceGate = gate(), dataGate = gate()
let workspaceCount = 0, workspaceReleased = false, refresh = false
const starts = new Map(), writes = [], pageErrors = []
let seedMode = false
const seedEvents = [], seedWrites = [], seedLastGate = gate()
let seedWorkspaceReads = 0, seedLastWriteStarted = false
page.on('pageerror', error => pageErrors.push(error.message))
await context.route('**/rest/v1/**', async route => {
  const request = route.request(), table = new URL(request.url()).pathname.split('/').pop()
  // This RPC uses POST but is a pure SELECT (migration 0016). Keep unknown
  // RPCs in the mutation checks; only this known read is exempted.
  if (new URL(request.url()).pathname.endsWith('/rpc/get_share_peers')) {
    assert.equal(request.method(), 'POST')
    assert.deepEqual(request.postDataJSON(), {})
    return route.fulfill({ json: [] })
  }
  if (seedMode) {
    if (request.method() !== 'GET') {
      const entry = { table, method: request.method(), body: request.postDataJSON() }
      seedWrites.push(entry)
      seedEvents.push(`${request.method()}:${table}`)
      if (table === 'time_blocks' && request.method() === 'POST') {
        seedLastWriteStarted = true
        await seedLastGate.promise
      }
      return route.fulfill({ json: [] })
    }
    seedEvents.push(`GET:${table}`)
    if (table === 'workspaces') {
      seedWorkspaceReads++
      return route.fulfill({ json: seedWorkspaceReads === 1 ? [] : [workspace] })
    }
    if (table === 'categories') return route.fulfill({ json: [category] })
    if (table === 'user_settings') return route.fulfill({ contentType: 'application/json', body: 'null' })
    return route.fulfill({ json: [] })
  }
  if (request.method() !== 'GET') {
    writes.push({ table, method: request.method(), body: request.postDataJSON() })
    return route.fulfill({ json: [] })
  }
  if (table === 'workspaces') {
    workspaceCount++
    if (workspaceCount === 1) await workspaceGate.promise
    workspaceReleased = true
    return route.fulfill({ json: [{ ...workspace, name: refresh ? '背景同步成功' : workspace.name }] })
  }
  if (datasets.includes(table)) {
    const events = starts.get(table) || []
    events.push({ time: Date.now(), workspaceReleased })
    starts.set(table, events)
    await dataGate.promise
    if (table === 'categories') return route.fulfill({ json: [category] })
    if (table === 'user_settings') return route.fulfill({ contentType: 'application/json', body: 'null' })
  }
  return route.fulfill({ json: [] })
})
const dispatchFocus = () => page.evaluate(() => {
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
})
try {
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('#email').fill(env.E2E_EMAIL)
  await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 60000 })
  await until(() => workspaceCount === 1, 'Initial workspace request starts')
  check('Independent datasets wait for the workspace response', starts.size === 0)
  await dispatchFocus()
  await sleep(400)
  check('Focus during workspace loading does not start a competing refresh', workspaceCount === 1)
  workspaceGate.release()
  await until(() => datasets.every(table => starts.has(table)), 'All six datasets start before any dataset response is released (parallel, not serial)')
  check('All six independent requests are in flight simultaneously', datasets.every(table => starts.get(table).length === 1))
  check('All six requests start after workspace hydration', [...starts.values()].every(events => events[0].workspaceReleased))
  await dispatchFocus()
  await sleep(400)
  check('Focus during dataset loading does not invalidate initial loading', workspaceCount === 1)
  dataGate.release()
  await page.getByText(workspace.name, { exact: true }).first().waitFor({ timeout: 15000 })
  await page.getByText('載入中...', { exact: true }).waitFor({ state: 'hidden' })
  check('Initial loading finishes and renders the workspace after focus events', await page.getByText(workspace.name, { exact: true }).first().isVisible())
  // Leave time for the effect to install listeners; initial focus attempts must
  // not have consumed the background-refresh throttle.
  await sleep(100)
  refresh = true
  await dispatchFocus()
  await until(() => workspaceCount === 2 && datasets.every(table => starts.get(table)?.length === 2), 'Focus after loading refreshes all datasets')
  await page.getByText('背景同步成功', { exact: true }).first().waitFor({ timeout: 15000 })
  check('Background refresh applies newly fetched data', await page.getByText('背景同步成功', { exact: true }).first().isVisible())
  check('Background refresh does not restore the startup spinner', await page.getByText('載入中...', { exact: true }).count() === 0)
  await dispatchFocus()
  await sleep(300)
  check('Immediate focus bursts remain throttled', workspaceCount === 2)
  assert.deepEqual(writes, [], 'Startup and background refresh perform no data mutations'); passes++
  check('Main page has no uncaught runtime errors', pageErrors.length === 0)
  seedMode = true
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await until(() => seedLastWriteStarted, 'First-run seed reaches its final time-block insert')
  check('First-run seed writes remain ordered by foreign-key dependency',
    seedWrites.map(write => write.table).join(',') === 'workspaces,categories,tasks,time_blocks')
  const workspaceIds = new Set(seedWrites[0].body.map(row => row.id))
  const categoryIds = new Set(seedWrites[1].body.map(row => row.id))
  check('Seed categories and tasks reference inserted workspace/category IDs',
    seedWrites[1].body.every(row => workspaceIds.has(row.workspace_id)) &&
    seedWrites[2].body.every(row => workspaceIds.has(row.workspace_id) && categoryIds.has(row.category_id)))
  check('No dependent reads start while first-run seed is incomplete',
    !seedEvents.some(event => datasets.some(table => event === `GET:${table}`)))
  await dispatchFocus()
  await sleep(300)
  check('Focus during first-run seeding does not repeat workspace read or seed', seedWorkspaceReads === 1 && seedWrites.length === 4)
  seedLastGate.release()
  await page.getByText(workspace.name, { exact: true }).first().waitFor({ timeout: 15000 })
  await page.getByText('載入中...', { exact: true }).waitFor({ state: 'hidden' })
  const secondWorkspaceRead = seedEvents.lastIndexOf('GET:workspaces')
  check('Seed completion re-reads workspaces before all dependent datasets',
    seedWorkspaceReads === 2 && datasets.every(table => seedEvents.indexOf(`GET:${table}`) > secondWorkspaceRead))
  check('First-run seed performs only expected mocked writes', seedWrites.every(write =>
    (write.method === 'POST' && ['workspaces', 'categories', 'tasks', 'time_blocks'].includes(write.table)) ||
    (write.method === 'PATCH' && write.table === 'user_settings' && write.body.onboarding_completed === true)))
  check('First-run screen renders without uncaught runtime errors', pageErrors.length === 0)
  console.log(`Startup loading verification: ${passes} checks passed (${base}). All REST requests mocked.`)
} finally {
  workspaceGate.release()
  dataGate.release()
  seedLastGate.release()
  await context.close()
  await browser.close()
}
