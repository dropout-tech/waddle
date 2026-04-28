'use client'

import { useState } from 'react'
import { Check, GripVertical, Clock, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { getUrgencyColor, formatEstimatedTime } from '@/lib/task-utils'

interface TaskRowProps {
  task: Task
  onToggleComplete: (taskId: string) => void
  onSelect: (task: Task) => void
  isDragging?: boolean
}

export function TaskRow({
  task,
  onToggleComplete,
  onSelect,
  isDragging,
}: TaskRowProps) {
  const [isHovered, setIsHovered] = useState(false)
  const colors = getUrgencyColor(task)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all duration-150 cursor-pointer',
        colors.bg,
        colors.border,
        isDragging && 'opacity-50 scale-[0.98]',
        isHovered && !task.isCompleted && 'ring-1 ring-primary/30'
      )}
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: task.workspaceColor,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(task)}
      draggable
    >
      {/* Drag Handle */}
      <div className="opacity-0 group-hover:opacity-50 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete(task.id)
        }}
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
          task.isCompleted
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/40 hover:border-primary/60'
        )}
      >
        {task.isCompleted && <Check className="w-3 h-3 text-primary-foreground" />}
      </button>

      {/* Task Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-sm font-medium truncate',
              colors.text
            )}
          >
            {task.title}
          </span>

          {/* Urgency Dot */}
          <div
            className={cn('flex-shrink-0 w-2 h-2 rounded-full', colors.dot)}
            title={`急迫度: ${task.urgency}`}
          />
        </div>

        {/* Task Meta */}
        {(task.scheduledStartTime || task.estimatedMinutes || task.dueDate) && (
          <div className="flex items-center gap-3 mt-0.5">
            {task.scheduledStartTime && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                <Clock className="w-3 h-3" />
                {task.scheduledStartTime}
                {task.scheduledEndTime && ` - ${task.scheduledEndTime}`}
              </span>
            )}
            {task.estimatedMinutes && !task.scheduledStartTime && (
              <span className="text-xs text-muted-foreground font-mono">
                {formatEstimatedTime(task.estimatedMinutes)}
              </span>
            )}
            {task.dueDate && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {task.dueDate}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
