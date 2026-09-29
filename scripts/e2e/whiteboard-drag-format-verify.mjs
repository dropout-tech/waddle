/* eslint-disable no-console -- executable regression script */
// Whiteboard: drag a card by its body (mouse: immediately; touch: after selecting),
// card-level text formatting toolbar, trackpad pinch (ctrl+wheel) zoom.
// Starts `next dev` on 3175 unless E2E_BASE_URL is set. Supabase REST is mocked — only login hits the real API.
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.e2e.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
const base = process.env.E2E_BASE_URL || 'http://localhost:3175'
const server = process.env.E2E_BASE_URL ? null : spawn('pnpm',['exec','next','dev','-p','3175'],{stdio:'ignore',detached:true})
const SHOTS = process.env.SHOT_DIR || 'docs/reports/2026-09-29-whiteboard-drag-format'; mkdirSync(SHOTS,{recursive:true})
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) fails++ }
const today = new Date().toLocaleDateString('en-CA')
const ID = '00000000-0000-4000-8000-000000000301'
let rows, writes
const reset = () => { rows = [{ id: ID, date: today, type: 'text', content: '拖我移動', sort_order: 0, metadata: { canvas: { x: 40, y: 80, width: 240, height: 180 } }, created_at: new Date().toISOString() }]; writes = [] }
const geometryWrites = () => writes.filter(w => w?.metadata?.canvas && w.metadata.canvas.x !== 40)
let browser
async function open(context) {
  await context.route('**/rest/v1/**', async route => {
    const r = route.request(), u = new URL(r.url()), table = u.pathname.split('/').pop(), id = u.searchParams.get('id')?.replace('eq.', '')
    if (table !== 'scratchpad_items') return route.fulfill({ json: [] })
    if (r.method() === 'GET') return route.fulfill({ json: rows })
    const body = r.postData() ? r.postDataJSON() : null; writes.push(body)
    if (r.method() === 'PATCH') rows = rows.map(x => x.id === id ? { ...x, ...body } : x)
    return route.fulfill({ json: r.method() === 'PATCH' ? { id } : [] })
  })
  const page = await context.newPage()
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message))
  await page.goto(base + '/login'); await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click(); await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 90000 })
  await page.goto(base + '/float/scratchpad'); await page.getByTestId('scratchpad-canvas').waitFor()
  await page.getByTestId('canvas-item').getByText('拖我移動').waitFor()
  return page
}
const card = page => page.getByTestId('canvas-item').filter({ hasText: '拖我移動' })

