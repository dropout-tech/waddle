'use client'

import { Check, Clock, Calendar, MessageSquare, Timer, AlertCircle, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { getUrgencyColor, formatEstimatedTime } from '@/lib/task-utils'
import type { Density } from './task-panel'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TaskRowProps {
  task: Task
  density?: Density
  onToggleComplete: (taskId: string) => void
  onSelect: (task: Task) => void
  isDragging?: boolean
  showWorkspaceTag?: boolean
}

export function TaskRow({
  task,
  density = 'comfortable',
  onToggleComplete,
  onSelect,
  isDragging,
  showWorkspaceTag = false,
}: TaskRowProps) {
  const colors = getUrgencyColor(task)

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleComplete(task.id)
  }

  // ─── COMPACT: single tight line, left border only ────────────────────────
  if (density === 'compact') {
    return (
      <div
        onClick={() => onSelect(task)}
        className={cn(
          'flex items-center gap-2 px-2.5 py-1 cursor-pointer transition-all duration-150 rounded-md',
          'hover:brightness-[0.96]',
          isDragging && 'opacity-50',
          task.isCompleted && 'opacity-50'
        )}
        style={{
          backgroundColor: colors.rowBg || 'transparent',
          borderLeft: `3px solid ${colors.accentColor}`,
        }}
        draggable
      >
        {/* Checkbox */}
        <button
          onClick={handleCheck}
          className="flex-shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all hover:scale-110"
          style={{
            backgroundColor: task.isCompleted ? colors.accentColor : 'transparent',
            borderColor: `color-mix(in oklch, ${colors.accentColor} 60%, transparent)`,
          }}
        >
          {task.isCompleted && <Check className="w-2 h-2 text-white" strokeWidth={3.5} />}
        </button>

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
            task.isCompleted && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
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
    )
  }

  // ─── COMFORTABLE (default): full detail, extra padding, notes always visible ────────
  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 cursor-pointer',
        'border hover:brightness-[0.97]',
        isDragging && 'opacity-50 scale-[0.98]',
        task.isCompleted && 'opacity-55'
      )}
      style={{
        backgroundColor: colors.rowBg,
        borderColor: `color-mix(in oklch, ${colors.accentColor} 25%, transparent)`,
        borderLeftWidth: '3px',
        borderLeftColor: colors.accentColor,
      }}
      onClick={() => onSelect(task)}
      draggable
    >
      {/* Drag Handle */}
      <div className="opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing pt-0.5">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </div>

      {/* Checkbox */}
      <button
        onClick={handleCheck}
        className="flex-shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all mt-0.5 hover:scale-110"
        style={{
          backgroundColor: task.isCompleted ? colors.accentColor : 'transparent',
          borderColor: task.isCompleted ? colors.accentColor : `color-mix(in oklch, ${colors.accentColor} 50%, transparent)`,
        }}
      >
        {task.isCompleted && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </button>

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
            task.isCompleted && 'line-through text-muted-foreground'
          )}>
            {task.title}
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
                  <p className="whitespace-pre-wrap text-foreground">{task.notes}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Meta Info Row */}
        <div className="flex flex-wrap items-center gap-3 mt-1.5">
          {task.estimatedMinutes && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Timer className="w-3 h-3" />
              <span className="font-medium">{formatEstimatedTime(task.estimatedMinutes)}</span>
            </span>
          )}
          {task.scheduledStartTime && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: colors.accentColor }}>
              <Clock className="w-3 h-3" />
              <span className="font-mono">
                {task.scheduledStartTime}{task.scheduledEndTime && ` - ${task.scheduledEndTime}`}
              </span>
            </span>
          )}
          {task.dueDate && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium"
              style={{ color: colors.isOverdue ? colors.accentColor : 'oklch(0.52 0.02 55)' }}
            >
              <Calendar className="w-3 h-3" />
              <span>{task.dueDate}</span>
            </span>
          )}
        </div>

        {/* Notes preview */}
        {task.notes && (
          <p
            className="mt-2 text-[11px] leading-relaxed line-clamp-1 pl-2"
            style={{
              color: 'oklch(0.55 0.02 55 / 0.75)',
              borderLeft: `2px solid ${colors.accentColor}40`,
            }}
          >
            {task.notes}
          </p>
        )}
      </div>
    </div>
  )
}
