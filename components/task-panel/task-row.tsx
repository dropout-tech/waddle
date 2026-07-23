'use client'

import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Clock, Calendar, MessageSquare, Timer, AlertCircle, GripVertical, Trash2, Users } from 'lucide-react'
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
import { useDisplayColor } from '@/hooks/use-display-color'
import { useI18n } from '@/lib/i18n/react'
import { beginGestureSuppression, endGestureSuppression } from '@/hooks/use-swipe-navigation'

interface TaskRowProps {
  task: Task
  density?: Density
  metaOrder?: MetaField[]
  onToggleComplete: (taskId: string) => void
  onSelect: (task: Task) => void
  onDelete?: (task: Task) => void
  isDeleteRevealed?: boolean
  onDeleteRevealChange?: (taskId: string | null) => void
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
  /** Moves the task when the pointer is released over another category. */
  onMoveToCategory?: (taskId: string, categoryId: string) => void
  /** Lets the panel highlight the category currently under the drag pointer. */
  onCategoryDragHover?: (categoryId: string | null) => void
  /** Shows the drag handle when category moves are available. */
  canMoveBetweenCategories?: boolean
  isDragging?: boolean
  showWorkspaceTag?: boolean
}

const DEFAULT_META_ORDER: MetaField[] = ['duration', 'date', 'time']
const DRAG_THRESHOLD = 5
const DELETE_REVEAL_WIDTH = 76
const DELETE_REVEAL_THRESHOLD = DELETE_REVEAL_WIDTH / 2

