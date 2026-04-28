'use client'

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { CurrentTimeLine } from './current-time-line'

interface WeekViewProps {
  selectedDate: Date
  tasks: Task[]
  pendingTasks: Task[]
  timeBlocks: TimeBlock[]
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (date: string, startTime: string, endTime: string) => void
  onNavigate?: (direction: 'prev' | 'next') => void
  onDateChange?: (date: Date) => void
  startHour?: number
  endHour?: number
}

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']
const DAY_WIDTH = 120 // pixels per day column
const DAYS_TO_RENDER = 21 // render 3 weeks (7 days before, current week, 7 days after)
const CENTER_DAY_INDEX = 10 // index of the center day (0-indexed)

export function WeekView({
  selectedDate,
  tasks,
  pendingTasks,
  timeBlocks,
  onTaskSelect,
  onToggleComplete,
  onCreateTask,
  onNavigate,
  onDateChange,
  startHour = 6,
  endHour = 22,
}: WeekViewProps) {
  // Drag state for creating new tasks
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ day: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ day: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const weekViewRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)
  const lastScrollLeft = useRef(0)

  // Generate dates centered around selectedDate
  const allDates = useMemo(() => {
    const dates: Date[] = []
    const centerDate = new Date(selectedDate)
    
    for (let i = -CENTER_DAY_INDEX; i < DAYS_TO_RENDER - CENTER_DAY_INDEX; i++) {
      const d = new Date(centerDate)
      d.setDate(centerDate.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [selectedDate])

  // Scroll to center on mount and when selectedDate changes
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    
    // Calculate scroll position to center the selected date
    const timeColumnWidth = 56 // w-14 = 56px
    const targetScrollLeft = CENTER_DAY_INDEX * DAY_WIDTH
    
    container.scrollLeft = targetScrollLeft
    lastScrollLeft.current = targetScrollLeft
  }, [selectedDate])

  // Handle scroll to detect when user scrolls to edges and load more dates
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || isScrolling.current) return

    const scrollLeft = container.scrollLeft
    const maxScroll = container.scrollWidth - container.clientWidth
    const timeColumnWidth = 56

    // Calculate which date is now in the center of the viewport
    const viewportCenter = scrollLeft + (container.clientWidth - timeColumnWidth) / 2
    const centerDayIndex = Math.floor((viewportCenter - timeColumnWidth) / DAY_WIDTH)
    
    // If scrolled near the edges, update the selected date
    if (scrollLeft < DAY_WIDTH * 3) {
      // Near left edge - go to previous week
      isScrolling.current = true
      onNavigate?.('prev')
      setTimeout(() => { isScrolling.current = false }, 100)
    } else if (scrollLeft > maxScroll - DAY_WIDTH * 3) {
      // Near right edge - go to next week
      isScrolling.current = true
      onNavigate?.('next')
      setTimeout(() => { isScrolling.current = false }, 100)
    }

    lastScrollLeft.current = scrollLeft
  }, [onNavigate])

  const hours = useMemo(() => {
    const h = []
    for (let i = startHour; i <= endHour; i++) {
      h.push(i)
    }
    return h
  }, [startHour, endHour])

  const today = new Date()
  const todayString = today.toISOString().split('T')[0]

  // Get scheduled tasks for a specific date (tasks with specific time)
  const getScheduledTasksForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(
      (t) => t.scheduledDate === dateStr && t.scheduledStartTime && t.scheduledEndTime
    )
  }

  // Get all-day/unscheduled tasks for a specific date
  // These are tasks that have scheduledDate or dueDate matching this day but NO specific time
  const getAllDayTasksForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(
      (t) => 
        (t.scheduledDate === dateStr || t.dueDate === dateStr) && 
        !t.scheduledStartTime
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
    return Math.max(endPos - startPos, 20)
  }

  // Convert Y position to time string with clamping
  const yToTime = useCallback((y: number) => {
    const totalMinutes = startHour * 60 + Math.round(y / 60 * 60)
    // Round to nearest 15 minutes and clamp to valid range
    const roundedMinutes = Math.round(totalMinutes / 15) * 15
    const clampedMinutes = Math.max(startHour * 60, Math.min(23 * 60 + 45, roundedMinutes))
    const hours = Math.floor(clampedMinutes / 60)
    const minutes = clampedMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }, [startHour])

  // Handle mouse down on grid to start drag
  const handleMouseDown = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if ((e.target as HTMLElement).closest('[data-task]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const scrollTop = scrollContainerRef.current?.scrollTop || 0
    const y = e.clientY - rect.top
    setIsDragging(true)
    setDragStart({ day: dayIndex, y })
    setDragEnd({ day: dayIndex, y })
  }, [])

  // Handle mouse move during drag
  const handleMouseMove = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if (!isDragging || !dragStart) return
    const rect = e.currentTarget.getBoundingClientRect()
    const maxY = hours.length * 60
    const y = Math.max(0, Math.min(e.clientY - rect.top, maxY))
    setDragEnd({ day: dayIndex, y })
  }, [isDragging, dragStart, hours.length])

  // Handle mouse up to finish drag and create task
  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      return
    }

    // Only create if dragged on same day and has some height
    if (dragStart.day === dragEnd.day && Math.abs(dragEnd.y - dragStart.y) > 15) {
      const minY = Math.min(dragStart.y, dragEnd.y)
      const maxY = Math.max(dragStart.y, dragEnd.y)
      const startTime = yToTime(minY)
      const endTime = yToTime(maxY)
      const date = allDates[dragStart.day].toISOString().split('T')[0]
      
      onCreateTask?.(date, startTime, endTime)
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }, [isDragging, dragStart, dragEnd, allDates, yToTime, onCreateTask])

  // Calculate drag selection box
  const getDragSelection = (dayIndex: number) => {
    if (!isDragging || !dragStart || !dragEnd || dragStart.day !== dayIndex) {
      return null
    }
    const minY = Math.min(dragStart.y, dragEnd.y)
    const maxY = Math.max(dragStart.y, dragEnd.y)
    const startTime = yToTime(minY)
    const endTime = yToTime(maxY)
    return { top: minY, height: maxY - minY, startTime, endTime }
  }

  return (
    <div ref={weekViewRef} className="flex-1 flex flex-col overflow-hidden bg-panel-secondary">
      {/* Single scrollable container for both header and time grid */}
      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <div 
          ref={gridRef}
          className="flex"
          style={{ width: `${56 + DAYS_TO_RENDER * DAY_WIDTH}px` }}
        >
          {/* Sticky Time Labels Column */}
          <div className="w-14 flex-shrink-0 sticky left-0 z-20 bg-panel border-r border-border">
            {/* Header spacer */}
            <div className="h-[72px] border-b border-border" />
            {/* Time labels */}
            {hours.map((hour) => (
              <div key={hour} className="h-[60px] relative">
                <span className="absolute -top-2 left-1 right-1 text-[10px] text-muted-foreground font-mono text-right">
                  {hour.toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns - continuous scrolling */}
          {allDates.map((date, dayIndex) => {
            const dateStr = date.toISOString().split('T')[0]
            const isToday = dateStr === todayString
            const dayTasks = getScheduledTasksForDate(date)
            const dayBlocks = getTimeBlocksForDate(date)
            const allDayTasks = getAllDayTasksForDate(date)
            const dragSelection = getDragSelection(dayIndex)
            const weekdayIndex = date.getDay()

            return (
              <div
                key={dateStr}
                className={cn(
                  'border-r border-border last:border-r-0 flex flex-col',
                  isToday && 'bg-primary/5'
                )}
                style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
              >
                {/* Sticky Day Header */}
                <div className={cn(
                  'sticky top-0 z-10 bg-panel border-b border-border',
                  isToday && 'bg-primary/10'
                )}>
                  <div className="px-2 py-1.5 text-center">
                    <div className="text-[10px] text-muted-foreground font-medium">
                      週{WEEKDAY_NAMES[weekdayIndex]}
                    </div>
                    <div className={cn(
                      'text-lg font-bold',
                      isToday ? 'text-primary' : 'text-foreground'
                    )}>
                      {date.getDate()}
                    </div>
                  </div>
                  {/* All-day tasks area */}
                  {(allDayTasks.length > 0 || pendingTasks.some(t => t.dueDate === dateStr && !t.scheduledDate)) && (
                    <div className="max-h-[48px] overflow-y-auto px-1 pb-1 space-y-0.5 border-t border-border/30">
                      {allDayTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => onTaskSelect(task)}
                          className={cn(
                            'w-full text-left px-1.5 py-0.5 rounded text-[9px] font-medium truncate transition-all',
                            'hover:opacity-80',
                            task.isCompleted && 'opacity-50 line-through'
                          )}
                          style={{
                            backgroundColor: task.calendarColor || task.workspaceColor,
                            color: '#fff',
                          }}
                        >
                          {task.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Time Grid for this day */}
                <div
                  className="relative flex-1 cursor-crosshair"
                  onMouseDown={(e) => handleMouseDown(e, dayIndex)}
                  onMouseMove={(e) => handleMouseMove(e, dayIndex)}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => { if (isDragging) handleMouseUp() }}
                >
                  {/* Hour lines */}
                  {hours.map((hour) => (
                    <div key={hour} className="h-[60px] border-b border-border/50">
                      <div className="h-[30px] border-b border-dashed border-border/30" />
                    </div>
                  ))}

                  {/* Time Blocks */}
                  {dayBlocks.map((block) => (
                    <div
                      key={block.id}
                      data-task="true"
                      className="absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-[9px] font-medium overflow-hidden"
                      style={{
                        top: getTimePosition(block.startTime),
                        height: getDurationHeight(block.startTime, block.endTime),
                        backgroundColor: block.color + '30',
                        borderLeft: `3px solid ${block.color}`,
                        color: block.color,
                      }}
                    >
                      <div className="truncate">{block.label}</div>
                    </div>
                  ))}

                  {/* Scheduled Tasks */}
                  {dayTasks.map((task) => (
                    <button
                      key={task.id}
                      data-task="true"
                      onClick={() => onTaskSelect(task)}
                      onMouseDown={(e) => e.stopPropagation()}
                      className={cn(
                        'absolute left-0.5 right-0.5 rounded px-1.5 py-1 text-left overflow-hidden transition-all hover:opacity-90',
                        task.isCompleted && 'opacity-60'
                      )}
                      style={{
                        top: getTimePosition(task.scheduledStartTime!),
                        height: getDurationHeight(task.scheduledStartTime!, task.scheduledEndTime!),
                        backgroundColor: task.calendarColor || task.workspaceColor,
                        color: '#fff',
                      }}
                    >
                      <div className={cn(
                        'text-[10px] font-semibold leading-tight truncate',
                        task.isCompleted && 'line-through'
                      )}>
                        {task.title}
                      </div>
                      <div className="text-[9px] opacity-80 mt-0.5">
                        {task.scheduledStartTime}-{task.scheduledEndTime}
                      </div>
                    </button>
                  ))}

                  {/* Drag Selection Preview */}
                  {dragSelection && dragSelection.height > 10 && (
                    <div
                      className="absolute left-0.5 right-0.5 bg-primary/20 border-2 border-primary border-dashed rounded pointer-events-none z-20 flex flex-col items-center justify-center"
                      style={{
                        top: dragSelection.top,
                        height: dragSelection.height,
                      }}
                    >
                      <span className="text-[10px] font-mono font-bold text-primary">
                        {dragSelection.startTime} - {dragSelection.endTime}
                      </span>
                    </div>
                  )}

                  {/* Current time line for today */}
                  {isToday && <CurrentTimeLine startHour={startHour} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
