'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Workspace, Task } from '@/lib/types'
import { CategorySection } from './category-section'
import type { Density, MetaField } from './task-panel'

interface WorkspaceSectionProps {
  workspace: Workspace
  density?: Density
  metaOrder?: MetaField[]
  onToggleCategoryCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
  onAddCategory?: (workspaceId: string, name: string) => void
}

export function WorkspaceSection({
  workspace,
  density = 'comfortable',
  metaOrder,
  onToggleCategoryCollapse,
  onToggleComplete,
  onSelectTask,
  onAddTask,
  onAddCategory,
}: WorkspaceSectionProps) {
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  // Count total pending tasks
  const pendingCount = workspace.categories.reduce(
    (sum, cat) => sum + cat.tasks.filter((t) => !t.isCompleted).length,
    0
  )

  const handleAddCategory = () => {
    if (newCategoryName.trim() && onAddCategory) {
      onAddCategory(workspace.id, newCategoryName.trim())
      setNewCategoryName('')
      setIsAddingCategory(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddCategory()
    } else if (e.key === 'Escape') {
      setNewCategoryName('')
      setIsAddingCategory(false)
    }
  }

  return (
    <div className="mb-6">
      {/* Workspace Header */}
      <div className="flex items-center gap-3 px-1 mb-3">
        <div
          className="w-1 h-6 rounded-sm"
          style={{ backgroundColor: workspace.color }}
        />
        <div className="flex-1 flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">
            {workspace.icon && <span className="mr-1">{workspace.icon}</span>}
            {workspace.name}
          </h3>
          <span 
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ 
              backgroundColor: `${workspace.color}15`,
              color: workspace.color 
            }}
          >
            {pendingCount}
          </span>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-1 pl-3 border-l border-border ml-1">
        {workspace.categories
          .filter((c) => !c.isArchived)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              density={density}
              metaOrder={metaOrder}
              onToggleCollapse={onToggleCategoryCollapse}
              onToggleComplete={onToggleComplete}
              onSelectTask={onSelectTask}
              onAddTask={onAddTask}
            />
          ))}

        {/* Add Category */}
        {isAddingCategory ? (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-primary/40 bg-primary/5 mt-2">
            <Plus className="w-3.5 h-3.5 text-primary" />
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!newCategoryName.trim()) {
                  setIsAddingCategory(false)
                }
              }}
              placeholder="分類名稱..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => setIsAddingCategory(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-muted-foreground/50 hover:text-primary hover:bg-muted/30 transition-colors mt-2"
          >
            <Plus className="w-3 h-3" />
            <span className="text-[10px] font-medium">新增分類</span>
          </button>
        )}
      </div>
    </div>
  )
}
