import type { Task, TimeBlock, NotebookNote, ScratchpadItem, StickyNote } from '@/lib/types'
import { taskOccursOnDate, toDateString } from '@/lib/calendar-utils'
import type { WidgetPet } from './pet'

export const widgetKinds = ['overview', 'calendar', 'agenda', 'week', 'tasks', 'top-three', 'whiteboard', 'notebook', 'focus-note', 'focus', 'shortcuts', 'pet', 'month', 'sticky'] as const
export type WidgetKind = typeof widgetKinds[number]
export const widgetNames: Record<WidgetKind, string> = {
  overview: '月曆＋今日任務', calendar: '可視化小月曆', agenda: '近期行程', week: '本週時間表', tasks: '任務清單',
  'top-three': '今天三件事', whiteboard: '白板', notebook: '記事本', 'focus-note': '專注記事', focus: '專注計時', shortcuts: '隨手記入口',
  pet: '我的 Huddle', month: '大型月曆', sticky: '便條紙',
}
export interface WidgetItem { id: string; title: string; subtitle: string; date?: string; time?: string; completed?: boolean; actionable?: boolean; revision?: string; thumbnail?: string }
/** One scheduled slot for the native 本週時間表 widget (today + next 6 days). */
export interface WidgetSlot { date: string; start: string; end: string; title: string; color: string }
export const WEEK_SLOT_LIMIT = 40
/** One entry in a 大型月曆 day cell: task (checkbox), meeting (event) or time block. */
export interface WidgetSpanItem { title: string; color: string; type: 'task' | 'event' | 'block'; done?: boolean; time?: string }
/** A day of the 大型月曆 widget: the first SPAN_ITEMS entries plus the real total (for "+N"). */
export interface WidgetSpanDay { date: string; total: number; items: WidgetSpanItem[] }
/** 便條紙 widget: a sticky note reduced to plain text — first line as the title. */
export interface WidgetSticky { id: string; title: string; body: string; color: string; updatedAt: string }
export const SPAN_DAYS = 21
export const SPAN_ITEMS = 4
export const STICKY_LIMIT = 5
type StickySource = Pick<StickyNote, 'id' | 'content' | 'color' | 'updatedAt'>
export interface WidgetSnapshot {
  schemaVersion: 1; accountId: string; epoch: string; generatedAt: string; today: string; locale: string
  tasks: WidgetItem[]; agenda: WidgetItem[]; notes: WidgetItem[]; boards: WidgetItem[]
  /** Added after schemaVersion 1 shipped; the Swift side decodes it as optional. */
  week: WidgetSlot[]
  days: { date: string; day: number; inMonth: boolean; count: number }[]
  /** `total` = the pomodoro's full length in seconds (lock-screen ring); optional. */
  focus: { mode?: 'pomodoro' | 'stopwatch'; state: string; title: string; endAt: number | null; seconds: number; note: string; total?: number }
  water: { enabled: boolean; nextAt: number | null; count: number }
  /** 「我的 Huddle」 widget (lib/widgets/pet.ts). Optional: the Swift side decodes it as optional too. */
  pet?: WidgetPet
  /** 大型月曆: SPAN_DAYS days from this week's Monday. Optional (older native readers ignore it). */
  span?: WidgetSpanDay[]
  /** 便條紙: the most recently edited sticky notes. Optional for the same reason. */
  stickies?: WidgetSticky[]
  /** Today's daily check-in (Asia/Taipei day); optional so older native readers ignore it. */
  checkIn?: { date: string; checkedIn: boolean; points: number }
}
export function plainText(doc: unknown, depth = 0): string {
  if (!doc || typeof doc !== 'object' || depth > 20) return ''
  const n = doc as { text?: unknown; content?: unknown[] }
  return (typeof n.text === 'string' ? n.text : (Array.isArray(n.content) ? n.content.map(x => plainText(x, depth + 1)).join(' ') : '')).replace(/\s+/g, ' ').trim().slice(0, 160)
}
export function focusNoteTitle(today: string, label?: string) {
  return `專注記事 · ${today} · ${label ?? '自由專注'}`
}
export function focusNoteExcerpt(notes: NotebookNote[], today: string, label?: string) {
  return plainText(notes.find(n => !n.isArchived && n.title === focusNoteTitle(today, label))?.content)
}
export function monthDays(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 12)
  start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i)
    return { date: toDateString(d), day: d.getDate(), inMonth: d.getMonth() === date.getMonth(), count: 0 }
  })
}
/** Monday of the week containing `date` (local, noon so DST never shifts the day). */
export function spanStart(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  d.setDate(d.getDate() - (d.getDay() + 6) % 7)
  return d
}
const hexOr = (c: string | undefined, fallback = '#b04f38') => c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : fallback
/** 大型月曆: per day, timed entries first (by start), then untimed tasks; at most SPAN_ITEMS kept. */
export function makeSpan(now: Date, tasks: Task[], blocks: TimeBlock[]): WidgetSpanDay[] {
  const start = spanStart(now)
  return Array.from({ length: SPAN_DAYS }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i)
    const date = toDateString(d), noon = new Date(`${date}T12:00:00`)
    const all: WidgetSpanItem[] = [
      ...tasks.filter(t => taskOccursOnDate(t, noon)).map(t => ({
        title: t.title.slice(0, 20), color: hexOr(t.calendarColor || t.workspaceColor),
        type: t.isMeeting ? 'event' as const : 'task' as const,
        // A recurring master's flag isn't per occurrence — never show it ticked.
        done: !t.isRecurring && t.isCompleted, time: t.scheduledStartTime?.match(HHMM)?.[0],
      })),
      ...blocks.filter(b => b.date === date).map(b => ({ title: b.label.slice(0, 20), color: hexOr(b.color), type: 'block' as const, time: b.startTime?.match(HHMM)?.[0] })),
    ]
    all.sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || (a.time ?? '').localeCompare(b.time ?? '') || Number(!!a.done) - Number(!!b.done))
    return { date, total: all.length, items: all.slice(0, SPAN_ITEMS).map(({ done, time, ...x }) => ({ ...x, ...(done ? { done } : {}), ...(time ? { time } : {}) })) }
  })
}
/** Top-level blocks of a Tiptap doc as plain-text lines (paragraphs, list items, headings). */
function docLines(doc: unknown): string[] {
  const n = doc as { content?: unknown[] } | null
  if (!n || !Array.isArray(n.content)) return []
  return n.content.flatMap(b => {
    const x = b as { type?: string; content?: unknown[] }
    // Lists: one line per item, so a checklist reads like the note itself.
    return (x?.type === 'bulletList' || x?.type === 'orderedList' || x?.type === 'taskList') && Array.isArray(x.content) ? x.content.map(i => plainText(i)) : [plainText(b)]
  }).filter(Boolean)
}
/** 便條紙 widget: newest first, empty notes skipped, first line → title (≤40), the rest → body (≤140). */
export function stickySummaries(notes: StickySource[]): WidgetSticky[] {
  return notes.map(n => ({ n, lines: docLines(n.content) })).filter(x => x.lines.length)
    .sort((a, b) => b.n.updatedAt.localeCompare(a.n.updatedAt)).slice(0, STICKY_LIMIT)
    .map(({ n, lines }) => ({ id: n.id, title: lines[0].slice(0, 40), body: lines.slice(1).join(' ').slice(0, 140), color: n.color, updatedAt: n.updatedAt }))
}
/**
 * Pull the newest sticky notes in small pages until STICKY_LIMIT *non-blank* ones are in hand
 * (blank notes are skipped by stickySummaries, so a fixed `limit(12)` could leave the widget short).
 * `page` returns rows newest-first with a stable tiebreak; returns null if any page fails.
 */
