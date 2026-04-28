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
      <div className="flex items-center gap-3 px-2 mb-3">
        <div
          className="w-2 h-8 rounded-full"
          style={{ backgroundColor: workspace.color }}
        />
        <div className="flex-1">
          <h3
            className="text-sm font-bold"
            style={{ color: workspace.color }}
          >
            {workspace.icon && <span className="mr-1.5">{workspace.icon}</span>}
            {workspace.name}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {pendingCount} 個待辦任務
          </p>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-1 pl-2 border-l-2" style={{ borderColor: `${workspace.color}30` }}>
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
