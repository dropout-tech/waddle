'use client'

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock, SlotType } from '@/lib/types'
import { CurrentTimeLine } from './current-time-line'
import { TaskBlock, type TaskDragStart } from './task-block'
import { CheckSquare, Coffee, Clock, Crosshair, User, Layers, X, ChevronLeft } from 'lucide-react'

// Map icon names to components
const ICON_MAP: Record<string, React.ElementType> = {
  CheckSquare, Coffee, Clock, Crosshair, User, Layers,
}

// Render icon based on type (lucide or emoji/custom)
const renderSlotIcon = (slotType: SlotType) => {
  if (slotType.iconType === 'lucide') {
    const IconComp = ICON_MAP[slotType.icon] || Clock
    return <IconComp className="w-4 h-4" style={{ color: slotType.color }} />
  }
  // emoji or custom text - fallback to colored circle if empty
  if (!slotType.icon) {
    return <div className="w-3 h-3 rounded-full" style={{ backgroundColor: slotType.color }} />
  }
  return <span className="text-base">{slotType.icon}</span>
}

interface DayScrollViewProps {
  selectedDate: Date
  tasks: Task[]
  timeBlocks: TimeBlock[]
  slotTypes?: SlotType[]
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (date: string, startTime: string, endTime: string) => void
  onCreateTimeBlock?: (date: string, startTime: string, endTime: string, type: string, label: string, color: string) => void
  onRescheduleTask?: (taskId: string, date: string, newStart: string, newEnd: string) => void
  onNavigate?: (direction: 'prev' | 'next') => void
  onDateChange?: (date: Date) => void
  startHour?: number
  endHour?: number
}

