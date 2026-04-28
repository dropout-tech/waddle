'use client'

import { Clock, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { formatEstimatedTime } from '@/lib/task-utils'

interface PendingZoneProps {
  tasks: Task[]
  onTaskSelect: (task: Task) => void
}

export function PendingZone({ tasks, onTaskSelect }: PendingZoneProps) {
  if (tasks.length === 0) {
    return (
      <div className="px-4 py-4 border-b border-border bg-secondary/20">
        <div className="flex items-center justify-center gap-2 text-muted-foreground/60">
          <Inbox className="w-4 h-4" />
          <span className="text-xs">今天沒有待排程的任務</span>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-secondary/30 to-accent/10">
      {/* Label */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-5 h-5 rounded-lg bg-primary/20 flex items-center justify-center">
          <Clock className="w-3 h-3 text-primary" />
        </div>
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          待排程
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          拖曳到時間軸排程
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
              'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-grab active:cursor-grabbing',
              'hover:scale-[1.02] active:scale-[0.98] shadow-sm'
            )}
            style={{
              backgroundColor: `${task.workspaceColor}20`,
              borderWidth: '2px',
              borderColor: `${task.workspaceColor}40`,
              color: task.workspaceColor,
            }}
          >
            <span className="truncate max-w-[150px] font-bold">{task.title}</span>
            {task.estimatedMinutes && (
              <span className="text-[10px] font-mono opacity-70 px-1.5 py-0.5 rounded-full bg-white/50">
                {formatEstimatedTime(task.estimatedMinutes)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
