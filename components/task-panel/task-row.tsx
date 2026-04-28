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
        'group relative flex items-start gap-3 px-3.5 py-3 rounded-lg transition-all duration-200 cursor-pointer',
        'bg-card border border-border hover:border-primary/30',
        isDragging && 'opacity-50 scale-[0.98] dragging',
        task.isCompleted && 'opacity-60'
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
      <div className="opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing pt-0.5">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </div>

      {/* Checkbox - Clean circle */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete(task.id)
        }}
        className={cn(
          'flex-shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all mt-0.5',
          task.isCompleted
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/25 hover:border-primary/50'
        )}
      >
        {task.isCompleted && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
      </button>

      {/* Task Content */}
      <div className="flex-1 min-w-0">
        {/* Title Row */}
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'text-sm font-medium leading-snug text-foreground',
              task.isCompleted && 'line-through text-muted-foreground'
            )}
          >
            {task.title}
          </span>

          {/* Urgency Badge - Small pill */}
          <span
            className={cn(
              'flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide',
              colors.bg,
              colors.text
            )}
          >
            U{task.urgency}
          </span>

          {/* Notes Indicator */}
          {task.notes && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0 text-muted-foreground/50 hover:text-primary transition-colors">
                    <MessageSquare className="w-3 h-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px] text-xs bg-card border-border">
                  <p className="whitespace-pre-wrap text-foreground">{task.notes}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Meta Info Row - Clean separated items */}
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {/* Estimated Duration */}
          {task.estimatedMinutes && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Timer className="w-3 h-3" />
              <span className="font-medium">{formatEstimatedTime(task.estimatedMinutes)}</span>
            </span>
          )}

          {/* Scheduled Time */}
          {task.scheduledStartTime && (
            <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
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
              'inline-flex items-center gap-1 text-[11px] font-medium',
              new Date(task.dueDate) < new Date() ? 'text-destructive' : 'text-muted-foreground'
            )}>
              <Calendar className="w-3 h-3" />
              <span>{task.dueDate}</span>
            </span>
          )}
        </div>

        {/* Notes Preview */}
        {task.notes && (
          <p className="mt-2 text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-1 border-l-2 border-muted pl-2">
            {task.notes}
          </p>
        )}
      </div>
    </div>
  )
}
