'use client'

import { memo, useRef, useState } from 'react'
import { cn, haptic } from '@/lib/utils'
import type { Task } from '@/lib/types'
import {
  calculateBlockHeight,
  calculateBlockTop,
  formatTime,
} from '@/lib/task-utils'
import { Check, GripVertical, RefreshCw, Layers, Clock } from 'lucide-react'

// Touch input requires a long-press before any drag activates so the user
// can scroll the calendar past tasks without accidentally moving them.
// Matches the TaskRow long-press feel.
const TOUCH_LONG_PRESS_MS = 280
// During the long-press hold, allow up to this much finger jitter without
// cancelling. Beyond this, treat the gesture as a scroll attempt.
const TOUCH_HOLD_TOLERANCE_PX = 8

export type TaskDragType = 'move' | 'resize-top' | 'resize-bottom'

export interface TaskDragStart {
  taskId: string
  dragType: TaskDragType
  /** Original start minutes from midnight */
  originalStart: number
  /** Original end minutes from midnight */
  originalEnd: number
  /** Mouse Y offset within the block (for move — to preserve click position) */
  offsetY: number
  /** Mousedown viewport X — parent uses this for click-vs-drag detection. */
  startX: number
  /** Mousedown viewport Y — parent uses this for click-vs-drag detection. */
  startY: number
}

