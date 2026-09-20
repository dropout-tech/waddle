/* eslint-disable no-console -- reproducible marketing captures */
// Render real application components with public fictional demo data.
// Every REST request is fulfilled locally. Only email authentication is live.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const base = process.env.E2E_BASE_URL || 'http://localhost:3187'
const english = process.argv.includes('--locale=en')
const text = value => english ? translations[value] || value : value
const translations = {
 '創作工作室': 'Creative studio', '秋日品牌企劃': 'Autumn brand story',
 '整理品牌故事與靈感': 'Gather stories and inspiration', '完成首頁文案初稿': 'Draft the homepage copy', '和插畫師討論視覺方向': 'Review artwork with the illustrator', '挑選週報的三張照片': 'Choose three newsletter photos', '整理明天的提案重點': 'Outline the next proposal',
 '寫出第一版故事': 'Write the first story', '選出三張參考圖': 'Choose three reference images', '完成首頁文案': 'Finish the homepage copy', '今天想完成的事': 'A few things for today',
 '秋日品牌企劃\n\n把日常裡的小片刻，\n寫成讓人想靠近的故事。': 'Autumn brand story\n\nTurn small everyday moments\ninto stories that feel welcoming.',
 '寫出第一版故事\n選出三張參考圖\n完成首頁文案': 'Write the first story\nChoose three reference images\nFinish the homepage copy',
 '留給明天的靈感\n\n暖色、紙張、午後的光。\n少一點說明，多一點感受。': 'Ideas for tomorrow\n\nWarm colors, paper, afternoon light.\nLess explaining. More feeling.',
 '讓品牌故事慢慢成形': 'Give the brand story room to grow', '正在整理第一版提案': 'Shaping the first proposal', '先完成故事與文案，下午再對齊視覺方向。': 'Story and copy first. Align the artwork this afternoon.', '午餐，出去走走': 'Lunch and a walk',
}
const localize = value => typeof value === 'string' ? text(value) : Array.isArray(value) ? value.map(localize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, localize(entry)])) : value
const env = Object.fromEntries(readFileSync('.env.e2e.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
const now = new Date().toISOString()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const workspaces = [{ id: id(1), name: '創作工作室', color: '#C88B72', icon: '🌿', sort_order: 0, is_archived: false, is_default: false }]
const categories = [{ id: id(2), workspace_id: id(1), name: '秋日品牌企劃', sort_order: 0, is_collapsed: false, is_archived: false, is_default: false }]
const tasks = [
 ['整理品牌故事與靈感', '09:00', '10:00', true],
 ['完成首頁文案初稿', '10:30', '12:00', false],
 ['和插畫師討論視覺方向', '14:00', '15:00', false],
 ['挑選週報的三張照片', null, null, false],
 ['整理明天的提案重點', '16:00', '17:00', false],
].map(([title, start, end, done], i) => ({ id: id(10 + i), workspace_id: id(1), category_id: id(2), title, task_type: 'one_time', urgency: i === 1 ? 7 : 3, sort_order: i, estimated_minutes: 60, is_completed: done, is_archived: false, is_recurring: false, show_in_task_list: true, scheduled_date: start ? date : null, scheduled_start_time: start, scheduled_end_time: end, calendar_color: '#D9A18C', created_at: now, updated_at: now, is_meeting: i === 2, completed_at: done ? now : null }))
const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const checklist = { type: 'doc', content: [{ type: 'taskList', content: [['寫出第一版故事', true], ['選出三張參考圖', true], ['完成首頁文案', false]].map(([text, checked]) => ({ type: 'taskItem', attrs: { checked }, content: [paragraph(text)] })) }] }
const scratchpad_items = [
 { id: id(31), date, type: 'text', content: '秋日品牌企劃\n\n把日常裡的小片刻，\n寫成讓人想靠近的故事。', sort_order: 0, metadata: { canvas: { x: 65, y: 60, width: 350, height: 240 } }, created_at: now },
 { id: id(32), date, type: 'text', title: '今天想完成的事', content: '寫出第一版故事\n選出三張參考圖\n完成首頁文案', sort_order: 1, metadata: { canvas: { x: 510, y: 70, width: 365, height: 250 }, document: checklist }, created_at: now },
 { id: id(33), date, type: 'text', content: '留給明天的靈感\n\n暖色、紙張、午後的光。\n少一點說明，多一點感受。', sort_order: 2, metadata: { canvas: { x: 135, y: 385, width: 420, height: 200 } }, created_at: now },
]
const settings = { calendar_start_hour: 8, calendar_end_hour: 19, default_view: 'day', week_start_day: 1, day_view_days: 1, week_view_days: 7, keep_completed_today_in_list: true, show_category_prefix: false, default_category_enabled: false, quick_links: [], weather_city: 'Taipei', weather_unit: 'celsius', lunch_break: { enabled: true, startTime: '12:00', endTime: '13:00', color: '#EEF1E6' }, buffer_time: { enabled: false, defaultDuration: 30 }, default_task_colors: {}, onboarding_completed: true, focus_board: { enabled: true, global: { mode: 'text', text: '讓品牌故事慢慢成形' }, byWorkspace: {}, cards: [{ categoryId: id(2), status: { mode: 'text', text: '正在整理第一版提案' }, remarks: '先完成故事與文案，下午再對齊視覺方向。', sortOrder: 0 }] } }
const fixtures = { workspaces, categories, tasks, scratchpad_items, time_blocks: [{ id: id(50), date, start_time: '12:00', end_time: '13:00', type: 'break', label: '午餐，出去走走', color: '#A9B7A0', is_recurring: false }] }
const browser = await chromium.launch()
const context = await browser.newContext({ locale: english ? 'en-US' : 'zh-TW', timezoneId: 'Asia/Taipei', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
await context.addInitScript(lang => localStorage.setItem('waddle-language-v1', lang), english ? 'en' : 'zh-TW')
const page = await context.newPage()
const mutations = []
await context.route('**/rest/v1/**', async route => {
 const r = route.request(), url = new URL(r.url()), table = url.pathname.split('/').pop()
 if (url.pathname.endsWith('/rpc/get_share_peers')) return route.fulfill({ json: [] })
 if (r.method() !== 'GET') { mutations.push({ table, method: r.method() }); return route.fulfill({ json: [] }) }
 if (table === 'user_settings') return route.fulfill({ json: localize(settings) })
 return route.fulfill({ json: localize(fixtures[table] || []) })
})
const capture = async filename => {
 await page.evaluate(() => document.fonts.ready)
 // Remove only Next.js development tooling, never product UI.
 await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
 await page.mouse.move(1438, 998)
 const visibleText = await page.locator('body').innerText()
 assert.ok(!visibleText.includes(env.E2E_EMAIL), 'Never capture the account email')
 if (english) assert.ok(!/[\p{Script=Han}]/u.test(visibleText), 'English captures must contain no visible Chinese labels or content')
 await page.screenshot({ path: `public/marketing/${english ? filename.replace('.png', '-en.png') : filename}`, animations: 'disabled' })
}
try {
 await page.goto(base + '/login', { waitUntil: 'domcontentloaded' })
 await page.locator('#email').fill(env.E2E_EMAIL)
 await page.locator('#password').fill(env.E2E_PASSWORD)
 await page.locator('button[type=submit]').click()
 await page.waitForURL(url => url.pathname === '/', { timeout: 60000, waitUntil: 'domcontentloaded' })
 await page.getByText(text('完成首頁文案初稿'), { exact: true }).first().waitFor({ timeout: 30000 })
 await page.waitForTimeout(1200)
 mkdirSync('public/marketing', { recursive: true })
 await capture('workspace-demo.png')
 await page.goto(base + '/float/scratchpad', { waitUntil: 'domcontentloaded' })
 await page.getByTestId('scratchpad-canvas').waitFor()
 await page.getByText(text('今天想完成的事'), { exact: true }).first().waitFor()
 await capture('whiteboard-demo.png')
 const card = page.locator(`[data-canvas-item="${id(32)}"]`)
 await card.getByTestId('canvas-drag-handle').focus()
 await card.getByRole('button', { name: english ? 'Open content' : '開啟內容', exact: true }).click()
 await page.getByRole('dialog', { name: english ? 'Whiteboard content' : '白板內容', exact: true }).locator('.tiptap').waitFor()
 await capture('whiteboard-detail-demo.png')
 assert.equal(mutations.length, 0, 'Captures must not trigger application mutations')
 console.log('Captured three real product screens using fictional local fixtures only.')
} finally { await context.close(); await browser.close() }
