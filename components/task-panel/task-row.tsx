'use client'

import { useState } from 'react'
import { Check, GripVertical, Clock, Calendar, MessageSquare, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { getUrgencyColor, formatEstimatedTime } from '@/lib/task-utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
        'group relative flex items-start gap-2.5 px-3 py-3 rounded-xl border-2 transition-all duration-200 cursor-pointer soft-card cute-hover',
        colors.bg,
        colors.border,
        isDragging && 'opacity-50 scale-[0.98]',
        isHovered && !task.isCompleted && 'ring-2 ring-primary/20'
      )}
      style={{
        borderLeftWidth: '5px',
        borderLeftColor: task.workspaceColor,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(task)}
      draggable
    >
      {/* Drag Handle */}
      <div className="opacity-0 group-hover:opacity-50 transition-opacity cursor-grab active:cursor-grabbing pt-0.5">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete(task.id)
        }}
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all mt-0.5',
          task.isCompleted
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/30 hover:border-primary/60 hover:bg-primary/10'
        )}
      >
        {task.isCompleted && <Check className="w-3 h-3 text-primary-foreground" />}
      </button>

      {/* Task Content */}
      <div className="flex-1 min-w-0">
        {/* Title Row */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-sm font-medium leading-tight',
              colors.text,
              task.isCompleted && 'line-through opacity-60'
            )}
          >
            {task.title}
          </span>

          {/* Urgency Dot */}
          <div
            className={cn('flex-shrink-0 w-2.5 h-2.5 rounded-full', colors.dot)}
            title={`急迫度: ${task.urgency}`}
          />

          {/* Notes Indicator */}
          {task.notes && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px] text-xs">
                  <p className="whitespace-pre-wrap">{task.notes}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Meta Info - Separated Duration, Time, and Date */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
          {/* Estimated Duration */}
          {task.estimatedMinutes && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Timer className="w-3 h-3" />
              <span className="font-medium">{formatEstimatedTime(task.estimatedMinutes)}</span>
            </span>
          )}

          {/* Scheduled Time (if set) */}
          {task.scheduledStartTime && (
            <span className="flex items-center gap-1 text-xs text-primary font-medium">
              <Clock className="w-3 h-3" />
              <span className="font-mono">
                {task.scheduledStartTime}
                {task.scheduledEndTime && ` - ${task.scheduledEndTime}`}
              </span>
            </span>
          )}

          {/* Due Date */}
          {task.dueDate && (
            <span className={cn(
              'flex items-center gap-1 text-xs font-medium',
              new Date(task.dueDate) < new Date() ? 'text-destructive' : 'text-muted-foreground'
            )}>
              <Calendar className="w-3 h-3" />
              <span>{task.dueDate}</span>
            </span>
          )}
        </div>

        {/* Notes Preview (if exists and long enough) */}
        {task.notes && (
          <p className="mt-1.5 text-xs text-muted-foreground/80 truncate max-w-[200px]">
            {task.notes}
          </p>
        )}
      </div>
    </div>
  )
}
