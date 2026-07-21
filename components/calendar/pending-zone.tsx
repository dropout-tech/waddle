'use client'

import { useState, useRef } from 'react'
import { Clock, Inbox, Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { formatEstimatedTime } from '@/lib/task-utils'
import { taskDisplayTitle } from '@/lib/task-display'
import { useShowCategoryPrefix } from '@/components/category-prefix-context'
import { useI18n } from '@/lib/i18n/react'

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
  const showCategoryPrefix = useShowCategoryPrefix()
  const { t } = useI18n()

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
      <div className="px-5 py-4 border-b border-border bg-muted/30" role="region" aria-label={t('待排程任務')}>
        <button
          type="button"
          onClick={() => { setIsAdding(true); setTimeout(() => inputRef.current?.focus(), 0) }}
          className="w-full flex items-center justify-center gap-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span className="text-xs">{t('點擊新增待排程任務')}</span>
        </button>
      </div>
    )
  }

  return (
    <div
      className="px-5 py-4 border-b border-border bg-muted/20"
      role="region"
      aria-label={t('待排程任務')}
    >
      {/* Label */}
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t('待排程')}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {t('· 拖曳到下方時間軸')}
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
              placeholder={t('任務名稱...')}
              className="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              autoFocus
              enterKeyHint="done"
              autoCapitalize="sentences"
              autoCorrect="off"
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
            <span>{t('新增')}</span>
          </button>
        )}

        {tasks.map((task) => (
          <div
            key={task.id}
            draggable
            aria-label={t('待排程任務：{title}', { title: taskDisplayTitle(task, showCategoryPrefix) })}
            className={cn(
              'group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-grab active:cursor-grabbing',
              'bg-card border border-border hover:border-primary/30 hover:shadow-sm',
              'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
              task.isCompleted && 'opacity-50'
            )}
          >
            {/* Checkbox */}
            <button
              onClick={() => onToggleComplete?.(task.id)}
              aria-label={task.isCompleted ? t('標記為未完成') : t('標記為完成')}
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
              {taskDisplayTitle(task, showCategoryPrefix)}
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
