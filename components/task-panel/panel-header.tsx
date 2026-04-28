'use client'

import { Cloud, Sun, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/task-utils'
import type { Workspace } from '@/lib/types'

interface PanelHeaderProps {
  workspaces: Workspace[]
  onWorkspaceClick: (workspaceId: string) => void
}

export function PanelHeader({ workspaces, onWorkspaceClick }: PanelHeaderProps) {
  const today = new Date()

  // Count pending tasks per workspace
  const getWorkspaceCount = (workspace: Workspace) => {
    let count = 0
    for (const category of workspace.categories) {
      count += category.tasks.filter((t) => !t.isCompleted).length
    }
    return count
  }

  // Get total pending tasks
  const totalPending = workspaces.reduce((sum, ws) => sum + getWorkspaceCount(ws), 0)

  return (
    <div className="px-4 py-4 border-b border-border bg-gradient-to-br from-primary/5 to-secondary/10 rounded-t-xl">
      {/* Row 1: Brand + Date + Weather */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              FlowDesk
            </h1>
          </div>
        </div>

        {/* Weather Widget */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm">
          <Sun className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-mono text-foreground">26°C</span>
        </div>
      </div>

      {/* Date Display */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          {formatDate(today)}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
          {totalPending} 個待辦
        </span>
      </div>

      {/* Row 2: Workspace Summary Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {workspaces
          .filter((w) => !w.isArchived)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((workspace) => {
            const count = getWorkspaceCount(workspace)
            return (
              <button
                key={workspace.id}
                onClick={() => onWorkspaceClick(workspace.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  'hover:scale-105 active:scale-100 shadow-sm'
                )}
                style={{
                  backgroundColor: `${workspace.color}20`,
                  borderWidth: '2px',
                  borderColor: `${workspace.color}40`,
                  color: workspace.color,
                }}
              >
                {workspace.icon && <span>{workspace.icon}</span>}
                <span className="font-bold">{workspace.name}</span>
                <span className="opacity-70">({count})</span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
