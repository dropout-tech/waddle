/* eslint-disable no-console -- executable regression script */
// Inline calculator ("120*3=" → "120*3=360") in notebook (Tiptap) and whiteboard textarea.
// Starts `next dev` on 3173 unless E2E_BASE_URL is set. Supabase REST is mocked — only login hits the real API.
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.e2e.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
const base = process.env.E2E_BASE_URL || 'http://localhost:3173'
const server = process.env.E2E_BASE_URL ? null : spawn('pnpm',['exec','next','dev','-p','3173'],{stdio:'ignore',detached:true})
const SHOTS = 'docs/reports/2026-09-29-inline-math'; mkdirSync(SHOTS,{recursive:true})
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) fails++ }
let notebookRow = {id:'00000000-0000-4000-8000-000000000201',title:'算式測試',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'開頭'}]}]},sort_order:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),is_archived:false}
const writes = []
let browser
try {
  for (let i=0;i<180;i++){ try { if ((await fetch(base+'/login')).ok) break } catch {} await sleep(1000) }
  browser = await chromium.launch()
  const context = await browser.newContext({ locale:'zh-TW', viewport:{ width:1280, height:900 } })
  await context.addInitScript(() => { try { localStorage.setItem('waddle-language-v1','zh-TW') } catch {} })
  await context.route('**/rest/v1/**', async route => {
    const r = route.request(), table = new URL(r.url()).pathname.split('/').pop()
    if (table === 'notebook_notes') { if (r.method()==='GET') return route.fulfill({json:[notebookRow]}); notebookRow = {...notebookRow, ...r.postDataJSON()}; return route.fulfill({json:[]}) }
    if (table === 'scratchpad_items' && r.method() !== 'GET') { writes.push(r.postDataJSON()); return route.fulfill({json:[]}) }
    return route.fulfill({json:[]})
  })
  const page = await context.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto(base+'/login?method=email'); await page.locator('#email').fill(env.E2E_EMAIL); await page.locator('#password').fill(env.E2E_PASSWORD)
  await page.locator('button[type=submit]').click(); await page.waitForURL(u=>!u.pathname.includes('/login'),{timeout:90000})

  // --- Notebook (Tiptap) ---
  await page.goto(base+'/notebook'); await page.getByText('算式測試',{exact:true}).click()
  const ed = page.locator('.tiptap'); await ed.waitFor()
  await ed.click(); await page.keyboard.press('End')
  await page.keyboard.type(' 120*3=')
  ok((await ed.innerText()).includes('120*3=360'), `notebook: "120*3=" → ${JSON.stringify(await ed.innerText())}`)
  await page.keyboard.press('Backspace')
  ok((await ed.innerText()).trim().endsWith('120*3='), 'notebook: Backspace right after undoes the result')
  await page.keyboard.press('Enter'); await page.keyboard.type('(1200+300)*0.8=')
  ok((await ed.innerText()).includes('(1200+300)*0.8=1200'), 'notebook: parentheses')
  await page.keyboard.press('Enter'); await page.keyboard.type('原價 200+10%=')
  ok((await ed.innerText()).includes('200+10%=220'), 'notebook: calculator percent 200+10% = 220')
  await page.keyboard.press('Enter'); await page.keyboard.type('a = b')
  ok((await ed.innerText()).includes('a = b'), 'notebook: plain "a = b" untouched')
  await sleep(1500)
  ok(JSON.stringify(notebookRow.content).includes('200+10%=220'), 'notebook: result saved to note content')
  await page.screenshot({ path: `${SHOTS}/1-notebook.png` })

  // --- Whiteboard inline card editor (Tiptap, one paragraph per line; desktop + 390px) ---
  const text = el => el.evaluate(n => [...n.querySelectorAll('p')].map(p => p.textContent).join('\n'))
  const caretAtEnd = el => el.evaluate(n => { const s = getSelection(); const r = document.createRange(); r.selectNodeContents(n); r.setEnd(s.focusNode, s.focusOffset); return s.isCollapsed && r.toString().length === n.textContent.length })
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
    await page.goto(base+'/float/scratchpad'); await page.getByTestId('scratchpad-canvas').waitFor()
    await page.getByRole('button', { name:'文字', exact:true }).first().click()
    const ta = page.getByTestId('scratchpad-canvas').getByLabel('畫布內容', { exact:true }); await ta.waitFor()
    await ta.pressSequentially('500*15%=')
    ok(await text(ta) === '500*15%=75', `whiteboard ${width}px: "500*15%=" → ${JSON.stringify(await text(ta))}`)
    await ta.pressSequentially('\n12*3=')
    const v = await text(ta), caret = await caretAtEnd(ta)
    ok(v === '500*15%=75\n12*3=36' && caret, `whiteboard ${width}px: second line + caret at end (${JSON.stringify(v)}, caret at end ${caret})`)
    await page.screenshot({ path: `${SHOTS}/2-whiteboard-${width}.png` })
    await ta.press('Meta+Enter'); await sleep(800)
    ok(writes.some(w => w?.content === '500*15%=75\n12*3=36'), `whiteboard ${width}px: saved content includes results`)
  }
  ok(errors.length === 0, `no page errors (${errors.join(' | ')})`)
} catch (e) { console.log('FAIL: crashed —', e.message); fails++ }
finally { await browser?.close(); if (server) try { process.kill(-server.pid) } catch {} }
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0)
