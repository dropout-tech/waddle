'use client'

import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import {
  calculateBlockHeight,
  calculateBlockTop,
  formatTime,
} from '@/lib/task-utils'
import { Check, GripVertical } from 'lucide-react'

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
}

interface TaskBlockProps {
  task: Task
  calendarStartHour?: number
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

export function TaskBlock({
  task,
  calendarStartHour = 7,
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

  const baseTop = compact ? 0 : calculateBlockTop(task.scheduledStartTime, calendarStartHour)
  const baseHeight = compact ? undefined : calculateBlockHeight(task.scheduledStartTime, task.scheduledEndTime)

  const top = dragOverride ? dragOverride.top : baseTop
  const height = dragOverride ? dragOverride.height : (compact ? undefined : baseHeight)

  // Column positioning
  const LABEL_PX = 56
  const RIGHT_PX = 4
  const GAP_PX = 2
  const totalGap = (totalColumns - 1) * GAP_PX
  const columnWidth = `calc((100% - ${LABEL_PX + RIGHT_PX + totalGap}px) / ${totalColumns})`
  const leftOffset = column === 0
    ? `${LABEL_PX}px`
    : `calc(${LABEL_PX}px + ${column} * ((100% - ${LABEL_PX + RIGHT_PX + totalGap}px) / ${totalColumns} + ${GAP_PX}px))`

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleComplete?.(task.id)
  }

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (!onDragStart || compact) return
    // Only left button, not on handle areas
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const blockEl = (e.currentTarget as HTMLElement).closest('[data-task-block]') as HTMLElement
    const blockRect = blockEl?.getBoundingClientRect()
    const offsetY = blockRect ? e.clientY - blockRect.top : 0
    onDragStart({
      taskId: task.id,
      dragType: 'move',
      originalStart: timeToMinutes(task.scheduledStartTime!),
      originalEnd: timeToMinutes(task.scheduledEndTime!),
      offsetY,
    })
  }

  const handleResizeTopMouseDown = (e: React.MouseEvent) => {
    if (!onDragStart || compact) return
    e.stopPropagation()
    e.preventDefault()
    onDragStart({
      taskId: task.id,
      dragType: 'resize-top',
      originalStart: timeToMinutes(task.scheduledStartTime!),
      originalEnd: timeToMinutes(task.scheduledEndTime!),
      offsetY: 0,
    })
  }

  const handleResizeBottomMouseDown = (e: React.MouseEvent) => {
    if (!onDragStart || compact) return
    e.stopPropagation()
    e.preventDefault()
    onDragStart({
      taskId: task.id,
      dragType: 'resize-bottom',
      originalStart: timeToMinutes(task.scheduledStartTime!),
      originalEnd: timeToMinutes(task.scheduledEndTime!),
      offsetY: 0,
    })
  }

  const color = task.calendarColor || task.workspaceColor

  if (compact) {
    return (
      <button
        onClick={() => onSelect(task)}
        data-task-block
        className={cn(
          'w-full h-full rounded-lg overflow-hidden transition-all cursor-pointer group',
          'hover:shadow-md active:scale-[0.99]',
          task.isCompleted && 'opacity-50'
        )}
        style={{ backgroundColor: color }}
      >
        <div className="h-full flex items-start gap-2 p-1">
          <span className={cn('font-semibold text-white truncate leading-tight text-[9px]', task.isCompleted && 'line-through opacity-80')}>
            {task.title}
          </span>
        </div>
      </button>
    )
  }

  return (
    <div
      data-task-block
      data-block="true"
      className={cn(
        'absolute rounded-lg overflow-hidden group select-none',
        isDragging
          ? 'shadow-2xl opacity-90 z-50 ring-2 ring-white/40'
          : 'hover:shadow-lg hover:z-10 transition-shadow',
        task.isCompleted && 'opacity-50'
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: leftOffset,
        width: columnWidth,
        backgroundColor: color,
        zIndex: isDragging ? 50 : column + 1,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {/* Resize handle — TOP */}
      <div
        className="absolute top-0 left-0 right-0 h-2 z-10 cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={handleResizeTopMouseDown}
      >
        <div className="w-6 h-0.5 bg-white/60 rounded-full" />
      </div>

      {/* Block body — drag to move */}
      <div
        className="h-full flex flex-col p-2 pt-3"
        onMouseDown={handleBodyMouseDown}
      >
        {/* Top Row: Checkbox + Title */}
        <div className="flex items-start gap-1.5 min-w-0">
          <div
            role="checkbox"
            aria-checked={task.isCompleted}
            aria-label={task.isCompleted ? '標記為未完成' : '標記為完成'}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleCheckboxClick}
            className={cn(
              'flex-shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border-[1.5px] border-white/60 flex items-center justify-center transition-all',
              'hover:border-white hover:bg-white/20 cursor-pointer',
              task.isCompleted && 'bg-white border-white'
            )}
          >
            {task.isCompleted && (
              <Check className="w-2 h-2" style={{ color }} strokeWidth={3} />
            )}
          </div>

          <span
            className={cn(
              'font-semibold text-white leading-tight',
              totalColumns > 2 ? 'text-[10px]' : 'text-xs truncate',
              task.isCompleted && 'line-through opacity-80'
            )}
            style={totalColumns > 2 ? { writingMode: 'vertical-rl', textOrientation: 'mixed' } : {}}
          >
            {task.title}
          </span>
        </div>

        {/* Time + Workspace */}
        {totalColumns <= 2 && (
          <div className="mt-auto">
            <span className="text-[10px] text-white/80 font-mono block">
              {formatTime(task.scheduledStartTime!)}-{formatTime(task.scheduledEndTime!)}
            </span>
            {totalColumns === 1 && (
              <span className="text-[9px] text-white/60 truncate block">
                {task.workspaceName}
              </span>
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
        onMouseDown={handleResizeBottomMouseDown}
      >
        <div className="w-6 h-0.5 bg-white/60 rounded-full" />
      </div>
    </div>
  )
}
