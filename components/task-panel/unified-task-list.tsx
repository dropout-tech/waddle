'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import type { Density, MetaField } from './task-panel'
import { TaskRow } from './task-row'
import { toDateString } from '@/lib/calendar-utils'

export type UnifiedGroupBy = 'time' | 'urgency'

interface UnifiedTaskListProps {
  tasks: Task[]
  density: Density
  metaOrder?: MetaField[]
  /**
   * 'time': group by 今天 / 即將 / 之後 / 未排程, sorted within group by time.
   * 'urgency': group by urgency buckets (極度緊急 → 輕鬆), high first.
   */
  groupBy?: UnifiedGroupBy
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
}

interface Group {
  key: string
  label: string
  color: string
  tasks: Task[]
}

const URGENCY_RANGES = [
  { min: 9, max: 10, label: '極度緊急', color: 'oklch(0.55 0.22 25)' },
  { min: 7, max: 8, label: '高度緊急', color: 'oklch(0.60 0.18 35)' },
  { min: 5, max: 6, label: '中等', color: 'oklch(0.70 0.14 70)' },
  { min: 3, max: 4, label: '一般', color: 'oklch(0.68 0.12 145)' },
  { min: 1, max: 2, label: '輕鬆', color: 'oklch(0.65 0.10 230)' },
] as const

export function UnifiedTaskList({
  tasks,
  density,
  metaOrder,
  groupBy = 'urgency',
  onToggleComplete,
  onSelectTask,
}: UnifiedTaskListProps) {
  // Always send completed to the bottom regardless of grouping.
  const visibleTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1
      return 0
    })
  }, [tasks])

  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'urgency') {
      const sorted = [...visibleTasks].sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1
        if (a.urgency !== b.urgency) return b.urgency - a.urgency
        if (a.scheduledStartTime && b.scheduledStartTime) {
          return a.scheduledStartTime.localeCompare(b.scheduledStartTime)
        }
        if (a.scheduledStartTime) return -1
        if (b.scheduledStartTime) return 1
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
        if (a.dueDate) return -1
        if (b.dueDate) return 1
        return 0
      })

      const result: Group[] = []
      for (const r of URGENCY_RANGES) {
        const subset = sorted.filter((t) => t.urgency >= r.min && t.urgency <= r.max)
        if (subset.length > 0) {
          result.push({ key: r.label, label: r.label, color: r.color, tasks: subset })
        }
      }
      return result
    }

    // groupBy === 'time'
    const today = toDateString(new Date())
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)
    const inSevenDays = new Date(todayDate)
    inSevenDays.setDate(inSevenDays.getDate() + 7)

    const todayTasks: Task[] = []
    const upcomingTasks: Task[] = []
    const laterTasks: Task[] = []
    const unscheduledTasks: Task[] = []

    for (const t of visibleTasks) {
      const refDate = t.scheduledDate || t.dueDate
      if (!refDate) {
        unscheduledTasks.push(t)
        continue
      }
      if (refDate === today) {
        todayTasks.push(t)
        continue
      }
      const d = new Date(refDate)
      d.setHours(0, 0, 0, 0)
      if (d < todayDate) {
        // Overdue rolls into "today" so user sees it first
        todayTasks.push(t)
      } else if (d <= inSevenDays) {
        upcomingTasks.push(t)
      } else {
        laterTasks.push(t)
      }
    }

    // Within each time group: sort by date asc, then by time asc
    const byDateThenTime = (a: Task, b: Task) => {
      const ad = a.scheduledDate || a.dueDate || ''
      const bd = b.scheduledDate || b.dueDate || ''
      if (ad !== bd) return ad.localeCompare(bd)
      const at = a.scheduledStartTime || ''
      const bt = b.scheduledStartTime || ''
      return at.localeCompare(bt)
    }
    todayTasks.sort(byDateThenTime)
    upcomingTasks.sort(byDateThenTime)
    laterTasks.sort(byDateThenTime)

    const result: Group[] = []
    if (todayTasks.length) result.push({ key: 'today', label: '今天', color: 'oklch(0.60 0.18 35)', tasks: todayTasks })
    if (upcomingTasks.length) result.push({ key: 'upcoming', label: '即將（七天內）', color: 'oklch(0.70 0.14 70)', tasks: upcomingTasks })
    if (laterTasks.length) result.push({ key: 'later', label: '之後', color: 'oklch(0.68 0.12 145)', tasks: laterTasks })
    if (unscheduledTasks.length) result.push({ key: 'unscheduled', label: '未排程', color: 'oklch(0.65 0.04 230)', tasks: unscheduledTasks })
    return result
  }, [visibleTasks, groupBy])

  if (visibleTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        沒有任務
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          {/* Group Header */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {group.label}
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              ({group.tasks.length})
            </span>
          </div>

          {/* Tasks */}
          <div className={cn(density === 'compact' ? 'space-y-0.5' : 'space-y-2')}>
            {group.tasks.map((task) => (
              <div key={task.id} className="relative">
                <div
                  className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full"
                  style={{ backgroundColor: task.workspaceColor }}
                  title={`${task.workspaceName} / ${task.categoryName}`}
                />
                <div className="pl-2">
                  <TaskRow
                    task={task}
                    density={density}
                    metaOrder={metaOrder}
                    onToggleComplete={onToggleComplete}
                    onSelect={onSelectTask}
                    showWorkspaceTag
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