function TaskRowImpl({
  task,
  density = 'comfortable',
  metaOrder = DEFAULT_META_ORDER,
  onToggleComplete,
  onSelect,
  onDelete,
  isDeleteRevealed = false,
  onDeleteRevealChange,
  onSendToCalendar,
  onDragActivate,
  onMoveToCategory,
  onCategoryDragHover,
  canMoveBetweenCategories = false,
  isDragging,
  showWorkspaceTag = false,
}: TaskRowProps) {
  const { t } = useI18n()
  const displayColor = useDisplayColor()
  const workspaceDisplayColor = displayColor(task.workspaceColor)
  const colors = getUrgencyColor(task, workspaceDisplayColor)
  // Empty-title tasks (e.g. created via drag with no save) should still be
  // visible and tappable. Show a placeholder so the row never collapses.
  const displayTitle = task.title?.trim() || t('未命名任務')

  // Drag-to-calendar state. Activated only after the cursor crosses
  // DRAG_THRESHOLD so plain clicks still open the detail modal.
  const [externalDragActive, setExternalDragActive] = useState(false)
  // Keep pointer-following coordinates outside React state. Pointermove can
  // fire faster than the display refresh rate; mutating the small portal
  // directly avoids re-rendering the full task row on every event.
  const [ghostOrigin, setGhostOrigin] = useState({ x: 0, y: 0 })
  const ghostElementRef = useRef<HTMLDivElement>(null)
  const swipeSurfaceRef = useRef<HTMLDivElement>(null)
  // Once the drag activates, the trailing click event (if any) needs to be
  // suppressed so we don't open the modal at the same time as the drop.
  const suppressNextClickRef = useRef(false)
  // Brief celebration burst when transitioning unchecked → checked. Same
  // pattern as TaskBlock: pop the circle, scale-in the check icon, six
  // sparkles flying outward.
  const [burst, setBurst] = useState(false)

  const setSwipeOffset = (offset: number, animate: boolean) => {
    const surface = swipeSurfaceRef.current
    if (!surface) return
    surface.style.transition = animate
      ? 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)'
      : 'none'
    surface.style.transform = `translate3d(${offset}px, 0, 0)`
  }

  useEffect(() => {
    setSwipeOffset(isDeleteRevealed ? -DELETE_REVEAL_WIDTH : 0, true)
  }, [isDeleteRevealed])

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDeleteRevealChange?.(null)
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
    if (isDeleteRevealed) {
      e.preventDefault()
      e.stopPropagation()
      onDeleteRevealChange?.(null)
      return
    }
    // Selecting another task should close any revealed delete action first.
    onDeleteRevealChange?.(null)
    onSelect(task)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDeleteRevealChange?.(null)
    haptic(16)
    onDelete?.(task)
  }

  const handleMouseDown = (e: React.PointerEvent) => {
    if (!onSendToCalendar && !onMoveToCategory && !onDelete) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // Don't start a drag from interactive children (checkbox).
    if ((e.target as HTMLElement).closest('button')) return

    const startX = e.clientX
    const startY = e.clientY
    let activated = false
    let calendarDragActivated = false
    let horizontalDeleteSwipe = false
    let gestureSuppressed = false
    let swipeOffset = isDeleteRevealed ? -DELETE_REVEAL_WIDTH : 0
    const swipeStartOffset = swipeOffset
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
            setGhostOrigin({ x: startX, y: startY })
            setExternalDragActive(true)
            const categoryId = categoryIdAtPoint(startX, startY)
            onCategoryDragHover?.(categoryId === task.categoryId ? null : categoryId)
            if (!categoryId) {
              calendarDragActivated = true
              onDragActivate?.()
            }
            haptic(15)
          }
        }, longPressMs)
      : null
    let stillInThreshold = true

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (
        isTouch &&
        onDelete &&
        !activated &&
        !horizontalDeleteSwipe &&
        Math.abs(dx) > 8 &&
        Math.abs(dx) > Math.abs(dy) * 1.25
      ) {
        horizontalDeleteSwipe = true
        gestureSuppressed = true
        beginGestureSuppression()
        if (longPressTimer != null) {
          window.clearTimeout(longPressTimer)
          longPressTimer = null
        }
      }

      if (horizontalDeleteSwipe) {
        ev.preventDefault()
        swipeOffset = Math.max(
          -DELETE_REVEAL_WIDTH,
          Math.min(0, swipeStartOffset + dx),
        )
        setSwipeOffset(swipeOffset, false)
        return
      }

      if (dist > DRAG_THRESHOLD) {
        stillInThreshold = false
        // Touch: only start drag via long-press timer; finger-drag without
        // hold = scroll. Mouse: any movement past threshold activates.
        if (!activated && !isTouch) {
          activated = true
          setGhostOrigin({ x: ev.clientX, y: ev.clientY })
          setExternalDragActive(true)
          haptic(12)
        }
      }
      if (activated) {
        if (ghostElementRef.current) {
          ghostElementRef.current.style.left = `${ev.clientX + 12}px`
          ghostElementRef.current.style.top = `${ev.clientY + 12}px`
        }
        const categoryId = categoryIdAtPoint(ev.clientX, ev.clientY)
        onCategoryDragHover?.(categoryId === task.categoryId ? null : categoryId)
        if (!categoryId && !calendarDragActivated) {
          calendarDragActivated = true
          onDragActivate?.()
        }
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

      if (horizontalDeleteSwipe) {
        suppressNextClickRef.current = true
        const shouldReveal =
          ev.type !== 'pointercancel' && swipeOffset <= -DELETE_REVEAL_THRESHOLD
        setSwipeOffset(shouldReveal ? -DELETE_REVEAL_WIDTH : 0, true)
        onDeleteRevealChange?.(shouldReveal ? task.id : null)
        if (shouldReveal && !isDeleteRevealed) haptic(12)
        if (gestureSuppressed) endGestureSuppression()
        return
      }

      if (gestureSuppressed) endGestureSuppression()

      if (!activated) {
        // No drag — leave the trailing click alone so onSelect can fire.
        return
      }

      setExternalDragActive(false)
      onCategoryDragHover?.(null)
      if (ev.type === 'pointercancel') return

      // Suppress the click event that fires after this mouseup, otherwise
      // the row's onClick would also open the detail modal.
      suppressNextClickRef.current = true

      const targetCategoryId = categoryIdAtPoint(ev.clientX, ev.clientY)
      if (targetCategoryId) {
        if (targetCategoryId !== task.categoryId) {
          onMoveToCategory?.(task.id, targetCategoryId)
        }
        return
      }

      if (!onSendToCalendar) return
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

  const categoryIdAtPoint = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)
    return element?.closest<HTMLElement>('[data-task-category-id]')?.dataset.taskCategoryId ?? null
  }

  // Floating ghost portal — only rendered while a drag is active. Lives in
  // document.body so position: fixed coords are relative to the viewport
  // regardless of any transformed ancestor.
  const ghost = externalDragActive && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={ghostElementRef}
          className="fixed pointer-events-none z-max px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shadow-2xl ring-2 ring-white/60 select-none max-w-[200px] truncate"
          style={{
            left: ghostOrigin.x + 12,
            top: ghostOrigin.y + 12,
            backgroundColor: displayColor(task.calendarColor || task.workspaceColor),
            color: '#fff',
          }}
        >
          {displayTitle}
        </div>,
        document.body
      )
    : null

  const categoryDragHandle = (
    <div
      data-task-category-drag-handle
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex-shrink-0 text-muted-foreground transition-opacity',
        canMoveBetweenCategories
          ? 'cursor-grab active:cursor-grabbing opacity-40 md:opacity-0 md:group-hover:opacity-50'
          : 'cursor-default opacity-20'
      )}
      title={canMoveBetweenCategories ? t('拖曳移動到其他分類') : undefined}
      aria-label={canMoveBetweenCategories ? t('拖曳移動到其他分類') : undefined}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </div>
  )

  // M/D prefix shown before the scheduled time (both densities) — two tasks
  // at "10:00" on different days would otherwise look identical in the panel.
  // Year is dropped since the panel is for current work.
  let scheduledDatePrefix = ''
  if (task.scheduledDate) {
    const [, m, d] = task.scheduledDate.split('-')
    if (m && d) scheduledDatePrefix = `${parseInt(m, 10)}/${parseInt(d, 10)} `
  }

  const desktopDeleteButton = onDelete ? (
    <button
      type="button"
      data-task-delete-action="desktop"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={handleDelete}
      className="absolute right-2 top-1/2 z-[2] hidden size-8 -translate-y-1/2 items-center justify-center rounded-lg border border-border/80 bg-card/95 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-[opacity,color,background-color,transform] duration-150 hover:scale-105 hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      title={t('刪除任務')}
      aria-label={t('刪除任務')}
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </button>
  ) : null

  const withDeleteReveal = (row: ReactNode) => (
    <>
      <div
        className={cn(
          'relative',
          onDelete && 'overflow-hidden md:overflow-visible',
          density === 'compact' ? 'rounded-md' : 'rounded-xl',
        )}
      >
        {onDelete && (
          <button
            type="button"
            data-task-delete-action="mobile"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleDelete}
            className="absolute inset-y-0 right-0 flex w-[76px] items-center justify-center gap-1.5 bg-primary/12 text-xs font-semibold text-primary transition-colors active:bg-primary/20 md:hidden"
            aria-label={t('刪除任務')}
            tabIndex={isDeleteRevealed ? 0 : -1}
            aria-hidden={!isDeleteRevealed}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            <span>{t('刪除')}</span>
          </button>
        )}
        <div ref={swipeSurfaceRef} className="relative z-[1] md:!transform-none">
          {row}
        </div>
      </div>
      {ghost}
    </>
  )

  // ─── COMPACT: single tight line, left border only ────────────────────────
  if (density === 'compact') {
    return withDeleteReveal(
        <div
          data-tour="task-row"
          onPointerDown={handleMouseDown}
          onClick={handleRowClick}
          className={cn(
            'group relative flex items-center gap-2 px-2.5 py-1 cursor-pointer transition-all duration-150 ease-quart rounded-md select-none',
            // Hover feedback beyond the drag handle: wash the row towards the
            // accent (dusty rose) and nudge right. The base color lives in a
            // CSS variable so hover can color-mix it — Tailwind classes can't
            // override an inline background-color.
            'bg-(--row-bg)',
            'hover:bg-[color-mix(in_oklch,var(--row-bg)_82%,var(--color-accent))] hover:translate-x-0.5 hover:shadow-sm hover:shadow-black/[0.06] active:translate-x-0',
            'focus-within:bg-[color-mix(in_oklch,var(--row-bg)_82%,var(--color-accent))]',
            isDragging && 'opacity-50',
            externalDragActive && 'opacity-40',
            task.isCompleted && 'opacity-50'
          )}
          style={{
            ['--row-bg' as string]: colors.rowBg || 'transparent',
            borderLeft: `3px solid ${colors.accentColor}`,
          }}
        >
          {categoryDragHandle}

          {/* Checkbox — visual circle stays small; the actual <button>
              gets padding so the tap target reaches 44px on mobile even
              though the visible dot is 14 px. Layout doesn't shift because
              the negative margin cancels the padding. Compact rows sit ~52px
              apart, so the mobile zone is capped at 40px (p-[13px]) — a 44px
              zone overlaps the neighbour row and misfires on fast taps.
              Desktop reverts to the original p-2 (~30px, fine for mouse
              precision). */}
          <div className="relative flex-shrink-0">
            <button
              onClick={handleCheck}
              className={cn(
                'flex-shrink-0 p-[13px] -m-[13px] md:p-2 md:-m-2 rounded-full flex items-center justify-center transition-transform active:scale-95',
                burst && 'animate-[task-pop_500ms_ease-out]'
              )}
              aria-checked={task.isCompleted}
              aria-label={task.isCompleted ? t('標記為未完成') : t('標記為完成')}
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
              style={{ backgroundColor: `${workspaceDisplayColor}20`, color: workspaceDisplayColor }}
            >
              {task.workspaceName}
            </span>
          )}

          {/* Meeting badge (compact layout). Icon-only — no label text —
              because the compact row's whole point is dense info. */}
          {task.isMeeting && (
            <Users
              className="flex-shrink-0 w-3 h-3 text-primary"
              aria-label={t('會議')}
            />
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

          {/* Time (if any) — prefixed with M/D when the task has a date */}
          {task.scheduledStartTime && (
            <span
              className="flex-shrink-0 font-mono text-[10px]"
              style={{ color: colors.accentColor }}
            >
              {scheduledDatePrefix}{task.scheduledStartTime}
            </span>
          )}

          {/* Overdue badge */}
          {colors.isOverdue && (
            <AlertCircle className="flex-shrink-0 w-3 h-3" style={{ color: colors.accentColor }} />
          )}
          {desktopDeleteButton}
        </div>
    )
  }

  // ─── COMFORTABLE (default): full detail, extra padding, notes always visible ────────
  return withDeleteReveal(
      <div
        data-tour="task-row"
        className={cn(
          'group relative flex items-start gap-3 px-3.5 py-3 rounded-xl transition-all duration-150 ease-quart cursor-pointer select-none border',
          // Hover feedback beyond the drag handle (W2.5): wash the card
          // towards the accent (dusty rose), firm up the border, and keep the
          // gentle lift. Base colors live in CSS variables because Tailwind
          // hover classes can't override inline styles.
          'bg-(--row-bg) border-[color-mix(in_oklch,var(--row-accent)_25%,transparent)]',
          'hover:bg-[color-mix(in_oklch,var(--row-bg)_88%,var(--color-accent))] hover:border-[color-mix(in_oklch,var(--row-accent)_45%,transparent)]',
          'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.07] active:translate-y-0 active:scale-[0.995]',
          // Keyboard parity: focusing the checkbox inside lights the card the
          // same way hover does.
          'focus-within:bg-[color-mix(in_oklch,var(--row-bg)_88%,var(--color-accent))] focus-within:border-[color-mix(in_oklch,var(--row-accent)_45%,transparent)]',
          isDragging && 'opacity-50 scale-[0.98]',
          externalDragActive && 'opacity-40',
          task.isCompleted && 'opacity-55'
        )}
        style={{
          ['--row-bg' as string]: colors.rowBg,
          ['--row-accent' as string]: colors.accentColor,
          borderLeftWidth: '3px',
          borderLeftColor: colors.accentColor,
        }}
        onPointerDown={handleMouseDown}
        onClick={handleRowClick}
      >
        {/* Drag Handle */}
        <div className="pt-0.5">
          {categoryDragHandle}
        </div>

        {/* Checkbox with celebration burst — same touch-target trick as
            the compact variant: invisible padding extends the tap zone
            without enlarging the rendered circle. p-[15px] on mobile hits
            the 44px floor; md: reverts to the original p-2 for desktop. */}
        <div className="relative flex-shrink-0 mt-0.5">
          <button
            onClick={handleCheck}
            className={cn(
              'p-[15px] -m-[15px] md:p-2 md:-m-2 rounded-full flex items-center justify-center transition-transform active:scale-95',
              burst && 'animate-[task-pop_500ms_ease-out]'
            )}
            aria-checked={task.isCompleted}
            aria-label={task.isCompleted ? t('標記為未完成') : t('標記為完成')}
            role="checkbox"
          >
            <span
              className="block w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all group-hover:scale-110"
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
                style={{ backgroundColor: `${workspaceDisplayColor}20`, color: workspaceDisplayColor }}
              >
                {task.workspaceName}
              </span>
            )}
            {/* Meeting badge — small icon + label chip before the title so
                a meeting reads as "meeting" before the user even parses
                the words. Uses bg-primary/15 + text-primary tokens so the
                contrast holds in both light AND dark themes — the prior
                hardcoded cream background turned the yellow text invisible
                under the dark palette. */}
            {task.isMeeting && (
              <span
                className="flex-shrink-0 inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary"
                title={t('會議')}
              >
                <Users className="w-2.5 h-2.5" />
                {t('會議')}
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
                      {scheduledDatePrefix}{task.scheduledStartTime}{task.scheduledEndTime && ` - ${task.scheduledEndTime}`}
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
        {desktopDeleteButton}
      </div>
  )
}

export const TaskRow = memo(TaskRowImpl)
