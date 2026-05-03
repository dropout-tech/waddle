'use client'

import { useMemo, useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { positionPopover } from '@/lib/popover-position'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock, SlotType } from '@/lib/types'
import {
  WEEKDAY_NAMES,
  timeToMinutes,
  minutesToTime,
  snap,
  clamp,
  calculateTaskColumns,
  toDateString,
} from '@/lib/calendar-utils'
import { beginGestureSuppression, endGestureSuppression } from '@/hooks/use-swipe-navigation'
import { CurrentTimeLine } from './current-time-line'
import { TaskBlock, type TaskDragStart } from './task-block'
import { SlotIcon } from './slot-icon'
import { X, ChevronLeft } from 'lucide-react'

interface WeekViewProps {
  selectedDate: Date
  tasks: Task[]
  pendingTasks: Task[]
  timeBlocks: TimeBlock[]
  slotTypes?: SlotType[]
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (date: string, startTime: string, endTime: string) => void
  onCreateTimeBlock?: (date: string, startTime: string, endTime: string, type: string, label: string, color: string, notes?: string, description?: string) => void
  /** Fired when user picks a workspace category — opens the full task detail modal in create mode */
  onOpenCreateTask?: (slotType: SlotType, date: string, startTime: string, endTime: string) => void
  onRescheduleTask?: (taskId: string, date: string, newStart: string, newEnd: string) => void
  onUnscheduleTask?: (taskId: string, date?: string) => void
  onNavigate?: (direction: 'prev' | 'next') => void
  onDateChange?: (date: Date) => void
  startHour?: number
  endHour?: number
  hourHeight?: number
}

interface ActiveTaskDrag extends TaskDragStart {
  currentStart: number
  currentEnd: number
  dayIndex: number
}

const DAY_WIDTH = 120
// Initial 21-day window centered on selectedDate; extends in both directions
// on demand as user scrolls toward an edge.
const INITIAL_DAYS_BEFORE = 10
const INITIAL_DAYS_AFTER = 10
const EXTEND_BATCH = 21
const EXTEND_THRESHOLD = DAY_WIDTH * 3
const TIME_COL_WIDTH = 56

