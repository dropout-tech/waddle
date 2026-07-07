'use client'

import { useMemo, useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { toast } from 'sonner'
import { positionPopover } from '@/lib/popover-position'
import { cn, haptic, isLightColor } from '@/lib/utils'
import type { Task, TimeBlock, SlotType } from '@/lib/types'
import {
  WEEKDAY_NAMES,
  timeToMinutes,
  minutesToTime,
  snap,
  clamp,
  calculateUnifiedColumns,
  toDateString,
  autoScrollContainerNearEdge,
  taskOccursOnDate,
} from '@/lib/calendar-utils'
import { beginGestureSuppression, endGestureSuppression } from '@/hooks/use-swipe-navigation'
import { useIsMobile } from '@/hooks/use-mobile'
import { CurrentTimeLine } from './current-time-line'
import { TaskBlock, type TaskDragStart } from './task-block'
import { SlotIcon } from './slot-icon'
import { X, ChevronLeft } from 'lucide-react'
import { RecurrenceChoiceModal, type RecurrenceChoice } from '../modals/recurrence-choice-modal'
import { taskDisplayTitle } from '@/lib/task-display'
import { useShowCategoryPrefix } from '@/components/category-prefix-context'
import { useDisplayColor } from '@/hooks/use-display-color'
import { WORKSPACE_COLORS } from '@/lib/palette'

interface WeekViewProps {
  selectedDate: Date
  tasks: Task[]
  pendingTasks: Task[]
  timeBlocks: TimeBlock[]
  slotTypes?: SlotType[]
  onTaskSelect: (task: Task, occurrenceDate?: string) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (date: string, startTime?: string, endTime?: string) => void
  onCreateTimeBlock?: (date: string, startTime: string, endTime: string, type: string, label: string, color: string, notes?: string, description?: string) => void
  /** Fired when user picks a workspace category — opens the full task detail modal in create mode */
  onOpenCreateTask?: (slotType: SlotType, date: string, startTime: string, endTime: string) => void
  onRescheduleTask?: (taskId: string, date: string, newStart: string, newEnd: string, recurrenceChoice?: RecurrenceChoice, targetDate?: string) => void
  onUnscheduleTask?: (taskId: string, date?: string, recurrenceChoice?: RecurrenceChoice, targetDate?: string) => void
  onUpdateTimeBlock?: (id: string, updates: Partial<TimeBlock>) => void
  onDeleteTimeBlock?: (id: string) => void
  onTimeBlockSelect?: (block: TimeBlock) => void
  onNavigate?: (direction: 'prev' | 'next') => void
  onDateChange?: (date: Date) => void
  startHour?: number
  endHour?: number
  hourHeight?: number
  /** How many days to fit per "week unit" (5-7). Drives column width so the
   *  user gets more horizontal room per day when 5-day work-week is chosen. */
  weekViewDays?: number
}

interface ActiveTaskDrag extends TaskDragStart {
  currentStart: number
  currentEnd: number
  dayIndex: number
}

const BASE_DAY_WIDTH = 120 // baseline column width when weekViewDays === 7
// Initial 21-day window centered on selectedDate; extends in both directions
// on demand as user scrolls toward an edge.
const INITIAL_DAYS_BEFORE = 10
const INITIAL_DAYS_AFTER = 10
const EXTEND_BATCH = 21
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
  onUpdateTimeBlock,
  onTimeBlockSelect,
  onNavigate,
  onDateChange,
  startHour = 0,
  endHour = 24,
  hourHeight = 60,
  weekViewDays = 7,
}: WeekViewProps) {
  const showCategoryPrefix = useShowCategoryPrefix()
  const displayColor = useDisplayColor()
  const isMobile = useIsMobile()
  // Measured width of the horizontal scroll container, on every screen
  // size (not just mobile). Columns are sized so exactly N days fill the
  // viewport — on mobile that's a fixed 3 (swipes land on aligned whole
  // columns), on desktop it's `weekViewDays` (7, or 5 for the work-week
  // setting). Without this, desktop fell back to a fixed 120px baseline
  // that rarely matched the panel's actual width, so a partial extra
  // column peeked in on the right edge (and duplicated a weekday label —
  // see week-view desktop bug W3.1).
  const [viewportWidth, setViewportWidth] = useState(0)
  const safeWeekDays = Math.max(5, Math.min(7, weekViewDays))
  const columnsPerScreen = isMobile ? 3 : safeWeekDays
  const DAY_WIDTH = viewportWidth > 0
    ? Math.floor((viewportWidth - TIME_COL_WIDTH) / columnsPerScreen)
    : Math.round(BASE_DAY_WIDTH * (7 / safeWeekDays))
  const EXTEND_THRESHOLD = DAY_WIDTH * 3

  // New-slot drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ day: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ day: number; y: number } | null>(null)
  const [pendingSlot, setPendingSlot] = useState<{ date: string; startTime: string; endTime: string; anchorX: number; anchorY: number } | null>(null)

  // Task block drag state
  const [activeTaskDrag, setActiveTaskDrag] = useState<ActiveTaskDrag | null>(null)

  // While dragging any task, the pending-zone date the cursor is currently
  // over. Drives the live drop-target highlight + ghost preview.
  const [hoveredPendingZoneDate, setHoveredPendingZoneDate] = useState<string | null>(null)

  // Pending task drag state (from header to grid)
  const [pendingTaskDrag, setPendingTaskDrag] = useState<{
    task: Task
    currentDayIndex: number
    currentMinutes: number
    duration: number
  } | null>(null)

  // Slot picker nested navigation
  const [selectedParent, setSelectedParent] = useState<string | null>(null)

  // Recurrence choice modal state
  const [recurrenceModal, setRecurrenceModal] = useState<{
    isOpen: boolean
    taskId: string
    targetDate: string
    newDate?: string
    newStart: string
    newEnd: string
    type: 'reschedule' | 'unschedule'
  } | null>(null)

  const handleRecurrenceConfirm = (choice: RecurrenceChoice) => {
    if (!recurrenceModal) return
    const { taskId, targetDate, newDate, newStart, newEnd, type } = recurrenceModal

    if (type === 'reschedule' && newDate) {
      onRescheduleTask?.(taskId, newDate, newStart, newEnd, choice, targetDate)
    } else if (type === 'unschedule') {
      onUnscheduleTask?.(taskId, newDate, choice, targetDate)
    }
    setRecurrenceModal(null)
  }

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

  // Keep the measured container width in sync (window resize, sidebar
  // toggle, rotation) so the columns-per-viewport math stays exact on
  // every screen size, not just mobile.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const measure = () => setViewportWidth(container.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Recenter scroll on selectedDate change (and when DAY_WIDTH changes —
  // mobile measurement landing or rotation shifts every column boundary).
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const targetScrollLeft = INITIAL_DAYS_BEFORE * DAY_WIDTH

    isScrolling.current = true
    container.scrollLeft = targetScrollLeft
    lastScrollLeft.current = container.scrollLeft

    const t = window.setTimeout(() => { isScrolling.current = false }, 150)
    return () => window.clearTimeout(t)
  }, [selectedDate, DAY_WIDTH])

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
  }, [DAY_WIDTH, EXTEND_THRESHOLD])

  const hours = useMemo(() => {
    const h = []
    for (let i = startHour; i <= endHour; i++) {
      h.push(i)
    }
    return h
  }, [startHour, endHour])

  const today = new Date()
  const todayString = toDateString(today)

  // Get scheduled tasks for a specific date (tasks with specific time).
  // Recurring tasks expand into virtual occurrences via taskOccursOnDate.
  const getScheduledTasksForDate = (date: Date) => {
    return tasks.filter(
      (t) => taskOccursOnDate(t, date) && t.scheduledStartTime && t.scheduledEndTime
    )
  }

  // Get all-day/unscheduled tasks for a specific date.
  // Pending zone tasks for this day. The two clauses make scheduledDate
  // authoritative once set: a task with scheduledDate=A and dueDate=B only
  // shows in A's pending zone, never B's. Without this dueDate-vs-scheduledDate
  // priority a task that happens to have a dueDate at one day and a
  // scheduledDate at another would show up in both columns — and dragging
  // it across days would leave a "ghost" copy at the source.
  const getAllDayTasksForDate = (date: Date) => {
    const dateStr = toDateString(date)
    return tasks.filter(t =>
      (taskOccursOnDate(t, date) && !t.scheduledStartTime) ||
      (t.dueDate === dateStr && !t.scheduledDate)
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

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!movedBeyondThreshold && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        movedBeyondThreshold = true
        isDraggingTaskRef.current = true
        haptic(12)
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

      // Track which pending zone (if any) the cursor is over so the UI can
      // show the live drop-target highlight + ghost preview.
      const hoveredEl = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const overPendingEl = hoveredEl?.closest('[data-pending-zone]') as HTMLElement | null
      const hoveredDate = overPendingEl?.getAttribute('data-pending-zone-date') ?? null
      setHoveredPendingZoneDate(prev => prev === hoveredDate ? prev : hoveredDate)

      autoScrollContainerNearEdge(scrollContainer, ev.clientY)
    }

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)

      if (!movedBeyondThreshold || !dragState) {
        // Click. activeTaskDrag was never set — TaskBlock's own onMouseUp
        // opens the modal. Nothing to clean up here.
        setHoveredPendingZoneDate(null)
        return
      }

      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const overPending = target?.closest('[data-pending-zone]') as HTMLElement | null

      const finalState = dragState
      setActiveTaskDrag(null)
      setHoveredPendingZoneDate(null)
      dragState = null

      if (overPending) {
        // See day-scroll-view for the full rationale: dropping on a pending
        // zone clears the time slots, which is destructive enough that we
        // surface an explicit undo. Without this, mis-aimed drags silently
        // un-time tasks and they appear to vanish from the timeline.
        const pendingDate = overPending.getAttribute('data-pending-zone-date') ?? undefined
        const taskTitle = tasks.find((t) => t.id === finalState.taskId)?.title || '任務'
        const originalDate = tasks.find((t) => t.id === finalState.taskId)?.scheduledDate
        const originalStart = minutesToTime(finalState.originalStart)
        const originalEnd = minutesToTime(finalState.originalEnd)
        
        const task = tasks.find(t => t.id === finalState.taskId)
        const occurrenceDate = toDateString(allDates[dayIndex])

        if (task?.isRecurring) {
          setRecurrenceModal({
            isOpen: true,
            taskId: task.id,
            targetDate: occurrenceDate,
            newDate: pendingDate,
            newStart: '',
            newEnd: '',
            type: 'unschedule',
          })
        } else {
          onUnscheduleTask?.(finalState.taskId, pendingDate)
        }

        toast(
          `「${taskTitle}」已移到 ${pendingDate ?? '待排程'}（時間移除）`,
          {
            duration: 8000,
            action: {
              label: '復原',
              onClick: () => {
                if (originalDate) {
                  onRescheduleTask?.(finalState.taskId, originalDate, originalStart, originalEnd)
                }
              },
            },
          },
        )
      } else {
        const dropTarget = allDates[finalState.dayIndex]
        if (dropTarget) {
          const task = tasks.find(t => t.id === finalState.taskId)
          const occurrenceDate = toDateString(allDates[dayIndex])
          const newDate = toDateString(dropTarget)
          const newStart = minutesToTime(finalState.currentStart)
          const newEnd = minutesToTime(finalState.currentEnd)

          if (task?.isRecurring) {
            setRecurrenceModal({
              isOpen: true,
              taskId: task.id,
              targetDate: occurrenceDate,
              newDate,
              newStart,
              newEnd,
              type: 'reschedule',
            })
          } else {
            onRescheduleTask?.(
              finalState.taskId,
              newDate,
              newStart,
              newEnd,
            )
          }
        }
      }

      isDraggingTaskRef.current = false
      dragEndCooldown.current = true
      setTimeout(() => { dragEndCooldown.current = false }, 300)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [allDates, MIN, MAX, onRescheduleTask, onUnscheduleTask, tasks])

  // Pending task drag — same window-level pattern. Drag preview only activates
  // after the cursor moves past the threshold, so a plain click on a pending
  // task opens the detail modal (via the React onClick) without scheduling.
  const handlePendingTaskMouseDown = useCallback((task: Task, e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    const duration = task.estimatedMinutes || 30
    let movedBeyondThreshold = false
    // Closure-local mirror — same rationale as in handleTaskDragStart above.
    let lastDayIndex = 0
    let lastMinutes = 0

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!movedBeyondThreshold && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        movedBeyondThreshold = true
        isDraggingTaskRef.current = true
        haptic(12)
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

      // Track hovered pending zone for the drop-target highlight + ghost.
      const hoveredEl = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const overPendingEl = hoveredEl?.closest('[data-pending-zone]') as HTMLElement | null
      const hoveredDate = overPendingEl?.getAttribute('data-pending-zone-date') ?? null
      setHoveredPendingZoneDate(prev => prev === hoveredDate ? prev : hoveredDate)

      autoScrollContainerNearEdge(scrollContainer, ev.clientY)
    }

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)

      if (!movedBeyondThreshold) {
        // Click — let onClick fire normally to open the detail modal.
        setHoveredPendingZoneDate(null)
        return
      }

      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const overPending = target?.closest('[data-pending-zone]') as HTMLElement | null

      setPendingTaskDrag(null)
      setHoveredPendingZoneDate(null)

      if (overPending) {
        // Drop on a pending zone. Same date → no-op. Different date → move
        // the task to that date but keep it pending (no time).
        const targetDate = overPending.getAttribute('data-pending-zone-date') ?? undefined
        if (targetDate && targetDate !== task.scheduledDate) {
          onUnscheduleTask?.(task.id, targetDate)
        }
      } else {
        // Drop on the timeline → schedule.
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

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [allDates, MIN, MAX, onRescheduleTask, onUnscheduleTask])

  // Handle mouse down on grid to start new-slot drag or click
  const handleMouseDown = useCallback((e: React.PointerEvent, dayIndex: number) => {
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
  const handleMouseMove = useCallback((e: React.PointerEvent, dayIndex: number) => {
    if (activeTaskDrag || pendingTaskDrag) return // handled by window listeners
    if (!isDragging || !dragStart) return
    // Touch: don't update dragEnd. See day-scroll-view for full rationale.
    if (e.pointerType === 'touch') return
    const rect = e.currentTarget.getBoundingClientRect()
    const maxY = hours.length * 60
    const y = Math.max(0, Math.min(e.clientY - rect.top, maxY))
    setDragEnd({ day: dayIndex, y })
  }, [isDragging, dragStart, activeTaskDrag, pendingTaskDrag, hours.length])

  // Handle mouse up - detect click vs drag (new-slot creation only)
  const handleMouseUp = useCallback((e: React.PointerEvent) => {
    // Task-block and pending-task drags are committed by window-level listeners
    // installed in handleTaskDragStart / handlePendingTaskMouseDown. This
    // handler only owns the "drag on empty grid to create a new slot" flow.
    if (activeTaskDrag || pendingTaskDrag) return

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

  const handleHeaderResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    isResizingHeader.current = true
    resizeStartY.current = e.clientY
    resizeStartH.current = headerHeight

    const onMove = (ev: PointerEvent) => {
      if (!isResizingHeader.current) return
      const delta = ev.clientY - resizeStartY.current
      setHeaderHeight(Math.max(HEADER_MIN, Math.min(HEADER_MAX, resizeStartH.current + delta)))
    }
    const onUp = () => {
      isResizingHeader.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [headerHeight, HEADER_MIN])

  return (
    <div ref={weekViewRef} className="flex-1 flex flex-col overflow-hidden bg-panel-secondary">
      {recurrenceModal && (
        <RecurrenceChoiceModal
          isOpen={recurrenceModal.isOpen}
          onClose={() => setRecurrenceModal(null)}
          onConfirm={handleRecurrenceConfirm}
          title={recurrenceModal.type === 'reschedule' ? '重新排程重複任務' : '取消排程重複任務'}
        />
      )}
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

                // Live drag preview state — see day-scroll-view for the full
                // explanation. Same logic mirrored here.
                const draggedTaskPreview =
                  pendingTaskDrag?.task ??
                  (activeTaskDrag ? tasks.find(t => t.id === activeTaskDrag.taskId) ?? null : null)
                const isPendingOriginZone =
                  !!pendingTaskDrag && pendingTaskDrag.task.scheduledDate === dateStr
                const isHoveredDropTarget =
                  !!draggedTaskPreview &&
                  hoveredPendingZoneDate === dateStr &&
                  !isPendingOriginZone
                const pendingDragOnNonOriginTarget =
                  !!pendingTaskDrag &&
                  hoveredPendingZoneDate !== pendingTaskDrag.task.scheduledDate

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
                        isHoveredDropTarget
                          ? 'bg-primary/15 ring-2 ring-primary/60 ring-inset'
                          : 'hover:bg-secondary/30'
                      )}
                      style={{ minHeight: `${headerHeight - HEADER_DATE_HEIGHT}px` }}
                      onClick={(e) => {
                        // Only trigger if clicking on empty space, not a task,
                        // and not right after dropping a task here.
                        if ((e.target as HTMLElement).closest('button')) return
                        if (dragEndCooldown.current) return
                        // No times → parent creates an unscheduled task for
                        // this date so it lands in the pending zone, not the
                        // timeline below.
                        onCreateTask?.(dateStr)
                      }}
                      title={(activeTaskDrag || pendingTaskDrag) ? '放開以放到待排程' : '點擊新增任務'}
                    >
                      {allDayTasks.map((task) => {
                        const isThisTaskBeingDragged = pendingTaskDrag?.task.id === task.id
                        return (
                          <div
                            key={task.id}
                            onPointerDown={(e) => handlePendingTaskMouseDown(task, e)}
                            onClick={(e) => { e.stopPropagation(); onTaskSelect(task) }}
                            className={cn(
                              'w-full flex-shrink-0 flex items-center text-left px-1.5 py-[3px] rounded text-[10px] leading-tight font-medium cursor-grab active:cursor-grabbing select-none',
                              'hover:opacity-90 hover:shadow-sm transition-all',
                              task.isCompleted && 'opacity-40 line-through',
                              isThisTaskBeingDragged && (
                                pendingDragOnNonOriginTarget ? 'invisible' : 'opacity-30'
                              )
                            )}
                            style={{
                              backgroundColor: displayColor(task.calendarColor || task.workspaceColor),
                              color: '#fff',
                            }}
                          >
                            <span className="flex items-center gap-1 min-w-0">
                              {task.isCompleted && <span className="flex-shrink-0">✓</span>}
                              <span className="truncate">{taskDisplayTitle(task, showCategoryPrefix)}</span>
                            </span>
                          </div>
                        )
                      })}

                      {/* Ghost preview while the cursor is hovering this zone */}
                      {isHoveredDropTarget && draggedTaskPreview && (
                        <div
                          className="w-full flex-shrink-0 px-1.5 py-[3px] rounded text-[10px] font-medium truncate ring-2 ring-white/70 shadow-md select-none pointer-events-none"
                          style={{
                            backgroundColor: displayColor(draggedTaskPreview.calendarColor || draggedTaskPreview.workspaceColor),
                            color: '#fff',
                          }}
                        >
                          <span className="flex items-center gap-1 min-w-0">
                            <span className="truncate">{taskDisplayTitle(draggedTaskPreview, showCategoryPrefix)}</span>
                          </span>
                        </div>
                      )}
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
          onPointerDown={handleHeaderResizeStart}
          style={{ touchAction: 'none' }}
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
        >
          {/* Time labels column - sticky left */}
          <div className="w-14 flex-shrink-0 sticky left-0 z-sticky bg-panel border-r border-border">
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
            // Pack tasks and TimeBlocks into shared columns so an
            // overlapping block lands in a sibling column instead of
            // burying the task (or vice-versa). See calculateUnifiedColumns.
            const { tasks: taskColumns, blocks: blockColumns } = calculateUnifiedColumns(dayTasks, dayBlocks)

            return (
              <div
                key={dateStr}
                data-day-grid
                data-day-date={dateStr}
                data-hour-height={hourHeight}
                data-start-minute={MIN}
                className={cn(
                  'relative border-r border-border last:border-r-0 cursor-crosshair',
                  isToday && 'bg-primary/5'
                )}
                style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
                onPointerDown={(e) => handleMouseDown(e, dayIndex)}
                onPointerMove={(e) => handleMouseMove(e, dayIndex)}
                onPointerUp={(e) => handleMouseUp(e)}
                onPointerLeave={(e) => { if (isDragging) handleMouseUp(e) }}
              >
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div key={hour} className="border-b border-border/50" style={{ height: `${hourHeight}px` }}>
                    <div className="border-b border-dashed border-border/30" style={{ height: `${hourHeight / 2}px` }} />
                  </div>
                ))}

                {/* Time Blocks — tap to open the editor. (Week view skips
                    drag-to-resize because each day column is too narrow on
                    mobile to make precise edge drags reliable; users go
                    through the modal instead.) Translucent card that shares
                    columns with tasks so overlaps fan out instead of stacking. */}
                {dayBlocks.map((block) => {
                  const col = blockColumns.get(block.id)
                  const colIdx = col?.column ?? 0
                  const totalCols = col?.totalColumns ?? 1
                  const widthPct = 100 / totalCols
                  const leftPct = colIdx * widthPct
                  // See day-scroll-view for rationale: tint strong enough to
                  // read on cream bg, text color flips by luminance.
                  const color = displayColor(block.color)!
                  const textColor = isLightColor(color) ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.95)'
                  return (
                    <div
                      key={block.id}
                      data-task="true"
                      role="button"
                      aria-label={`${block.label} ${block.startTime}–${block.endTime}`}
                      title={`${block.label} · ${block.startTime}–${block.endTime}`}
                      onClick={() => onTimeBlockSelect?.(block)}
                      className="absolute rounded px-2 py-1 text-xs font-medium overflow-hidden cursor-pointer hover:shadow-md transition-all"
                      style={{
                        top: getTimePosition(block.startTime),
                        height: getDurationHeight(block.startTime, block.endTime),
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: color + '99',
                        borderLeft: `3px solid ${color}`,
                        color: textColor,
                      }}
                    >
                      <div className="truncate">{block.label}</div>
                      <div className="text-[10px] opacity-70">{block.startTime}-{block.endTime}</div>
                    </div>
                  )
                })}

                {/* Scheduled Tasks with drag/resize via TaskBlock */}
                {dayTasks.map((task) => {
                  const col = taskColumns.get(task.id)
                  const isDraggingThis = activeTaskDrag?.taskId === task.id
                  const isBeingDraggedAway = isDraggingThis && activeTaskDrag?.dayIndex !== dayIndex
                  // Hide task if it's being dragged to another day, or if the
                  // cursor has moved over a pending zone (the ghost preview
                  // in that pending zone is the visible copy now).
                  const isOverPendingZone = isDraggingThis && hoveredPendingZoneDate !== null
                  if (isBeingDraggedAway || isOverPendingZone) return null
                  const dragOverride = isDraggingThis && activeTaskDrag
                    ? { top: activeTaskDrag.currentStart - MIN, height: activeTaskDrag.currentEnd - activeTaskDrag.currentStart }
                    : null
                  return (
                    <TaskBlock
                      key={task.id}
                      task={task}
                      date={dateStr}
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

                {/* Show dragged task preview when dragging to this day.
                    Hidden while the cursor is over any pending zone (the
                    ghost there is the visible preview). */}
                {activeTaskDrag && activeTaskDrag.dayIndex === dayIndex && hoveredPendingZoneDate === null && !dayTasks.find(t => t.id === activeTaskDrag.taskId) && (
                  <div
                    className="absolute left-1 right-1 rounded-xl px-2 py-1.5 text-left overflow-hidden opacity-80 pointer-events-none z-30 shadow-lg"
                    style={{
                      top: `${activeTaskDrag.currentStart - MIN}px`,
                      height: `${activeTaskDrag.currentEnd - activeTaskDrag.currentStart}px`,
                      backgroundColor: displayColor(tasks.find(t => t.id === activeTaskDrag.taskId)?.calendarColor || WORKSPACE_COLORS.dustyLavender.hex),
                    }}
                  >
                    <div className="text-xs font-semibold text-white truncate">
                      {(() => {
                        const dt = tasks.find(t => t.id === activeTaskDrag.taskId)
                        return dt ? taskDisplayTitle(dt, showCategoryPrefix) : ''
                      })()}
                    </div>
                    <div className="text-[10px] text-white/80 font-mono mt-0.5">
                      {minutesToTime(activeTaskDrag.currentStart)}-{minutesToTime(activeTaskDrag.currentEnd)}
                    </div>
                  </div>
                )}

                {/* Show pending task drag preview when dragging from header
                    to this day. Hidden while the cursor is over any pending
                    zone (the ghost in that zone is the visible preview). */}
                {pendingTaskDrag && pendingTaskDrag.currentDayIndex === dayIndex && hoveredPendingZoneDate === null && (
                  <div
                    className="absolute left-1 right-1 rounded-xl px-2 py-1.5 text-left overflow-hidden pointer-events-none z-30 shadow-xl border-2 border-white/50"
                    style={{
                      top: `${pendingTaskDrag.currentMinutes - MIN}px`,
                      height: `${Math.max(pendingTaskDrag.duration, 30)}px`,
                      backgroundColor: displayColor(pendingTaskDrag.task.calendarColor || pendingTaskDrag.task.workspaceColor || WORKSPACE_COLORS.dustyLavender.hex),
                    }}
                  >
                    <div className="text-xs font-semibold text-white truncate">
                      {taskDisplayTitle(pendingTaskDrag.task, showCategoryPrefix)}
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

                {/* Current time line for today — compact: time gutter is
                    rendered as a separate column, so the line should span
                    the full day width. */}
                {isToday && <CurrentTimeLine startHour={startHour} compact />}
              </div>
            )
          })}
        </div>

        {/* Type picker popup - fixed position near click location */}
{pendingSlot && (
          <>
          <div
            className="fixed inset-0 z-overlay"
            onPointerDown={(e) => { e.stopPropagation(); setPendingSlot(null); setSelectedParent(null) }}
          />
          <div
            ref={popoverRef}
            className={cn(
              'fixed z-popover bg-card border border-border rounded-2xl shadow-2xl p-3 w-64 transition-opacity duration-100',
              popoverPos ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              left: `${popoverPos?.left ?? -9999}px`,
              top: `${popoverPos?.top ?? -9999}px`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
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
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${displayColor(slotType.color)}25` }}>
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
