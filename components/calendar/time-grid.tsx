'use client'

import { useEffect, useRef, useState } from 'react'
import type { Task, TimeBlock } from '@/lib/types'
import { TaskBlock } from './task-block'
import { TimeBlockItem } from './time-block-item'
import { CurrentTimeLine } from './current-time-line'
import { Plus } from 'lucide-react'

interface TimeGridProps {
  scheduledTasks: Task[]
  timeBlocks: TimeBlock[]
  startHour?: number
  endHour?: number
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (startTime: string, endTime: string) => void
}

export function TimeGrid({
  scheduledTasks,
  timeBlocks,
  startHour = 7,
  endHour = 23,
  onTaskSelect,
  onToggleComplete,
  onCreateTask,
}: TimeGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverTime, setHoverTime] = useState<{ hour: number; half: boolean } | null>(null)

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

  // Handle click on time slot to create new task
  const handleTimeSlotClick = (hour: number, isHalfHour: boolean) => {
    if (!onCreateTask) return
    const startMinute = isHalfHour ? 30 : 0
    const endHourCalc = isHalfHour ? hour + 1 : hour
    const endMinute = isHalfHour ? 0 : 30
    const startTime = `${String(hour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`
    const endTime = `${String(endHourCalc).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
    onCreateTask(startTime, endTime)
  }

  // Handle mouse move over grid
  const handleMouseMove = (e: React.MouseEvent, hour: number) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const isHalfHour = relativeY >= 30
    setHoverTime({ hour, half: isHalfHour })
  }

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

            {/* Grid Lines - Clickable area */}
            <div
              className="flex-1 relative border-t border-calendar-grid cursor-pointer group"
              onMouseMove={(e) => handleMouseMove(e, hour)}
              onMouseLeave={() => setHoverTime(null)}
            >
              {/* First half hour - clickable */}
              <div
                className="absolute left-0 right-0 top-0 h-[30px] hover:bg-primary/5 transition-colors"
                onClick={() => handleTimeSlotClick(hour, false)}
              >
                {hoverTime?.hour === hour && !hoverTime.half && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-1 text-[10px] text-primary/60 bg-primary/10 px-2 py-0.5 rounded-full">
                      <Plus className="w-3 h-3" />
                      <span>新增任務</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Half-hour dashed line */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-calendar-grid-subtle pointer-events-none"
                style={{ top: '30px' }}
              />

              {/* Second half hour - clickable */}
              <div
                className="absolute left-0 right-0 top-[30px] h-[30px] hover:bg-primary/5 transition-colors"
                onClick={() => handleTimeSlotClick(hour, true)}
              >
                {hoverTime?.hour === hour && hoverTime.half && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-1 text-[10px] text-primary/60 bg-primary/10 px-2 py-0.5 rounded-full">
                      <Plus className="w-3 h-3" />
                      <span>新增任務</span>
                    </div>
                  </div>
                )}
              </div>
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
