'use client'

import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import {
  calculateBlockHeight,
  calculateBlockTop,
  formatTime,
} from '@/lib/task-utils'
import { Check } from 'lucide-react'

interface TaskBlockProps {
  task: Task
  calendarStartHour?: number
  onSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  compact?: boolean
  // For overlapping tasks - column positioning
  column?: number
  totalColumns?: number
}

export function TaskBlock({
  task,
  calendarStartHour = 7,
  onSelect,
  onToggleComplete,
  compact = false,
  column = 0,
  totalColumns = 1,
}: TaskBlockProps) {
  if (!task.scheduledStartTime || !task.scheduledEndTime) return null

  const top = compact ? 0 : calculateBlockTop(task.scheduledStartTime, calendarStartHour)
  const height = compact ? '100%' : calculateBlockHeight(
    task.scheduledStartTime,
    task.scheduledEndTime
  )

  // Column layout: divide the available track area (after the 56px time label)
  // into equal columns with a 2px gap between each.
  // We express left/width as percentages of the full container, offsetting by the
  // 56px time-label area that is always present.
  const LABEL_PX = 56   // width of the time-label column
  const RIGHT_PX = 4    // right padding
  const GAP_PX = 2      // gap between columns

  // Percentage of the full container width that the track area occupies
  // We keep this as inline style strings that are simple (no nested calc).
  // Instead we use left + width both in calc() but without nesting.
  const totalGap = (totalColumns - 1) * GAP_PX
  // width = (100% - LABEL_PX - RIGHT_PX - totalGap) / totalColumns
  const columnWidth = `calc((100% - ${LABEL_PX + RIGHT_PX + totalGap}px) / ${totalColumns})`
  // left  = LABEL_PX + column * (columnWidth + GAP_PX)
  //       = LABEL_PX + column * ((100% - LABEL_PX - RIGHT_PX - totalGap) / totalColumns + GAP_PX)
  const leftOffset = column === 0
    ? `${LABEL_PX}px`
    : `calc(${LABEL_PX}px + ${column} * ((100% - ${LABEL_PX + RIGHT_PX + totalGap}px) / ${totalColumns} + ${GAP_PX}px))`

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleComplete?.(task.id)
  }

  // For compact mode or single column
  if (compact) {
    return (
      <button
        onClick={() => onSelect(task)}
        className={cn(
          'w-full h-full rounded-lg overflow-hidden transition-all cursor-pointer group',
          'hover:shadow-md active:scale-[0.99]',
          task.isCompleted && 'opacity-50'
        )}
        style={{
          backgroundColor: task.calendarColor || task.workspaceColor,
        }}
      >
        <div className="h-full flex items-start gap-2 p-1">
          <div className="flex flex-col flex-1 min-w-0">
            <span
              className={cn(
                'font-semibold text-white truncate leading-tight text-[9px]',
                task.isCompleted && 'line-through opacity-80'
              )}
            >
              {task.title}
            </span>
          </div>
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={() => onSelect(task)}
      className={cn(
        'absolute rounded-lg overflow-hidden transition-all cursor-pointer group',
        'hover:shadow-lg hover:z-10 active:scale-[0.99]',
        task.isCompleted && 'opacity-50'
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: leftOffset,
        width: columnWidth,
        backgroundColor: task.calendarColor || task.workspaceColor,
        zIndex: column + 1,
      }}
    >
      <div className="h-full flex flex-col p-2">
        {/* Top Row: Checkbox + Title */}
        <div className="flex items-start gap-1.5 min-w-0">
          {/* Checkbox */}
          <div
            role="checkbox"
            aria-checked={task.isCompleted}
            aria-label={task.isCompleted ? '標記為未完成' : '標記為完成'}
            onClick={handleCheckboxClick}
            className={cn(
              'flex-shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border-[1.5px] border-white/60 flex items-center justify-center transition-all',
              'hover:border-white hover:bg-white/20 cursor-pointer',
              task.isCompleted && 'bg-white border-white'
            )}
          >
            {task.isCompleted && (
              <Check
                className="w-2 h-2"
                style={{ color: task.calendarColor || task.workspaceColor }}
                strokeWidth={3}
              />
            )}
          </div>

          {/* Task Title - vertical text if narrow */}
          <span
            className={cn(
              'font-semibold text-white leading-tight',
              totalColumns > 2 ? 'text-[10px] writing-mode-vertical' : 'text-xs truncate',
              task.isCompleted && 'line-through opacity-80'
            )}
            style={totalColumns > 2 ? { writingMode: 'vertical-rl', textOrientation: 'mixed' } : {}}
          >
            {task.title}
          </span>
        </div>

        {/* Time + Workspace - only show if enough space */}
        {totalColumns <= 2 && (
          <div className="mt-auto">
            <span className="text-[10px] text-white/80 font-mono block">
              {formatTime(task.scheduledStartTime)}-{formatTime(task.scheduledEndTime)}
            </span>
            {totalColumns === 1 && (
              <span className="text-[9px] text-white/60 truncate block">
                {task.workspaceName}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}
