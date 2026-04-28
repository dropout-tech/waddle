'use client'

import { useState } from 'react'
import { ChevronDown, Plus, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category, Task } from '@/lib/types'
import { TaskRow } from './task-row'

interface CategorySectionProps {
  category: Category
  onToggleCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
}

export function CategorySection({
  category,
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
    <div className="mb-2">
      {/* Category Header */}
      <button
        onClick={() => onToggleCollapse(category.id)}
        className="flex items-center gap-2 w-full px-2 py-2 rounded-xl hover:bg-secondary/50 transition-colors group"
      >
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform duration-200',
            category.isCollapsed && '-rotate-90'
          )}
        />
        <span className="text-sm font-bold text-foreground/80">
          {category.name}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
              {pendingCount}
            </span>
          )}
          {completedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
              {completedCount} done
            </span>
          )}
        </div>
      </button>

      {/* Tasks */}
      {!category.isCollapsed && (
        <div className="ml-2 mt-1 space-y-2">
          {sortedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggleComplete={onToggleComplete}
              onSelect={onSelectTask}
            />
          ))}

          {/* Add Task Input */}
          {isAdding ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-primary/30 bg-primary/5 shadow-sm">
              <Sparkles className="w-4 h-4 text-primary" />
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
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors border-2 border-dashed border-border hover:border-primary/30"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">新增任務</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
