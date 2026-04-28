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
  return (
    <div className="mb-6">
      {/* Workspace Header */}
      <div className="flex items-center gap-2 px-2 mb-3">
        <div
          className="w-1.5 h-5 rounded-full"
          style={{ backgroundColor: workspace.color }}
        />
        <h3
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: workspace.color }}
        >
          {workspace.icon && <span className="mr-1">{workspace.icon}</span>}
          {workspace.name}
        </h3>
      </div>

      {/* Categories */}
      <div className="space-y-2">
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
