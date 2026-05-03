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

interface DayScrollViewProps {
  selectedDate: Date
  tasks: Task[]
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

const DAY_WIDTH = 280
// Initial window: 21 days centered on selectedDate. Window extends in both
// directions on demand as user scrolls toward an edge — see handleScroll.
const INITIAL_DAYS_BEFORE = 10
const INITIAL_DAYS_AFTER = 10
const EXTEND_BATCH = 14            // days to add per extension
const EXTEND_THRESHOLD = DAY_WIDTH * 2  // start extending when within 2 days of edge
const TIME_COL_WIDTH = 56

export function DayScrollView({
  selectedDate,
  tasks,
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
}: DayScrollViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)
  // Track dragging state synchronously for scroll handler
  const isDraggingTaskRef = useRef(false)

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
  
  const todayString = toDateString(new Date())
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)

  // Days extended beyond the initial window. Both grow as the user scrolls
  // toward an edge, giving the view an infinite feel without resetting on nav.
  const [extraBefore, setExtraBefore] = useState(0)
  const [extraAfter, setExtraAfter] = useState(0)
  // When prepending dates, we shift scrollLeft by N*DAY_WIDTH in a useLayoutEffect
  // so the same day stays under the cursor. This ref carries the pending shift.
  const pendingScrollAdjust = useRef(0)

  // Generate dates centered around selectedDate, extended by extras on each side
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

  // Index of selectedDate within allDates (depends on extras)
  const centerIndex = INITIAL_DAYS_BEFORE + extraBefore

  // When user explicitly navigates (selectedDate changes), reset extras and
  // recenter scroll. The extras-reset and selectedDate change happen in the
  // same render cycle so the centerIndex math below stays correct.
  useEffect(() => {
    pendingScrollAdjust.current = 0
    setExtraBefore(0)
    setExtraAfter(0)
  }, [selectedDate])

  useEffect(() => {
    const container = scrollContainerRef.current
    const header = headerScrollRef.current
    if (!container || !header) return

    const targetScrollLeft = INITIAL_DAYS_BEFORE * DAY_WIDTH

    isScrolling.current = true
    container.scrollLeft = targetScrollLeft
    header.scrollLeft = targetScrollLeft
    lastScrollLeft.current = container.scrollLeft

    const t = window.setTimeout(() => { isScrolling.current = false }, 150)
    return () => window.clearTimeout(t)
  }, [selectedDate])

  // After prepending days, shift scrollLeft so the day previously under the
  // cursor stays put visually. Runs synchronously after DOM mutation.
  useLayoutEffect(() => {
    if (pendingScrollAdjust.current === 0) return
    const container = scrollContainerRef.current
    const header = headerScrollRef.current
    if (!container) return
    container.scrollLeft += pendingScrollAdjust.current
    if (header) header.scrollLeft = container.scrollLeft
    lastScrollLeft.current = container.scrollLeft
    pendingScrollAdjust.current = 0
  }, [extraBefore])

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

  // Track last horizontal scroll position
  const lastScrollLeft = useRef(0)
  // Cooldown after drag ends to prevent accidental navigation
  const dragEndCooldown = useRef(false)

  // Horizontal scroll: pan freely; extend the date window on demand as the
  // user approaches either edge so it feels infinite. selectedDate is not
  // touched by scrolling — explicit nav uses chevrons / keyboard / swipe.
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
      // Prepend more days. Compensate scrollLeft in useLayoutEffect so the
      // current visual position is preserved.
      pendingScrollAdjust.current += EXTEND_BATCH * DAY_WIDTH
      setExtraBefore(prev => prev + EXTEND_BATCH)
    } else if (scrollWidth - scrollLeft - clientWidth < EXTEND_THRESHOLD) {
      // Append more days. No scrollLeft adjustment needed — content grows on the right.
      setExtraAfter(prev => prev + EXTEND_BATCH)
    }
  }, [])

  // Get tasks for a specific date
  const getTasksForDate = useCallback((date: Date) => {
    const dateStr = toDateString(date)
    return tasks.filter(t => t.scheduledDate === dateStr && t.scheduledStartTime)
  }, [tasks])

  // Get time blocks for a specific date
  const getBlocksForDate = useCallback((date: Date) => {
    const dateStr = toDateString(date)
    return timeBlocks.filter(b => b.date === dateStr)
  }, [timeBlocks])

  // Get all-day tasks
  const getAllDayTasksForDate = useCallback((date: Date) => {
    const dateStr = toDateString(date)
    return tasks.filter(t =>
      (t.scheduledDate === dateStr && !t.scheduledStartTime) ||
      (t.dueDate === dateStr && !t.scheduledDate)
    )
  }, [tasks])

  // Time position calculations
  const getTimePosition = useCallback((time: string) => {
    const minutes = timeToMinutes(time)
    const offsetMinutes = minutes - startHour * 60
    return `${(offsetMinutes / 60) * hourHeight}px`
  }, [startHour, hourHeight])

  const getDurationHeight = useCallback((start: string, end: string) => {
    const startMin = timeToMinutes(start)
    const endMin = timeToMinutes(end)
    const durationMinutes = endMin - startMin
    return `${Math.max((durationMinutes / 60) * hourHeight, hourHeight / 4)}px`
  }, [hourHeight])

  // Drag handlers
  const yToTime = useCallback((y: number) => {
    const minutes = snap(startHour * 60 + Math.round(y / hourHeight * 60))
    return minutesToTime(Math.max(startHour * 60, Math.min(endHour * 60, minutes)))
  }, [startHour, endHour, hourHeight])

  const MIN = startHour * 60
  const MAX = endHour * 60

  // Track if this is a click vs drag (for new-slot drag on empty grid)
  const mouseDownTime = useRef<number>(0)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)

  // Default duration for click-to-create (in minutes)
  const DEFAULT_DURATION = 30

  // Threshold (px) to differentiate a click from a drag.
  const DRAG_THRESHOLD = 5

  // Scheduled task drag — install window-level mousemove/mouseup so the drag
  // survives the cursor leaving the grid (e.g. moving up to the pending zone
  // to unschedule). Uses elementFromPoint at mouseup to pick the drop target.
  // The drag preview (lift / shadow) only activates after the cursor moves
  // past DRAG_THRESHOLD — that way a click doesn't flicker the lift effect.
  const handleTaskDragStart = useCallback((info: TaskDragStart, dayIndex: number) => {
    setPendingSlot(null)

    const startX = info.startX
    const startY = info.startY
    let movedBeyondThreshold = false
    // Closure-local mirror of activeTaskDrag. Side effects at mouseup read
    // from this rather than from a functional setState callback — calling
    // parent setters inside setActiveTaskDrag(curr => ...) would run during
    // React's render phase and trip "setState during render" warnings.
    let dragState: ActiveTaskDrag | null = null

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!movedBeyondThreshold && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        movedBeyondThreshold = true
        isDraggingTaskRef.current = true
        dragState = {
          ...info,
          currentStart: info.originalStart,
          currentEnd: info.originalEnd,
          dayIndex,
        }
        setActiveTaskDrag(dragState)
      }
      if (!movedBeyondThreshold || !dragState) return

      const scrollContainer = scrollContainerRef.current
      if (!scrollContainer) return
      const containerRect = scrollContainer.getBoundingClientRect()
      const mouseXInContent = ev.clientX - containerRect.left + scrollContainer.scrollLeft
      const mouseYInContent = ev.clientY - containerRect.top + scrollContainer.scrollTop
      const relX = mouseXInContent - TIME_COL_WIDTH
      const newDayIndex = Math.max(0, Math.min(Math.floor(relX / DAY_WIDTH), allDates.length - 1))
      const minutes = snap(MIN + mouseYInContent)

      const duration = dragState.originalEnd - dragState.originalStart
      if (dragState.dragType === 'move') {
        const newStart = clamp(snap(minutes - dragState.offsetY), MIN, MAX - 15)
        const newEnd = clamp(newStart + duration, MIN + 15, MAX)
        dragState = { ...dragState, dayIndex: newDayIndex, currentStart: newStart, currentEnd: newEnd }
      } else if (dragState.dragType === 'resize-top') {
        dragState = { ...dragState, currentStart: clamp(snap(minutes), MIN, dragState.currentEnd - 15) }
      } else if (dragState.dragType === 'resize-bottom') {
        dragState = { ...dragState, currentEnd: clamp(snap(minutes), dragState.currentStart + 15, MAX) }
      }
      setActiveTaskDrag(dragState)
    }

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      if (!movedBeyondThreshold || !dragState) {
        // Click. activeTaskDrag was never set — TaskBlock's own onMouseUp
        // opens the modal. Nothing to clean up here.
        return
      }

      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const overPending = target?.closest('[data-pending-zone]') as HTMLElement | null

      // Clear UI state first, THEN fire the parent callback. Doing it in the
      // other order works too, but this keeps the lift effect from lingering
      // for an extra frame while the parent re-renders.
      const finalState = dragState
      setActiveTaskDrag(null)
      dragState = null

      if (overPending) {
        const pendingDate = overPending.getAttribute('data-pending-zone-date') ?? undefined
        onUnscheduleTask?.(finalState.taskId, pendingDate)
      } else {
        const dropTarget = allDates[finalState.dayIndex]
        if (dropTarget) {
          onRescheduleTask?.(
            finalState.taskId,
            toDateString(dropTarget),
            minutesToTime(finalState.currentStart),
            minutesToTime(finalState.currentEnd),
          )
        }
      }

      isDraggingTaskRef.current = false
      dragEndCooldown.current = true
      setTimeout(() => { dragEndCooldown.current = false }, 300)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [allDates, MIN, MAX, onRescheduleTask, onUnscheduleTask])

  // Pending task drag — same window-level pattern. Drag preview only activates
  // after the cursor moves past the threshold, so a plain click on a pending
  // task opens the detail modal (via the React onClick) without scheduling.
  const handlePendingTaskMouseDown = useCallback((task: Task, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    const duration = task.estimatedMinutes || 30
    let movedBeyondThreshold = false
    // Closure-local mirror of pendingTaskDrag — same rationale as in
    // handleTaskDragStart above (avoid side effects inside setState).
    let lastDayIndex = 0
    let lastMinutes = 0

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!movedBeyondThreshold && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        movedBeyondThreshold = true
        isDraggingTaskRef.current = true
      }
      if (!movedBeyondThreshold) return

      const scrollContainer = scrollContainerRef.current
      if (!scrollContainer) return
      const containerRect = scrollContainer.getBoundingClientRect()
      const mouseXInContent = ev.clientX - containerRect.left + scrollContainer.scrollLeft
      const mouseYInContent = ev.clientY - containerRect.top + scrollContainer.scrollTop
      const relX = mouseXInContent - TIME_COL_WIDTH
      lastDayIndex = Math.max(0, Math.min(Math.floor(relX / DAY_WIDTH), allDates.length - 1))
      lastMinutes = clamp(snap(MIN + Math.max(0, mouseYInContent)), MIN, MAX - 15)

      setPendingTaskDrag({
        task,
        currentDayIndex: lastDayIndex,
        currentMinutes: lastMinutes,
        duration,
      })
    }

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      if (!movedBeyondThreshold) {
        // Click — let onClick fire normally to open the detail modal.
        return
      }

      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const overPending = target?.closest('[data-pending-zone]')

      setPendingTaskDrag(null)

      // Drop back over the pending zone is a no-op (still pending).
      if (!overPending) {
        const dropTarget = allDates[lastDayIndex]
        if (dropTarget) {
          onRescheduleTask?.(
            task.id,
            toDateString(dropTarget),
            minutesToTime(lastMinutes),
            minutesToTime(lastMinutes + duration),
          )
        }
      }

      isDraggingTaskRef.current = false
      dragEndCooldown.current = true
      setTimeout(() => { dragEndCooldown.current = false }, 300)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [allDates, MIN, MAX, onRescheduleTask])

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

  // Handle mouse move for new-slot drag (per column)
  const handleMouseMove = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if (activeTaskDrag || pendingTaskDrag) return // handled by window listeners
    if (!isDragging || !dragStart) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setDragEnd({ day: dayIndex, y })
  }, [isDragging, dragStart, activeTaskDrag, pendingTaskDrag])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Task-block and pending-task drags are committed by window-level listeners
    // installed in handleTaskDragStart / handlePendingTaskMouseDown. This
    // handler only owns the "drag on empty grid to create a new slot" flow.
    if (activeTaskDrag || pendingTaskDrag) return

    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false)
      return
    }

    // Calculate if this was a click (short time, small movement) vs drag
    const elapsed = Date.now() - mouseDownTime.current
    const movedDistance = mouseDownPos.current 
      ? Math.sqrt(Math.pow(e.clientX - mouseDownPos.current.x, 2) + Math.pow(e.clientY - mouseDownPos.current.y, 2))
      : 0
    const isClick = elapsed < 200 && movedDistance < 10

    if (isClick) {
      const startTime = yToTime(dragStart.y)
      const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1])
      const endMinutes = Math.min(startMinutes + DEFAULT_DURATION, endHour * 60)
      const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`
      const date = toDateString(allDates[dragStart.day])
      // Anchor in viewport coords (clientX/Y), so the popover positioner can
      // flip above when there isn't room below.
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
    if (slotType.workspaceId) {
      onOpenCreateTask?.(slotType, date, startTime, endTime)
      setPendingSlot(null)
      setSelectedParent(null)
      return
    }

    if (slotType.key === 'task') {
      onCreateTask?.(date, startTime, endTime)
    } else {
      onCreateTimeBlock?.(date, startTime, endTime, slotType.key, slotType.label, slotType.color)
    }
    setPendingSlot(null)
    setSelectedParent(null)
  }, [pendingSlot, onCreateTask, onCreateTimeBlock, onOpenCreateTask, getChildSlotTypes])

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

  // Resizable header height state - default to show pending tasks area
  const [headerHeight, setHeaderHeight] = useState(160)
  const HEADER_DATE_HEIGHT = 60
  const HEADER_MIN = 100 // min: at least some space for pending tasks
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
            <div className="flex" style={{ width: `${allDates.length * DAY_WIDTH}px` }}>
              {allDates.map((date) => {
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
                    {/* Pending/All-day tasks — also acts as drop zone for
                         scheduled tasks dragged here to clear their time. */}
                    <div
                      data-pending-zone
                      data-pending-zone-date={dateStr}
                      className={cn(
                        'flex-1 px-1 pb-1.5 flex flex-col gap-0.5 overflow-hidden cursor-pointer transition-colors border-t border-border/50',
                        activeTaskDrag
                          ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/40 ring-inset'
                          : 'hover:bg-secondary/30'
                      )}
                      style={{ minHeight: `${headerHeight - HEADER_DATE_HEIGHT}px` }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button')) return
                        if (dragEndCooldown.current) return
                        onCreateTask?.(dateStr, '09:00', '09:30')
                      }}
                      title={activeTaskDrag ? '放開以將任務移回待排程' : '點擊新增任務'}
                    >
                      {allDayTasks.map((task) => (
                        <div
                          key={task.id}
                          onMouseDown={(e) => handlePendingTaskMouseDown(task, e)}
                          onClick={(e) => { e.stopPropagation(); onTaskSelect(task) }}
                          className={cn(
                            'w-full flex-shrink-0 text-left px-2 py-1 rounded text-[11px] font-medium truncate cursor-grab active:cursor-grabbing select-none',
                            'hover:opacity-90 hover:shadow-sm transition-all',
                            task.isCompleted && 'opacity-40 line-through',
                            pendingTaskDrag?.task.id === task.id && 'opacity-30'
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
        onScroll={() => {
          handleScroll()
          syncScroll('grid')
        }}
      >
        <div
          ref={gridRef}
          className="flex"
          style={{ width: `${TIME_COL_WIDTH + allDates.length * DAY_WIDTH}px` }}
        >
          {/* Time labels column */}
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
                onMouseUp={(e) => handleMouseUp(e)}
                onMouseLeave={(e) => { if (isDragging) handleMouseUp(e) }}
              >
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div key={hour} className="border-b border-border/50" style={{ height: `${hourHeight}px` }}>
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
            ref={popoverRef}
            className={cn(
              'fixed z-40 bg-card border border-border rounded-2xl shadow-2xl p-3 w-64 transition-opacity duration-100',
              popoverPos ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              left: `${popoverPos?.left ?? -9999}px`,
              top: `${popoverPos?.top ?? -9999}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Pick a slot type. Workspace types open the full TaskDetailModal in create mode. */}
            <div className="flex items-center justify-between mb-2.5">
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
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${slotType.color}25` }}>
                      <SlotIcon slotType={slotType} />
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
