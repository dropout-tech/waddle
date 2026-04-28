'use client'

import { useMemo } from 'react'
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
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function MonthView({
  selectedDate,
  tasks,
  timeBlocks,
  onTaskSelect,
  onToggleComplete,
  onDateSelect,
  onCreateTask,
}: MonthViewProps) {
  // Calculate calendar grid
  const calendarDays = useMemo(() => {
    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth()

    // First day of month
    const firstDay = new Date(year, month, 1)
    const firstDayOfWeek = firstDay.getDay()

    // Last day of month
    const lastDay = new Date(year, month + 1, 0)
    const totalDays = lastDay.getDate()

    // Previous month days to show
    const prevMonthLastDay = new Date(year, month, 0).getDate()

    const days: Array<{
      date: Date
      dateString: string
      isCurrentMonth: boolean
      isToday: boolean
    }> = []

    // Add previous month's trailing days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i)
      days.push({
        date,
        dateString: date.toISOString().split('T')[0],
        isCurrentMonth: false,
        isToday: false,
      })
    }

    // Add current month's days
    const today = new Date().toISOString().split('T')[0]
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

    // Add next month's leading days to complete the grid (6 rows)
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
  }, [selectedDate])

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
    // Sort tasks within each date by urgency (high to low) then by time
    for (const date in map) {
      map[date].sort((a, b) => {
        // Urgency first (higher urgency = more important = comes first)
        if (b.urgency !== a.urgency) return b.urgency - a.urgency
        // Then by start time if available
        if (a.scheduledStartTime && b.scheduledStartTime) {
          return a.scheduledStartTime.localeCompare(b.scheduledStartTime)
        }
        return 0
      })
    }
    return map
  }, [tasks])

  // Get time blocks by date
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

  // Get urgency color
  const getUrgencyColor = (urgency: number) => {
    if (urgency >= 8) return 'oklch(0.55 0.22 25)' // red
    if (urgency >= 6) return 'oklch(0.65 0.18 45)' // orange  
    if (urgency >= 4) return 'oklch(0.70 0.14 70)' // amber
    return 'oklch(0.65 0.12 145)' // green
  }

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden">
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
          const totalEstimated = dayTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0)

          return (
            <div
              key={index}
              className={cn(
                'relative flex flex-col rounded-lg border transition-all cursor-pointer overflow-hidden group min-h-[100px]',
                day.isCurrentMonth ? 'bg-card hover:bg-card/80' : 'bg-muted/30',
                day.isToday && 'ring-2 ring-primary ring-offset-1',
                !day.isCurrentMonth && 'opacity-50'
              )}
              onClick={() => onDateSelect?.(day.date)}
            >
              {/* Date Header */}
              <div className="flex items-center justify-between px-2 py-1 border-b border-border/50">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center',
                      day.isToday && 'bg-primary text-primary-foreground',
                      !day.isCurrentMonth && 'text-muted-foreground'
                    )}
                  >
                    {day.date.getDate()}
                  </span>
                  {/* Time estimate badge */}
                  {totalEstimated > 0 && day.isCurrentMonth && (
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {Math.floor(totalEstimated / 60)}h{totalEstimated % 60 > 0 ? `${totalEstimated % 60}m` : ''}
                    </span>
                  )}
                </div>

                {/* Quick Add Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCreateTask?.(day.dateString)
                  }}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-all"
                >
                  <Plus className="w-3 h-3 text-primary" />
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
                      title={`${block.label}: ${block.startTime}-${block.endTime}`}
                    />
                  ))}
                </div>
              )}

              {/* Task List */}
              <div className="flex-1 px-1 pb-1 space-y-0.5 overflow-y-auto">
                {pendingTasks.slice(0, 4).map((task) => (
                  <div
                    key={task.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onTaskSelect(task)
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer hover:brightness-95 transition-all group/task"
                    style={{
                      backgroundColor: `${task.calendarColor || task.workspaceColor}15`,
                      borderLeft: `2px solid ${task.calendarColor || task.workspaceColor}`,
                    }}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={(e) => handleToggleComplete(e, task.id)}
                      className="flex-shrink-0 w-3 h-3 rounded-full border flex items-center justify-center transition-all hover:scale-110"
                      style={{ borderColor: task.calendarColor || task.workspaceColor }}
                    >
                      {task.isCompleted && (
                        <Check
                          className="w-2 h-2"
                          style={{ color: task.calendarColor || task.workspaceColor }}
                          strokeWidth={3}
                        />
                      )}
                    </button>
                    
                    {/* Urgency dot */}
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getUrgencyColor(task.urgency) }}
                    />
                    
                    {/* Title */}
                    <span className="truncate font-medium text-foreground/80 flex-1">
                      {task.title}
                    </span>
                    
                    {/* Time if scheduled */}
                    {task.scheduledStartTime && (
                      <span className="text-[8px] font-mono text-muted-foreground flex-shrink-0">
                        {task.scheduledStartTime}
                      </span>
                    )}
                  </div>
                ))}

                {/* Completed tasks indicator */}
                {completedTasks.length > 0 && pendingTasks.length < 4 && (
                  <div className="text-[9px] text-muted-foreground/60 px-1 flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" />
                    {completedTasks.length} 已完成
                  </div>
                )}

                {/* More tasks indicator */}
                {pendingTasks.length > 4 && (
                  <div className="text-[9px] text-primary font-medium px-1">
                    + {pendingTasks.length - 4} 更多
                  </div>
                )}
              </div>

              {/* Task count badge - only show if there are pending tasks */}
              {pendingTasks.length > 0 && (
                <div
                  className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
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
}