interface TaskBlockProps {
  task: Task
  calendarStartHour?: number
  hourHeight?: number
  onSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onDragStart?: (info: TaskDragStart) => void
  compact?: boolean
  column?: number
  totalColumns?: number
  /** When dragging: override top/height for live preview */
  dragOverride?: { top: number; height: number } | null
  isDragging?: boolean
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function TaskBlockImpl({
  task,
  calendarStartHour = 0,
  hourHeight = 60,
  onSelect,
  onToggleComplete,
  onDragStart,
  compact = false,
  column = 0,
  totalColumns = 1,
  dragOverride = null,
  isDragging = false,
}: TaskBlockProps) {
  if (!task.scheduledStartTime || !task.scheduledEndTime) return null

  // For compact mode (day/week scroll views), position is relative to column, not time label
  const baseTop = calculateBlockTop(task.scheduledStartTime, calendarStartHour, hourHeight)
  const baseHeight = calculateBlockHeight(task.scheduledStartTime, task.scheduledEndTime, hourHeight)

  const top = dragOverride ? dragOverride.top : baseTop
  const height = dragOverride ? dragOverride.height : baseHeight

  // Column positioning for compact mode (no time label offset needed)
  const GAP_PX = 2
  const totalGap = (totalColumns - 1) * GAP_PX
  const widthPercent = 100 / totalColumns
  const leftPercent = column * widthPercent

  // Brief celebration burst when transitioning from unchecked → checked.
  const [burst, setBurst] = useState(false)

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!task.isCompleted) {
      setBurst(true)
      window.setTimeout(() => setBurst(false), 700)
    }
    onToggleComplete?.(task.id)
  }

  // Track press origin to distinguish a click (open task) from a drag.
  // Pointer events handle both mouse and touch identically.
  const pressOrigin = useRef<{ x: number; y: number; t: number } | null>(null)
  // Long-press timer for touch input — drag only activates after the user
  // has pressed and held for TOUCH_LONG_PRESS_MS. Cancelled if they release
  // or move beyond TOUCH_HOLD_TOLERANCE_PX first.
  const longPressTimer = useRef<number | null>(null)

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const fireDragStart = (
    e: { clientX: number; clientY: number },
    dragType: TaskDragType,
  ) => {
    if (!onDragStart) return
    const blockEl = document.querySelector<HTMLElement>(`[data-task-block-id="${task.id}"]`)
    const blockRect = blockEl?.getBoundingClientRect()
    const offsetY = blockRect ? e.clientY - blockRect.top : 0
    onDragStart({
      taskId: task.id,
      dragType,
      originalStart: timeToMinutes(task.scheduledStartTime!),
      originalEnd: timeToMinutes(task.scheduledEndTime!),
      offsetY: dragType === 'move' ? offsetY : 0,
      startX: e.clientX,
      startY: e.clientY,
    })
  }

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    if (!onDragStart) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()
    pressOrigin.current = { x: e.clientX, y: e.clientY, t: Date.now() }

    if (e.pointerType === 'mouse') {
      // Desktop: drag activates immediately, parent uses 5px threshold.
      fireDragStart(e, 'move')
      return
    }

    // Touch: arm a long-press timer. The parent's pointermove listener
    // isn't installed until fireDragStart runs, so we track jitter here
    // ourselves and only commit the drag once the hold completes.
    const startX = e.clientX
    const startY = e.clientY
    const onWindowMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.sqrt(dx * dx + dy * dy) > TOUCH_HOLD_TOLERANCE_PX) {
        // Treat as scroll attempt → abort drag intent. The default touch
        // gesture (scroll) takes over.
        cancelLongPress()
        window.removeEventListener('pointermove', onWindowMove)
        window.removeEventListener('pointerup', onWindowUp)
        window.removeEventListener('pointercancel', onWindowUp)
        pressOrigin.current = null
      }
    }
    const onWindowUp = () => {
      window.removeEventListener('pointermove', onWindowMove)
      window.removeEventListener('pointerup', onWindowUp)
      window.removeEventListener('pointercancel', onWindowUp)
      // If the timer hasn't fired yet, cancel it — handleBodyPointerUp
      // below will treat this as a tap and open the modal.
      if (longPressTimer.current !== null) cancelLongPress()
    }
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowUp)

    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null
      haptic(15)
      fireDragStart({ clientX: startX, clientY: startY }, 'move')
      // Suppress the upcoming click on release — the parent owns drop now.
      pressOrigin.current = null
    }, TOUCH_LONG_PRESS_MS)
  }

  const handleBodyPointerUp = (e: React.PointerEvent) => {
    const origin = pressOrigin.current
    pressOrigin.current = null
    cancelLongPress()
    if (!origin) return
    const dx = e.clientX - origin.x
    const dy = e.clientY - origin.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const elapsed = Date.now() - origin.t
    // Click threshold: 5px movement, 300ms.
    if (dist < 5 && elapsed < 300) {
      onSelect(task)
    }
  }

  const handleResizePointerDown = (
    e: React.PointerEvent,
    dragType: 'resize-top' | 'resize-bottom',
  ) => {
    if (!onDragStart) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()

    if (e.pointerType === 'mouse') {
      fireDragStart(e, dragType)
      return
    }

    // Touch: same long-press gate as the body. Otherwise a brushing finger
    // on the resize handle while scrolling resizes the task by accident.
    const startX = e.clientX
    const startY = e.clientY
    const onWindowMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.sqrt(dx * dx + dy * dy) > TOUCH_HOLD_TOLERANCE_PX) {
        cancelLongPress()
        window.removeEventListener('pointermove', onWindowMove)
        window.removeEventListener('pointerup', onWindowUp)
        window.removeEventListener('pointercancel', onWindowUp)
      }
    }
    const onWindowUp = () => {
      window.removeEventListener('pointermove', onWindowMove)
      window.removeEventListener('pointerup', onWindowUp)
      window.removeEventListener('pointercancel', onWindowUp)
      if (longPressTimer.current !== null) cancelLongPress()
    }
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowUp)
    window.addEventListener('pointercancel', onWindowUp)

    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null
      haptic(15)
      fireDragStart({ clientX: startX, clientY: startY }, dragType)
    }, TOUCH_LONG_PRESS_MS)
  }

  const handleResizeTopPointerDown = (e: React.PointerEvent) =>
    handleResizePointerDown(e, 'resize-top')
  const handleResizeBottomPointerDown = (e: React.PointerEvent) =>
    handleResizePointerDown(e, 'resize-bottom')

  const color = task.calendarColor || task.workspaceColor

  // Compact mode: positioned within column, uses percentage-based width
  // Non-compact: uses time label offset calculation
  const styleProps = compact
    ? {
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
        backgroundColor: color,
        zIndex: isDragging ? 50 : column + 1,
        cursor: isDragging ? 'grabbing' : 'grab',
      }
    : {
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(56px + ${leftPercent}% * (100% - 60px) / 100)`,
        width: `calc((100% - 60px) / ${totalColumns} - 2px)`,
        backgroundColor: color,
        zIndex: isDragging ? 50 : column + 1,
        cursor: isDragging ? 'grabbing' : 'grab',
      }

  const ariaLabel = `${task.title}，${formatTime(task.scheduledStartTime!)} 到 ${formatTime(task.scheduledEndTime!)}${task.isCompleted ? '，已完成' : ''}`

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(task)
    }
  }

  return (
    <div
      data-task-block
      data-task-block-id={task.id}
      data-block="true"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={task.isCompleted}
      onKeyDown={handleKeyDown}
      className={cn(
        'absolute rounded-xl overflow-hidden group select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1',
        isDragging
          // "Lift" the block while dragging — slight scale + rotation makes
          // it feel like the user picked it up off the calendar.
          ? 'shadow-2xl opacity-95 z-50 ring-2 ring-white/40 scale-[1.02] -rotate-1 transition-transform'
          : 'hover:shadow-lg hover:z-10 transition-all',
        task.isCompleted && 'opacity-50'
      )}
      style={styleProps}
    >
      {/* Resize handle — TOP. Larger touch target on mobile (the indicator
          stays small; the hit area expands invisibly). */}
      <div
        className="absolute top-0 left-0 right-0 h-4 md:h-2 z-10 cursor-ns-resize flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        onPointerDown={handleResizeTopPointerDown}
        style={{ touchAction: 'none' }}
      >
        <div className="w-6 h-0.5 bg-white/60 rounded-full" />
      </div>

      {/* Block body — drag to move, click to open detail */}
      <div
        className={cn(
          'h-full flex flex-col',
          totalColumns > 1 ? 'p-1.5 pt-2 gap-0.5' : 'p-2 pt-3'
        )}
        onPointerDown={handleBodyPointerDown}
        onPointerUp={handleBodyPointerUp}
        style={{ touchAction: 'none' }}
        title={`${task.title} · ${formatTime(task.scheduledStartTime!)}–${formatTime(task.scheduledEndTime!)}`}
      >
        {/* Top Row: Checkbox + Title */}
        <div className={cn('flex min-w-0', totalColumns > 1 ? 'items-start gap-1' : 'items-start gap-1.5')}>
          <div className="relative flex-shrink-0">
            <div
              role="checkbox"
              aria-checked={task.isCompleted}
              aria-label={task.isCompleted ? '標記為未完成' : '標記為完成'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleCheckboxClick}
              className={cn(
                'mt-0.5 w-3.5 h-3.5 rounded-full border-[1.5px] border-white/60 flex items-center justify-center transition-all',
                'hover:border-white hover:bg-white/20 cursor-pointer',
                task.isCompleted && 'bg-white border-white',
                burst && 'animate-[task-pop_500ms_ease-out]'
              )}
            >
              {task.isCompleted && (
                <Check
                  className={cn('w-2 h-2', burst && 'animate-[task-check_500ms_ease-out]')}
                  style={{ color }}
                  strokeWidth={3}
                />
              )}
            </div>

            {/* Sparkle burst — six particles flying outward */}
            {burst && (
              <div className="pointer-events-none absolute inset-0 mt-0.5">
                {[0, 60, 120, 180, 240, 300].map((angle) => (
                  <span
                    key={angle}
                    className="absolute top-1/2 left-1/2 w-1 h-1 rounded-full bg-white animate-[task-sparkle_600ms_ease-out_forwards]"
                    style={{
                      ['--task-sparkle-angle' as string]: `${angle}deg`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Title: wraps to multiple lines when narrow.
              1 col → 2 lines max, normal size.
              2-3 cols → up to 3 lines, slightly smaller.
              4+ cols → vertical text (column too narrow for legible wrap). */}
          <span
            className={cn(
              'font-semibold text-white leading-tight break-words flex-1 min-w-0',
              totalColumns > 3
                ? 'text-[10px]'
                : totalColumns > 1
                ? 'text-[11px] line-clamp-3'
                : 'text-xs line-clamp-2'
            )}
            style={totalColumns > 3 ? { writingMode: 'vertical-rl', textOrientation: 'mixed' } : undefined}
          >
            {task.title}
          </span>
        </div>

        {/* Time + Type — kept up to 3 columns; hidden at 4+ to give vertical title room */}
        {totalColumns <= 3 && (
          <div className="mt-auto">
            <span className={cn(
              'text-white/80 font-mono block',
              totalColumns > 1 ? 'text-[9px]' : 'text-[10px]'
            )}>
              {formatTime(task.scheduledStartTime!)}–{formatTime(task.scheduledEndTime!)}
            </span>
            {totalColumns === 1 && (
              <div className="flex items-center gap-1 mt-0.5">
                {task.taskType === 'routine' && <RefreshCw className="w-2.5 h-2.5 text-white/50 flex-shrink-0" />}
                {task.taskType === 'project' && <Layers className="w-2.5 h-2.5 text-white/50 flex-shrink-0" />}
                {task.taskType === 'one_time' && <Clock className="w-2.5 h-2.5 text-white/50 flex-shrink-0" />}
                <span className="text-[9px] text-white/55 truncate">
                  {task.taskType === 'routine' ? '例行任務' : task.taskType === 'project' ? '專案' : '單次任務'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grip icon — shows on hover (desktop) / always (mobile) to teach draggability */}
      <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-30 md:opacity-0 md:group-hover:opacity-40 transition-opacity pointer-events-none">
        <GripVertical className="w-3 h-3 text-white" />
      </div>

      {/* Resize handle — BOTTOM. Same mobile sizing as TOP. */}
      <div
        className="absolute bottom-0 left-0 right-0 h-4 md:h-2 z-10 cursor-ns-resize flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        onPointerDown={handleResizeBottomPointerDown}
        style={{ touchAction: 'none' }}
      >
        <div className="w-6 h-0.5 bg-white/60 rounded-full" />
      </div>
    </div>
  )
}

export const TaskBlock = memo(TaskBlockImpl)
