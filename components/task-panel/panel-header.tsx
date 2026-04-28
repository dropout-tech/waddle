'use client'

import { Cloud, Sun, CloudRain } from 'lucide-react'
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

  return (
    <div className="px-4 py-4 border-b border-border">
      {/* Row 1: Brand + Date + Weather */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            FlowDesk
          </h1>
          <div className="h-5 w-px bg-border" />
          <span className="text-sm font-mono text-muted-foreground">
            {formatDate(today)}
          </span>
        </div>

        {/* Weather Widget */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border">
          <Sun className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-mono text-foreground">26°C</span>
        </div>
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
                  'hover:scale-105 active:scale-100'
                )}
                style={{
                  backgroundColor: `${workspace.color}15`,
                  borderWidth: '1px',
                  borderColor: `${workspace.color}30`,
                  color: workspace.color,
                }}
              >
                {workspace.icon && <span>{workspace.icon}</span>}
                <span>{workspace.name}</span>
                <span className="opacity-70">({count})</span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
