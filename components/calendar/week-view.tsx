'use client'

import { useMemo, useState, useRef, useCallback } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation'
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
  startHour?: number
  endHour?: number
}

const WEEKDAYS = ['六', '日', '一', '二', '三', '四', '五']

export function WeekView({
  selectedDate,
  tasks,
  pendingTasks,
  timeBlocks,
  onTaskSelect,
  onToggleComplete,
  onCreateTask,
  onNavigate,
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

  // Enable swipe/drag navigation on the entire week view
  useSwipeNavigation({
    onSwipeLeft: () => onNavigate?.('next'),
    onSwipeRight: () => onNavigate?.('prev'),
    elementRef: weekViewRef,
    enableMouseDrag: true,
    threshold: 80,
    directionRatio: 2.5, // Require more horizontal movement to not interfere with task creation
  })



  // Get the week dates (Saturday to Friday, starting from Saturday of the week containing selectedDate)
  const weekDates = useMemo(() => {
    const dates: Date[] = []
    const start = new Date(selectedDate)
    const day = start.getDay()
    // Go to Saturday (day 6) of the current week
    const diff = day === 6 ? 0 : -(day + 1)
    start.setDate(start.getDate() + diff)
    
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
      const date = weekDates[dragStart.day].toISOString().split('T')[0]
      
      onCreateTask?.(date, startTime, endTime)
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }, [isDragging, dragStart, dragEnd, weekDates, yToTime, onCreateTask])

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
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        <div className="min-w-[800px]" ref={gridRef}>
          {/* Sticky Header Row */}
          <div className="sticky top-0 z-10 flex bg-panel border-b border-border select-none">
            {/* Time column header spacer */}
            <div className="w-14 flex-shrink-0 border-r border-border" />
            
            {/* Day headers with all-day tasks */}
            {weekDates.map((date, i) => {
              const dateStr = date.toISOString().split('T')[0]
              const isToday = dateStr === todayString
              const allDayTasks = getAllDayTasksForDate(date)
              
              return (
                <div
                  key={i}
                  className={cn(
                    'flex-1 min-w-[100px] border-r border-border last:border-r-0 flex flex-col',
                    isToday && 'bg-primary/5'
                  )}
                >
                  {/* Day header */}
                  <div className={cn(
                    'px-2 py-1.5 text-center',
                    isToday && 'bg-primary/10'
                  )}>
                    <div className="text-[10px] text-muted-foreground font-medium">
                      週{WEEKDAYS[i]}
                    </div>
                    <div className={cn(
                      'text-lg font-bold',
                      isToday ? 'text-primary' : 'text-foreground'
                    )}>
                      {date.getDate()}
                    </div>
                  </div>

                  {/* All-day tasks area */}
                  <div className="min-h-[32px] max-h-[80px] overflow-y-auto px-1 py-1 space-y-0.5 border-t border-border/30">
                    {allDayTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onTaskSelect(task)}
                        className={cn(
                          'w-full text-left px-1.5 py-1 rounded text-[10px] font-medium truncate transition-all',
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
                    {/* Also show pending tasks that have dueDate for this day */}
                    {pendingTasks
                      .filter((t) => t.dueDate === dateStr && !t.scheduledDate)
                      .map((task) => (
                        <button
                          key={task.id}
                          onClick={() => onTaskSelect(task)}
                          className={cn(
                            'w-full flex items-center gap-1 text-left px-1.5 py-1 rounded text-[10px] font-medium transition-all',
                            'bg-muted/50 hover:bg-muted text-muted-foreground',
                            task.isCompleted && 'opacity-50 line-through'
                          )}
                        >
                          <Check className="w-2.5 h-2.5 flex-shrink-0 opacity-50" />
                          <span className="truncate">{task.title}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Time Grid Body */}
          <div className="flex">
            {/* Time labels column */}
            <div className="w-14 flex-shrink-0 border-r border-border bg-panel/50">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="h-[60px] relative"
                >
                  <span className="absolute -top-2 left-1 right-1 text-[10px] text-muted-foreground font-mono text-right">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDates.map((date, dayIndex) => {
              const dateStr = date.toISOString().split('T')[0]
              const isToday = dateStr === todayString
              const dayTasks = getScheduledTasksForDate(date)
              const dayBlocks = getTimeBlocksForDate(date)
              const dragSelection = getDragSelection(dayIndex)

              return (
                <div
                  key={dayIndex}
                  className={cn(
                    'flex-1 min-w-[100px] relative border-r border-border last:border-r-0 cursor-crosshair',
                    isToday && 'bg-primary/5'
                  )}
                  onMouseDown={(e) => handleMouseDown(e, dayIndex)}
                  onMouseMove={(e) => handleMouseMove(e, dayIndex)}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => {
                    if (isDragging) handleMouseUp()
                  }}
                >
                  {/* Hour lines */}
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="h-[60px] border-b border-border/50"
                    >
                      {/* Half-hour line */}
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
                      <div className="text-[8px] opacity-70">
                        {block.startTime}-{block.endTime}
                      </div>
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
                  {isToday && (
                    <CurrentTimeLine startHour={startHour} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
