'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { TaskBlock } from './task-block'
import { TimeBlockItem } from './time-block-item'
import { CurrentTimeLine } from './current-time-line'

interface WeekViewProps {
  selectedDate: Date
  tasks: Task[]
  timeBlocks: TimeBlock[]
  onTaskSelect: (task: Task) => void
  startHour?: number
  endHour?: number
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function WeekView({
  selectedDate,
  tasks,
  timeBlocks,
  onTaskSelect,
  startHour = 6,
  endHour = 22,
}: WeekViewProps) {
  // Get the week dates (Sunday to Saturday)
  const weekDates = useMemo(() => {
    const dates: Date[] = []
    const start = new Date(selectedDate)
    const day = start.getDay()
    start.setDate(start.getDate() - day) // Go to Sunday
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [selectedDate])

  const hours = useMemo(() => {
    const h = []
    for (let i = startHour; i <= endHour; i++) {
      h.push(i)
    }
    return h
  }, [startHour, endHour])

  const today = new Date()
  const todayString = today.toISOString().split('T')[0]

  // Get tasks for a specific date
  const getTasksForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(
      (t) => t.scheduledDate === dateStr && t.scheduledStartTime && t.scheduledEndTime
    )
  }

  // Get time blocks for a specific date
  const getTimeBlocksForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return timeBlocks.filter((tb) => tb.date === dateStr)
  }

  // Calculate position for a time
  const getTimePosition = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    const hourOffset = h - startHour
    const minuteOffset = m / 60
    return (hourOffset + minuteOffset) * 60 // 60px per hour
  }

  // Calculate height for duration
  const getDurationHeight = (start: string, end: string) => {
    const startPos = getTimePosition(start)
    const endPos = getTimePosition(end)
    return endPos - startPos
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="min-w-[800px]">
        {/* Header Row */}
        <div className="sticky top-0 z-10 flex border-b border-border bg-panel">
          {/* Time column header */}
          <div className="w-14 flex-shrink-0 p-2 text-xs text-muted-foreground text-center border-r border-border">
            時間
          </div>
          
          {/* Day headers */}
          {weekDates.map((date, i) => {
            const dateStr = date.toISOString().split('T')[0]
            const isToday = dateStr === todayString
            const isSelected = date.toDateString() === selectedDate.toDateString()
            
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 p-2 text-center border-r border-border last:border-r-0',
                  isToday && 'bg-primary/10',
                  isSelected && 'bg-secondary'
                )}
              >
                <div className="text-xs text-muted-foreground">
                  週{WEEKDAYS[i]}
                </div>
                <div className={cn(
                  'text-sm font-bold mt-0.5',
                  isToday && 'text-primary'
                )}>
                  {date.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Time Grid */}
        <div className="relative flex">
          {/* Time labels column */}
          <div className="w-14 flex-shrink-0 border-r border-border">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-[60px] relative border-b border-border"
              >
                <span className="absolute -top-2.5 right-2 text-[10px] text-muted-foreground font-mono">
                  {hour.toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((date, dayIndex) => {
            const dateStr = date.toISOString().split('T')[0]
            const isToday = dateStr === todayString
            const dayTasks = getTasksForDate(date)
            const dayBlocks = getTimeBlocksForDate(date)

            return (
              <div
                key={dayIndex}
                className={cn(
                  'flex-1 relative border-r border-border last:border-r-0',
                  isToday && 'bg-primary/5'
                )}
              >
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="h-[60px] border-b border-border"
                  />
                ))}

                {/* Time Blocks */}
                {dayBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="absolute left-1 right-1"
                    style={{
                      top: getTimePosition(block.startTime),
                      height: getDurationHeight(block.startTime, block.endTime),
                    }}
                  >
                    <TimeBlockItem block={block} compact />
                  </div>
                ))}

                {/* Tasks */}
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="absolute left-1 right-1"
                    style={{
                      top: getTimePosition(task.scheduledStartTime!),
                      height: getDurationHeight(task.scheduledStartTime!, task.scheduledEndTime!),
                    }}
                  >
                    <TaskBlock task={task} onSelect={onTaskSelect} compact />
                  </div>
                ))}

                {/* Current time line for today */}
                {isToday && (
                  <CurrentTimeLine startHour={startHour} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
