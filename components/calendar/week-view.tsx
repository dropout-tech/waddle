'use client'

import { useMemo, useState, useRef, useCallback, useEffect, memo } from 'react'
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
const DAYS_TO_RENDER = 21 // render 3 weeks
const CENTER_DAY_INDEX = 10

// Helper functions for time calculations
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function overlaps(a: Task, b: Task): boolean {
  const aStart = timeToMinutes(a.scheduledStartTime!)
  const aEnd = timeToMinutes(a.scheduledEndTime!)
  const bStart = timeToMinutes(b.scheduledStartTime!)
  const bEnd = timeToMinutes(b.scheduledEndTime!)
  return aStart < bEnd && aEnd > bStart
}

function calculateTaskColumns(tasks: Task[]): Map<string, { column: number; totalColumns: number }> {
  const result = new Map<string, { column: number; totalColumns: number }>()
  const valid = tasks.filter(t => t.scheduledStartTime && t.scheduledEndTime)
  if (!valid.length) return result

  const sorted = [...valid].sort((a, b) => {
    const d = timeToMinutes(a.scheduledStartTime!) - timeToMinutes(b.scheduledStartTime!)
    return d !== 0 ? d :
      (timeToMinutes(b.scheduledEndTime!) - timeToMinutes(b.scheduledStartTime!)) -
      (timeToMinutes(a.scheduledEndTime!) - timeToMinutes(a.scheduledStartTime!))
  })

  const visited = new Set<string>()
  const groups: Task[][] = []

  for (const task of sorted) {
    if (visited.has(task.id)) continue
    const group: Task[] = []
    const queue = [task]
    while (queue.length) {
      const cur = queue.shift()!
      if (visited.has(cur.id)) continue
      visited.add(cur.id)
      group.push(cur)
      for (const other of sorted) {
        if (!visited.has(other.id) && overlaps(cur, other)) queue.push(other)
      }
    }
    groups.push(group)
  }

  for (const group of groups) {
    group.sort((a, b) => timeToMinutes(a.scheduledStartTime!) - timeToMinutes(b.scheduledStartTime!))
    const columnEnds: number[] = []
    for (const task of group) {
      const taskStart = timeToMinutes(task.scheduledStartTime!)
      let placed = false
      for (let col = 0; col < columnEnds.length; col++) {
        if (columnEnds[col] <= taskStart) {
          result.set(task.id, { column: col, totalColumns: 0 })
          columnEnds[col] = timeToMinutes(task.scheduledEndTime!)
          placed = true
          break
        }
      }
      if (!placed) {
        result.set(task.id, { column: columnEnds.length, totalColumns: 0 })
        columnEnds.push(timeToMinutes(task.scheduledEndTime!))
      }
    }
    const total = columnEnds.length
    for (const task of group) {
      const e = result.get(task.id)!
      result.set(task.id, { column: e.column, totalColumns: total })
    }
  }
  return result
}

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
    
    // If scrolled near the edges, update the selected date
    if (scrollLeft < DAY_WIDTH * 2) {
      isScrolling.current = true
      onNavigate?.('prev')
      requestAnimationFrame(() => { isScrolling.current = false })
    } else if (scrollLeft > maxScroll - DAY_WIDTH * 2) {
      isScrolling.current = true
      onNavigate?.('next')
      requestAnimationFrame(() => { isScrolling.current = false })
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

  // Sync horizontal scroll between header and grid
  const headerScrollRef = useRef<HTMLDivElement>(null)
  
  const syncScroll = useCallback((source: 'header' | 'grid') => {
    const header = headerScrollRef.current
    const grid = scrollContainerRef.current
    if (!header || !grid) return
    
    if (source === 'grid') {
      header.scrollLeft = grid.scrollLeft
    } else {
      grid.scrollLeft = header.scrollLeft
    }
  }, [])

  return (
    <div ref={weekViewRef} className="flex-1 flex flex-col overflow-hidden bg-panel-secondary">
      {/* Fixed Header Row - scrolls horizontally with grid */}
      <div className="flex-shrink-0 flex border-b border-border bg-panel">
        {/* Time column spacer */}
        <div className="w-14 flex-shrink-0 border-r border-border" />
        
        {/* Scrollable header area */}
        <div 
          ref={headerScrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide"
          onScroll={() => syncScroll('header')}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex" style={{ width: `${DAYS_TO_RENDER * DAY_WIDTH}px` }}>
            {allDates.map((date, dayIndex) => {
              const dateStr = date.toISOString().split('T')[0]
              const isToday = dateStr === todayString
              const allDayTasks = getAllDayTasksForDate(date)
              const weekdayIndex = date.getDay()

              return (
                <div
                  key={dateStr}
                  className={cn(
                    'border-r border-border last:border-r-0',
                    isToday && 'bg-primary/5'
                  )}
                  style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
                >
                  <div className={cn(
                    'px-2 py-1.5 text-center',
                    isToday && 'bg-primary/10'
                  )}>
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
              )
            })}
          </div>
        </div>
      </div>

      {/* Scrollable Time Grid */}
      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-auto"
        onScroll={(e) => {
          handleScroll()
          syncScroll('grid')
        }}
      >
        <div ref={gridRef} className="flex" style={{ width: `${56 + DAYS_TO_RENDER * DAY_WIDTH}px` }}>
          {/* Time labels column - sticky left */}
          <div className="w-14 flex-shrink-0 sticky left-0 z-20 bg-panel border-r border-border">
            {hours.map((hour) => (
              <div key={hour} className="h-[60px] relative">
                <span className="absolute -top-2 left-1 right-1 text-[10px] text-muted-foreground font-mono text-right">
                  {hour.toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {allDates.map((date, dayIndex) => {
            const dateStr = date.toISOString().split('T')[0]
            const isToday = dateStr === todayString
            const dayTasks = getScheduledTasksForDate(date)
            const dayBlocks = getTimeBlocksForDate(date)
            const dragSelection = getDragSelection(dayIndex)
            const taskColumns = calculateTaskColumns(dayTasks)

            return (
              <div
                key={dateStr}
                className={cn(
                  'relative border-r border-border last:border-r-0 cursor-crosshair',
                  isToday && 'bg-primary/5'
                )}
                style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
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

                {/* Scheduled Tasks with overlap handling */}
                {dayTasks.map((task) => {
                  const col = taskColumns.get(task.id)
                  const column = col?.column ?? 0
                  const totalColumns = col?.totalColumns ?? 1
                  const widthPercent = 100 / totalColumns
                  const leftPercent = column * widthPercent

                  return (
                    <button
                      key={task.id}
                      data-task="true"
                      onClick={() => onTaskSelect(task)}
                      onMouseDown={(e) => e.stopPropagation()}
                      className={cn(
                        'absolute rounded px-1 py-0.5 text-left overflow-hidden transition-all hover:opacity-90 hover:z-10',
                        task.isCompleted && 'opacity-60'
                      )}
                      style={{
                        top: getTimePosition(task.scheduledStartTime!),
                        height: getDurationHeight(task.scheduledStartTime!, task.scheduledEndTime!),
                        left: `calc(${leftPercent}% + 1px)`,
                        width: `calc(${widthPercent}% - 2px)`,
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
                      {totalColumns === 1 && (
                        <div className="text-[9px] opacity-80">
                          {task.scheduledStartTime}-{task.scheduledEndTime}
                        </div>
                      )}
                    </button>
                  )
                })}

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
            )
          })}
        </div>
      </div>
    </div>
  )
}
