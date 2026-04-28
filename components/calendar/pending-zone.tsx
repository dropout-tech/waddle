'use client'

import { useState, useRef } from 'react'
import { Clock, Inbox, Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { formatEstimatedTime } from '@/lib/task-utils'

interface PendingZoneProps {
  tasks: Task[]
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (title: string) => void
}

export function PendingZone({ tasks, onTaskSelect, onToggleComplete, onCreateTask }: PendingZoneProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if (newTaskTitle.trim()) {
      onCreateTask?.(newTaskTitle.trim())
      setNewTaskTitle('')
      setIsAdding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setNewTaskTitle('')
    }
  }

  if (tasks.length === 0 && !isAdding) {
    return (
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <div 
          onClick={() => { setIsAdding(true); setTimeout(() => inputRef.current?.focus(), 0) }}
          className="flex items-center justify-center gap-2 text-muted-foreground/50 cursor-pointer hover:text-muted-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-xs">點擊新增待排程任務</span>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 py-4 border-b border-border bg-muted/20">
      {/* Label */}
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          待排程
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          - 拖曳到下方時間軸
        </span>
      </div>

      {/* Pending Task Cards */}
      <div className="flex flex-wrap gap-2">
        {/* Quick add input */}
        {isAdding ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card border border-primary/40">
            <input
              ref={inputRef}
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => { if (!newTaskTitle.trim()) setIsAdding(false) }}
              placeholder="任務名稱..."
              className="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              autoFocus
            />
            <button
              onClick={handleSubmit}
              disabled={!newTaskTitle.trim()}
              className="text-primary hover:text-primary/80 disabled:opacity-30 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
          >
            <Plus className="w-3 h-3" />
            <span>新增</span>
          </button>
        )}

        {tasks.map((task) => (
          <div
            key={task.id}
            draggable
            className={cn(
              'group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-grab',
              'bg-card border border-border hover:border-primary/30 hover:shadow-sm',
              task.isCompleted && 'opacity-50'
            )}
          >
            {/* Checkbox */}
            <button
              onClick={() => onToggleComplete?.(task.id)}
              aria-label={task.isCompleted ? '標記為未完成' : '標記為完成'}
              className={cn(
                'flex-shrink-0 w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center transition-all',
                task.isCompleted 
                  ? 'border-primary bg-primary' 
                  : 'border-muted-foreground/30 hover:border-primary/50'
              )}
            >
              {task.isCompleted && (
                <Check className="w-2 h-2 text-primary-foreground" strokeWidth={3} />
              )}
            </button>

            {/* Color dot */}
            <div 
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: task.workspaceColor }}
            />

            {/* Title */}
            <button
              onClick={() => onTaskSelect(task)}
              className={cn(
                'truncate max-w-[140px] font-medium text-foreground text-left',
                task.isCompleted && 'line-through text-muted-foreground'
              )}
            >
              {task.title}
            </button>

            {task.estimatedMinutes && (
              <span className="text-[10px] font-mono text-muted-foreground/70 flex-shrink-0">
                {formatEstimatedTime(task.estimatedMinutes)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
