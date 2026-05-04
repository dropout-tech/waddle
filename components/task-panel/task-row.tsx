'use client'

import { memo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Clock, Calendar, MessageSquare, Timer, AlertCircle, GripVertical } from 'lucide-react'
import { cn, haptic } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { getUrgencyColor, formatEstimatedTime } from '@/lib/task-utils'
import { calendarHitTest, minutesToTime } from '@/lib/calendar-utils'
import { renderNotesWithLinks } from '@/lib/notes-render'
import type { Density, MetaField } from './task-panel'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TaskRowProps {
  task: Task
  density?: Density
  metaOrder?: MetaField[]
  onToggleComplete: (taskId: string) => void
  onSelect: (task: Task) => void
  /**
   * Called when the row is dragged onto the calendar:
   *   - Drop on a day grid → schedules the task with start/end times.
   *   - Drop on a pending zone → only `date` provided; the task moves to
   *     that date but stays pending (no time).
   *   - Drop somewhere else → not called (the drag is cancelled).
   */
  onSendToCalendar?: (taskId: string, date: string, startTime?: string, endTime?: string) => void
  /**
   * Fires once when the drag crosses DRAG_THRESHOLD. The mobile layout
   * uses this to auto-switch its bottom tab to 日曆 so the user can drop
   * onto the calendar without first switching tabs themselves.
   */
  onDragActivate?: () => void
  isDragging?: boolean
  showWorkspaceTag?: boolean
}

const DEFAULT_META_ORDER: MetaField[] = ['duration', 'date', 'time']
const DRAG_THRESHOLD = 5

