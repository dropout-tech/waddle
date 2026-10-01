// Writes a demo widget snapshot (fake data, no network, no database) straight
// into a booted iOS Simulator's App Group container, so the native widgets can
// be screenshotted without signing in. Used for docs/reports/2026-10-01-lockscreen-widgets.
//
//   node scripts/e2e/widget-fixture.mjs <app-group-container-dir> [--en] [--focus=running|paused|idle]
//
// Find the container with:
//   xcrun simctl get_app_container booted com.lazylazy.huddle group.com.lazylazy.huddle
// NOTE: launching the Huddle app while signed out resets the shared store, so
// write the fixture after the app has been installed and leave the app closed.
import { registerHooks } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('@/'))return next(pathToFileURL(resolve(specifier.slice(2)+'.ts')).href,context);return next(specifier,context)}})
const { makeSnapshot } = await import('../../lib/widgets/model.ts')

const dir = process.argv[2]
if (!dir) { console.error('usage: widget-fixture.mjs <container-dir> [--en] [--focus=running|paused|idle]'); process.exit(1) }
const en = process.argv.includes('--en')
const focusState = (process.argv.find(a => a.startsWith('--focus=')) ?? '--focus=running').slice(8)
const now = new Date()
const key = (offset) => { const d = new Date(now); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const hhmm = (minutesFromNow) => { const d = new Date(now.getTime() + minutesFromNow * 60000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const T = (zh, e) => en ? e : zh
const C = { work: '#b8482a', home: '#6f8057', study: '#5a7d9a', life: '#c9962b' }
let n = 0
const task = (day, zh, e, o = {}) => ({ id: `demo-${++n}`, title: T(zh, e), categoryName: T('工作', 'Work'), workspaceColor: C.work, calendarColor: C.work, isCompleted: false, scheduledDate: key(day), sortOrder: n, updatedAt: now.toISOString(), showInTaskList: true, isRecurring: false, isArchived: false, ...o })
const meet = (day, zh, e, start, end, color) => task(day, zh, e, { isMeeting: true, scheduledStartTime: start, scheduledEndTime: end, calendarColor: color, showInTaskList: false })
const block = (day, zh, e, start, end, color) => ({ id: `block-${++n}`, date: key(day), startTime: start, endTime: end, label: T(zh, e), color, type: 'focus', isRecurring: false })
// Week runs Monday-first; offsets are relative to today.
const tasks = [
  task(0, '寫完提案初稿', 'Finish proposal draft'), task(0, '回覆客戶信件', 'Reply to client', { isCompleted: true }),
  task(0, '買貓砂', 'Buy cat litter', { calendarColor: C.life }), task(0, '整理收據', 'Sort receipts', { calendarColor: C.home }),
  meet(0, '線上讀書會', 'Book club call', hhmm(40), hhmm(100), C.study), meet(0, '產品週會', 'Product sync', '10:00', '11:00', C.work),
  meet(1, '牙醫回診', 'Dentist', '09:30', '10:30', C.home), task(1, '交週報', 'Weekly report'),
  meet(2, '家庭聚餐', 'Family dinner', '18:00', '20:00', C.life),
  meet(4, '季度規劃會', 'Quarter planning', '10:00', '12:00', C.work), task(4, '繳房租', 'Pay rent', { calendarColor: C.home }),
  task(5, '寄出樣品', 'Ship samples'), task(5, '預約健檢', 'Book check-up', { calendarColor: C.home }),
  meet(7, '客戶簡報', 'Client pitch', '14:00', '15:30', C.work), task(7, '修改報價', 'Revise quote'), task(7, '訂機票', 'Book flights', { calendarColor: C.life }), task(7, '備份照片', 'Back up photos', { calendarColor: C.home }), task(7, '讀完第三章', 'Read chapter 3', { calendarColor: C.study }),
  meet(9, '面試新同事', 'Interview', '11:00', '12:00', C.work), task(11, '換季整理衣櫃', 'Closet swap', { calendarColor: C.home }),
  meet(13, '朋友婚禮', 'Wedding', '12:00', '15:00', C.life), task(15, '月底對帳', 'Month-end books'),
  task(-1, '更新履歷', 'Update CV', { isCompleted: true }), task(-2, '倒垃圾', 'Take out trash', { isCompleted: true, calendarColor: C.home }), meet(-2, '一對一', '1:1', '15:00', '15:30', C.work),
]
const blocks = [
  block(0, '晨跑', 'Morning run', '07:00', '07:45', C.home), block(1, '專注寫作', 'Deep writing', '14:00', '16:00', C.study),
  block(3, '瑜伽', 'Yoga', '08:00', '09:00', C.home), block(6, '專注寫作', 'Deep writing', '09:00', '11:00', C.study), block(7, '健身', 'Gym', '19:00', '20:00', C.home),
]
const doc = (...lines) => ({ type: 'doc', content: lines.map(t => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) })
const minsAgo = (m) => new Date(now.getTime() - m * 60000).toISOString()
const stickies = [
  { id: 'aaaa-1', color: 'yellow', updatedAt: minsAgo(12), content: doc(T('週末採買', 'Weekend groceries'), T('牛奶、雞蛋、吐司、香蕉，還有貓罐頭兩箱', 'Milk, eggs, bread, bananas and two cases of cat food')) },
  { id: 'aaaa-2', color: 'sage', updatedAt: minsAgo(60 * 26), content: doc(T('提案要提到的三點', 'Three points for the pitch'), T('成本、時程、風險各一頁', 'One page each: cost, timeline, risks')) },
  { id: 'aaaa-3', color: 'rose', updatedAt: minsAgo(60 * 50), content: doc(T('給媽媽的生日禮物', "Mom's birthday gift"), T('圍巾或是保溫杯', 'A scarf or a tumbler')) },
  { id: 'aaaa-4', color: 'cream', updatedAt: minsAgo(60 * 80), content: doc(T('書單', 'Reading list')) },
]
const snapshot = makeSnapshot({ accountId: 'demo-account', epoch: 'demo-epoch', tasks, blocks, boards: {}, notes: [], stickies, now, locale: en ? 'en' : 'zh-TW' })
const focusTotal = 50 * 60
snapshot.focus = focusState === 'running'
  ? { mode: 'pomodoro', state: 'running', title: T('寫提案', 'Proposal'), endAt: now.getTime() + 44 * 60000, seconds: 44 * 60, note: '', total: focusTotal }
  : focusState === 'paused'
    ? { mode: 'pomodoro', state: 'paused', title: T('寫提案', 'Proposal'), endAt: null, seconds: 31 * 60 + 20, note: '', total: focusTotal }
    : { state: 'idle', title: T('慢慢來，先專心一件事', 'One thing at a time'), endAt: null, seconds: 1500, note: '' }
snapshot.water = { enabled: true, nextAt: now.getTime() + 48 * 60000, count: 0 }
snapshot.pet = { adopted: true, name: T('豆豆', 'Bean'), color: 'ink', accessory: 'scarf', lang: en ? 'en' : 'zh-TW', overdue: 0, overdueLine: '', lines: [T('今天也慢慢來。', 'Slow and steady today.')] }
const state = { accountId: 'demo-account', epoch: 'demo-epoch', actions: [], snapshot, waterLog: { day: key(0), count: 3, last: now.getTime() - 35 * 60000 } }
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'widgets.json'), JSON.stringify(state))
console.log(`wrote ${join(dir, 'widgets.json')} (${JSON.stringify(state).length} bytes, focus=${focusState}, lang=${en ? 'en' : 'zh-TW'})`)
