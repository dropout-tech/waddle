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
    return map
  }, [tasks])

  const handleToggleComplete = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    onToggleComplete?.(taskId)
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
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 flex-1 gap-1">
        {calendarDays.map((day, index) => {
          const dayTasks = tasksByDate[day.dateString] || []
          const pendingTasks = dayTasks.filter((t) => !t.isCompleted)
          const completedTasks = dayTasks.filter((t) => t.isCompleted)

          return (
            <div
              key={index}
              className={cn(
                'relative flex flex-col rounded-lg border transition-all cursor-pointer overflow-hidden group',
                day.isCurrentMonth ? 'bg-card' : 'bg-muted/30',
                day.isToday && 'ring-2 ring-primary ring-offset-1',
                !day.isCurrentMonth && 'opacity-50'
              )}
              onClick={() => onDateSelect?.(day.date)}
            >
              {/* Date Number */}
              <div className="flex items-center justify-between px-2 py-1">
                <span
                  className={cn(
                    'text-xs font-medium',
                    day.isToday && 'text-primary font-bold',
                    !day.isCurrentMonth && 'text-muted-foreground'
                  )}
                >
                  {day.date.getDate()}
                </span>

                {/* Quick Add Button */}
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

              {/* Task List */}
              <div className="flex-1 px-1 pb-1 space-y-0.5 overflow-y-auto">
                {pendingTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onTaskSelect(task)
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer hover:brightness-95 transition-all group/task"
                    style={{
                      backgroundColor: `${task.workspaceColor}20`,
                      borderLeft: `2px solid ${task.workspaceColor}`,
                    }}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={(e) => handleToggleComplete(e, task.id)}
                      className="flex-shrink-0 w-3 h-3 rounded-full border flex items-center justify-center transition-all hover:scale-110"
                      style={{ borderColor: task.workspaceColor }}
                    >
                      {task.isCompleted && (
                        <Check
                          className="w-2 h-2"
                          style={{ color: task.workspaceColor }}
                          strokeWidth={3}
                        />
                      )}
                    </button>
                    <span className="truncate font-medium text-foreground/80">
                      {task.title}
                    </span>
                  </div>
                ))}

                {/* Completed tasks indicator */}
                {completedTasks.length > 0 && pendingTasks.length < 3 && (
                  <div className="text-[9px] text-muted-foreground/60 px-1">
                    + {completedTasks.length} 已完成
                  </div>
                )}

                {/* More tasks indicator */}
                {pendingTasks.length > 3 && (
                  <div className="text-[9px] text-primary font-medium px-1">
                    + {pendingTasks.length - 3} 更多
                  </div>
                )}
              </div>

              {/* Task count badge */}
              {dayTasks.length > 0 && (
                <div
                  className="absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                  style={{
                    backgroundColor:
                      pendingTasks.length > 0 ? 'oklch(0.65 0.15 25)' : 'oklch(0.70 0.12 145)',
                  }}
                >
                  {dayTasks.length}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