try {
  for (let i = 0; i < 180; i++) { try { if ((await fetch(base + '/login')).ok) break } catch {} await sleep(1000) }
  browser = await chromium.launch()

  // ---------- Desktop (mouse) ----------
  reset()
  const desk = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } })
  await desk.addInitScript(() => { try { if (!localStorage.getItem('waddle-language-v1')) localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })
  let page = await open(desk)
  let box = await card(page).boundingBox()
  // plain click on the text: selects, shows toolbar, writes nothing
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(400)
  ok(await page.getByTestId('card-format-toolbar').isVisible(), 'click selects the card and shows the format toolbar')
  ok(geometryWrites().length === 0, 'a click without movement writes no geometry')
  // drag by the body (not the corner handle)
  const sx = box.x + box.width / 2, sy = box.y + box.height / 2 + 20
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 60, sy + 40, { steps: 5 }); await page.mouse.move(sx + 120, sy + 80, { steps: 5 }); await page.mouse.up(); await sleep(600)
  const after = await card(page).boundingBox()
  ok(Math.abs(after.x - box.x - 120) < 3 && Math.abs(after.y - box.y - 80) < 3, `mouse drag from card body moves it (Δ ${Math.round(after.x - box.x)}, ${Math.round(after.y - box.y)})`)
  const g = geometryWrites().at(-1)?.metadata?.canvas
  ok(g && Math.abs(g.x - 160) < 3 && Math.abs(g.y - 160) < 3, `new position saved (${JSON.stringify(g)})`)
  // unselected card drags immediately with the mouse too
  const blank = await page.getByTestId('scratchpad-canvas').evaluate(el => { const b = el.getBoundingClientRect(); for (let y = b.bottom - 80; y > b.top + 20; y -= 30) for (let x = b.right - 40; x > b.left + 20; x -= 30) if (document.elementFromPoint(x, y) === el) return { x, y }; return null })
  await page.mouse.click(blank.x, blank.y); await sleep(300)
  ok(!(await page.getByTestId('card-format-toolbar').isVisible().catch(() => false)), 'clicking empty paper deselects (toolbar hidden)')
  box = await card(page).boundingBox()
  await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 60, box.y + 100, { steps: 6 }); await page.mouse.up(); await sleep(500)
  ok(Math.abs((await card(page).boundingBox()).x - (box.x - 40)) < 3, 'mouse drags an unselected card right away')

  // formatting toolbar
  const tb = page.getByTestId('card-format-toolbar')
  await tb.getByRole('button', { name: '放大字體' }).click(); await tb.getByRole('button', { name: '放大字體' }).click()
  await tb.getByRole('button', { name: '粗體' }).click(); await tb.getByRole('button', { name: '斜體' }).click(); await tb.getByRole('button', { name: '底線' }).click()
  await tb.getByRole('button', { name: '文字顏色' }).click(); await tb.getByRole('button', { name: '紅色' }).click()
  await tb.getByRole('button', { name: '螢光筆' }).click(); await tb.getByRole('button', { name: '黃色' }).click()
  await tb.getByRole('button', { name: '靠左對齊' }).click(); await sleep(600)
  const p = card(page).locator('p').first()
  const css = await p.evaluate(el => { const s = getComputedStyle(el); const span = el.querySelector('span'); return { size: s.fontSize, weight: s.fontWeight, style: s.fontStyle, deco: s.textDecorationLine, color: s.color, align: s.textAlign, wash: span ? getComputedStyle(span).backgroundColor : null } })
  ok(css.size === '26px' && css.weight === '700' && css.style === 'italic' && css.deco.includes('underline') && css.color === 'rgb(212, 72, 59)' && css.align === 'center' && /250, 204, 21/.test(css.wash ?? ''), `card text formatted: ${JSON.stringify(css)}`)
  const style = rows[0].metadata.style
  ok(style?.size === 'xl' && style.bold && style.italic && style.underline && style.color === 'red' && style.highlight === 'yellow' && style.align === 'center' && rows[0].metadata.canvas, `style saved alongside geometry: ${JSON.stringify(style)}`)
  ok(await tb.getByRole('button', { name: '粗體' }).getAttribute('aria-pressed') === 'true', 'bold button shows pressed state')
  await page.screenshot({ path: `${SHOTS}/1-desktop-formatted.png` })
  // edit mode keeps formatting and toolbar keeps focus in the text box
  await p.dblclick(); const ta = page.getByTestId('scratchpad-canvas').getByLabel('畫布內容', { exact: true }); await ta.waitFor()
  ok(await ta.evaluate(el => getComputedStyle(el).fontSize === '26px' && getComputedStyle(el).fontWeight === '700'), 'text box while editing shows the same size/bold')
  await tb.getByRole('button', { name: '粗體' }).click(); await sleep(300)
  ok(await ta.evaluate(el => document.activeElement === el && getComputedStyle(el).fontWeight === '400'), 'toolbar works while typing without stealing focus')
  await page.keyboard.press('Escape'); await sleep(300)

  // trackpad pinch = ctrl+wheel over the board
  const zoomLabel = () => page.getByTestId('scratchpad-canvas').locator('[aria-live="polite"]').innerText()
  const before = await zoomLabel()
  const prevented = await page.getByTestId('scratchpad-canvas').evaluate(el => { const r = el.getBoundingClientRect(); let last; for (let i = 0; i < 6; i++) { const ev = new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }); el.dispatchEvent(ev); last = ev.defaultPrevented } return last })
  await sleep(300); const zoomedIn = await zoomLabel()
  ok(before === '100%' && parseInt(zoomedIn) > 100 && prevented, `pinch-out zooms the board (${before} → ${zoomedIn}), page zoom blocked=${prevented}`)
  await page.getByTestId('scratchpad-canvas').evaluate(el => { const r = el.getBoundingClientRect(); for (let i = 0; i < 12; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, ctrlKey: true, clientX: r.left + 50, clientY: r.top + 50, bubbles: true, cancelable: true })) })
  await sleep(300); ok(parseInt(await zoomLabel()) < parseInt(zoomedIn), `pinch-in zooms out (${await zoomLabel()})`)
  const plainPrevented = await page.getByTestId('scratchpad-canvas').evaluate(el => { const ev = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true }); el.dispatchEvent(ev); return ev.defaultPrevented })
  ok(!plainPrevented, 'plain scroll wheel is not hijacked (page still scrolls)')
  ok(page.errors.length === 0, `desktop: no page errors ${page.errors.join(' | ')}`)

  // English labels
  await page.evaluate(() => localStorage.setItem('waddle-language-v1', 'en'))
  await page.reload(); await page.getByTestId('scratchpad-canvas').waitFor()
  const cardEn = page.getByTestId('canvas-item').first(); const bEn = await cardEn.boundingBox()
  await page.mouse.click(bEn.x + bEn.width / 2, bEn.y + bEn.height / 2); await sleep(300)
  const labels = await page.getByTestId('card-format-toolbar').locator('button').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
  ok(labels.length >= 8 && labels.every(l => l && !/[一-鿿]/.test(l)), `English toolbar labels: ${labels.join(', ')}`)
  await desk.close()

  // ---------- Phone (touch) ----------
  reset()
  const phone = await browser.newContext({ locale: 'zh-TW', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await phone.addInitScript(() => { try { if (!localStorage.getItem('waddle-language-v1')) localStorage.setItem('waddle-language-v1', 'zh-TW') } catch {} })
  page = await open(phone)
  const cdp = await phone.newCDPSession(page)
  const touchDrag = async (x, y, dx, dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }] }); await sleep(16) }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(500)
  }
  box = await card(page).boundingBox()
  await touchDrag(box.x + box.width / 2, box.y + box.height / 2, 60, 50)
  let moved = await card(page).boundingBox()
  ok(Math.abs(moved.x - box.x) < 3 && Math.abs(moved.y - box.y) < 3, 'touch: dragging an unselected card does not move it')
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await sleep(400)
  ok(await page.getByTestId('card-format-toolbar').isVisible(), 'touch: tap selects and shows the toolbar')
  if (process.env.DEBUG_TOUCH) await page.evaluate(() => { window.__log = []; for (const t of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture']) document.addEventListener(t, e => window.__log.push(`${t}:${e.pointerType}:${e.target?.closest?.('[data-testid]')?.dataset.testid ?? e.target?.tagName}`), true) })
  await touchDrag(box.x + box.width / 2, box.y + box.height / 2, 60, 50)
  if (process.env.DEBUG_TOUCH) console.log('LOG', (await page.evaluate(() => window.__log)).join(' | ').slice(0, 1500))
  moved = await card(page).boundingBox()
  ok(Math.abs(moved.x - box.x - 60) < 4 && Math.abs(moved.y - box.y - 50) < 4, `touch: selected card drags (Δ ${Math.round(moved.x - box.x)}, ${Math.round(moved.y - box.y)})`)
  const tbBox = await page.getByTestId('card-format-toolbar').boundingBox()
  ok(tbBox.x >= 0 && tbBox.x + tbBox.width <= 390 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `touch: toolbar fits 390px (${Math.round(tbBox.x)}–${Math.round(tbBox.x + tbBox.width)})`)
  const small = await page.getByTestId('card-format-toolbar').locator('button').evaluateAll(els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44 }).length)
  ok(small === 0, `touch: every toolbar button ≥ 44pt (${small} too small)`)
  await page.screenshot({ path: `${SHOTS}/2-phone-selected.png` })
  ok(page.errors.length === 0, `phone: no page errors ${page.errors.join(' | ')}`)
} catch (e) { console.log('FAIL: crashed —', e.message.split('\n')[0]); fails++ }
finally { await browser?.close(); if (server) try { process.kill(-server.pid) } catch {} }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0)