interface ActiveTaskDrag extends TaskDragStart {
  currentStart: number
  currentEnd: number
  dayIndex: number
}

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']
const DAY_WIDTH = 280
const DAYS_TO_RENDER = 7
const CENTER_DAY_INDEX = 3
const TIME_COL_WIDTH = 56 // time label column width

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function snap(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
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

export function DayScrollView({
  selectedDate,
  tasks,
  timeBlocks,
  slotTypes = [],
  onTaskSelect,
  onToggleComplete,
  onCreateTask,
  onCreateTimeBlock,
  onRescheduleTask,
  onNavigate,
  onDateChange,
  startHour = 6,
  endHour = 22,
}: DayScrollViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)

  // New-slot drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ day: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ day: number; y: number } | null>(null)
  const [pendingSlot, setPendingSlot] = useState<{ date: string; startTime: string; endTime: string; anchorX: number; anchorY: number } | null>(null)

  // Task block drag state
  const [activeTaskDrag, setActiveTaskDrag] = useState<ActiveTaskDrag | null>(null)

  // Slot picker nested navigation
  const [selectedParent, setSelectedParent] = useState<string | null>(null)

  // Organized slot types
  const topLevelSlotTypes = useMemo(() => slotTypes.filter(s => !s.parentId).sort((a, b) => a.sortOrder - b.sortOrder), [slotTypes])
  const getChildSlotTypes = useCallback((parentId: string) => slotTypes.filter(s => s.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder), [slotTypes])
  
  const todayString = new Date().toISOString().split('T')[0]
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)

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
    const header = headerScrollRef.current
    if (!container || !header) return
    
    const timeColumnWidth = 56
    const targetScrollLeft = CENTER_DAY_INDEX * DAY_WIDTH
    
    container.scrollLeft = targetScrollLeft
    header.scrollLeft = targetScrollLeft
  }, [selectedDate])

  // Sync scroll between header and grid
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

  // Handle scroll to detect edges
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || isScrolling.current) return

    const scrollLeft = container.scrollLeft
    const maxScroll = container.scrollWidth - container.clientWidth

    if (scrollLeft < DAY_WIDTH * 0.5) {
      isScrolling.current = true
      onNavigate?.('prev')
      requestAnimationFrame(() => { isScrolling.current = false })
    } else if (scrollLeft > maxScroll - DAY_WIDTH * 0.5) {
      isScrolling.current = true
      onNavigate?.('next')
      requestAnimationFrame(() => { isScrolling.current = false })
    }
  }, [onNavigate])

  // Get tasks for a specific date
  const getTasksForDate = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(t => t.scheduledDate === dateStr && t.scheduledStartTime)
  }, [tasks])

  // Get time blocks for a specific date
  const getBlocksForDate = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return timeBlocks.filter(b => b.date === dateStr)
  }, [timeBlocks])

  // Get all-day tasks
  const getAllDayTasksForDate = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(t => 
      (t.scheduledDate === dateStr && !t.scheduledStartTime) ||
      (t.dueDate === dateStr && !t.scheduledDate)
    )
  }, [tasks])

  // Time position calculations
  const getTimePosition = useCallback((time: string) => {
    const minutes = timeToMinutes(time)
    return `${minutes - startHour * 60}px`
  }, [startHour])

  const getDurationHeight = useCallback((start: string, end: string) => {
    const startMin = timeToMinutes(start)
    const endMin = timeToMinutes(end)
    return `${Math.max(endMin - startMin, 15)}px`
  }, [])

  // Drag handlers
  const yToTime = useCallback((y: number) => {
    const minutes = snap(startHour * 60 + y)
    return minutesToTime(Math.max(startHour * 60, Math.min(endHour * 60, minutes)))
  }, [startHour, endHour])

  const MIN = startHour * 60
  const MAX = endHour * 60

  const handleTaskDragStart = useCallback((info: TaskDragStart, dayIndex: number) => {
    setActiveTaskDrag({ ...info, currentStart: info.originalStart, currentEnd: info.originalEnd, dayIndex })
    setPendingSlot(null)
  }, [])

  const TIME_COL_WIDTH = 56

  const handleMouseDown = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if ((e.target as HTMLElement).closest('[data-block]')) return
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setIsDragging(true)
    setDragStart({ day: dayIndex, y })
    setDragEnd({ day: dayIndex, y })
  }, [])

  // Global mouse move for cross-day task dragging
  const handleGlobalMouseMove = useCallback((e: React.MouseEvent) => {
    if (!activeTaskDrag) return
    
    const gridEl = gridRef.current
    if (!gridEl) return
    
    const gridRect = gridEl.getBoundingClientRect()
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0
    
    // Calculate which day column the mouse is over
    const relX = e.clientX - gridRect.left - TIME_COL_WIDTH
    const newDayIndex = Math.max(0, Math.min(Math.floor(relX / DAY_WIDTH), allDates.length - 1))
    
    // Calculate time from Y position
    const relY = e.clientY - gridRect.top + scrollTop
    const minutes = snap(MIN + relY)
    const duration = activeTaskDrag.originalEnd - activeTaskDrag.originalStart
    
    if (activeTaskDrag.dragType === 'move') {
      const newStart = clamp(snap(minutes - activeTaskDrag.offsetY), MIN, MAX - 15)
      const newEnd = clamp(newStart + duration, MIN + 15, MAX)
      setActiveTaskDrag(prev => prev ? { ...prev, dayIndex: newDayIndex, currentStart: newStart, currentEnd: newEnd } : null)
    } else if (activeTaskDrag.dragType === 'resize-top') {
      setActiveTaskDrag(prev => prev ? { ...prev, currentStart: clamp(minutes, MIN, prev.currentEnd - 15) } : null)
    } else if (activeTaskDrag.dragType === 'resize-bottom') {
      setActiveTaskDrag(prev => prev ? { ...prev, currentEnd: clamp(minutes, prev.currentStart + 15, MAX) } : null)
    }
  }, [activeTaskDrag, allDates.length, MIN, MAX])

  // Handle mouse move for new-slot drag (per column)
  const handleMouseMove = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if (activeTaskDrag) return // handled by global
    if (!isDragging || !dragStart) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setDragEnd({ day: dayIndex, y })
  }, [isDragging, dragStart, activeTaskDrag])

  const handleMouseUp = useCallback(() => {
    // Commit task block drag
    if (activeTaskDrag) {
      const date = allDates[activeTaskDrag.dayIndex]?.toISOString().split('T')[0]
      if (date) {
        onRescheduleTask?.(activeTaskDrag.taskId, date, minutesToTime(activeTaskDrag.currentStart), minutesToTime(activeTaskDrag.currentEnd))
      }
      setActiveTaskDrag(null)
      return
    }

    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false)
      return
    }

    if (dragStart.day === dragEnd.day && Math.abs(dragEnd.y - dragStart.y) > 15) {
      const minY = Math.min(dragStart.y, dragEnd.y)
      const maxY = Math.max(dragStart.y, dragEnd.y)
      const startTime = yToTime(minY)
      const endTime = yToTime(maxY)
      const date = allDates[dragStart.day].toISOString().split('T')[0]
      const anchorX = TIME_COL_WIDTH + dragStart.day * DAY_WIDTH + DAY_WIDTH / 2
      setPendingSlot({ date, startTime, endTime, anchorX, anchorY: minY })
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }, [isDragging, dragStart, dragEnd, allDates, yToTime, activeTaskDrag, onRescheduleTask])

  // Handle slot type selection
