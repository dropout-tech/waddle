import type { Task, TimeBlock, NotebookNote, ScratchpadItem } from '@/lib/types'
import { taskOccursOnDate, toDateString } from '@/lib/calendar-utils'

export const widgetKinds = ['overview', 'calendar', 'agenda', 'tasks', 'top-three', 'whiteboard', 'notebook', 'focus-note', 'focus', 'water', 'shortcuts'] as const
export type WidgetKind = typeof widgetKinds[number]
export const widgetNames: Record<WidgetKind, string> = {
  overview: '月曆＋今日任務', calendar: '可視化小月曆', agenda: '近期行程', tasks: '任務清單',
  'top-three': '今天三件事', whiteboard: '白板', notebook: '記事本', 'focus-note': '專注記事', focus: '專注計時', water: '喝水提醒', shortcuts: '隨手記入口',
}
export interface WidgetItem { id: string; title: string; subtitle: string; date?: string; time?: string; completed?: boolean; actionable?: boolean; revision?: string; thumbnail?: string }
export interface WidgetSnapshot {
  schemaVersion: 1; accountId: string; epoch: string; generatedAt: string; today: string; locale: string
  tasks: WidgetItem[]; agenda: WidgetItem[]; notes: WidgetItem[]; boards: WidgetItem[]
  days: { date: string; day: number; inMonth: boolean; count: number }[]
  focus: { mode?: 'pomodoro' | 'stopwatch'; state: string; title: string; endAt: number | null; seconds: number; note: string }
  water: { enabled: boolean; nextAt: number | null; count: number }
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
export function makeSnapshot(input: { accountId: string; epoch: string; tasks: Task[]; blocks: TimeBlock[]; notes?: NotebookNote[]; boards: Record<string, ScratchpadItem[]>; now?: Date; locale?: string }): WidgetSnapshot {
  const now = input.now ?? new Date(), today = toDateString(now)
  const tasks = input.tasks.filter(t => !t.isArchived)
  const toItem = (t: Task, date?: string): WidgetItem => ({ id: t.id, title: t.title.slice(0, 80), subtitle: t.categoryName.slice(0, 40), date: date ?? t.scheduledDate ?? t.dueDate, time: t.scheduledStartTime, completed: t.isCompleted, actionable: !t.isRecurring && !t.isMeeting, revision: t.updatedAt })
  const days = monthDays(now).map(d => ({ ...d, count: tasks.filter(t => taskOccursOnDate(t, new Date(`${d.date}T12:00:00`))).length + input.blocks.filter(b => b.date === d.date).length }))
  const agenda: WidgetItem[] = []
  for (let n = 0; n < 7; n++) {
    const date = new Date(now); date.setDate(date.getDate() + n); const key = toDateString(date)
    tasks.filter(t => !t.isCompleted && taskOccursOnDate(t, new Date(`${key}T12:00:00`)) && t.scheduledStartTime).forEach(t => agenda.push(toItem(t, key)))
    input.blocks.filter(b => b.date === key).forEach(b => agenda.push({ id: b.id, title: b.label.slice(0, 80), subtitle: '時間區塊', date: key, time: b.startTime }))
  }
  agenda.sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  return {
    schemaVersion: 1, accountId: input.accountId, epoch: input.epoch, generatedAt: now.toISOString(), today, locale: input.locale ?? 'zh-TW',
    days, tasks: tasks.filter(t => t.showInTaskList !== false && !t.isMeeting && (taskOccursOnDate(t, now) || (!t.scheduledDate && (!t.dueDate || t.dueDate <= today))))
      .sort((a,b) => Number(a.isCompleted) - Number(b.isCompleted) || a.sortOrder - b.sortOrder).slice(0, 20).map(t => toItem(t)),
    agenda: agenda.slice(0, 20), notes: (input.notes ?? []).filter(n => !n.isArchived).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map(n => ({ id:n.id, title:n.title.slice(0,80) || '未命名筆記', subtitle:plainText(n.content) })),
    boards: Object.entries(input.boards).filter(([,items])=>items.length).sort(([a],[b])=>b.localeCompare(a)).slice(0,7).map(([date,items])=>({ id:date,date,title:`${date} 白板`,subtitle:items.filter(i=>i.type === 'text' || i.type === 'todo').map(i=>i.title || i.content).join(' · ').slice(0,160) })),
    focus: { state:'idle',title:'慢慢來，先專心一件事',endAt:null,seconds:1500,note:'' }, water:{enabled:false,nextAt:null,count:0},
  }
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
