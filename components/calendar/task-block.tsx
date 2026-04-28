'use client'

import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import {
  calculateBlockHeight,
  calculateBlockTop,
  formatTime,
} from '@/lib/task-utils'

interface TaskBlockProps {
  task: Task
  calendarStartHour?: number
  onSelect: (task: Task) => void
  compact?: boolean
}

export function TaskBlock({
  task,
  calendarStartHour = 7,
  onSelect,
  compact = false,
}: TaskBlockProps) {
  if (!task.scheduledStartTime || !task.scheduledEndTime) return null

  // For compact mode (week view), don't use absolute positioning
  const top = compact ? 0 : calculateBlockTop(task.scheduledStartTime, calendarStartHour)
  const height = compact ? '100%' : calculateBlockHeight(
    task.scheduledStartTime,
    task.scheduledEndTime
  )

  return (
    <button
      onClick={() => onSelect(task)}
      className={cn(
        'rounded-xl overflow-hidden transition-all cursor-pointer cute-hover',
        compact ? 'w-full h-full' : 'absolute left-[60px] right-4',
        'hover:scale-[1.01] hover:z-10 active:scale-[0.99]',
        task.isCompleted && 'opacity-50'
      )}
      style={{
        ...(compact ? {} : { top: `${top}px`, height: `${height}px` }),
        backgroundColor: task.calendarColor || task.workspaceColor,
        boxShadow: `0 2px 8px ${task.calendarColor || task.workspaceColor}30`,
      }}
    >
      <div className={cn('h-full flex flex-col', compact ? 'p-1.5' : 'p-2.5')}>
        {/* Task Title */}
        <span
          className={cn(
            'font-bold text-white truncate',
            compact ? 'text-[10px]' : 'text-sm',
            task.isCompleted && 'line-through'
          )}
        >
          {task.title}
        </span>

        {/* Time + Workspace - Hide in compact mode if space is limited */}
        {!compact && (
          <span className="text-[10px] text-white/85 font-mono mt-0.5">
            {formatTime(task.scheduledStartTime)} -{' '}
            {formatTime(task.scheduledEndTime)}
            <span className="mx-1.5">|</span>
            {task.workspaceName}
          </span>
        )}

        {/* Task Type Badge */}
        {!compact && task.taskType !== 'one_time' && (
          <span className="mt-auto text-[9px] text-white/70 uppercase tracking-wider">
            {task.taskType === 'routine' ? '例行' : '專案'}
          </span>
        )}
      </div>

      {/* Resize Handle (visual only for now) */}
      {!compact && (
        <div className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-black/10 opacity-0 hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
}
