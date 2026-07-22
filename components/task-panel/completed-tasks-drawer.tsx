'use client'

import { useMemo } from 'react'
import { CheckCircle2, Flame, Clock, TrendingUp, Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import { forEachTask } from '@/lib/task-utils'
import type { Workspace, Task } from '@/lib/types'
import { getLang } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n/react'
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

/** Month bucket label. Current year drops the year prefix ("6 月"); older
 *  years keep it ("2025 年 6 月") so cross-year history stays unambiguous. */
function groupLabel(d: string, currentYear: number): string {
  const [y, m] = d.split('-')
  const year = parseInt(y, 10)
  const month = parseInt(m, 10)
  if (getLang() === 'en') {
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' })
    return year === currentYear ? monthName : `${monthName} ${year}`
  }
  return year === currentYear ? `${month} 月` : `${year} 年 ${month} 月`
}

/** "幾天前 / 幾小時前 / 幾分鐘前" — humanized duration label. */
function humanizeMinutes(mins: number): string {
  if (!Number.isFinite(mins) || mins < 0) return '—'
  const isEn = getLang() === 'en'
  if (mins < 60) return isEn ? `${Math.round(mins)} min` : `${Math.round(mins)} 分`
  const hours = mins / 60
  if (hours < 24) return isEn ? `${hours.toFixed(hours < 10 ? 1 : 0)} hr` : `${hours.toFixed(hours < 10 ? 1 : 0)} 小時`
  const days = hours / 24
  if (days < 14) return isEn ? `${days.toFixed(days < 10 ? 1 : 0)} d` : `${days.toFixed(days < 10 ? 1 : 0)} 天`
  return isEn ? `${Math.round(days / 7)} wk` : `${Math.round(days / 7)} 週`
}

/** Date + weekday for a completed row, e.g. "7/13（週日）" / "Jul 13 (Sun)". */
function formatDateWeekday(date: Date, isEn: boolean): string {
  if (isEn) {
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    return `${month} ${date.getDate()} (${date.toLocaleDateString('en-US', { weekday: 'short' })})`
  }
  return `${date.getMonth() + 1}/${date.getDate()}（${WEEKDAY_LABEL[date.getDay()]}）`
}

export function CompletedTasksDrawer({
  workspaces,
  isOpen,
  onClose,
  onSelectTask,
}: CompletedTasksDrawerProps) {
  // Aliased to `tr` — this file uses `t` as the loop variable name for
  // individual Task objects throughout, which would shadow the i18n
  // translate function.
  const { t: tr } = useI18n()
  // Flatten all completed tasks. Tasks without a completedAt timestamp
  // (e.g. ones completed before the write-through fix shipped, or rows
  // whose migration-0007 backfill didn't run) are kept in the list but
  // routed to a "未知時間" bucket and excluded from time-based stats so
  // they don't poison averages or the streak.
  const completed = useMemo<CompletedFlat[]>(() => {
    const out: CompletedFlat[] = []
    forEachTask(workspaces, (t, cat, ws) => {
      if (!t.isCompleted) return
      out.push({
        ...t,
        workspaceColor: ws.color,
        categoryName: cat.name,
      })
    })
    // Newest first — that's almost always what the user wants to see.
    // Tasks without completedAt sort to the bottom of their group via the
    // empty-string fallback in localeCompare.
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
    const completedDayset = new Set<string>()

    for (const t of completed) {
      if (!t.completedAt) continue // unknown-time bucket excluded from stats
      const dateStr = dateKey(t.completedAt)
      completedDayset.add(dateStr)
      if (dateStr >= weekStartStr) weekCount++
      if (dateStr >= monthStartStr) monthCount++
      if (t.createdAt) {
        const ms = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()
        if (ms > 0) {
          totalMinutes += ms / 60000
          totalMinutesCount++
        }
      }
      const completedHour = new Date(t.completedAt).getHours()
      hourBuckets[completedHour]++
    }

    // Streak: consecutive days with at least one completion, walking back
    // from today. Stops at the first day with zero. Capped at 365 so a
    // very long-running user doesn't pay an O(N) scan per render.
    // Uses fresh Date constructions per iteration (relative to `now`)
    // instead of cumulative setDate mutation — the latter can double-count
    // a day across DST fall-back in non-Taiwan timezones.
    let streak = 0
    const startBack = completedDayset.has(todayStr) ? 0 : 1
    for (let i = startBack; i < 365 + startBack; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dayStr = toDateString(d)
      if (completedDayset.has(dayStr)) {
        streak++
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

  // Group rows by month. `completed` is sorted newest-first, so buckets are
  // created in most-recent-month-first order (the "未知時間" bucket lands last
  // because those rows sort to the bottom).
  const groups = useMemo(() => {
    const currentYear = new Date().getFullYear()

    const buckets: Array<{ label: string; tasks: CompletedFlat[] }> = []
    const indexByLabel = new Map<string, number>()
    for (const t of completed) {
      // Tasks without completedAt land in a dedicated bucket so they're
      // still discoverable; the bucket renders last because the natural
      // sort is "most recent first".
      const label = t.completedAt
        ? groupLabel(dateKey(t.completedAt), currentYear)
        : tr('未知時間')
      let idx = indexByLabel.get(label)
      if (idx === undefined) {
        idx = buckets.length
        indexByLabel.set(label, idx)
        buckets.push({ label, tasks: [] })
      }
      buckets[idx].tasks.push(t)
    }
    return buckets
  }, [completed, tr])

  return (
    <Sheet open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col gap-0"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            {tr('已完成任務')}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {tr('共 {total} 個任務，本週完成 {week} 個。', { total: stats.total, week: stats.week })}
          </SheetDescription>
        </SheetHeader>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-2 px-5 py-4 border-b border-border bg-muted/30">
          <StatCard
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            label={tr('本週完成')}
            value={String(stats.week)}
            sub={tr('本月 {count}', { count: stats.month })}
          />
          <StatCard
            icon={<Flame className="w-3.5 h-3.5" />}
            label={tr('連續天數')}
            value={String(stats.streak)}
            sub={stats.streak > 0 ? tr('繼續加油') : tr('今天開始吧')}
          />
          <StatCard
            icon={<Clock className="w-3.5 h-3.5" />}
            label={tr('平均耗時')}
            value={stats.avgMinutes !== null ? humanizeMinutes(stats.avgMinutes) : '—'}
            sub={tr('從建立到完成')}
          />
          <StatCard
            icon={<CalendarIcon className="w-3.5 h-3.5" />}
            label={tr('最常完成')}
            value={stats.topHour !== null ? `${String(stats.topHour).padStart(2, '0')}:00` : '—'}
            sub={stats.topHour !== null ? tr('{count} 次', { count: stats.topHourCount }) : tr('尚無資料')}
          />
        </div>

        {/* Grouped list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 opacity-30 mb-3" />
              <p className="text-sm">{tr('還沒有完成任何任務')}</p>
              <p className="text-xs mt-1 opacity-80">{tr('勾選一個任務就會出現在這裡')}</p>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.label} className="mb-5 last:mb-2">
                {/* Group header — non-sticky. Earlier this used sticky+
                    backdrop-blur but the parent scroll container shares
                    a stacking context with the KPI cards above, so the
                    blur band bled over them. A plain section header reads
                    cleanly and the list isn't long enough to justify
                    sticky behavior. */}
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 py-1">
                  {g.label}
                  <span className="text-muted-foreground/60 normal-case font-normal">{tr('・已完成 {count}', { count: g.tasks.length })}</span>
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
  const { t: tr, lang } = useI18n()
  // completedAt may be missing on rows completed before write-through
  // shipped (or whose 0007 backfill wasn't run). We still render the row
  // with an em-dash placeholder so the user can see the task exists.
  const t = task.completedAt ? new Date(task.completedAt) : null
  const hh = t ? String(t.getHours()).padStart(2, '0') : '—'
  const mm = t ? String(t.getMinutes()).padStart(2, '0') : '—'
  const dateWeekday = t ? formatDateWeekday(t, lang === 'en') : ''

  // Time-to-complete (createdAt → completedAt). Useful glance at how long
  // each task took to actually get done.
  let elapsed: string | null = null
  if (t && task.createdAt) {
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
            {task.title || tr('（未命名任務）')}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{task.workspaceName} · {task.categoryName}</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          {t ? (
            <>
              <div className="text-[11px] font-mono text-muted-foreground">
                {dateWeekday}
              </div>
              <div className="text-xs font-mono text-foreground/80">{hh}:{mm}</div>
              {elapsed && (
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{tr('耗時 {elapsed}', { elapsed })}</div>
              )}
            </>
          ) : (
            <div className="text-[10px] text-muted-foreground/70 italic">{tr('時間未知')}</div>
          )}
        </div>
      </button>
    </li>
  )
}