const handleSelectType = useCallback((slotType: SlotType) => {
    if (!pendingSlot) return
    const { date, startTime, endTime } = pendingSlot
    
    // Check if this type has children - if so, navigate into it
    const children = getChildSlotTypes(slotType.id)
    if (children.length > 0) {
      setSelectedParent(slotType.id)
      return
    }
    
    if (slotType.key === 'task') {
      onCreateTask?.(date, startTime, endTime)
    } else {
      onCreateTimeBlock?.(date, startTime, endTime, slotType.key, slotType.label, slotType.color)
    }
    setPendingSlot(null)
    setSelectedParent(null)
  }, [pendingSlot, onCreateTask, onCreateTimeBlock, getChildSlotTypes])

  const getDragSelection = useCallback((dayIndex: number) => {
    if (!isDragging || !dragStart || !dragEnd) return null
    if (dragStart.day !== dayIndex) return null
    
    const minY = Math.min(dragStart.y, dragEnd.y)
    const maxY = Math.max(dragStart.y, dragEnd.y)
    return {
      top: minY,
      height: maxY - minY,
      startTime: yToTime(minY),
      endTime: yToTime(maxY),
    }
  }, [isDragging, dragStart, dragEnd, yToTime])

  // Resizable header height state
  const [headerHeight, setHeaderHeight] = useState(72)
  const HEADER_DATE_HEIGHT = 60
  const HEADER_MIN = HEADER_DATE_HEIGHT
  const HEADER_MAX = 360
  const isResizingHeader = useRef(false)
  const resizeStartY = useRef(0)
  const resizeStartH = useRef(0)

  const handleHeaderResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizingHeader.current = true
    resizeStartY.current = e.clientY
    resizeStartH.current = headerHeight

    const onMove = (ev: MouseEvent) => {
      if (!isResizingHeader.current) return
      const delta = ev.clientY - resizeStartY.current
      setHeaderHeight(Math.max(HEADER_MIN, Math.min(HEADER_MAX, resizeStartH.current + delta)))
    }
    const onUp = () => {
      isResizingHeader.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [headerHeight, HEADER_MIN])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-panel-secondary">
      {/* Resizable Header Row */}
      <div
        className="flex-shrink-0 flex flex-col border-b border-border bg-panel"
        style={{ height: `${headerHeight}px` }}
      >
        <div className="flex flex-1 min-h-0">
          <div className="w-14 flex-shrink-0 border-r border-border" />
          <div
            ref={headerScrollRef}
            className="flex-1 overflow-x-auto overflow-y-auto"
            onScroll={() => syncScroll('header')}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex" style={{ width: `${DAYS_TO_RENDER * DAY_WIDTH}px` }}>
              {allDates.map((date) => {
                const dateStr = date.toISOString().split('T')[0]
                const isToday = dateStr === todayString
                const allDayTasks = getAllDayTasksForDate(date)
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
                    {/* Date label - fixed height */}
                    <div className={cn(
                      'px-3 py-2 text-center flex-shrink-0',
                      isToday && 'bg-primary/10'
                    )}>
                      <div className="text-xs text-muted-foreground font-medium">
                        {date.getMonth() + 1}/{date.getDate()} 週{WEEKDAY_NAMES[weekdayIndex]}
                      </div>
                      <div className={cn(
                        'text-2xl font-bold',
                        isToday ? 'text-primary' : 'text-foreground'
                      )}>
                        {date.getDate()}
                      </div>
                    </div>
                    {/* Pending/All-day tasks - visible only when header expanded */}
                    {allDayTasks.length > 0 && headerHeight > HEADER_DATE_HEIGHT && (
                      <div className="px-1 pb-1.5 flex flex-col gap-0.5 overflow-hidden">
                        {allDayTasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => onTaskSelect(task)}
                            className={cn(
                              'w-full flex-shrink-0 text-left px-2 py-1 rounded text-[11px] font-medium truncate transition-opacity',
                              'hover:opacity-80 active:opacity-70',
                              task.isCompleted && 'opacity-40 line-through'
                            )}
                            style={{
                              backgroundColor: task.calendarColor || task.workspaceColor,
                              color: '#fff',
                            }}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              {task.isCompleted && <span className="flex-shrink-0">✓</span>}
                              <span className="truncate">{task.title}</span>
                            </span>
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

        {/* Drag handle */}
        <div
          className="flex-shrink-0 h-2 flex items-center justify-center cursor-row-resize group select-none border-t border-border/40 hover:border-primary/40 transition-colors"
          onMouseDown={handleHeaderResizeStart}
        >
          <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
        </div>
      </div>

      {/* Scrollable Time Grid */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        onScroll={() => {
          handleScroll()
          syncScroll('grid')
        }}
      >
        <div 
          ref={gridRef}
          className="flex" 
          style={{ width: `${TIME_COL_WIDTH + DAYS_TO_RENDER * DAY_WIDTH}px` }}
          onMouseMove={handleGlobalMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Time labels column */}
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
            const dayTasks = getTasksForDate(date)
            const dayBlocks = getBlocksForDate(date)
            const dragSelection = getDragSelection(dayIndex)

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
                    className="absolute left-1 right-1 rounded px-2 py-1 text-xs font-medium overflow-hidden"
                    style={{
                      top: getTimePosition(block.startTime),
                      height: getDurationHeight(block.startTime, block.endTime),
                      backgroundColor: block.color + '30',
                      borderLeft: `3px solid ${block.color}`,
                      color: block.color,
                    }}
                  >
                    <div className="truncate">{block.label}</div>
                    <div className="text-[10px] opacity-70">{block.startTime}-{block.endTime}</div>
                  </div>
                ))}

                {/* Scheduled Tasks with drag/resize via TaskBlock */}
                {(() => {
                  const taskCols = calculateTaskColumns(dayTasks)
                  return dayTasks.map((task) => {
                    const col = taskCols.get(task.id)
                    const isDraggingThis = activeTaskDrag?.taskId === task.id
                    const isBeingDraggedAway = isDraggingThis && activeTaskDrag?.dayIndex !== dayIndex
                    // Hide task if being dragged to another day
                    if (isBeingDraggedAway) return null
                    const dragOverride = isDraggingThis && activeTaskDrag
                      ? { top: activeTaskDrag.currentStart - MIN, height: activeTaskDrag.currentEnd - activeTaskDrag.currentStart }
                      : null
                    return (
                      <TaskBlock
                        key={task.id}
                        task={task}
                        calendarStartHour={startHour}
                        onSelect={onTaskSelect}
                        onToggleComplete={onToggleComplete}
                        onDragStart={(info) => handleTaskDragStart(info, dayIndex)}
                        compact={true}
                        column={col?.column ?? 0}
                        totalColumns={col?.totalColumns ?? 1}
                        dragOverride={dragOverride}
                        isDragging={isDraggingThis}
                      />
                    )
                  })
                })()}

                {/* Show dragged task preview when dragging to this day */}
                {activeTaskDrag && activeTaskDrag.dayIndex === dayIndex && !dayTasks.find(t => t.id === activeTaskDrag.taskId) && (
                  <div
                    className="absolute left-1 right-1 rounded-xl px-2 py-1.5 text-left overflow-hidden opacity-80 pointer-events-none z-30 shadow-lg"
                    style={{
                      top: `${activeTaskDrag.currentStart - MIN}px`,
                      height: `${activeTaskDrag.currentEnd - activeTaskDrag.currentStart}px`,
                      backgroundColor: tasks.find(t => t.id === activeTaskDrag.taskId)?.calendarColor || '#6B7FD4',
                    }}
                  >
                    <div className="text-xs font-semibold text-white truncate">
                      {tasks.find(t => t.id === activeTaskDrag.taskId)?.title}
                    </div>
                    <div className="text-[10px] text-white/80 font-mono mt-0.5">
                      {minutesToTime(activeTaskDrag.currentStart)}-{minutesToTime(activeTaskDrag.currentEnd)}
                    </div>
                  </div>
                )}

                {/* Drag Selection Preview */}
                {dragSelection && dragSelection.height > 10 && (
                  <div
                    className="absolute left-1 right-1 bg-primary/20 border-2 border-primary border-dashed rounded pointer-events-none z-20 flex flex-col items-center justify-center"
                    style={{
                      top: dragSelection.top,
                      height: dragSelection.height,
                    }}
                  >
                    <span className="text-xs font-mono font-bold text-primary">
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

        {/* Type picker popup */}
{pendingSlot && (
          <>
          <div
            className="fixed inset-0 z-30"
            onMouseDown={(e) => { e.stopPropagation(); setPendingSlot(null); setSelectedParent(null) }}
          />
          <div
            className="absolute z-40 bg-card border border-border rounded-2xl shadow-2xl p-3 w-64"
            style={{
              left: `${Math.min(pendingSlot.anchorX, (scrollContainerRef.current?.clientWidth || 400) - 280)}px`,
              top: `${Math.min(pendingSlot.anchorY, hours.length * 60 - 220)}px`
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2.5">
              {selectedParent ? (
                <button
                  onClick={() => setSelectedParent(null)}
                  className="flex items-center gap-1 text-xs font-semibold text-foreground hover:text-primary transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  返回
                </button>
              ) : (
                <span className="text-xs font-semibold text-foreground">
                  {pendingSlot.startTime} - {pendingSlot.endTime}
                </span>
              )}
              <button onClick={() => { setPendingSlot(null); setSelectedParent(null) }} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">
              {selectedParent ? slotTypes.find(s => s.id === selectedParent)?.label : '選擇時間區塊的類型'}
            </p>
            <div className="flex flex-col gap-1">
              {(selectedParent ? getChildSlotTypes(selectedParent) : topLevelSlotTypes).map((slotType) => {
                const hasChildren = getChildSlotTypes(slotType.id).length > 0
                return (
                  <button
                    key={slotType.id}
                    onClick={() => handleSelectType(slotType)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${slotType.color}25` }}>
                      {renderSlotIcon(slotType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{slotType.label}</div>
                      <div className="text-[10px] text-muted-foreground">{slotType.description}</div>
                    </div>
                    {hasChildren && (
                      <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          </>
          )}
      </div>
    </div>
  )
}
