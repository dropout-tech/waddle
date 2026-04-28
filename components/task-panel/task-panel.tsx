'use client'

import { useRef, useState, useMemo } from 'react'
import { BookOpen, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace, Task } from '@/lib/types'
import { PanelHeader } from './panel-header'
import { WorkspaceSection } from './workspace-section'
import { FilterBar, type FilterState } from './filter-bar'
import { Button } from '@/components/ui/button'

interface TaskPanelProps {
  workspaces: Workspace[]
  onToggleCategoryCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
  onAddCategory?: (workspaceId: string, name: string) => void
  onAddWorkspace?: (name: string, color: string, icon: string) => void
  onOpenJournal: () => void
  onOpenReport: () => void
  className?: string
}

export function TaskPanel({
  workspaces,
  onToggleCategoryCollapse,
  onToggleComplete,
  onSelectTask,
  onAddTask,
  onAddCategory,
  onAddWorkspace,
  onOpenJournal,
  onOpenReport,
  className,
}: TaskPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    urgency: [],
    showCompleted: true,
    workspaceIds: [],
  })

  // Filter workspaces and tasks
  const filteredWorkspaces = useMemo(() => {
    return workspaces
      .filter((w) => !w.isArchived)
      .filter((w) => filters.workspaceIds.length === 0 || filters.workspaceIds.includes(w.id))
      .map((workspace) => ({
        ...workspace,
        categories: workspace.categories
          .filter((c) => !c.isArchived)
          .map((category) => ({
            ...category,
            tasks: category.tasks.filter((task) => {
              // Search filter
              if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase())) {
                return false
              }
              // Urgency filter
              if (filters.urgency.length > 0 && !filters.urgency.includes(task.urgency)) {
                return false
              }
              // Completed filter
              if (!filters.showCompleted && task.isCompleted) {
                return false
              }
              return true
            }),
          })),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }, [workspaces, filters])

  const handleWorkspaceClick = (workspaceId: string) => {
    // Scroll to workspace section
    const element = document.getElementById(`workspace-${workspaceId}`)
    if (element && scrollContainerRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-card border-r border-border shadow-sm',
        className
      )}
    >
      {/* Header */}
      <PanelHeader
        workspaces={workspaces}
        onWorkspaceClick={handleWorkspaceClick}
        onAddWorkspace={onAddWorkspace}
      />

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color }))}
      />

      {/* Task List - Scrollable */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        {filteredWorkspaces.map((workspace) => (
            <div key={workspace.id} id={`workspace-${workspace.id}`}>
              <WorkspaceSection
                workspace={workspace}
                onToggleCategoryCollapse={onToggleCategoryCollapse}
                onToggleComplete={onToggleComplete}
                onSelectTask={onSelectTask}
                onAddTask={onAddTask}
                onAddCategory={onAddCategory}
              />
            </div>
          ))}
      </div>

      {/* Bottom Toolbar */}
      <div className="flex items-center gap-2 p-3 border-t border-border bg-card">
        <Button
          variant="secondary"
          className="flex-1 gap-2 rounded-xl"
          onClick={onOpenJournal}
        >
          <BookOpen className="w-4 h-4" />
          <span>日記</span>
        </Button>
        <Button
          variant="secondary"
          className="flex-1 gap-2 rounded-xl"
          onClick={onOpenReport}
        >
          <BarChart3 className="w-4 h-4" />
          <span>報告</span>
        </Button>
      </div>
    </div>
  )
}