export async function loadStickyRows<R extends StickySource>(page: (from: number, to: number) => PromiseLike<{ rows: R[] | null; error: unknown }>, pageSize = 20, maxPages = 5): Promise<R[] | null> {
  const all: R[] = []
  for (let i = 0; i < maxPages; i++) {
    const { rows, error } = await page(i * pageSize, (i + 1) * pageSize - 1)
    if (error) return null
    all.push(...(rows ?? []))
    if ((rows?.length ?? 0) < pageSize || stickySummaries(all).length >= STICKY_LIMIT) break
  }
  return all
}
export function makeSnapshot(input: { accountId: string; epoch: string; tasks: Task[]; blocks: TimeBlock[]; notes?: NotebookNote[]; boards: Record<string, ScratchpadItem[]>; stickies?: StickySource[]; now?: Date; locale?: string }): WidgetSnapshot {
  const now = input.now ?? new Date(), today = toDateString(now)
  const tasks = input.tasks.filter(t => !t.isArchived)
  const toItem = (t: Task, date?: string): WidgetItem => ({ id: t.id, title: t.title.slice(0, 80), subtitle: t.categoryName.slice(0, 40), date: date ?? t.scheduledDate ?? t.dueDate, time: t.scheduledStartTime, completed: t.isCompleted, actionable: !t.isRecurring && !t.isMeeting, revision: t.updatedAt })
  const days = monthDays(now).map(d => ({ ...d, count: tasks.filter(t => taskOccursOnDate(t, new Date(`${d.date}T12:00:00`))).length + input.blocks.filter(b => b.date === d.date).length }))
  const agenda: WidgetItem[] = [], week: WidgetSlot[] = []
  for (let n = 0; n < 7; n++) {
    const date = new Date(now); date.setDate(date.getDate() + n); const key = toDateString(date)
    const timed = tasks.filter(t => taskOccursOnDate(t, new Date(`${key}T12:00:00`)) && t.scheduledStartTime)
    const blocks = input.blocks.filter(b => b.date === key)
    timed.filter(t => !t.isCompleted).forEach(t => agenda.push(toItem(t, key)))
    blocks.forEach(b => agenda.push({ id: b.id, title: b.label.slice(0, 80), subtitle: '時間區塊', date: key, time: b.startTime }))
    // The week grid shows occupied hours, done or not.
    timed.forEach(t => pushSlot(week, key, t.scheduledStartTime, t.scheduledEndTime, t.title, t.calendarColor || t.workspaceColor))
    blocks.forEach(b => pushSlot(week, key, b.startTime, b.endTime, b.label, b.color))
  }
  agenda.sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  week.sort((a,b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
  return {
    schemaVersion: 1, accountId: input.accountId, epoch: input.epoch, generatedAt: now.toISOString(), today, locale: input.locale ?? 'zh-TW',
    days, tasks: tasks.filter(t => t.showInTaskList !== false && !t.isMeeting && (taskOccursOnDate(t, now) || (!t.scheduledDate && (!t.dueDate || t.dueDate <= today))))
      .sort((a,b) => Number(a.isCompleted) - Number(b.isCompleted) || a.sortOrder - b.sortOrder).slice(0, 20).map(t => toItem(t)),
    agenda: agenda.slice(0, 20), week: week.slice(0, WEEK_SLOT_LIMIT), notes: (input.notes ?? []).filter(n => !n.isArchived).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map(n => ({ id:n.id, title:n.title.slice(0,80) || '未命名筆記', subtitle:plainText(n.content) })),
    boards: Object.entries(input.boards).filter(([,items])=>items.length).sort(([a],[b])=>b.localeCompare(a)).slice(0,7).map(([date,items])=>({ id:date,date,title:`${date} 白板`,subtitle:items.filter(i=>i.type === 'text' || i.type === 'todo').map(i=>i.title || i.content).join(' · ').slice(0,160) })),
    focus: { state:'idle',title:'慢慢來，先專心一件事',endAt:null,seconds:1500,note:'' }, water:{enabled:false,nextAt:null,count:0},
    span: makeSpan(now, tasks, input.blocks),
    ...(input.stickies ? { stickies: stickySummaries(input.stickies) } : {}),
  }
}
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)/
/** Normalise a task / time block into a small, well-formed slot (HH:mm, #rrggbb). */
function pushSlot(out: WidgetSlot[], date: string, start: string | undefined, end: string | undefined, title: string, color: string | undefined) {
  const s = start?.match(HHMM); if (!s) return
  const from = Number(s[1]) * 60 + Number(s[2])
  const e = end?.match(HHMM), rawEnd = e ? Number(e[1]) * 60 + Number(e[2]) : from + 30
  // Missing / overnight ends get a default 30 min; nothing crosses midnight.
  const to = Math.min(24 * 60, rawEnd > from ? Math.max(rawEnd, from + 15) : from + 30)
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  out.push({ date, start: hhmm(from), end: hhmm(to), title: title.slice(0, 24), color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#b04f38' })
}
export type WidgetDestination = { kind: WidgetKind; id?: string; date?: string; accountId?: string; epoch?: string }
export function parseWidgetURL(raw: string): WidgetDestination | null {
  try {
    if (!/^huddle:\/\/widget\/[a-z-]+(?:\?|$)/.test(raw)) return null
    const u = new URL(raw)
    if (u.protocol !== 'huddle:' || u.hostname !== 'widget' || u.username || u.password || u.port) return null
    const kind = u.pathname.slice(1) as WidgetKind
    if (!widgetKinds.includes(kind)) return null
    const id = u.searchParams.get('id') ?? undefined, date = u.searchParams.get('date') ?? undefined
    if (id && !/^[a-zA-Z0-9-]{1,80}$/.test(id)) return null
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date)) return null
    return { kind,id,date,accountId:u.searchParams.get('accountId') ?? undefined,epoch:u.searchParams.get('epoch') ?? undefined }
  } catch { return null }
}
/**
 * The single in-app destination for every widget tap. Native widgets always
 * send `huddle://widget/<kind>?id=&date=` (HuddleWidgets.swift `url(_:)`);
 * this maps it onto a real screen:
 *   notebook → /notebook/?note=<id|new>   focus-note → /notebook/?note=focus
 *   sticky → /?widget=sticky&note=<id>     (sticky-note ids are not task ids)
 *   everything else → /?widget=<kind>&date=&task=  (MainLayout, use-widget-launch.ts)
 */
export function widgetPath(d: Pick<WidgetDestination, 'kind' | 'id' | 'date'>): string {
  if (d.kind === 'notebook') return d.id ? `/notebook/?note=${encodeURIComponent(d.id)}` : '/notebook/'
  if (d.kind === 'focus-note') return '/notebook/?note=focus'
  const q = new URLSearchParams({ widget: d.kind === 'tasks' && d.id === 'new' ? 'new-task' : d.kind })
  if (d.date) q.set('date', d.date)
  if (d.kind === 'sticky') { if (d.id) q.set('note', d.id); return `/?${q}` }
  // Whiteboard items carry the board date as their id — not a task.
  if (d.id && d.id !== 'new' && d.kind !== 'whiteboard') q.set('task', d.id)
  return `/?${q}`
}
