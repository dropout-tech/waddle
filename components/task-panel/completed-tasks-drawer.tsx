'use client'

import { useMemo } from 'react'
import { CheckCircle2, Flame, Clock, TrendingUp, Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import type { Workspace, Task } from '@/lib/types'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

interface CompletedTasksDrawerProps {
  workspaces: Workspace[]
  isOpen: boolean
  onClose: () => void
  onSelectTask?: (task: Task) => void
}

interface CompletedFlat extends Task {
  // Snapshot of workspace + category at render time so the drawer survives
  // a re-render where the task got moved out of its source category.
  workspaceColor: string
  categoryName: string
}

const WEEKDAY_LABEL = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

/** Drop the time component; "2026-05-11T08:32:00Z" → "2026-05-11" (local). */
function dateKey(iso: string): string {
  return toDateString(new Date(iso))
}

/** Friendly group label given a date and a reference "today". */
function groupLabel(d: string, today: string, yesterday: string, sevenDaysAgo: string, fourteenDaysAgo: string): string {
  if (d === today) return '今天'
  if (d === yesterday) return '昨天'
  if (d >= sevenDaysAgo) return '本週稍早'
  if (d >= fourteenDaysAgo) return '上週'
  // Older — bucket by month for readability.
  const [y, m] = d.split('-')
  return `${parseInt(y, 10)} 年 ${parseInt(m, 10)} 月`
}

/** "幾天前 / 幾小時前 / 幾分鐘前" — humanized duration label. */
function humanizeMinutes(mins: number): string {
  if (!Number.isFinite(mins) || mins < 0) return '—'
  if (mins < 60) return `${Math.round(mins)} 分`
  const hours = mins / 60
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} 小時`
  const days = hours / 24
  if (days < 14) return `${days.toFixed(days < 10 ? 1 : 0)} 天`
  return `${Math.round(days / 7)} 週`
}

export function CompletedTasksDrawer({
  workspaces,
  isOpen,
  onClose,
  onSelectTask,
}: CompletedTasksDrawerProps) {
  // Flatten all completed tasks. We require completedAt; rows without a
  // timestamp (pre-toggleTaskComplete-write-through completions) won't appear
  // here — the migration backfills them from updated_at, but if a user
  // doesn't run it those rows are silently skipped. We could also include
  // them under a "未知時間" bucket; opting for skip to keep stats honest.
  const completed = useMemo<CompletedFlat[]>(() => {
    const out: CompletedFlat[] = []
    for (const ws of workspaces) {
      if (ws.isArchived) continue
      for (const cat of ws.categories) {
        if (cat.isArchived) continue
        for (const t of cat.tasks) {
          if (!t.isCompleted) continue
          if (!t.completedAt) continue
          out.push({
            ...t,
            workspaceColor: ws.color,
            categoryName: cat.name,
          })
        }
      }
    }
    // Newest first — that's almost always what the user wants to see.
    out.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    return out
  }, [workspaces])

  const stats = useMemo(() => {
    const now = new Date()
    const todayStr = toDateString(now)
    // Week start: Monday-anchored. Some users prefer Sunday-anchored but
    // weekly metrics typically use ISO weeks so Monday wins by default.
    const dayOfWeek = (now.getDay() + 6) % 7 // Monday = 0
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - dayOfWeek)
    weekStart.setHours(0, 0, 0, 0)
    const weekStartStr = toDateString(weekStart)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthStartStr = toDateString(monthStart)

    let weekCount = 0
    let monthCount = 0
    let totalMinutes = 0
    let totalMinutesCount = 0
    const hourBuckets = new Array(24).fill(0) as number[]

    for (const t of completed) {
      const dateStr = dateKey(t.completedAt!)
      if (dateStr >= weekStartStr) weekCount++
      if (dateStr >= monthStartStr) monthCount++
      if (t.createdAt) {
        const ms = new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()
        if (ms > 0) {
          totalMinutes += ms / 60000
          totalMinutesCount++
        }
      }
      const completedHour = new Date(t.completedAt!).getHours()
      hourBuckets[completedHour]++
    }

    // Streak: consecutive days with at least one completion, walking back
    // from today. Stops at the first day with zero. Capped at 365 so a
    // very long-running user doesn't pay an O(N) scan per render.
    let streak = 0
    const completedDayset = new Set(completed.map((t) => dateKey(t.completedAt!)))
    const cursor = new Date(now)
    cursor.setHours(0, 0, 0, 0)
    // If today has no completion yet, the streak doesn't count today but
    // may still continue from yesterday — that's the intuitive behavior.
    if (!completedDayset.has(toDateString(cursor))) {
      cursor.setDate(cursor.getDate() - 1)
    }
    for (let i = 0; i < 365; i++) {
      if (completedDayset.has(toDateString(cursor))) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
      } else {
        break
      }
    }

    let topHour = -1
    let topHourCount = 0
    for (let h = 0; h < 24; h++) {
      if (hourBuckets[h] > topHourCount) {
        topHour = h
        topHourCount = hourBuckets[h]
      }
    }

    return {
      total: completed.length,
      week: weekCount,
      month: monthCount,
      avgMinutes: totalMinutesCount > 0 ? totalMinutes / totalMinutesCount : null,
      topHour: topHour >= 0 ? topHour : null,
      topHourCount,
      streak,
    }
  }, [completed])

  // Group rows by friendly label. Order matters — render in the same order
  // we generate the labels in (today, yesterday, this week, last week, …).
  const groups = useMemo(() => {
    const today = toDateString(new Date())
    const yest = new Date()
    yest.setDate(yest.getDate() - 1)
    const yesterday = toDateString(yest)
    const seven = new Date()
    seven.setDate(seven.getDate() - 7)
    const sevenStr = toDateString(seven)
    const fourteen = new Date()
    fourteen.setDate(fourteen.getDate() - 14)
    const fourteenStr = toDateString(fourteen)

    const buckets: Array<{ label: string; tasks: CompletedFlat[] }> = []
    const indexByLabel = new Map<string, number>()
    for (const t of completed) {
      const d = dateKey(t.completedAt!)
      const label = groupLabel(d, today, yesterday, sevenStr, fourteenStr)
      let idx = indexByLabel.get(label)
      if (idx === undefined) {
        idx = buckets.length
        indexByLabel.set(label, idx)
        buckets.push({ label, tasks: [] })
      }
      buckets[idx].tasks.push(t)
    }
    return buckets
  }, [completed])

  return (
    <Sheet open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col gap-0"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            已完成任務
          </SheetTitle>
          <SheetDescription className="text-xs">
            共 {stats.total} 個任務，本週完成 {stats.week} 個。
          </SheetDescription>
        </SheetHeader>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-2 px-5 py-4 border-b border-border bg-muted/30">
          <StatCard
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            label="本週完成"
            value={String(stats.week)}
            sub={`本月 ${stats.month}`}
          />
          <StatCard
            icon={<Flame className="w-3.5 h-3.5" />}
            label="連續天數"
            value={String(stats.streak)}
            sub={stats.streak > 0 ? '繼續加油' : '今天開始吧'}
          />
          <StatCard
            icon={<Clock className="w-3.5 h-3.5" />}
            label="平均耗時"
            value={stats.avgMinutes !== null ? humanizeMinutes(stats.avgMinutes) : '—'}
            sub="從建立到完成"
          />
          <StatCard
            icon={<CalendarIcon className="w-3.5 h-3.5" />}
            label="最常完成"
            value={stats.topHour !== null ? `${String(stats.topHour).padStart(2, '0')}:00` : '—'}
            sub={stats.topHour !== null ? `${stats.topHourCount} 次` : '尚無資料'}
          />
        </div>

        {/* Grouped list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 opacity-30 mb-3" />
              <p className="text-sm">還沒有完成任何任務</p>
              <p className="text-xs mt-1 opacity-80">勾選一個任務就會出現在這裡</p>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.label} className="mb-5 last:mb-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 sticky top-0 bg-background/95 backdrop-blur-sm py-1 -mx-1 px-1 z-10">
                  {g.label}
                  <span className="ml-2 text-muted-foreground/60 normal-case font-normal">{g.tasks.length}</span>
                </h3>
                <ul className="space-y-1.5">
                  {g.tasks.map((t) => (
                    <CompletedRow key={t.id} task={t} onSelect={onSelectTask} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-semibold text-foreground leading-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground/80">{sub}</div>
    </div>
  )
}

function CompletedRow({ task, onSelect }: { task: CompletedFlat; onSelect?: (t: Task) => void }) {
  const completedAt = task.completedAt!
  const t = new Date(completedAt)
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  const weekday = WEEKDAY_LABEL[t.getDay()]
  const m = t.getMonth() + 1
  const d = t.getDate()

  // Time-to-complete (createdAt → completedAt). Useful glance at how long
  // each task took to actually get done.
  let elapsed: string | null = null
  if (task.createdAt) {
    const mins = (t.getTime() - new Date(task.createdAt).getTime()) / 60000
    if (mins > 0) elapsed = humanizeMinutes(mins)
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(task)}
        className={cn(
          'group w-full text-left rounded-lg border border-border bg-card px-3 py-2',
          'flex items-start gap-3 transition-colors',
          'hover:bg-muted/40',
        )}
      >
        <div
          className="mt-1 flex-shrink-0 w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: task.workspaceColor }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground line-through decoration-muted-foreground/40 truncate">
            {task.title || '（未命名任務）'}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{task.workspaceName} · {task.categoryName}</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-[11px] font-mono text-muted-foreground">
            {m}/{d}（{weekday}）
          </div>
          <div className="text-xs font-mono text-foreground/80">{hh}:{mm}</div>
          {elapsed && (
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">耗時 {elapsed}</div>
          )}
        </div>
      </button>
    </li>
  )
}
