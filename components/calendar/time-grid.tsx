'use client'

import { useEffect, useRef } from 'react'
import type { Task, TimeBlock } from '@/lib/types'
import { TaskBlock } from './task-block'
import { TimeBlockItem } from './time-block-item'
import { CurrentTimeLine } from './current-time-line'

interface TimeGridProps {
  scheduledTasks: Task[]
  timeBlocks: TimeBlock[]
  startHour?: number
  endHour?: number
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
}

export function TimeGrid({
  scheduledTasks,
  timeBlocks,
  startHour = 7,
  endHour = 23,
  onTaskSelect,
  onToggleComplete,
}: TimeGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Generate hour slots
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i
  )

  // Auto-scroll to current hour on mount
  useEffect(() => {
    if (containerRef.current) {
      const now = new Date()
      const currentHour = now.getHours()
      if (currentHour >= startHour && currentHour < endHour) {
        const scrollPosition = (currentHour - startHour) * 60 - 60 // 60px per hour, offset by 1 hour
        containerRef.current.scrollTop = Math.max(0, scrollPosition)
      }
    }
  }, [startHour, endHour])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto relative bg-panel-secondary"
    >
      {/* Time Grid Container */}
      <div
        className="relative"
        style={{ height: `${(endHour - startHour) * 60}px` }}
      >
        {/* Hour Lines */}
        {hours.map((hour, index) => (
          <div
            key={hour}
            className="absolute left-0 right-0 flex"
            style={{ top: `${index * 60}px`, height: '60px' }}
          >
            {/* Hour Label */}
            <div className="w-14 flex-shrink-0 pr-2 text-right">
              <span className="text-[11px] font-mono text-muted-foreground">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>

            {/* Grid Lines */}
            <div className="flex-1 relative border-t border-calendar-grid">
              {/* Half-hour dashed line */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-calendar-grid-subtle"
                style={{ top: '30px' }}
              />
            </div>
          </div>
        ))}

        {/* Time Blocks (breaks, buffers) */}
        {timeBlocks.map((block) => (
          <TimeBlockItem
            key={block.id}
            block={block}
            calendarStartHour={startHour}
          />
        ))}

        {/* Scheduled Tasks */}
        {scheduledTasks.map((task) => (
          <TaskBlock
            key={task.id}
            task={task}
            calendarStartHour={startHour}
            onSelect={onTaskSelect}
            onToggleComplete={onToggleComplete}
          />
        ))}

        {/* Current Time Indicator */}
        <CurrentTimeLine calendarStartHour={startHour} />
      </div>
    </div>
  )
}
