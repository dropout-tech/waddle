/* eslint-disable no-console -- executable regression script */
// Whiteboard phase 2: format just a few words inside a card (bold / colour /
// marker / size), alongside the whole-card format; same colour + marker in the
// notebook. Stored formats stay readable by older builds (lib/styled-doc.ts).
// Starts `next dev` on 3176 unless E2E_BASE_URL is set. Supabase REST is mocked — only login hits the real API.
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.e2e.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
const base = process.env.E2E_BASE_URL || 'http://localhost:3176'
const server = process.env.E2E_BASE_URL ? null : spawn('pnpm',['exec','next','dev','-p','3176'],{stdio:'ignore',detached:true})
const SHOTS = process.env.SHOT_DIR || 'docs/reports/2026-10-02-whiteboard-inline-format'; mkdirSync(SHOTS,{recursive:true})
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) fails++ }
const today = new Date().toLocaleDateString('en-CA')
const now = new Date().toISOString()
const PLAIN = '00000000-0000-4000-8000-000000000401', STALE = '00000000-0000-4000-8000-000000000402', RICH = '00000000-0000-4000-8000-000000000403'
const red = { type: 'textColor', attrs: { color: 'red' } }
let rows, writes, notebookRow
const reset = () => {
  rows = [
    { id: PLAIN, date: today, type: 'text', content: '本週重點', sort_order: 0, metadata: { canvas: { x: 40, y: 80, width: 260, height: 180 } }, created_at: now },
    // Written by a new build, then edited by an older one (content changed, metadata.inline kept).
    { id: STALE, date: today, type: 'text', content: '舊版改過的字', sort_order: 1, metadata: { canvas: { x: 340, y: 80, width: 240, height: 160 }, inline: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '原本的字', marks: [red] }] }] } }, created_at: now },
    // Rich card (detail editor) stored packed.
    { id: RICH, date: today, type: 'text', content: '紅色標題', title: '筆記', sort_order: 2, metadata: { canvas: { x: 40, y: 320, width: 260, height: 160 }, document: { type: 'doc', attrs: { styled: [{ type: 'paragraph', content: [{ type: 'text', text: '紅色', marks: [red] }, { type: 'text', text: '標題' }] }] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '紅色' }, { type: 'text', text: '標題' }] }] } }, created_at: now },
  ]
  writes = []
  notebookRow = { id: '00000000-0000-4000-8000-000000000411', title: '顏色測試', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '這幾個字要變色' }] }] }, sort_order: 0, created_at: now, updated_at: now, is_archived: false }
}
const lastWrite = id => writes.filter(w => w.id === id || w._id === id).at(-1)
let browser
async function open(context, path = '/float/scratchpad') {
  await context.route('**/rest/v1/**', async route => {
    const r = route.request(), u = new URL(r.url()), table = u.pathname.split('/').pop(), id = u.searchParams.get('id')?.replace('eq.', '')
    if (table === 'notebook_notes') { if (r.method() === 'GET') return route.fulfill({ json: [notebookRow] }); notebookRow = { ...notebookRow, ...r.postDataJSON() }; return route.fulfill({ json: [notebookRow] }) }
    if (table !== 'scratchpad_items') return route.fulfill({ json: [] })
    if (r.method() === 'GET') return route.fulfill({ json: rows })
    const body = r.postData() ? r.postDataJSON() : null
    const record = Array.isArray(body) ? body[0] : body
    writes.push({ ...record, _id: id ?? record?.id, _method: r.method() })
    if (r.method() === 'PATCH') rows = rows.map(x => x.id === id ? { ...x, ...record } : x)
    else if (record) rows = [...rows, record]
    return route.fulfill({ json: r.method() === 'PATCH' ? { id } : [] })
  })
  const page = await context.newPage()
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message))
  await page.goto(base + '/login?method=email'); await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click(); await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 90000 })
  await page.goto(base + path)
  return page
}
const card = (page, id) => page.locator(`[data-canvas-item="${id}"]`)
const editor = page => page.getByTestId('scratchpad-canvas').getByLabel(/^(畫布內容|Canvas content)$/)
// Tiptap focuses (autofocus) a tick after it mounts; type only once it has focus.
const openEditor = async page => { await editor(page).waitFor(); await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '畫布內容' || document.activeElement?.getAttribute('aria-label') === 'Canvas content', null, { timeout: 5000 }).catch(() => {}) }
const toolbar = page => page.getByTestId('card-format-toolbar')
const tb = (page, name) => toolbar(page).getByRole('button', { name, exact: true })
const marksOf = (doc, text) => doc?.content?.flatMap(p => p.content ?? []).find(n => n.text === text)?.marks?.map(m => m.type + (m.attrs ? ':' + Object.values(m.attrs)[0] : '')).sort() ?? []
const css = (loc) => loc.evaluate(el => { const s = getComputedStyle(el); return { weight: s.fontWeight, color: s.color, size: s.fontSize, bg: s.backgroundColor } })
// (macOS Chromium: End doesn't move the caret in contenteditable; Meta+ArrowRight does.)
const lineEnd = page => page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End')
async function selectLast(page, n) { await page.keyboard.press('ArrowRight'); await lineEnd(page); for (let i = 0; i < n; i++) await page.keyboard.press('Shift+ArrowLeft') }
async function blank(page) { const b = await page.getByTestId('scratchpad-canvas').boundingBox(); await page.mouse.click(b.x + b.width - 30, b.y + b.height - 90); await sleep(700) }