function TaskRowImpl({
  task,
  density = 'comfortable',
  metaOrder = DEFAULT_META_ORDER,
  onToggleComplete,
  onSelect,
  onSendToCalendar,
  onDragActivate,
  isDragging,
  showWorkspaceTag = false,
}: TaskRowProps) {
  const colors = getUrgencyColor(task)
  // Empty-title tasks (e.g. created via drag with no save) should still be
  // visible and tappable. Show a placeholder so the row never collapses.
  const displayTitle = task.title?.trim() || '未命名任務'

  // Drag-to-calendar state. Activated only after the cursor crosses
  // DRAG_THRESHOLD so plain clicks still open the detail modal.
  const [externalDragActive, setExternalDragActive] = useState(false)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  // Once the drag activates, the trailing click event (if any) needs to be
  // suppressed so we don't open the modal at the same time as the drop.
  const suppressNextClickRef = useRef(false)
  // Brief celebration burst when transitioning unchecked → checked. Same
  // pattern as TaskBlock: pop the circle, scale-in the check icon, six
  // sparkles flying outward.
  const [burst, setBurst] = useState(false)

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!task.isCompleted) {
      setBurst(true)
      window.setTimeout(() => setBurst(false), 700)
      haptic(20)
    }
    onToggleComplete(task.id)
  }

  const handleRowClick = (e: React.MouseEvent) => {
    if (suppressNextClickRef.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressNextClickRef.current = false
      return
    }
    onSelect(task)
  }

  const handleMouseDown = (e: React.PointerEvent) => {
    if (!onSendToCalendar) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // Don't start a drag from interactive children (checkbox).
    if ((e.target as HTMLElement).closest('button')) return

    const startX = e.clientX
    const startY = e.clientY
    let activated = false
    // For touch input we want a long-press before drag activates so the
    // user can still scroll the task list with their finger. Mouse keeps
    // the snappy 5px threshold.
    const isTouch = e.pointerType === 'touch'
    const longPressMs = 280
    let longPressTimer: number | null = isTouch
      ? window.setTimeout(() => {
          longPressTimer = null
          // Long-press fires only if the finger hasn't already moved past
          // threshold (in which case we'll treat it as a scroll, not a drag).
          if (!activated && stillInThreshold) {
            activated = true
            setExternalDragActive(true)
            onDragActivate?.()
            haptic(15)
          }
        }, longPressMs)
      : null
    let stillInThreshold = true

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > DRAG_THRESHOLD) {
        stillInThreshold = false
        // Touch: only start drag via long-press timer; finger-drag without
        // hold = scroll. Mouse: any movement past threshold activates.
        if (!activated && !isTouch) {
          activated = true
          setExternalDragActive(true)
          onDragActivate?.()
          haptic(12)
        }
      }
      if (activated) {
        setGhostPos({ x: ev.clientX, y: ev.clientY })
      }
    }

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (longPressTimer != null) {
        window.clearTimeout(longPressTimer)
        longPressTimer = null
      }

      if (!activated) {
        // No drag — leave the trailing click alone so onSelect can fire.
        return
      }

      setExternalDragActive(false)
      // Suppress the click event that fires after this mouseup, otherwise
      // the row's onClick would also open the detail modal.
      suppressNextClickRef.current = true

      const hit = calendarHitTest(ev.clientX, ev.clientY)
      if (!hit) return

      if (hit.kind === 'pending') {
        onSendToCalendar(task.id, hit.date)
        return
      }

      // hit.kind === 'grid'
      const duration =
        task.estimatedMinutes ??
        (task.scheduledStartTime && task.scheduledEndTime
          ? Math.max(15, parseInt(task.scheduledEndTime.split(':')[0]) * 60 + parseInt(task.scheduledEndTime.split(':')[1]) - (parseInt(task.scheduledStartTime.split(':')[0]) * 60 + parseInt(task.scheduledStartTime.split(':')[1])))
          : 30)
      const start = hit.minutes
      const end = Math.min(start + duration, 24 * 60 - 1)
      onSendToCalendar(task.id, hit.date, minutesToTime(start), minutesToTime(end))
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // Floating ghost portal — only rendered while a drag is active. Lives in
  // document.body so position: fixed coords are relative to the viewport
  // regardless of any transformed ancestor.
  const ghost = externalDragActive && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed pointer-events-none z-[200] px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shadow-2xl ring-2 ring-white/60 select-none max-w-[200px] truncate"
          style={{
            left: ghostPos.x + 12,
            top: ghostPos.y + 12,
            backgroundColor: task.calendarColor || task.workspaceColor,
            color: '#fff',
          }}
        >
          {displayTitle}
        </div>,
        document.body
      )
    : null

  // ─── COMPACT: single tight line, left border only ────────────────────────
  if (density === 'compact') {
    return (
      <>
        <div
          data-tour="task-row"
          onPointerDown={handleMouseDown}
          onClick={handleRowClick}
          className={cn(
            'flex items-center gap-2 px-2.5 py-1 cursor-pointer transition-all duration-150 rounded-md select-none',
            'hover:brightness-[0.96]',
            isDragging && 'opacity-50',
            externalDragActive && 'opacity-40',
            task.isCompleted && 'opacity-50'
          )}
          style={{
            backgroundColor: colors.rowBg || 'transparent',
            borderLeft: `3px solid ${colors.accentColor}`,
          }}
        >
          {/* Checkbox — visual circle stays small; the actual <button>
              gets p-2 -m-2 so the tap target is ~30 px even though the
              visible dot is 14 px. Layout doesn't shift because the
              negative margin cancels the padding. */}
          <div className="relative flex-shrink-0">
            <button
              onClick={handleCheck}
              className={cn(
                'flex-shrink-0 p-2 -m-2 rounded-full flex items-center justify-center transition-transform active:scale-95',
                burst && 'animate-[task-pop_500ms_ease-out]'
              )}
              aria-checked={task.isCompleted}
              aria-label={task.isCompleted ? '標記為未完成' : '標記為完成'}
              role="checkbox"
            >
              <span
                className="block w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all"
                style={{
                  backgroundColor: task.isCompleted ? colors.accentColor : 'transparent',
                  borderColor: `color-mix(in oklch, ${colors.accentColor} 60%, transparent)`,
                }}
              >
                {task.isCompleted && (
                  <Check
                    className={cn('w-2 h-2 text-white', burst && 'animate-[task-check_500ms_ease-out]')}
                    strokeWidth={3.5}
                  />
                )}
              </span>
            </button>
            {burst && (
              <div className="pointer-events-none absolute inset-0">
                {[0, 60, 120, 180, 240, 300].map(angle => (
                  <span
                    key={angle}
                    className="absolute top-1/2 left-1/2 w-1 h-1 rounded-full animate-[task-sparkle_600ms_ease-out_forwards]"
                    style={{
                      backgroundColor: colors.accentColor,
                      ['--task-sparkle-angle' as string]: `${angle}deg`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Urgency dot */}
          <span
            className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: colors.accentColor }}
          />

          {/* Workspace Tag */}
          {showWorkspaceTag && (
            <span
              className="flex-shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded"
              style={{ backgroundColor: `${task.workspaceColor}20`, color: task.workspaceColor }}
            >
              {task.workspaceName}
            </span>
          )}

          {/* Title */}
          <span
            className={cn(
              'flex-1 min-w-0 text-xs font-medium truncate text-foreground',
              !task.title?.trim() && 'italic text-muted-foreground',
              task.isCompleted && 'line-through text-muted-foreground'
            )}
          >
            {displayTitle}
          </span>

          {/* Time (if any) */}
          {task.scheduledStartTime && (
            <span
              className="flex-shrink-0 font-mono text-[10px]"
              style={{ color: colors.accentColor }}
            >
              {task.scheduledStartTime}
            </span>
          )}

          {/* Overdue badge */}
          {colors.isOverdue && (
            <AlertCircle className="flex-shrink-0 w-3 h-3" style={{ color: colors.accentColor }} />
          )}
        </div>
        {ghost}
      </>
    )
  }

  // ─── COMFORTABLE (default): full detail, extra padding, notes always visible ────────
  return (
    <>
      <div
        data-tour="task-row"
        className={cn(
          'group relative flex items-start gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 cursor-pointer select-none',
          'border hover:brightness-[0.97]',
          isDragging && 'opacity-50 scale-[0.98]',
          externalDragActive && 'opacity-40',
          task.isCompleted && 'opacity-55'
        )}
        style={{
          backgroundColor: colors.rowBg,
          borderColor: `color-mix(in oklch, ${colors.accentColor} 25%, transparent)`,
          borderLeftWidth: '3px',
          borderLeftColor: colors.accentColor,
        }}
        onPointerDown={handleMouseDown}
        onClick={handleRowClick}
      >
        {/* Drag Handle */}
        <div className="opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing pt-0.5">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>

        {/* Checkbox with celebration burst — same touch-target trick as
            the compact variant: invisible padding extends the tap zone
            without enlarging the rendered circle. */}
        <div className="relative flex-shrink-0 mt-0.5">
          <button
            onClick={handleCheck}
            className={cn(
              'p-2 -m-2 rounded-full flex items-center justify-center transition-transform active:scale-95',
              burst && 'animate-[task-pop_500ms_ease-out]'
            )}
            aria-checked={task.isCompleted}
            aria-label={task.isCompleted ? '標記為未完成' : '標記為完成'}
            role="checkbox"
          >
            <span
              className="block w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all"
              style={{
                backgroundColor: task.isCompleted ? colors.accentColor : 'transparent',
                borderColor: task.isCompleted ? colors.accentColor : `color-mix(in oklch, ${colors.accentColor} 50%, transparent)`,
              }}
            >
              {task.isCompleted && (
                <Check
                  className={cn('w-2.5 h-2.5 text-white', burst && 'animate-[task-check_500ms_ease-out]')}
                  strokeWidth={3}
                />
              )}
            </span>
          </button>
          {burst && (
            <div className="pointer-events-none absolute inset-0">
              {[0, 60, 120, 180, 240, 300].map(angle => (
                <span
                  key={angle}
                  className="absolute top-1/2 left-1/2 w-1 h-1 rounded-full animate-[task-sparkle_600ms_ease-out_forwards]"
                  style={{
                    backgroundColor: colors.accentColor,
                    ['--task-sparkle-angle' as string]: `${angle}deg`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Task Content */}
        <div className="flex-1 min-w-0">
          {/* Title Row */}
          <div className="flex items-start gap-2 flex-wrap">
            {/* Workspace Tag */}
            {showWorkspaceTag && (
              <span
                className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${task.workspaceColor}20`, color: task.workspaceColor }}
              >
                {task.workspaceName}
              </span>
            )}
            <span className={cn(
              'text-sm font-medium leading-snug text-foreground flex-1 min-w-0',
              !task.title?.trim() && 'italic text-muted-foreground',
              task.isCompleted && 'line-through text-muted-foreground'
            )}>
              {displayTitle}
            </span>

            {/* Status / Urgency badge */}
            <span
              className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
              style={{ backgroundColor: colors.badgeBg, color: colors.badgeText }}
            >
              {colors.isOverdue && <AlertCircle className="w-2.5 h-2.5" />}
              <span className="opacity-60 font-mono">{task.urgency}</span>
              {colors.label && <span>{colors.label}</span>}
            </span>

            {/* Notes tooltip icon */}
            {task.notes && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-shrink-0 transition-colors" style={{ color: colors.accentColor, opacity: 0.6 }}>
                      <MessageSquare className="w-3 h-3" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-xs bg-card border-border">
                    <p className="whitespace-pre-wrap break-words text-foreground">
                      {renderNotesWithLinks(task.notes!)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Meta Info Row - dynamic order from user preference */}
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            {metaOrder.map((field) => {
              if (field === 'duration' && task.estimatedMinutes) {
                return (
                  <span key="duration" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Timer className="w-3 h-3" />
                    <span className="font-medium">{formatEstimatedTime(task.estimatedMinutes)}</span>
                  </span>
                )
              }
              if (field === 'date' && task.dueDate) {
                return (
                  <span
                    key="date"
                    className="inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: colors.isOverdue ? colors.accentColor : 'oklch(0.52 0.02 55)' }}
                  >
                    <Calendar className="w-3 h-3" />
                    <span>{task.dueDate}</span>
                  </span>
                )
              }
              if (field === 'time' && task.scheduledStartTime) {
                return (
                  <span key="time" className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: colors.accentColor }}>
                    <Clock className="w-3 h-3" />
                    <span className="font-mono">
                      {task.scheduledStartTime}{task.scheduledEndTime && ` - ${task.scheduledEndTime}`}
                    </span>
                  </span>
                )
              }
              return null
            })}
          </div>

          {/* Notes preview — single-line clamp; full text + clickable links
              live in the tooltip on the meta row, so we keep this concise. */}
          {task.notes && (
            <p
              className="mt-2 text-[11px] leading-relaxed line-clamp-1 pl-2"
              style={{
                color: 'oklch(0.55 0.02 55 / 0.75)',
                borderLeft: `2px solid ${colors.accentColor}40`,
              }}
            >
              {renderNotesWithLinks(task.notes)}
            </p>
          )}
        </div>
      </div>
      {ghost}
    </>
  )
}

export const TaskRow = memo(TaskRowImpl)
