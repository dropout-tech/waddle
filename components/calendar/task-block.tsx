'use client'

import { memo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import {
  calculateBlockHeight,
  calculateBlockTop,
  formatTime,
} from '@/lib/task-utils'
import { Check, GripVertical, RefreshCw, Layers, Clock } from 'lucide-react'

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

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    if (!onDragStart) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()
    pressOrigin.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    const blockEl = (e.currentTarget as HTMLElement).closest('[data-task-block]') as HTMLElement
    const blockRect = blockEl?.getBoundingClientRect()
    const offsetY = blockRect ? e.clientY - blockRect.top : 0
    onDragStart({
      taskId: task.id,
      dragType: 'move',
      originalStart: timeToMinutes(task.scheduledStartTime!),
      originalEnd: timeToMinutes(task.scheduledEndTime!),
      offsetY,
      startX: e.clientX,
      startY: e.clientY,
    })
  }

  const handleBodyPointerUp = (e: React.PointerEvent) => {
    const origin = pressOrigin.current
    pressOrigin.current = null
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

  const handleResizeTopPointerDown = (e: React.PointerEvent) => {
    if (!onDragStart) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()
    onDragStart({
      taskId: task.id,
      dragType: 'resize-top',
      originalStart: timeToMinutes(task.scheduledStartTime!),
      originalEnd: timeToMinutes(task.scheduledEndTime!),
      offsetY: 0,
      startX: e.clientX,
      startY: e.clientY,
    })
  }

  const handleResizeBottomPointerDown = (e: React.PointerEvent) => {
    if (!onDragStart) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.stopPropagation()
    onDragStart({
      taskId: task.id,
      dragType: 'resize-bottom',
      originalStart: timeToMinutes(task.scheduledStartTime!),
      originalEnd: timeToMinutes(task.scheduledEndTime!),
      offsetY: 0,
      startX: e.clientX,
      startY: e.clientY,
    })
  }

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
          ? 'shadow-2xl opacity-90 z-50 ring-2 ring-white/40'
          : 'hover:shadow-lg hover:z-10 transition-shadow',
        task.isCompleted && 'opacity-50'
      )}
      style={styleProps}
    >
      {/* Resize handle — TOP */}
      <div
        className="absolute top-0 left-0 right-0 h-2 z-10 cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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

      {/* Grip icon — shows on hover to indicate draggability */}
      <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none">
        <GripVertical className="w-3 h-3 text-white" />
      </div>

      {/* Resize handle — BOTTOM */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2 z-10 cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onPointerDown={handleResizeBottomPointerDown}
        style={{ touchAction: 'none' }}
      >
        <div className="w-6 h-0.5 bg-white/60 rounded-full" />
      </div>
    </div>
  )
}

export const TaskBlock = memo(TaskBlockImpl)
