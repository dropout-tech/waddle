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
}

export function TaskBlock({
  task,
  calendarStartHour = 7,
  onSelect,
  onToggleComplete,
  compact = false,
}: TaskBlockProps) {
  if (!task.scheduledStartTime || !task.scheduledEndTime) return null

  const top = compact ? 0 : calculateBlockTop(task.scheduledStartTime, calendarStartHour)
  const height = compact ? '100%' : calculateBlockHeight(
    task.scheduledStartTime,
    task.scheduledEndTime
  )

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleComplete?.(task.id)
  }

  return (
    <button
      onClick={() => onSelect(task)}
      className={cn(
        'rounded-lg overflow-hidden transition-all cursor-pointer group',
        compact ? 'w-full h-full' : 'absolute left-[56px] right-3',
        'hover:shadow-md active:scale-[0.99]',
        task.isCompleted && 'opacity-50'
      )}
      style={{
        ...(compact ? {} : { top: `${top}px`, height: `${height}px` }),
        backgroundColor: task.calendarColor || task.workspaceColor,
      }}
    >
      <div className={cn('h-full flex items-start gap-2', compact ? 'p-1' : 'p-2.5')}>
        {/* Checkbox */}
        {!compact && (
          <div
            role="checkbox"
            aria-checked={task.isCompleted}
            aria-label={task.isCompleted ? '標記為未完成' : '標記為完成'}
            onClick={handleCheckboxClick}
            className={cn(
              'flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-[1.5px] border-white/60 flex items-center justify-center transition-all',
              'hover:border-white hover:bg-white/20 cursor-pointer',
              task.isCompleted && 'bg-white border-white'
            )}
          >
            {task.isCompleted && (
              <Check
                className="w-2.5 h-2.5"
                style={{ color: task.calendarColor || task.workspaceColor }}
                strokeWidth={3}
              />
            )}
          </div>
        )}

        <div className="flex flex-col flex-1 min-w-0">
          {/* Task Title */}
          <span
            className={cn(
              'font-semibold text-white truncate leading-tight',
              compact ? 'text-[9px]' : 'text-sm',
              task.isCompleted && 'line-through opacity-80'
            )}
          >
            {task.title}
          </span>

          {/* Time + Workspace */}
          {!compact && (
            <span className="text-[10px] text-white/80 font-mono mt-0.5">
              {formatTime(task.scheduledStartTime)} - {formatTime(task.scheduledEndTime)}
            </span>
          )}

          {/* Workspace Name */}
          {!compact && (
            <span className="text-[9px] text-white/60 mt-0.5 truncate">
              {task.workspaceName}
            </span>
          )}
        </div>
      </div>

      {/* Resize Handle */}
      {!compact && (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
}
