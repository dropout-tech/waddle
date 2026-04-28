'use client'

import type { Workspace, Task } from '@/lib/types'
import { CategorySection } from './category-section'

interface WorkspaceSectionProps {
  workspace: Workspace
  onToggleCategoryCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
}

export function WorkspaceSection({
  workspace,
  onToggleCategoryCollapse,
  onToggleComplete,
  onSelectTask,
  onAddTask,
}: WorkspaceSectionProps) {
  // Count total pending tasks
  const pendingCount = workspace.categories.reduce(
    (sum, cat) => sum + cat.tasks.filter((t) => !t.isCompleted).length,
    0
  )

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
              onToggleCollapse={onToggleCategoryCollapse}
              onToggleComplete={onToggleComplete}
              onSelectTask={onSelectTask}
              onAddTask={onAddTask}
            />
          ))}
      </div>
    </div>
  )
}
