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
import { useI18n } from '@/lib/i18n/react'
import { format } from 'date-fns'

interface DayScrollViewProps {
  selectedDate: Date
  tasks: Task[]
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
  /** How many days should fit in the viewport at once (1-3). Desktop only;
   *  mobile always shows one day per viewport for snap-scroll behavior. */
  dayViewDays?: number
}

interface ActiveTaskDrag extends TaskDragStart {
  currentStart: number
  currentEnd: number
  dayIndex: number
}

// Bare weekday chars collide with other single-char meanings elsewhere in
// the shared t() dictionary (see calendar-header.tsx) — resolve English
// weekday abbreviations directly by index instead of routing through t().
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const DEFAULT_DAY_WIDTH = 280
// Initial window centered on selectedDate. Mobile uses a tighter window
// because each day fills the entire viewport (only ~1 visible at once)
// so a wide DOM tree is mostly off-screen yet still costs to keep
// interactive. Window extends on scroll — see handleScroll.
const INITIAL_DAYS_BEFORE_DESKTOP = 10
const INITIAL_DAYS_AFTER_DESKTOP = 10
const INITIAL_DAYS_BEFORE_MOBILE = 4
const INITIAL_DAYS_AFTER_MOBILE = 4
const EXTEND_BATCH = 14            // days to add per extension
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
  onUpdateTimeBlock,
  onTimeBlockSelect,
  onNavigate,
  onDateChange,
  startHour = 0,
  endHour = 24,
  hourHeight = 60,
  dayViewDays = 1,
}: DayScrollViewProps) {
  const isMobile = useIsMobile()
  const showCategoryPrefix = useShowCategoryPrefix()
  const displayColor = useDisplayColor()
  const { t: translate, lang } = useI18n()
  // On mobile, each day fills (viewport - time column) so the user sees one
  // full day per swipe and scroll-snap lands on day boundaries. Desktop
  // measures the actual scroll container and divides by dayViewDays so the
  // user-chosen number of days fits exactly within the visible area.
  const [viewportWidth, setViewportWidth] = useState(typeof window === 'undefined' ? 1024 : window.innerWidth)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // We attach this resize observer to scrollContainerRef (declared just
  // below) once it's mounted, so DAY_WIDTH stays accurate when the user
  // resizes the task panel splitter (which changes the calendar's
  // available width without changing window width).
  const desktopDayWidth = (() => {
    const safeDays = Math.max(1, Math.min(3, dayViewDays))
    if (containerWidth && containerWidth > TIME_COL_WIDTH + 200) {
      const w = (containerWidth - TIME_COL_WIDTH) / safeDays
      return Math.max(220, Math.floor(w))
    }
    return safeDays > 1 ? Math.floor(DEFAULT_DAY_WIDTH * (1 / safeDays) * 1.6) : DEFAULT_DAY_WIDTH
  })()
  // Mobile day cell must equal the *measured* scrollable width minus the
  // sticky time column so scroll-snap lands exactly one day per swipe.
  // Using window.innerWidth as a proxy drifts a few px (safe-area inset,
  // scrollbar, container padding) and the error accumulates → visible
  // half-cell at the edges. Falls back to viewport math only until the
  // ResizeObserver delivers the real container width.
  const mobileDayWidth = containerWidth && containerWidth > TIME_COL_WIDTH + 100
    ? Math.max(240, Math.floor(containerWidth - TIME_COL_WIDTH))
    : Math.max(240, viewportWidth - TIME_COL_WIDTH)
  const DAY_WIDTH = isMobile ? mobileDayWidth : desktopDayWidth
  const EXTEND_THRESHOLD = DAY_WIDTH * 2

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)

  // Observe scroll container size for the dayViewDays-aware DAY_WIDTH calc.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = scrollContainerRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (typeof w === 'number') setContainerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Track dragging state synchronously for scroll handler
  const isDraggingTaskRef = useRef(false)

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

  // Time block drag state — for resizing/moving 午休 / 緩衝 / 專注 blocks.
  const [activeBlockDrag, setActiveBlockDrag] = useState<{
    blockId: string
    dragType: 'move' | 'resize-top' | 'resize-bottom'
    originalStart: number
    originalEnd: number
    offsetY: number
    dayIndex: number
    currentStart: number
    currentEnd: number
  } | null>(null)

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
    type: 'reschedule' | 'unschedule' | 'delete'
  } | null>(null)

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
  const isAnyDragging = !!activeTaskDrag || !!pendingTaskDrag || !!activeBlockDrag || isDragging
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

  const initialBefore = isMobile ? INITIAL_DAYS_BEFORE_MOBILE : INITIAL_DAYS_BEFORE_DESKTOP
  const initialAfter = isMobile ? INITIAL_DAYS_AFTER_MOBILE : INITIAL_DAYS_AFTER_DESKTOP

  // Generate dates centered around selectedDate, extended by extras on each side
  const allDates = useMemo(() => {
    const dates: Date[] = []
    const before = initialBefore + extraBefore
    const after = initialAfter + extraAfter
    const centerDate = new Date(selectedDate)
    for (let i = -before; i <= after; i++) {
      const d = new Date(centerDate)
      d.setDate(centerDate.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [selectedDate, extraBefore, extraAfter, initialBefore, initialAfter])

  // Index of selectedDate within allDates (depends on extras)
  const centerIndex = initialBefore + extraBefore

  // When user explicitly navigates (selectedDate changes), reset extras and
  // recenter scroll. The extras-reset and selectedDate change happen in the
  // same render cycle so the centerIndex math below stays correct.
  useEffect(() => {
    pendingScrollAdjust.current = 0
    setExtraBefore(0)
    setExtraAfter(0)
  }, [selectedDate])

  // Recenter horizontally on selectedDate. Also re-runs when DAY_WIDTH
  // changes while the user hasn't navigated away (extras still 0), because
  // DAY_WIDTH resolves in two phases: first render uses a fallback (no
  // containerWidth yet), then ResizeObserver fires and the real width
  // arrives. Without re-running, the scrollLeft set with the fallback
  // width points to a day several days before today once the real (often
  // larger) width takes effect.
  useEffect(() => {
    const container = scrollContainerRef.current
    const header = headerScrollRef.current
    if (!container || !header) return
    if (extraBefore !== 0 || extraAfter !== 0) return

    const targetScrollLeft = initialBefore * DAY_WIDTH

    isScrolling.current = true
    container.scrollLeft = targetScrollLeft
    header.scrollLeft = targetScrollLeft
    lastScrollLeft.current = container.scrollLeft

    // First-mount only: vertically scroll the timeline so "now" is roughly
    // centered. Without this users always see the day's start hour even
    // when it's noon. Skip if the day is in the past or future.
    const today = new Date()
    const isViewingToday =
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    if (isViewingToday) {
      const minsNow = today.getHours() * 60 + today.getMinutes()
      const yPx = (minsNow - MIN) * (hourHeight / 60)
      const targetY = Math.max(0, yPx - container.clientHeight / 3)
      container.scrollTop = targetY
    }

    const t = window.setTimeout(() => { isScrolling.current = false }, 150)
    return () => window.clearTimeout(t)
  }, [selectedDate, DAY_WIDTH])

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
  // Mobile: debounced scroll → selectedDate sync. Set when scroll settles
  // on a snap boundary; we then call onDateChange so the header label and
  // pending zone match the visible day.
  const scrollSyncTimer = useRef<number | null>(null)

  // Horizontal scroll: pan freely; extend the date window on demand as the
  // user approaches either edge so it feels infinite. On mobile each scroll
  // settle also syncs selectedDate to the visible day.
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

    // Mobile-only: after the user stops scrolling, snap selectedDate to the
    // day that's now centered in the viewport.
    if (isMobile && onDateChange) {
      if (scrollSyncTimer.current) window.clearTimeout(scrollSyncTimer.current)
      scrollSyncTimer.current = window.setTimeout(() => {
        const c = scrollContainerRef.current
        if (!c || isScrolling.current || isDraggingTaskRef.current) return
        const dayIndex = Math.round(c.scrollLeft / DAY_WIDTH)
        const target = allDates[dayIndex]
        if (!target) return
        const targetStr = toDateString(target)
        if (targetStr === toDateString(selectedDate)) return
        onDateChange(target)
      }, 140)
    }
  }, [isMobile, onDateChange, allDates, selectedDate, DAY_WIDTH, EXTEND_THRESHOLD])

  // Get tasks for a specific date.
  // Recurring tasks expand into virtual occurrences via taskOccursOnDate.
  const getTasksForDate = useCallback((date: Date) => {
    return tasks.filter(t => taskOccursOnDate(t, date) && t.scheduledStartTime)
  }, [tasks])

  // Get time blocks for a specific date
  const getBlocksForDate = useCallback((date: Date) => {
    const dateStr = toDateString(date)
    return timeBlocks.filter(b => b.date === dateStr)
  }, [timeBlocks])

  // Get all-day tasks (including recurring expansions)
  const getAllDayTasksForDate = useCallback((date: Date) => {
    const dateStr = toDateString(date)
    return tasks.filter(t =>
      (taskOccursOnDate(t, date) && !t.scheduledStartTime) ||
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

      // Auto-scroll the timeline when finger / cursor approaches the top or
      // bottom edge so the user can reach off-screen times.
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

      // Clear UI state first, THEN fire the parent callback. Doing it in the
      // other order works too, but this keeps the lift effect from lingering
      // for an extra frame while the parent re-renders.
      const finalState = dragState
      setActiveTaskDrag(null)
      setHoveredPendingZoneDate(null)
      dragState = null

      if (overPending) {
        // Drop on a pending zone clears the time slots — the user might have
        // meant this, or might have just missed the timeline edge. Either way
        // the task vanishes from where they were looking, so we remember the
        // pre-drag schedule and offer a one-tap undo.
        const pendingDate = overPending.getAttribute('data-pending-zone-date') ?? undefined
        const taskTitle = tasks.find((t) => t.id === finalState.taskId)?.title || translate('任務')
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
          translate('「{title}」已移到 {date}（時間移除）', {
            title: taskTitle,
            date: pendingDate ?? translate('待排程'),
          }),
          {
            duration: 8000,
            action: {
              label: translate('復原'),
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
  }, [allDates, MIN, MAX, onRescheduleTask, onUnscheduleTask, tasks, DAY_WIDTH, translate])

  // Time block drag (move / resize-top / resize-bottom). Same window-level
  // pattern as task drags — preview activates after cursor moves past
  // threshold so a plain tap opens the detail modal instead of moving.
  const handleTimeBlockDragStart = useCallback((
    block: TimeBlock,
    dragType: 'move' | 'resize-top' | 'resize-bottom',
    dayIndex: number,
    e: React.PointerEvent,
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const blockEl = (e.currentTarget as HTMLElement).closest('[data-block]') as HTMLElement | null
    const blockRect = blockEl?.getBoundingClientRect()
    const offsetY = blockRect ? e.clientY - blockRect.top : 0

    const originalStart = timeToMinutes(block.startTime)
    const originalEnd = timeToMinutes(block.endTime)
    let movedBeyondThreshold = false
    let dragState: NonNullable<typeof activeBlockDrag> | null = null

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!movedBeyondThreshold && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        movedBeyondThreshold = true
        isDraggingTaskRef.current = true
        haptic(12)
        dragState = {
          blockId: block.id,
          dragType,
          originalStart,
          originalEnd,
          offsetY,
          dayIndex,
          currentStart: originalStart,
          currentEnd: originalEnd,
        }
        setActiveBlockDrag(dragState)
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
      setActiveBlockDrag(dragState)

      autoScrollContainerNearEdge(scrollContainer, ev.clientY)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)

      if (!movedBeyondThreshold || !dragState) {
        // Tap — open detail modal via the click handler that follows.
        return
      }

      const finalState = dragState
      setActiveBlockDrag(null)
      dragState = null

      const dropTarget = allDates[finalState.dayIndex]
      if (dropTarget) {
        onUpdateTimeBlock?.(finalState.blockId, {
          date: toDateString(dropTarget),
          startTime: minutesToTime(finalState.currentStart),
          endTime: minutesToTime(finalState.currentEnd),
        })
      }

      isDraggingTaskRef.current = false
      dragEndCooldown.current = true
      setTimeout(() => { dragEndCooldown.current = false }, 300)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [allDates, MIN, MAX, DAY_WIDTH, onUpdateTimeBlock])

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
    // Closure-local mirror of pendingTaskDrag — same rationale as in
    // handleTaskDragStart above (avoid side effects inside setState).
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

  const handleMouseDown = useCallback((e: React.PointerEvent, dayIndex: number) => {
    if ((e.target as HTMLElement).closest('[data-block]')) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top

    // Track press time + position to detect click vs drag in handleMouseUp.
    mouseDownTime.current = Date.now()
    mouseDownPos.current = { x: e.clientX, y: e.clientY }

    setIsDragging(true)
    setDragStart({ day: dayIndex, y })
    setDragEnd({ day: dayIndex, y })
  }, [])

  // Handle mouse move for new-slot drag (per column)
  const handleMouseMove = useCallback((e: React.PointerEvent, dayIndex: number) => {
    if (activeTaskDrag || pendingTaskDrag || activeBlockDrag) return // handled by window listeners
    if (!isDragging || !dragStart) return
    // Touch input: don't update dragEnd. Finger movement on the grid is
    // reserved for vertical scroll, not for drag-to-select-time-range.
    // Tap-without-movement still opens the slot picker via handleMouseUp's
    // "isClick" branch, which compares against mouseDownPos.
    if (e.pointerType === 'touch') return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setDragEnd({ day: dayIndex, y })
  }, [isDragging, dragStart, activeTaskDrag, pendingTaskDrag])

  const handleMouseUp = useCallback((e: React.PointerEvent) => {
    // Task-block and pending-task drags are committed by window-level listeners
    // installed in handleTaskDragStart / handlePendingTaskMouseDown. This
    // handler only owns the "drag on empty grid to create a new slot" flow.
    if (activeTaskDrag || pendingTaskDrag || activeBlockDrag) return

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-panel-secondary">
      {recurrenceModal && (
        <RecurrenceChoiceModal
          isOpen={recurrenceModal.isOpen}
          onClose={() => setRecurrenceModal(null)}
          onConfirm={handleRecurrenceConfirm}
          title={recurrenceModal.type === 'reschedule' ? translate('重新排程重複任務') : translate('取消排程重複任務')}
        />
      )}
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
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              ...(isMobile && !activeTaskDrag && !pendingTaskDrag && !activeBlockDrag
                ? { scrollSnapType: 'x mandatory' as const, scrollSnapStop: 'always' as const }
                : {}),
            }}
          >
            <div className="flex" style={{ width: `${allDates.length * DAY_WIDTH}px` }}>
              {allDates.map((date) => {
                const dateStr = toDateString(date)
                const isToday = dateStr === todayString
                const allDayTasks = getAllDayTasksForDate(date)
                const weekdayIndex = date.getDay()

                // The single task currently being dragged (if any). We render
                // this as a "ghost" preview inside whichever pending zone the
                // cursor is hovering, so the user can see the destination
                // before committing the drop.
                const draggedTaskPreview =
                  pendingTaskDrag?.task ??
                  (activeTaskDrag ? tasks.find(t => t.id === activeTaskDrag.taskId) ?? null : null)
                const isPendingOriginZone =
                  !!pendingTaskDrag && pendingTaskDrag.task.scheduledDate === dateStr
                // Only show the ghost when the hover represents an actual move:
                // - any zone for a scheduled-task drag (means "unschedule here")
                // - a non-origin zone for a pending-task drag (means "move date")
                const isHoveredDropTarget =
                  !!draggedTaskPreview &&
                  hoveredPendingZoneDate === dateStr &&
                  !isPendingOriginZone
                // Source pending task hides while the cursor is over any
                // meaningful drop target (different pending zone or the
                // timeline) — so the ghost shown in the target is the only
                // visible copy. Hovering the origin zone keeps it dimmed.
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
                    style={{
                      width: `${DAY_WIDTH}px`,
                      minWidth: `${DAY_WIDTH}px`,
                      ...(isMobile ? { scrollSnapAlign: 'start' } : {}),
                    }}
                  >
                    {/* Date label - fixed height */}
                    <div className={cn(
                      'px-3 py-2 text-center flex-shrink-0',
                      isToday && 'bg-primary/10'
                    )}>
                      <div className="text-xs text-muted-foreground font-medium">
                        {lang === 'en'
                          ? format(date, 'M/d EEE')
                          : `${date.getMonth() + 1}/${date.getDate()} 週${WEEKDAY_NAMES[weekdayIndex]}`}
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
                        isHoveredDropTarget
                          ? 'bg-primary/15 ring-2 ring-primary/60 ring-inset'
                          : 'hover:bg-secondary/30'
                      )}
                      style={{ minHeight: `${headerHeight - HEADER_DATE_HEIGHT}px` }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button')) return
                        if (dragEndCooldown.current) return
                        // No times → parent creates an unscheduled task for
                        // this date so it lands in the pending zone, not the
                        // timeline below.
                        onCreateTask?.(dateStr)
                      }}
                      title={(activeTaskDrag || pendingTaskDrag) ? translate('放開以放到待排程') : translate('點擊新增任務')}
                    >
                      {allDayTasks.map((task) => {
                        const isThisTaskBeingDragged = pendingTaskDrag?.task.id === task.id
                        return (
                          <div
                            key={task.id}
                            onPointerDown={(e) => handlePendingTaskMouseDown(task, e)}
                            onClick={(e) => { e.stopPropagation(); onTaskSelect(task) }}
                            className={cn(
                              // flex + items-center on the outer div locks the
                              // text to the geometric vertical center; the old
                              // block layout left line-height padding above the
                              // glyph and made short pills look bottom-heavy.
                              'w-full flex-shrink-0 flex items-center text-left px-2 py-1 rounded text-[11px] leading-tight font-medium cursor-grab active:cursor-grabbing select-none',
                              'hover:opacity-90 hover:shadow-sm transition-all',
                              task.isCompleted && 'opacity-40 line-through',
                              isThisTaskBeingDragged && (
                                pendingDragOnNonOriginTarget ? 'invisible' : 'opacity-30'
                              )
                            )}
                            style={{
                              backgroundColor: displayColor(task.calendarColor || task.workspaceColor),
                              color: '#fff',
                              touchAction: 'none',
                            }}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              {task.isCompleted && <span className="flex-shrink-0">✓</span>}
                              <span className="truncate">{taskDisplayTitle(task, showCategoryPrefix)}</span>
                            </span>
                          </div>
                        )
                      })}

                      {/* Ghost preview while the cursor is hovering this zone */}
                      {isHoveredDropTarget && draggedTaskPreview && (
                        <div
                          className="w-full flex-shrink-0 px-2 py-1 rounded text-[11px] font-medium truncate ring-2 ring-white/70 shadow-md select-none pointer-events-none"
                          style={{
                            backgroundColor: displayColor(draggedTaskPreview.calendarColor || draggedTaskPreview.workspaceColor),
                            color: '#fff',
                          }}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
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

        {/* Drag handle to resize the pending-zone height — desktop only.
            On mobile the pending-zone is fixed-height (managed via
            min-height) and resize-by-drag isn't meaningful. */}
        {!isMobile && (
          <div
            className="flex-shrink-0 h-2 flex items-center justify-center cursor-row-resize group select-none border-t border-border/40 hover:border-primary/40 transition-colors"
            onPointerDown={handleHeaderResizeStart}
            style={{ touchAction: 'none' }}
          >
            <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
          </div>
        )}
      </div>

      {/* Scrollable Time Grid. Mobile snaps to whole days so one swipe =
          one day; desktop keeps free panning. While a task drag is active
          we disable snap so horizontal task movement isn't yanked to a
          day boundary mid-drag. */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        style={isMobile && !activeTaskDrag && !pendingTaskDrag && !activeBlockDrag ? { scrollSnapType: 'x mandatory', scrollSnapStop: 'always' } : undefined}
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
            const dayTasks = getTasksForDate(date)
            const dayBlocks = getBlocksForDate(date)
            const dragSelection = getDragSelection(dayIndex)
            // Pack tasks and TimeBlocks into shared columns so a block that
            // overlaps a task's time range gets a sibling column instead of
            // hiding underneath. Both layers consume {column, totalColumns}
            // from the same grid.
            const { tasks: taskCols, blocks: blockCols } = calculateUnifiedColumns(dayTasks, dayBlocks)

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
                style={{
                  width: `${DAY_WIDTH}px`,
                  minWidth: `${DAY_WIDTH}px`,
                  ...(isMobile ? { scrollSnapAlign: 'start' } : {}),
                  // Skip layout/paint for off-screen day columns. Mobile
                  // benefits the most because only ~1 day is visible at a
                  // time but the DOM still holds the whole window. The
                  // intrinsic-size hint prevents scrollbar jitter when the
                  // browser swaps a day in/out of rendered state.
                  contentVisibility: 'auto',
                  containIntrinsicSize: `${DAY_WIDTH}px ${(endHour - startHour) * hourHeight}px`,
                }}
                onPointerDown={(e) => handleMouseDown(e, dayIndex)}
                onPointerMove={(e) => handleMouseMove(e, dayIndex)}
                onPointerUp={(e) => handleMouseUp(e)}
                onPointerLeave={(e) => { if (isDragging) handleMouseUp(e) }}
              >
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div key={hour} className="border-b border-border/50" style={{ height: `${hourHeight}px` }}>
                    <div className="h-[30px] border-b border-dashed border-border/30" />
                  </div>
                ))}

                {/* Time Blocks — tap to edit, drag body to move, drag
                    top/bottom edge to resize. Mirrors TaskBlock affordances.
                    Rendered as a translucent card that shares column slots
                    with tasks (see calculateUnifiedColumns), so an
                    overlapping task lands in a sibling column instead of
                    burying the block. */}
                {dayBlocks.map((block) => {
                  const isDraggingThis = activeBlockDrag?.blockId === block.id
                  // While dragging, show the live preview position instead
                  // of the persisted one so the user can see where it'll
                  // land before releasing.
                  const top = isDraggingThis && activeBlockDrag
                    ? `${activeBlockDrag.currentStart - MIN}px`
                    : getTimePosition(block.startTime)
                  const height = isDraggingThis && activeBlockDrag
                    ? `${Math.max(activeBlockDrag.currentEnd - activeBlockDrag.currentStart, 30)}px`
                    : getDurationHeight(block.startTime, block.endTime)
                  // Hide the source if the drag has moved to a different day
                  // (the live preview rendered in that day's column is the
                  // visible copy).
                  const isMovingAway = isDraggingThis && activeBlockDrag && activeBlockDrag.dayIndex !== dayIndex
                  if (isMovingAway) return null
                  const previewStart = isDraggingThis && activeBlockDrag
                    ? minutesToTime(activeBlockDrag.currentStart)
                    : block.startTime
                  const previewEnd = isDraggingThis && activeBlockDrag
                    ? minutesToTime(activeBlockDrag.currentEnd)
                    : block.endTime
                  const col = blockCols.get(block.id)
                  const colIdx = col?.column ?? 0
                  const totalCols = col?.totalColumns ?? 1
                  const widthPct = 100 / totalCols
                  const leftPct = colIdx * widthPct
                  // Tint strong enough to read against the cream calendar
                  // background but still clearly translucent so the block
                  // reads as "state" rather than another solid task. Text
                  // color flips by luminance — black/dark blocks need white
                  // text; cream/pale blocks need dark text.
                  const color = displayColor(block.color)!
                  const textColor = isLightColor(color) ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.95)'
                  return (
                    <div
                      key={block.id}
                      data-block
                      data-task="true"
                      role="button"
                      aria-label={`${block.label} ${previewStart}–${previewEnd}`}
                      title={`${block.label} · ${previewStart}–${previewEnd}`}
                      className={cn(
                        'absolute rounded text-xs font-medium overflow-hidden group select-none',
                        isDraggingThis
                          ? 'shadow-2xl z-modal ring-2 ring-white/40 scale-[1.02] -rotate-1 transition-transform'
                          : 'hover:shadow-md transition-all'
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: color + '99',
                        borderLeft: `3px solid ${color}`,
                        color: textColor,
                        cursor: isDraggingThis ? 'grabbing' : 'grab',
                        zIndex: isDraggingThis ? 50 : 1,
                        touchAction: 'none',
                      }}
                    >
                      {/* Resize handle — TOP. Larger touch target on mobile. */}
                      <div
                        className="absolute top-0 left-0 right-0 h-4 md:h-2 z-panel cursor-ns-resize flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        onPointerDown={(e) => handleTimeBlockDragStart(block, 'resize-top', dayIndex, e)}
                        style={{ touchAction: 'none' }}
                      >
                        <div className="w-6 h-0.5 rounded-full" style={{ backgroundColor: color, opacity: 0.6 }} />
                      </div>

                      {/* Body — drag to move, tap to open edit modal */}
                      <div
                        className="px-2 py-1 h-full flex flex-col"
                        onPointerDown={(e) => handleTimeBlockDragStart(block, 'move', dayIndex, e)}
                        onClick={() => {
                          if (dragEndCooldown.current) return
                          onTimeBlockSelect?.(block)
                        }}
                        style={{ touchAction: 'none' }}
                      >
                        <div className="truncate">{block.label}</div>
                        <div className="text-[10px] opacity-70">{previewStart}-{previewEnd}</div>
                      </div>

                      {/* Resize handle — BOTTOM. */}
                      <div
                        className="absolute bottom-0 left-0 right-0 h-4 md:h-2 z-panel cursor-ns-resize flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        onPointerDown={(e) => handleTimeBlockDragStart(block, 'resize-bottom', dayIndex, e)}
                        style={{ touchAction: 'none' }}
                      >
                        <div className="w-6 h-0.5 rounded-full" style={{ backgroundColor: color, opacity: 0.6 }} />
                      </div>
                    </div>
                  )
                })}

                {/* Live preview when block is being dragged to a different day.
                    The destination day's packing is unknown until drop, so
                    the preview takes the full column width — it's a hovering
                    ghost, not a final placement. */}
                {activeBlockDrag && activeBlockDrag.dayIndex === dayIndex && !dayBlocks.find(b => b.id === activeBlockDrag.blockId) && (() => {
                  const block = timeBlocks.find(b => b.id === activeBlockDrag.blockId)
                  if (!block) return null
                  const color = displayColor(block.color)!
                  const textColor = isLightColor(color) ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.95)'
                  return (
                    <div
                      className="absolute left-1 right-1 rounded px-2 py-1 text-xs font-medium overflow-hidden shadow-2xl z-modal ring-2 ring-white/40 pointer-events-none"
                      style={{
                        top: `${activeBlockDrag.currentStart - MIN}px`,
                        height: `${Math.max(activeBlockDrag.currentEnd - activeBlockDrag.currentStart, 30)}px`,
                        backgroundColor: color + '99',
                        borderLeft: `3px solid ${color}`,
                        color: textColor,
                      }}
                    >
                      <div className="truncate">{block.label}</div>
                      <div className="text-[10px] opacity-70">
                        {minutesToTime(activeBlockDrag.currentStart)}-{minutesToTime(activeBlockDrag.currentEnd)}
                      </div>
                    </div>
                  )
                })()}

                {/* Scheduled Tasks with drag/resize via TaskBlock */}
                {(() => {
                  return dayTasks.map((task) => {
                    const col = taskCols.get(task.id)
                    const isDraggingThis = activeTaskDrag?.taskId === task.id
                    const isBeingDraggedAway = isDraggingThis && activeTaskDrag?.dayIndex !== dayIndex
                    // Hide task if being dragged to another day, or if the
                    // cursor has moved over a pending zone (the ghost
                    // preview in that pending zone is the visible copy now).
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
                  })
                })()}

                {/* Show dragged task preview when dragging to this day */}
                {activeTaskDrag && activeTaskDrag.dayIndex === dayIndex && !dayTasks.find(t => t.id === activeTaskDrag.taskId) && (
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

                {/* Current time line for today — compact mode because the
                    time gutter is a separate sticky column. */}
                {isToday && <CurrentTimeLine startHour={startHour} compact />}
              </div>
            )
          })}
        </div>

        {/* Type picker popup */}
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
            <div className="flex items-center justify-between mb-2.5">
              {selectedParent ? (
                <button
                  onClick={() => setSelectedParent(null)}
                  className="flex items-center gap-1 text-xs font-semibold text-foreground hover:text-primary transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  {translate('返回')}
                </button>
              ) : (
                <span className="text-xs font-semibold text-foreground">
                  {pendingSlot.startTime} - {pendingSlot.endTime}
                </span>
              )}
              <button onClick={() => { setPendingSlot(null); setSelectedParent(null) }} aria-label={translate('關閉')} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">
              {selectedParent ? slotTypes.find(s => s.id === selectedParent)?.label : translate('選擇時間區塊的類型')}
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
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${displayColor(slotType.color)}25` }}>
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
