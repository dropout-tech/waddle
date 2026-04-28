'use client'

import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { formatEstimatedTime } from '@/lib/task-utils'

interface PendingZoneProps {
  tasks: Task[]
  onTaskSelect: (task: Task) => void
}

export function PendingZone({ tasks, onTaskSelect }: PendingZoneProps) {
  if (tasks.length === 0) return null

  return (
    <div className="px-4 py-3 border-b border-border bg-secondary/30">
      {/* Label */}
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          PENDING - 拖曳到時間軸排程
        </span>
      </div>

      {/* Pending Task Cards */}
      <div className="flex flex-wrap gap-2">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onTaskSelect(task)}
            draggable
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-grab active:cursor-grabbing',
              'hover:scale-[1.02] active:scale-[0.98]'
            )}
            style={{
              backgroundColor: `${task.workspaceColor}15`,
              borderWidth: '1px',
              borderColor: `${task.workspaceColor}40`,
              color: task.workspaceColor,
            }}
          >
            <span className="truncate max-w-[150px]">{task.title}</span>
            {task.estimatedMinutes && (
              <span className="text-[10px] font-mono opacity-70">
                {formatEstimatedTime(task.estimatedMinutes)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
