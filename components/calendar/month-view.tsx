'use client'

import { useMemo, useRef, useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { Check, Plus, ChevronRight } from 'lucide-react'
import { toDateString, taskOccursOnDate } from '@/lib/calendar-utils'
import { taskDisplayTitle } from '@/lib/task-display'
import { useShowCategoryPrefix } from '@/components/category-prefix-context'
import { useIsMobile } from '@/hooks/use-mobile'

interface MonthViewProps {
  selectedDate: Date
  tasks: Task[]
  timeBlocks: TimeBlock[]
  onTaskSelect: (task: Task, occurrenceDate?: string) => void
  onToggleComplete?: (taskId: string) => void
  onDateSelect?: (date: Date) => void
  /** Mobile agenda's explicit "open day view" action. On mobile, tapping a
   * day only selects it (agenda below updates); this is the intentional jump. */
  onOpenDayView?: (date: Date) => void
  onCreateTask?: (date: string) => void
  onNavigate?: (direction: 'prev' | 'next') => void
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS_TO_RENDER = 3

export function MonthView({
  selectedDate,
  tasks,
  timeBlocks,
  onTaskSelect,
  onToggleComplete,
  onDateSelect,
  onOpenDayView,
  onCreateTask,
  onNavigate,
}: MonthViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const showCategoryPrefix = useShowCategoryPrefix()
  const isMobile = useIsMobile()

  // Mobile agenda: the day whose tasks are listed under the compact grid.
  // Follows selectedDate (header navigation, "today" button) but can be
  // changed locally by tapping a day cell without leaving month view.
  const [agendaDay, setAgendaDay] = useState<Date>(selectedDate)
  useEffect(() => {
    setAgendaDay(selectedDate)
  }, [selectedDate])

  // Generate months to render
  const months = useMemo(() => {
    const result: Date[] = []
    for (let i = -1; i < MONTHS_TO_RENDER - 1; i++) {
      const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + i, 1)
      result.push(d)
    }
    return result
  }, [selectedDate])

  // Scroll to center month on mount/change
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    
    // Find center month element and scroll to it
    const centerKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}`
    const centerElement = monthRefs.current.get(centerKey)
    if (centerElement) {
      container.scrollLeft = centerElement.offsetLeft
    }
  }, [selectedDate])

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || isScrolling.current) return

    const scrollLeft = container.scrollLeft
    const containerWidth = container.clientWidth
    const scrollWidth = container.scrollWidth
    const monthWidth = scrollWidth / MONTHS_TO_RENDER

    if (scrollLeft < monthWidth * 0.3) {
      isScrolling.current = true
      onNavigate?.('prev')
      setTimeout(() => { isScrolling.current = false }, 150)
    } else if (scrollLeft > scrollWidth - containerWidth - monthWidth * 0.3) {
      isScrolling.current = true
      onNavigate?.('next')
      setTimeout(() => { isScrolling.current = false }, 150)
    }
  }, [onNavigate])

  // Calculate calendar grid for a specific month
  const getCalendarDays = useCallback((monthDate: Date) => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()

    const firstDay = new Date(year, month, 1)
    const firstDayOfWeek = firstDay.getDay()
    const lastDay = new Date(year, month + 1, 0)
    const totalDays = lastDay.getDate()
    const prevMonthLastDay = new Date(year, month, 0).getDate()

    const days: Array<{
      date: Date
      dateString: string
      isCurrentMonth: boolean
      isToday: boolean
    }> = []

    const today = toDateString(new Date())

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i)
      days.push({
        date,
        dateString: toDateString(date),
        isCurrentMonth: false,
        isToday: false,
      })
    }

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day)
      const dateString = toDateString(date)
      days.push({
        date,
        dateString,
        isCurrentMonth: true,
        isToday: dateString === today,
      })
    }

    const remaining = 42 - days.length
    for (let day = 1; day <= remaining; day++) {
      const date = new Date(year, month + 1, day)
      days.push({
        date,
        dateString: toDateString(date),
        isCurrentMonth: false,
        isToday: false,
      })
    }

    return days
  }, [])

  // Lookup tasks for a given day, including recurring expansions.
  // Computing per-day at render time (≤42 days per month × N tasks) is
  // cheap and avoids precomputing a sparse map of all future occurrences.
  const getTasksForDay = useCallback((date: Date, dateString: string): Task[] => {
    const matched = tasks.filter((t) => {
      if (taskOccursOnDate(t, date)) return true
      // due-date tasks (no schedule) still pin to their dueDate column.
      if (!t.scheduledDate && t.dueDate === dateString) return true
      return false
    })
    return [...matched].sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency
      if (a.scheduledStartTime && b.scheduledStartTime) {
        return a.scheduledStartTime.localeCompare(b.scheduledStartTime)
      }
      return 0
    })
  }, [tasks])

  const blocksByDate = useMemo(() => {
    const map: Record<string, TimeBlock[]> = {}
    for (const block of timeBlocks) {
      if (!map[block.date]) map[block.date] = []
      map[block.date].push(block)
    }
    return map
  }, [timeBlocks])

  const handleToggleComplete = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    onToggleComplete?.(taskId)
  }

  const getUrgencyColor = (urgency: number) => {
    if (urgency >= 8) return 'oklch(0.55 0.22 25)'
    if (urgency >= 6) return 'oklch(0.65 0.18 45)'
    if (urgency >= 4) return 'oklch(0.70 0.14 70)'
    return 'oklch(0.65 0.12 145)'
  }

  // ── Mobile: compact dot grid + agenda list ────────────────────────────────
  // At 390px wide, 7 columns leave ~52px per cell — task chips are unreadable
  // and their touch targets overlap. Instead of shrinking the desktop layout,
  // the phone gets the iOS-calendar pattern: date + colored dots per cell,
  // with the selected day's schedule listed below (mobile-ux skill §1/§6).
  if (isMobile) {
    const agendaDateString = toDateString(agendaDay)
    const agendaTasks = getTasksForDay(agendaDay, agendaDateString)
    const agendaPending = agendaTasks
      .filter((t) => !t.isCompleted)
      .sort((a, b) => {
        if (a.scheduledStartTime && b.scheduledStartTime) {
          return a.scheduledStartTime.localeCompare(b.scheduledStartTime)
        }
        // Timed items first, then by urgency.
        if (a.scheduledStartTime) return -1
        if (b.scheduledStartTime) return 1
        return b.urgency - a.urgency
      })
    const agendaCompleted = agendaTasks.filter((t) => t.isCompleted)
    const agendaBlocks = [...(blocksByDate[agendaDateString] || [])].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    )
    const agendaIsToday = agendaDateString === toDateString(new Date())
    const agendaEmpty =
      agendaPending.length === 0 && agendaCompleted.length === 0 && agendaBlocks.length === 0

    return (
      <div className="flex-1 flex flex-col overflow-hidden select-none bg-panel-secondary">
        {/* Horizontally snapping month pager (compact grid only) */}
        <div
          ref={scrollContainerRef}
          className="flex-shrink-0 flex overflow-x-auto snap-x snap-mandatory"
          onScroll={handleScroll}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {months.map((monthDate) => {
            const calendarDays = getCalendarDays(monthDate)
            const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`

            return (
              <div
                key={monthKey}
                ref={(el) => {
                  if (el) monthRefs.current.set(monthKey, el)
                }}
                className="flex-shrink-0 w-full snap-center flex flex-col px-3 pt-1 pb-2"
              >
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 mb-1">
                  {WEEKDAYS.map((day, index) => (
                    <div
                      key={day}
                      className={cn(
                        'text-center text-[11px] font-medium py-1.5',
                        index === 0 || index === 6 ? 'text-foreground/65' : 'text-muted-foreground'
                      )}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Compact day grid: date + task dots, ≥44px touch cells */}
                <div className="grid grid-cols-7 gap-0.5">
                  {calendarDays.map((day, index) => {
                    const dayTasks = getTasksForDay(day.date, day.dateString)
                    const dayPending = dayTasks.filter((t) => !t.isCompleted)
                    const hasCompletedOnly = dayPending.length === 0 && dayTasks.length > 0
                    const isAgendaDay = day.dateString === agendaDateString

                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          setAgendaDay(day.date)
                          onDateSelect?.(day.date)
                        }}
                        className={cn(
                          'relative flex flex-col items-center justify-center gap-1 rounded-lg min-h-[46px] transition-colors',
                          !day.isCurrentMonth && 'opacity-40',
                          isAgendaDay ? 'bg-accent/60' : 'active:bg-secondary/60'
                        )}
                      >
                        <span
                          className={cn(
                            'text-[13px] font-semibold w-6 h-6 rounded-full flex items-center justify-center leading-none',
                            day.isToday && 'bg-primary text-primary-foreground',
                            !day.isToday && !day.isCurrentMonth && 'text-muted-foreground'
                          )}
                        >
                          {day.date.getDate()}
                        </span>
                        {/* Dot row keeps a fixed height so all cells align */}
                        <span className="flex items-center gap-[3px] h-1.5">
                          {dayPending.slice(0, 3).map((task) => (
                            <span
                              key={task.id}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: task.calendarColor || task.workspaceColor }}
                            />
                          ))}
                          {hasCompletedOnly && (
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/35" />
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected-day agenda */}
        <div className="flex-1 flex flex-col min-h-0 border-t border-border/70 bg-panel">
          <div className="flex items-center justify-between pl-4 pr-2 py-1.5 border-b border-border/50">
            <span className="text-sm font-semibold">
              {agendaDay.getMonth() + 1}月{agendaDay.getDate()}日 週{WEEKDAYS[agendaDay.getDay()]}
              {agendaIsToday && (
                <span className="ml-2 text-xs font-medium text-primary">今天</span>
              )}
            </span>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => onCreateTask?.(agendaDateString)}
                aria-label="新增任務"
                className="w-11 h-11 flex items-center justify-center rounded-lg text-primary active:bg-secondary/60 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => onOpenDayView?.(agendaDay)}
                className="h-11 pl-2 pr-1 flex items-center justify-center gap-0.5 rounded-lg text-xs text-muted-foreground active:bg-secondary/60 transition-colors"
              >
                日視圖
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {agendaEmpty ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <span className="text-sm text-muted-foreground">這天還沒有安排</span>
                <button
                  type="button"
                  onClick={() => onCreateTask?.(agendaDateString)}
                  className="h-11 px-5 rounded-full bg-secondary border border-border text-sm font-medium text-secondary-foreground active:brightness-95 transition-all"
                >
                  新增一件事
                </button>
              </div>
            ) : (
              <div className="space-y-0.5 pb-2">
                {agendaBlocks.map((block) => (
                  <div key={block.id} className="flex items-center gap-3 px-2 min-h-[44px] py-1">
                    <span
                      className="w-1 self-stretch rounded-full flex-shrink-0"
                      style={{ backgroundColor: block.color }}
                    />
                    <span className="text-xs font-mono text-muted-foreground w-[84px] flex-shrink-0">
                      {block.startTime}–{block.endTime}
                    </span>
                    <span className="text-sm text-foreground/80 truncate">{block.label}</span>
                  </div>
                ))}

                {agendaPending.map((task) => (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onTaskSelect(task, agendaDateString)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onTaskSelect(task, agendaDateString)
                    }}
                    className="flex items-center gap-1 pr-2 min-h-[52px] rounded-xl active:bg-secondary/50 transition-colors cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={(e) => handleToggleComplete(e, task.id)}
                      aria-label="完成任務"
                      className="w-11 h-11 flex-shrink-0 flex items-center justify-center"
                    >
                      <span
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                        style={{ borderColor: task.calendarColor || task.workspaceColor }}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] leading-snug text-foreground truncate">
                        {taskDisplayTitle(task, showCategoryPrefix)}
                      </div>
                      {task.scheduledStartTime && task.scheduledEndTime && (
                        <div className="text-xs font-mono text-muted-foreground mt-0.5">
                          {task.scheduledStartTime}–{task.scheduledEndTime}
                        </div>
                      )}
                    </div>
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getUrgencyColor(task.urgency) }}
                    />
                  </div>
                ))}

                {agendaCompleted.map((task) => (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onTaskSelect(task, agendaDateString)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onTaskSelect(task, agendaDateString)
                    }}
                    className="flex items-center gap-1 pr-2 min-h-[52px] rounded-xl active:bg-secondary/50 transition-colors cursor-pointer opacity-60"
                  >
                    <button
                      type="button"
                      onClick={(e) => handleToggleComplete(e, task.id)}
                      aria-label="取消完成"
                      className="w-11 h-11 flex-shrink-0 flex items-center justify-center"
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: task.calendarColor || task.workspaceColor }}
                      >
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] leading-snug text-muted-foreground line-through truncate">
                        {taskDisplayTitle(task, showCategoryPrefix)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none bg-panel-secondary">
      <div 
        ref={scrollContainerRef}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory"
        onScroll={handleScroll}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {months.map((monthDate) => {
          const calendarDays = getCalendarDays(monthDate)
          const isCurrentMonth = monthDate.getMonth() === selectedDate.getMonth() && 
                                 monthDate.getFullYear() === selectedDate.getFullYear()
          const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`
          
          return (
            <div 
              key={monthKey}
              ref={(el) => {
                if (el) monthRefs.current.set(monthKey, el)
              }}
              className="flex-shrink-0 w-full snap-center flex flex-col p-4"
            >
              {/* Month Title */}
              <div className="text-center mb-3">
                <span className={cn(
                  'text-lg font-bold',
                  isCurrentMonth ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {monthDate.getFullYear()}年{monthDate.getMonth() + 1}月
                </span>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 mb-2">
                {WEEKDAYS.map((day, index) => (
                  <div
                    key={day}
                    className={cn(
                      'text-center text-xs font-medium py-2',
                      index === 0 || index === 6 ? 'text-foreground/65' : 'text-muted-foreground'
                    )}
                  >
                    週{day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 flex-1 gap-1">
                {calendarDays.map((day, index) => {
                  const dayTasks = getTasksForDay(day.date, day.dateString)
                  const dayBlocks = blocksByDate[day.dateString] || []
                  const pendingTasks = dayTasks.filter((t) => !t.isCompleted)
                  const completedTasks = dayTasks.filter((t) => t.isCompleted)

                  return (
                    <div
                      key={index}
                      className={cn(
                        'relative flex flex-col rounded-lg border transition-all cursor-pointer overflow-hidden group min-h-[80px]',
                        day.isCurrentMonth ? 'bg-card hover:bg-card/80' : 'bg-muted/30',
                        day.isToday && 'ring-2 ring-primary ring-offset-1',
                        !day.isCurrentMonth && 'opacity-50'
                      )}
                      onClick={() => onDateSelect?.(day.date)}
                    >
                      {/* Date Header */}
                      <div className="flex items-center justify-between px-1.5 py-1 border-b border-border/50">
                        <span
                          className={cn(
                            'text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center',
                            day.isToday && 'bg-primary text-primary-foreground',
                            !day.isCurrentMonth && 'text-muted-foreground'
                          )}
                        >
                          {day.date.getDate()}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onCreateTask?.(day.dateString)
                          }}
                          className="opacity-100 md:opacity-0 md:group-hover:opacity-100 w-4 h-4 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-all"
                        >
                          <Plus className="w-2.5 h-2.5 text-primary" />
                        </button>
                      </div>

                      {/* Time Blocks Indicator */}
                      {dayBlocks.length > 0 && (
                        <div className="flex gap-0.5 px-1 py-0.5">
                          {dayBlocks.map((block) => (
                            <div
                              key={block.id}
                              className="h-1 flex-1 rounded-full"
                              style={{ backgroundColor: block.color }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Task List */}
                      <div className="flex-1 px-1 pb-1 space-y-0.5 overflow-y-auto">
                        {pendingTasks.slice(0, 3).map((task) => (
                          <div
                            key={task.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              onTaskSelect(task, day.dateString)
                            }}
                            className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px] cursor-pointer hover:brightness-95 transition-all"
                            style={{
                              backgroundColor: `${task.calendarColor || task.workspaceColor}15`,
                              borderLeft: `2px solid ${task.calendarColor || task.workspaceColor}`,
                            }}
                          >
                            <button
                              onClick={(e) => handleToggleComplete(e, task.id)}
                              className="flex-shrink-0 w-2.5 h-2.5 rounded-full border flex items-center justify-center"
                              style={{ borderColor: task.calendarColor || task.workspaceColor }}
                            >
                              {task.isCompleted && (
                                <Check className="w-1.5 h-1.5" style={{ color: task.calendarColor || task.workspaceColor }} strokeWidth={3} />
                              )}
                            </button>
                            <div
                              className="w-1 h-1 rounded-full flex-shrink-0"
                              style={{ backgroundColor: getUrgencyColor(task.urgency) }}
                            />
                            <span className="truncate font-medium text-foreground/80 flex-1">
                              {taskDisplayTitle(task, showCategoryPrefix)}
                            </span>
                          </div>
                        ))}

                        {completedTasks.length > 0 && pendingTasks.length < 3 && (
                          <div className="text-[8px] text-muted-foreground/60 px-1 flex items-center gap-0.5">
                            <Check className="w-2 h-2" />
                            {completedTasks.length}
                          </div>
                        )}

                        {pendingTasks.length > 3 && (
                          <div className="text-[8px] text-primary font-medium px-1">
                            +{pendingTasks.length - 3}
                          </div>
                        )}
                      </div>

                      {pendingTasks.length > 0 && (
                        <div
                          className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 rounded-full text-[8px] font-bold flex items-center justify-center text-white"
                          style={{
                            backgroundColor: pendingTasks.some(t => t.urgency >= 7) 
                              ? 'oklch(0.55 0.22 25)' 
                              : 'oklch(0.65 0.15 230)',
                          }}
                        >
                          {pendingTasks.length}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
