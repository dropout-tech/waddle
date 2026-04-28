'use client'

import { useRef } from 'react'
import { BookOpen, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace, Task } from '@/lib/types'
import { PanelHeader } from './panel-header'
import { WorkspaceSection } from './workspace-section'
import { Button } from '@/components/ui/button'

interface TaskPanelProps {
  workspaces: Workspace[]
  onToggleCategoryCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
  onOpenJournal: () => void
  className?: string
}

export function TaskPanel({
  workspaces,
  onToggleCategoryCollapse,
  onToggleComplete,
  onSelectTask,
  onAddTask,
  onOpenJournal,
  className,
}: TaskPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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
        'flex flex-col h-full bg-panel border-r border-border',
        className
      )}
    >
      {/* Header */}
      <PanelHeader
        workspaces={workspaces}
        onWorkspaceClick={handleWorkspaceClick}
      />

      {/* Task List - Scrollable */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        {workspaces
          .filter((w) => !w.isArchived)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((workspace) => (
            <div key={workspace.id} id={`workspace-${workspace.id}`}>
              <WorkspaceSection
                workspace={workspace}
                onToggleCategoryCollapse={onToggleCategoryCollapse}
                onToggleComplete={onToggleComplete}
                onSelectTask={onSelectTask}
                onAddTask={onAddTask}
              />
            </div>
          ))}
      </div>

      {/* Bottom Toolbar */}
      <div className="flex items-center gap-2 p-3 border-t border-border bg-panel">
        <Button
          variant="secondary"
          className="flex-1 gap-2"
          onClick={onOpenJournal}
        >
          <BookOpen className="w-4 h-4" />
          <span>日記</span>
        </Button>
        <Button
          variant="secondary"
          className="flex-1 gap-2"
          disabled
          title="即將推出"
        >
          <BarChart3 className="w-4 h-4" />
          <span>報告</span>
        </Button>
      </div>
    </div>
  )
}
