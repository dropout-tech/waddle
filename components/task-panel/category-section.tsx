'use client'

import { useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category, Task } from '@/lib/types'
import { TaskRow } from './task-row'
import type { Density } from './task-panel'

interface CategorySectionProps {
  category: Category
  density?: Density
  onToggleCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
}

export function CategorySection({
  category,
  density = 'normal',
  onToggleCollapse,
  onToggleComplete,
  onSelectTask,
  onAddTask,
}: CategorySectionProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const pendingCount = category.tasks.filter((t) => !t.isCompleted).length
  const completedCount = category.tasks.filter((t) => t.isCompleted).length

  const handleAddSubmit = () => {
    if (newTaskTitle.trim()) {
      onAddTask(category.id, newTaskTitle.trim())
      setNewTaskTitle('')
      setIsAdding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddSubmit()
    } else if (e.key === 'Escape') {
      setNewTaskTitle('')
      setIsAdding(false)
    }
  }

  // Sort tasks: incomplete first (by urgency desc), then completed
  const sortedTasks = [...category.tasks].sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) {
      return a.isCompleted ? 1 : -1
    }
    if (!a.isCompleted && !b.isCompleted) {
      return b.urgency - a.urgency
    }
    return a.sortOrder - b.sortOrder
  })

  return (
    <div className="mb-3">
      {/* Category Header */}
      <button
        onClick={() => onToggleCollapse(category.id)}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors group"
      >
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200',
            category.isCollapsed && '-rotate-90'
          )}
        />
        <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">
          {category.name}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium">
              {pendingCount}
            </span>
          )}
          {completedCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-success/10 text-success text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              {completedCount}
            </span>
          )}
        </div>
      </button>

      {/* Tasks */}
      {!category.isCollapsed && (
        <div className={cn('mt-1', density === 'compact' ? 'space-y-0.5' : density === 'comfortable' ? 'space-y-3 mt-2' : 'space-y-2 mt-2')}>
          {sortedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              density={density}
              onToggleComplete={onToggleComplete}
              onSelect={onSelectTask}
            />
          ))}

          {/* Add Task Input */}
          {isAdding ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-primary/40 bg-primary/5">
              <Plus className="w-3.5 h-3.5 text-primary" />
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  if (!newTaskTitle.trim()) {
                    setIsAdding(false)
                  }
                }}
                placeholder="輸入任務名稱..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                autoFocus
              />
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-muted-foreground/60 hover:text-primary hover:bg-muted/30 transition-colors border border-dashed border-border/50 hover:border-primary/30"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">新增任務</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