try {
  for (let i = 0; i < 180; i++) { try { if ((await fetch(base + '/login')).ok) break } catch {} await sleep(1000) }
  browser = await chromium.launch()

  // ---------- Desktop ----------
  reset()
  const desk = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  await desk.addInitScript(() => { try { if (!localStorage.getItem('waddle-language-v1')) localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })
  let page = await open(desk)
  await card(page, PLAIN).getByText('本週重點').waitFor()

  // Old-build fallback: stale inline formatting is ignored, the edited text shows.
  ok(await card(page, STALE).getByText('舊版改過的字', { exact: true }).count() === 1 && await card(page, STALE).getByText('原本的字').count() === 0, 'stale inline format (text edited by an older build) falls back to the plain text')
  // Packed rich card shows its colour on the board.
  const richRed = card(page, RICH).locator('span', { hasText: /^紅色$/ })
  ok((await css(richRed)).color === 'rgb(212, 72, 59)', `packed rich card shows word colour on the board (${(await css(richRed)).color})`)

  // Edit in place, select the last two characters, format them.
  await card(page, PLAIN).getByText('本週重點').dblclick(); await openEditor(page)
  ok(await toolbar(page).isVisible() && await page.getByTestId('card-format-scope').count() === 0, 'editing with a caret only: toolbar shown in whole-card mode')
  await selectLast(page, 2)
  await page.getByTestId('card-format-scope').waitFor({ timeout: 3000 }).catch(() => {})
  ok(await page.getByTestId('card-format-scope').isVisible(), 'selecting words switches the toolbar to “只改選取的字”')
  await tb(page, '粗體').click()
  await tb(page, '文字顏色').click(); await toolbar(page).getByRole('button', { name: '紅色', exact: true }).click()
  await tb(page, '螢光筆').click(); await toolbar(page).getByRole('button', { name: '黃色', exact: true }).click()
  await tb(page, '放大字體').click(); await tb(page, '放大字體').click()
  ok(await editor(page).evaluate(el => document.activeElement === el || el.contains(document.activeElement)), 'toolbar clicks keep focus in the card text')
  ok(await page.getByTestId('card-format-scope').isVisible(), 'selection survives the toolbar clicks')
  await page.screenshot({ path: `${SHOTS}/1-desktop-editing-selection.png` })
  await blank(page)
  let w = lastWrite(PLAIN)
  ok(w?.content === '本週重點', `content stays the plain text (${JSON.stringify(w?.content)})`)
  ok(JSON.stringify(marksOf(w?.metadata?.inline, '重點')) === JSON.stringify(['bold', 'textColor:red', 'textHighlight:yellow', 'textSize:xl']), `only “重點” formatted: ${JSON.stringify(marksOf(w?.metadata?.inline, '重點'))}`)
  ok(marksOf(w?.metadata?.inline, '本週').length === 0, '“本週” left unformatted')
  ok(!w?.metadata?.style && !!w?.metadata?.canvas, 'card-level style untouched; geometry kept')
  const face = card(page, PLAIN).locator('span', { hasText: /^重點$/ })
  const f = await css(face)
  ok(f.weight === '700' && f.color === 'rgb(212, 72, 59)' && f.size === '26px' && f.bg.startsWith('rgba(250, 204, 21'), `card face shows the word format ${JSON.stringify(f)}`)
  const plainPart = await card(page, PLAIN).locator('p').evaluate(el => getComputedStyle(el).fontWeight)
  ok(plainPart === '400', `rest of the card stays normal weight (${plainPart})`)
  await page.screenshot({ path: `${SHOTS}/2-desktop-card-face.png` })

  // Reopen: the formatting is back in the editor.
  await card(page, PLAIN).locator('p').dblclick(); await openEditor(page)
  ok(await editor(page).locator('strong', { hasText: '重點' }).count() === 1 && await editor(page).locator('[data-text-color="red"]').count() === 1, `reopened editor keeps the word formatting ${await editor(page).innerHTML()}`)
  // Escape discards changes.
  await selectLast(page, 2); await tb(page, '斜體').click()
  let before = writes.length; await editor(page).press('Escape'); await sleep(500)
  ok(writes.length === before && await editor(page).count() === 0, 'Escape discards word formatting, no write')

  // Whole-card colour replaces word colours (slide-app semantics), bold words stay.
  await card(page, PLAIN).locator('p').click(); await toolbar(page).waitFor()
  await tb(page, '文字顏色').click(); await toolbar(page).getByRole('button', { name: '藍色', exact: true }).click(); await sleep(600)
  w = lastWrite(PLAIN)
  ok(w?.metadata?.style?.color === 'blue' && JSON.stringify(marksOf(w?.metadata?.inline, '重點')) === JSON.stringify(['bold', 'textHighlight:yellow', 'textSize:xl']), `whole-card colour clears word colours only: style=${JSON.stringify(w?.metadata?.style)} marks=${JSON.stringify(marksOf(w?.metadata?.inline, '重點'))}`)

  // New draft: format while typing, created with the formatting.
  await page.getByRole('button', { name: '文字', exact: true }).click(); await openEditor(page)
  await page.keyboard.type('新卡片 重要')
  await selectLast(page, 2); await tb(page, '粗體').click()
  await page.keyboard.press('ArrowRight'); await tb(page, '放大字體').click()   // caret only → whole card
  await blank(page)
  const post = writes.filter(x => x._method === 'POST').at(-1)
  ok(post?.content === '新卡片 重要' && JSON.stringify(marksOf(post?.metadata?.inline, '重要')) === '["bold"]' && post?.metadata?.style?.size === 'lg', `new card saved with word + card format: ${JSON.stringify({ c: post?.content, style: post?.metadata?.style, m: marksOf(post?.metadata?.inline, '重要') })}`)

  // Plain edit of an unformatted card writes no metadata.inline.
  reset(); await page.reload(); await card(page, PLAIN).getByText('本週重點').dblclick(); await openEditor(page)
  await lineEnd(page); await page.keyboard.type('！'); await blank(page)
  w = lastWrite(PLAIN)
  ok(w?.content === '本週重點！' && !('metadata' in w), `plain typing keeps the old format (content only): ${JSON.stringify(w)}`)

  // Rich card detail editor shows and keeps the packed colour.
  await card(page, RICH).getByRole('button', { name: '開啟內容', exact: true }).click()
  const detailRed = page.getByRole('dialog').locator('[data-text-color="red"]')
  await detailRed.waitFor({ timeout: 8000 }).catch(() => {})
  ok(await detailRed.count() === 1, 'detail editor unpacks the stored colour')
  await page.getByRole('dialog').getByRole('button', { name: '返回白板', exact: true }).click(); await sleep(400)
  ok(page.errors.length === 0, `desktop whiteboard: no page errors ${page.errors.join(' | ')}`)

  // English labels.
  await page.screenshot({ path: `${SHOTS}/debug-before-english.png` })
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en')); await page.reload()
  await card(page, PLAIN).getByText('本週重點').dblclick(); await openEditor(page); await selectLast(page, 2)
  const scope = await page.getByTestId('card-format-scope').textContent().catch(() => '')
  ok(scope === 'Selected text only', `English selection hint: ${JSON.stringify(scope)}`)
  await editor(page).press('Escape')
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'zh-TW'))

  // Notebook: colour + marker in the desktop bubble, stored packed.
  await page.goto(base + '/notebook'); await page.getByText('顏色測試', { exact: true }).click()
  const nb = page.locator('.tiptap').first(); await nb.waitFor()
  await nb.click(); await selectLast(page, 2)
  await page.getByRole('button', { name: '文字顏色', exact: true }).click()
  await page.getByRole('button', { name: '紅色', exact: true }).click()
  await page.getByRole('button', { name: '螢光筆', exact: true }).click()
  await page.getByRole('button', { name: '黃色', exact: true }).click()
  await page.screenshot({ path: `${SHOTS}/3-notebook-desktop.png` })
  await sleep(1800)
  const stored = notebookRow.content
  ok(Array.isArray(stored?.attrs?.styled) && JSON.stringify(marksOf({ content: stored.attrs.styled }, '變色')) === '["textColor:red","textHighlight:yellow"]', `notebook stores the styled copy: ${JSON.stringify(marksOf({ content: stored?.attrs?.styled ?? [] }, '變色'))}`)
  ok(!JSON.stringify(stored?.content).includes('textColor'), 'notebook visible content has no unknown marks (old builds stay safe)')
  await page.reload(); await page.getByText('顏色測試', { exact: true }).click(); await page.locator('.tiptap [data-text-color="red"]').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok(await page.locator('.tiptap [data-text-color="red"]').count() === 1, 'notebook colour survives a reload')
  ok(page.errors.length === 0, `desktop notebook: no page errors ${page.errors.join(' | ')}`)
  await desk.close()

  // ---------- Phone 390px, touch ----------
  reset()
  const phone = await browser.newContext({ locale: 'zh-TW', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
  await phone.addInitScript(() => { try { localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })
  page = await open(phone)
  await card(page, PLAIN).getByText('本週重點').waitFor()
  await card(page, PLAIN).getByText('本週重點').dblclick(); await openEditor(page)
  await selectLast(page, 2)
  await page.getByTestId('card-format-scope').waitFor({ timeout: 3000 }).catch(() => {})
  await tb(page, '粗體').tap()
  await tb(page, '文字顏色').tap(); await toolbar(page).getByRole('button', { name: '綠色', exact: true }).tap()
  ok(await page.getByTestId('card-format-scope').isVisible(), 'touch: selection survives toolbar taps')
  const tbBox = await toolbar(page).boundingBox()
  ok(tbBox.x >= 0 && tbBox.x + tbBox.width <= 390, `touch: toolbar with hint fits 390px (${Math.round(tbBox.x)}–${Math.round(tbBox.x + tbBox.width)})`)
  const small = await toolbar(page).locator('button').evaluateAll(bs => bs.filter(b => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44 }).length)
  ok(small === 0, `touch: every toolbar button ≥ 44pt (${small} too small)`)
  await page.screenshot({ path: `${SHOTS}/4-phone-editing.png` })
  await blank(page)
  w = lastWrite(PLAIN)
  ok(JSON.stringify(marksOf(w?.metadata?.inline, '重點')) === '["bold","textColor:green"]', `touch: words formatted and saved ${JSON.stringify(marksOf(w?.metadata?.inline, '重點'))}`)
  await page.screenshot({ path: `${SHOTS}/5-phone-card-face.png` })
  ok(page.errors.length === 0, `phone whiteboard: no page errors ${page.errors.join(' | ')}`)

  // Phone notebook: the keyboard toolbar swaps to a colour row.
  await page.goto(base + '/notebook'); await page.getByText('顏色測試', { exact: true }).first().tap()
  const pnb = page.locator('.tiptap').first(); await pnb.waitFor()
  await pnb.tap(); await selectLast(page, 2)
  await page.getByRole('button', { name: '螢光筆', exact: true }).tap()
  const swatch = page.getByRole('button', { name: '粉紅色', exact: true })
  ok(await swatch.isVisible(), 'phone notebook: marker swatches replace the toolbar row')
  await page.screenshot({ path: `${SHOTS}/6-phone-notebook-palette.png` })
  await swatch.tap(); await sleep(1800)
  ok(JSON.stringify(marksOf({ content: notebookRow.content?.attrs?.styled ?? [] }, '變色')) === '["textHighlight:pink"]', `phone notebook: marker saved ${JSON.stringify(marksOf({ content: notebookRow.content?.attrs?.styled ?? [] }, '變色'))}`)
  ok(page.errors.length === 0, `phone notebook: no page errors ${page.errors.join(' | ')}`)
} catch (e) { console.log('FAIL: crashed —', e.message); fails++; try { const pages = browser.contexts().flatMap(c => c.pages()); await pages.at(-1)?.screenshot({ path: `${SHOTS}/crash.png` }) } catch {} }
finally { await browser?.close(); if (server) try { process.kill(-server.pid) } catch {} }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0)