export function WeekView({
  selectedDate,
  tasks,
  pendingTasks,
  timeBlocks,
  slotTypes = [],
  onTaskSelect,
  onToggleComplete,
  onCreateTask,
  onCreateTimeBlock,
  onOpenCreateTask,
  onRescheduleTask,
  onUnscheduleTask,
  onNavigate,
  onDateChange,
  startHour = 0,
  endHour = 24,
  hourHeight = 60,
}: WeekViewProps) {
  // New-slot drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ day: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ day: number; y: number } | null>(null)
  const [pendingSlot, setPendingSlot] = useState<{ date: string; startTime: string; endTime: string; anchorX: number; anchorY: number } | null>(null)

  // Task block drag state
  const [activeTaskDrag, setActiveTaskDrag] = useState<ActiveTaskDrag | null>(null)

  // Pending task drag state (from header to grid)
  const [pendingTaskDrag, setPendingTaskDrag] = useState<{
    task: Task
    currentDayIndex: number
    currentMinutes: number
    duration: number
  } | null>(null)

  // Slot picker nested navigation
  const [selectedParent, setSelectedParent] = useState<string | null>(null)

  // Popover positioning — measured after render so it can flip when there
  // isn't enough room below the click.
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    if (!pendingSlot || !popoverRef.current) {
      setPopoverPos(null)
      return
    }
    const el = popoverRef.current
    const rect = el.getBoundingClientRect()
    const { top, left } = positionPopover(
      { x: pendingSlot.anchorX, y: pendingSlot.anchorY },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight }
    )
    setPopoverPos({ top, left })
  }, [pendingSlot, selectedParent])


  // Suppress panel-level swipe navigation while any in-calendar drag is
  // active. Without this, dragging a task ≥60 px horizontally would also
  // trigger a week navigate, making the task appear to jump weeks.
  const isAnyDragging = !!activeTaskDrag || !!pendingTaskDrag || isDragging
  useEffect(() => {
    if (!isAnyDragging) return
    beginGestureSuppression()
    return () => endGestureSuppression()
  }, [isAnyDragging])

  // Organized slot types
  const topLevelSlotTypes = useMemo(() => slotTypes.filter(s => !s.parentId).sort((a, b) => a.sortOrder - b.sortOrder), [slotTypes])
  const getChildSlotTypes = useCallback((parentId: string) => slotTypes.filter(s => s.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder), [slotTypes])
  
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const weekViewRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)
  // Track dragging state synchronously for scroll handler
  const isDraggingTaskRef = useRef(false)
  const lastScrollLeft = useRef(0)

  // Extension state for infinite-feeling scroll
  const [extraBefore, setExtraBefore] = useState(0)
  const [extraAfter, setExtraAfter] = useState(0)
  const pendingScrollAdjust = useRef(0)

  // Generate dates centered around selectedDate, extended on each side
  const allDates = useMemo(() => {
    const dates: Date[] = []
    const before = INITIAL_DAYS_BEFORE + extraBefore
    const after = INITIAL_DAYS_AFTER + extraAfter
    const centerDate = new Date(selectedDate)
    for (let i = -before; i <= after; i++) {
      const d = new Date(centerDate)
      d.setDate(centerDate.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [selectedDate, extraBefore, extraAfter])

  const centerIndex = INITIAL_DAYS_BEFORE + extraBefore

  // Reset extras when user explicitly navigates
  useEffect(() => {
    pendingScrollAdjust.current = 0
    setExtraBefore(0)
    setExtraAfter(0)
  }, [selectedDate])

  // Recenter scroll on selectedDate change
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const targetScrollLeft = INITIAL_DAYS_BEFORE * DAY_WIDTH

    isScrolling.current = true
    container.scrollLeft = targetScrollLeft
    lastScrollLeft.current = container.scrollLeft

    const t = window.setTimeout(() => { isScrolling.current = false }, 150)
    return () => window.clearTimeout(t)
  }, [selectedDate])

  // After prepending days, shift scrollLeft so visual position is preserved
  useLayoutEffect(() => {
    if (pendingScrollAdjust.current === 0) return
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollLeft += pendingScrollAdjust.current
    lastScrollLeft.current = container.scrollLeft
    pendingScrollAdjust.current = 0
  }, [extraBefore])

  // Cooldown after drag ends to prevent accidental navigation
  const dragEndCooldown = useRef(false)

  // Horizontal scroll: pan freely; extend window on edge approach.
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || isScrolling.current) return
    if (isDraggingTaskRef.current) {
      lastScrollLeft.current = container.scrollLeft
      return
    }

    const { scrollLeft, scrollWidth, clientWidth } = container
    lastScrollLeft.current = scrollLeft

    if (scrollLeft < EXTEND_THRESHOLD) {
      pendingScrollAdjust.current += EXTEND_BATCH * DAY_WIDTH
      setExtraBefore(prev => prev + EXTEND_BATCH)
    } else if (scrollWidth - scrollLeft - clientWidth < EXTEND_THRESHOLD) {
      setExtraAfter(prev => prev + EXTEND_BATCH)
    }
  }, [])

  const hours = useMemo(() => {
    const h = []
    for (let i = startHour; i <= endHour; i++) {
      h.push(i)
    }
    return h
  }, [startHour, endHour])

  const today = new Date()
  const todayString = toDateString(today)

  // Get scheduled tasks for a specific date (tasks with specific time)
  const getScheduledTasksForDate = (date: Date) => {
    const dateStr = toDateString(date)
    return tasks.filter(
      (t) => t.scheduledDate === dateStr && t.scheduledStartTime && t.scheduledEndTime
    )
  }

  // Get all-day/unscheduled tasks for a specific date
  // These are tasks that have scheduledDate or dueDate matching this day but NO specific time
  const getAllDayTasksForDate = (date: Date) => {
    const dateStr = toDateString(date)
    return tasks.filter(
      (t) =>
        (t.scheduledDate === dateStr || t.dueDate === dateStr) &&
        !t.scheduledStartTime
    )
  }

  // Get time blocks for a specific date
  const getTimeBlocksForDate = (date: Date) => {
    const dateStr = toDateString(date)
    return timeBlocks.filter((tb) => tb.date === dateStr)
  }

  // Calculate position for a time
  const getTimePosition = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    const hourOffset = h - startHour
    const minuteOffset = m / 60
    return (hourOffset + minuteOffset) * hourHeight
  }

  // Calculate height for duration
  const getDurationHeight = (start: string, end: string) => {
    const startPos = getTimePosition(start)
    const endPos = getTimePosition(end)
    return Math.max(endPos - startPos, 20)
  }

  // Convert Y position to time string with clamping
  const yToTime = useCallback((y: number) => {
    const totalMinutes = startHour * 60 + Math.round(y / hourHeight * 60)
    // Round to nearest 15 minutes and clamp to valid range
    const roundedMinutes = Math.round(totalMinutes / 15) * 15
    const clampedMinutes = Math.max(startHour * 60, Math.min(23 * 60 + 45, roundedMinutes))
    const hours = Math.floor(clampedMinutes / 60)
    const minutes = clampedMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }, [startHour, hourHeight])

  const MIN = startHour * 60
  const MAX = endHour * 60

  const handleTaskDragStart = useCallback((info: TaskDragStart, dayIndex: number) => {
    isDraggingTaskRef.current = true
    setActiveTaskDrag({ ...info, currentStart: info.originalStart, currentEnd: info.originalEnd, dayIndex })
    setPendingSlot(null)
  }, [])

  // Track if this is a click vs drag
  const mouseDownTime = useRef<number>(0)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)
  
  // Default duration for click-to-create (in minutes)
  const DEFAULT_DURATION = 30

  // Handle pending task drag start from header
  const handlePendingTaskDragStart = useCallback((task: Task, e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingTaskRef.current = true
    const duration = task.estimatedMinutes || 30
    // Start at 9:00 AM or current grid position if over grid
    const gridEl = gridRef.current
    let startMinutes = 9 * 60
    let dayIndex = centerIndex
    
    if (gridEl) {
      const gridRect = gridEl.getBoundingClientRect()
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0
      const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0
      const relX = e.clientX - gridRect.left - TIME_COL_WIDTH + scrollLeft
      const relY = e.clientY - gridRect.top + scrollTop
      dayIndex = Math.max(0, Math.min(Math.floor(relX / DAY_WIDTH), allDates.length - 1))
      startMinutes = snap(MIN + Math.max(0, relY))
    }
    
    setPendingTaskDrag({
      task,
      currentDayIndex: dayIndex,
      currentMinutes: startMinutes,
      duration,
    })
  }, [allDates.length, MIN])

  // Handle mouse down on grid to start new-slot drag or click
  const handleMouseDown = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if ((e.target as HTMLElement).closest('[data-block]')) return
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    
    // Track mouse down time and position to detect click vs drag
    mouseDownTime.current = Date.now()
    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    
    setIsDragging(true)
    setDragStart({ day: dayIndex, y })
    setDragEnd({ day: dayIndex, y })
  }, [])

  // Global mouse move for cross-day task dragging (both scheduled and pending tasks)
  const handleGlobalMouseMove = useCallback((e: React.MouseEvent) => {
    const gridEl = gridRef.current
    const scrollContainer = scrollContainerRef.current
    if (!gridEl || !scrollContainer) return
    
    // Use scroll container rect for accurate positioning
    const containerRect = scrollContainer.getBoundingClientRect()
    const scrollTop = scrollContainer.scrollTop
    const scrollLeft = scrollContainer.scrollLeft
    
    // Calculate mouse position in the scrollable content coordinate system
    // e.clientX/Y is viewport position, containerRect.left/top is container's viewport position
    // Adding scroll offset gives us position in the full scrollable content
    const mouseXInContent = e.clientX - containerRect.left + scrollLeft
    const mouseYInContent = e.clientY - containerRect.top + scrollTop
    
    // Calculate which day column the mouse is over (accounting for time column)
    const relX = mouseXInContent - TIME_COL_WIDTH
    const newDayIndex = Math.max(0, Math.min(Math.floor(relX / DAY_WIDTH), allDates.length - 1))
    
    // Calculate time from Y position (Y in content = minutes from startHour)
    const minutes = snap(MIN + mouseYInContent)
    
    // Handle pending task drag (from header to grid)
    if (pendingTaskDrag) {
      const newStart = clamp(snap(minutes), MIN, MAX - 15)
      setPendingTaskDrag(prev => prev ? { ...prev, currentDayIndex: newDayIndex, currentMinutes: newStart } : null)
      return
    }
    
    // Handle scheduled task drag
    if (activeTaskDrag) {
      const duration = activeTaskDrag.originalEnd - activeTaskDrag.originalStart
      
      if (activeTaskDrag.dragType === 'move') {
        // Move: can change both day and time
        const newStart = clamp(snap(minutes - activeTaskDrag.offsetY), MIN, MAX - 15)
        const newEnd = clamp(newStart + duration, MIN + 15, MAX)
        setActiveTaskDrag(prev => prev ? { ...prev, dayIndex: newDayIndex, currentStart: newStart, currentEnd: newEnd } : null)
      } else if (activeTaskDrag.dragType === 'resize-top') {
        // Resize top: only change start time, keep same day
        setActiveTaskDrag(prev => prev ? { ...prev, currentStart: clamp(snap(minutes), MIN, prev.currentEnd - 15) } : null)
      } else if (activeTaskDrag.dragType === 'resize-bottom') {
        // Resize bottom: only change end time, keep same day
        setActiveTaskDrag(prev => prev ? { ...prev, currentEnd: clamp(snap(minutes), prev.currentStart + 15, MAX) } : null)
      }
    }
  }, [activeTaskDrag, pendingTaskDrag, allDates.length, MIN, MAX])

  // Handle mouse move for new-slot drag (per column)
  const handleMouseMove = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if (activeTaskDrag) return // handled by global
    if (!isDragging || !dragStart) return
    const rect = e.currentTarget.getBoundingClientRect()
    const maxY = hours.length * 60
    const y = Math.max(0, Math.min(e.clientY - rect.top, maxY))
    setDragEnd({ day: dayIndex, y })
  }, [isDragging, dragStart, activeTaskDrag, hours.length])

  // Handle mouse up - detect click vs drag
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Handle pending task drop
    if (pendingTaskDrag) {
      const dropTarget = allDates[pendingTaskDrag.currentDayIndex]
      if (dropTarget) {
        const date = toDateString(dropTarget)
        const startTime = minutesToTime(pendingTaskDrag.currentMinutes)
        const endTime = minutesToTime(pendingTaskDrag.currentMinutes + pendingTaskDrag.duration)
        onRescheduleTask?.(pendingTaskDrag.task.id, date, startTime, endTime)
      }
      setPendingTaskDrag(null)
      // Reset drag ref and prevent navigation briefly
      isDraggingTaskRef.current = false
      dragEndCooldown.current = true
      setTimeout(() => { dragEndCooldown.current = false }, 300)
      return
    }

    // Handle scheduled task drop
    if (activeTaskDrag) {
      const dropTarget = allDates[activeTaskDrag.dayIndex]
      if (dropTarget) {
        const date = toDateString(dropTarget)
        onRescheduleTask?.(activeTaskDrag.taskId, date, minutesToTime(activeTaskDrag.currentStart), minutesToTime(activeTaskDrag.currentEnd))
      }
      setActiveTaskDrag(null)
      // Reset drag ref and prevent navigation briefly
      isDraggingTaskRef.current = false
      dragEndCooldown.current = true
      setTimeout(() => { dragEndCooldown.current = false }, 300)
      return
    }

    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      return
    }

    // Calculate if this was a click (short time, small movement) vs drag
    const elapsed = Date.now() - mouseDownTime.current
    const movedDistance = mouseDownPos.current 
      ? Math.sqrt(Math.pow(e.clientX - mouseDownPos.current.x, 2) + Math.pow(e.clientY - mouseDownPos.current.y, 2))
      : 0
    const isClick = elapsed < 200 && movedDistance < 10

    if (isClick) {
      // Click: create a default duration slot at clicked position
      const startTime = yToTime(dragStart.y)
      const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1])
      const endMinutes = Math.min(startMinutes + DEFAULT_DURATION, endHour * 60)
      const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`
      const date = toDateString(allDates[dragStart.day])
      setPendingSlot({ date, startTime, endTime, anchorX: e.clientX, anchorY: e.clientY })
    } else if (dragStart.day === dragEnd.day && Math.abs(dragEnd.y - dragStart.y) > 15) {
      const minY = Math.min(dragStart.y, dragEnd.y)
      const maxY = Math.max(dragStart.y, dragEnd.y)
      const startTime = yToTime(minY)
      const endTime = yToTime(maxY)
      const date = toDateString(allDates[dragStart.day])
      setPendingSlot({ date, startTime, endTime, anchorX: e.clientX, anchorY: e.clientY })
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
    mouseDownPos.current = null
  }, [isDragging, dragStart, dragEnd, allDates, yToTime, activeTaskDrag, pendingTaskDrag, onRescheduleTask, endHour])

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

    // Workspace-bound types create a task — open the full TaskDetailModal in create mode
    // so the user fills title / description / notes / urgency / etc. with the same UI as editing.
    if (slotType.workspaceId) {
      onOpenCreateTask?.(slotType, date, startTime, endTime)
      setPendingSlot(null)
      setSelectedParent(null)
      return
    }

    if (slotType.key === 'task') {
      onCreateTask?.(date, startTime, endTime)
    } else {
      // Pure time block (lunch / focus / buffer) — create immediately
      onCreateTimeBlock?.(date, startTime, endTime, slotType.key, slotType.label, slotType.color)
    }
    setPendingSlot(null)
    setSelectedParent(null)
  }, [pendingSlot, onCreateTask, onCreateTimeBlock, onOpenCreateTask, getChildSlotTypes])

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

  // Resizable header height state - default to show ~4 task rows
  const [headerHeight, setHeaderHeight] = useState(160) // default: show pending tasks
  const HEADER_DATE_HEIGHT = 52 // fixed date row height
  const HEADER_MIN = 100 // min: at least some space for pending tasks
  const HEADER_MAX = 320
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
    <div ref={weekViewRef} className="flex-1 flex flex-col overflow-hidden bg-panel-secondary">
      {/* Resizable Header Row */}
      <div
        className="flex-shrink-0 flex flex-col border-b border-border bg-panel"
        style={{ height: `${headerHeight}px` }}
      >
        <div className="flex flex-1 min-h-0">
          {/* Time column spacer */}
          <div className="w-14 flex-shrink-0 border-r border-border" />

          {/* Scrollable header area */}
          <div
            ref={headerScrollRef}
            className="flex-1 overflow-x-auto overflow-y-auto scrollbar-hide"
            onScroll={() => syncScroll('header')}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex" style={{ width: `${allDates.length * DAY_WIDTH}px` }}>
              {allDates.map((date, dayIndex) => {
                const dateStr = toDateString(date)
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
                      'px-2 py-1.5 text-center flex-shrink-0',
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
                    {/* Pending/All-day tasks — also acts as drop zone for
                         scheduled tasks dragged here to clear their time. */}
                    <div
                      data-pending-zone
                      data-pending-zone-date={dateStr}
                      className={cn(
                        'flex-1 px-0.5 pb-1 flex flex-col gap-px overflow-hidden cursor-pointer transition-colors border-t border-border/50',
                        // Highlight strongly when a scheduled task is being dragged so the
                        // user can see this is a valid drop target for unscheduling.
                        activeTaskDrag
                          ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/40 ring-inset'
                          : 'hover:bg-secondary/30'
                      )}
                      style={{ minHeight: `${headerHeight - HEADER_DATE_HEIGHT}px` }}
                      onMouseUp={(e) => {
                        // Drop a scheduled task here → unschedule (clear time, keep date).
                        // Has to run BEFORE the click handler that creates a new task.
                        if (activeTaskDrag) {
                          e.stopPropagation()
                          onUnscheduleTask?.(activeTaskDrag.taskId, dateStr)
                          setActiveTaskDrag(null)
                          isDraggingTaskRef.current = false
                          dragEndCooldown.current = true
                          setTimeout(() => { dragEndCooldown.current = false }, 300)
                        }
                      }}
                      onClick={(e) => {
                        // Only trigger if clicking on empty space, not a task,
                        // and not right after dropping a task here.
                        if ((e.target as HTMLElement).closest('button')) return
                        if (dragEndCooldown.current) return
                        onCreateTask?.(dateStr, '09:00', '09:30')
                      }}
                      title={activeTaskDrag ? '放開以將任務移回待排程' : '點擊新增任務'}
                    >
                      {allDayTasks.map((task) => (
                        <div
                          key={task.id}
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            handlePendingTaskDragStart(task, e)
                          }}
                          onClick={(e) => { e.stopPropagation(); onTaskSelect(task) }}
                          className={cn(
                            'w-full flex-shrink-0 text-left px-1.5 py-[3px] rounded text-[10px] font-medium truncate cursor-grab active:cursor-grabbing select-none',
                            'hover:opacity-90 hover:shadow-sm transition-all',
                            task.isCompleted && 'opacity-40 line-through',
                            pendingTaskDrag?.task.id === task.id && 'opacity-30'
                          )}
                          style={{
                            backgroundColor: task.calendarColor || task.workspaceColor,
                            color: '#fff',
                          }}
                        >
                          <span className="flex items-center gap-1 min-w-0">
                            {task.isCompleted && <span className="flex-shrink-0">✓</span>}
                            <span className="truncate">{task.title}</span>
                          </span>
                        </div>
                      ))}
                    </div>
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
        onScroll={(e) => {
          handleScroll()
          syncScroll('grid')
        }}
      >
        <div 
          ref={gridRef} 
          className="flex" 
          style={{ width: `${TIME_COL_WIDTH + allDates.length * DAY_WIDTH}px` }}
          onMouseMove={handleGlobalMouseMove}
          onMouseUp={(e) => handleMouseUp(e)}
          onMouseLeave={(e) => {
            handleMouseUp(e)
            // Also cancel pending task drag on leave
            if (pendingTaskDrag) setPendingTaskDrag(null)
          }}
        >
          {/* Time labels column - sticky left */}
          <div className="w-14 flex-shrink-0 sticky left-0 z-20 bg-panel border-r border-border">
            {hours.map((hour) => (
              <div key={hour} className="relative" style={{ height: `${hourHeight}px` }}>
                <span className="absolute -top-2 left-1 right-1 text-[10px] text-muted-foreground font-mono text-right">
                  {hour.toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {allDates.map((date, dayIndex) => {
            const dateStr = toDateString(date)
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
                onMouseUp={(e) => handleMouseUp(e)}
                onMouseLeave={(e) => { if (isDragging) handleMouseUp(e) }}
              >
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div key={hour} className="border-b border-border/50" style={{ height: `${hourHeight}px` }}>
                    <div className="border-b border-dashed border-border/30" style={{ height: `${hourHeight / 2}px` }} />
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

                {/* Scheduled Tasks with drag/resize via TaskBlock */}
                {dayTasks.map((task) => {
                  const col = taskColumns.get(task.id)
                  const isDraggingThis = activeTaskDrag?.taskId === task.id
                  const isBeingDraggedAway = isDraggingThis && activeTaskDrag?.dayIndex !== dayIndex
                  // Hide task if it's being dragged to another day
                  if (isBeingDraggedAway) return null
                  const dragOverride = isDraggingThis && activeTaskDrag
                    ? { top: activeTaskDrag.currentStart - MIN, height: activeTaskDrag.currentEnd - activeTaskDrag.currentStart }
                    : null
                  return (
                    <TaskBlock
                      key={task.id}
                      task={task}
                      calendarStartHour={startHour}
                      hourHeight={hourHeight}
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
                })}

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

                {/* Show pending task drag preview when dragging from header to this day */}
                {pendingTaskDrag && pendingTaskDrag.currentDayIndex === dayIndex && (
                  <div
                    className="absolute left-1 right-1 rounded-xl px-2 py-1.5 text-left overflow-hidden pointer-events-none z-30 shadow-xl border-2 border-white/50"
                    style={{
                      top: `${pendingTaskDrag.currentMinutes - MIN}px`,
                      height: `${Math.max(pendingTaskDrag.duration, 30)}px`,
                      backgroundColor: pendingTaskDrag.task.calendarColor || pendingTaskDrag.task.workspaceColor || '#6B7FD4',
                    }}
                  >
                    <div className="text-xs font-semibold text-white truncate">
                      {pendingTaskDrag.task.title}
                    </div>
                    <div className="text-[10px] text-white/80 font-mono mt-0.5">
                      {minutesToTime(pendingTaskDrag.currentMinutes)}-{minutesToTime(pendingTaskDrag.currentMinutes + pendingTaskDrag.duration)}
                    </div>
                  </div>
                )}

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

        {/* Type picker popup - fixed position near click location */}
{pendingSlot && (
          <>
          <div
            className="fixed inset-0 z-[100]"
            onMouseDown={(e) => { e.stopPropagation(); setPendingSlot(null); setSelectedParent(null) }}
          />
          <div
            ref={popoverRef}
            className={cn(
              'fixed z-[101] bg-card border border-border rounded-2xl shadow-2xl p-3 w-64 transition-opacity duration-100',
              popoverPos ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              left: `${popoverPos?.left ?? -9999}px`,
              top: `${popoverPos?.top ?? -9999}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Pick a slot type. Workspace types open the full TaskDetailModal in create mode. */}
                <div className="flex items-center justify-between mb-2">
                  {selectedParent ? (
                    <button
                      onClick={() => setSelectedParent(null)}
                      className="flex items-center gap-1 text-xs font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      返回
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-foreground">
                      {pendingSlot.startTime} - {pendingSlot.endTime}
                    </span>
                  )}
                  <button onClick={() => { setPendingSlot(null); setSelectedParent(null) }} aria-label="關閉" className="p-1 rounded-lg hover:bg-muted transition-colors">
                    <X className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
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
                        className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-muted transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${slotType.color}25` }}>
                          <SlotIcon slotType={slotType} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-foreground">{slotType.label}</div>
                          <div className="text-[9px] text-muted-foreground">{slotType.description}</div>
                        </div>
                        {hasChildren && (
                          <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground rotate-180" />
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
