'use client'

import { useMemo, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { Check, Plus } from 'lucide-react'

interface MonthViewProps {
  selectedDate: Date
  tasks: Task[]
  timeBlocks: TimeBlock[]
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onDateSelect?: (date: Date) => void
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
  onCreateTask,
  onNavigate,
}: MonthViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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

    const today = new Date().toISOString().split('T')[0]

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i)
      days.push({
        date,
        dateString: date.toISOString().split('T')[0],
        isCurrentMonth: false,
        isToday: false,
      })
    }

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day)
      const dateString = date.toISOString().split('T')[0]
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
        dateString: date.toISOString().split('T')[0],
        isCurrentMonth: false,
        isToday: false,
      })
    }

    return days
  }, [])

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const task of tasks) {
      const date = task.scheduledDate || task.dueDate
      if (date) {
        if (!map[date]) map[date] = []
        map[date].push(task)
      }
    }
    for (const date in map) {
      map[date].sort((a, b) => {
        if (b.urgency !== a.urgency) return b.urgency - a.urgency
        if (a.scheduledStartTime && b.scheduledStartTime) {
          return a.scheduledStartTime.localeCompare(b.scheduledStartTime)
        }
        return 0
      })
    }
    return map
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
                      index === 0 ? 'text-red-400' : index === 6 ? 'text-blue-400' : 'text-muted-foreground'
                    )}
                  >
                    週{day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 flex-1 gap-1">
                {calendarDays.map((day, index) => {
                  const dayTasks = tasksByDate[day.dateString] || []
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
                          className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-all"
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
                              onTaskSelect(task)
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
                              {task.title}
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
