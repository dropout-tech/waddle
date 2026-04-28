'use client'

import { Cloud, Sun, Leaf } from 'lucide-react'
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
    <div className="px-5 py-5 border-b border-border bg-card">
      {/* Row 1: Brand + Weather */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
              <Leaf className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                FlowDesk
              </h1>
              <p className="text-[10px] text-muted-foreground -mt-0.5">
                your daily planner
              </p>
            </div>
          </div>
        </div>

        {/* Weather Widget - Minimal */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border">
          <Sun className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-medium text-foreground">26°</span>
        </div>
      </div>

      {/* Date Display - Japanese style */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground tabular-nums">
            {today.getDate()}
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground">
              {today.toLocaleDateString('zh-TW', { month: 'long' })}
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {today.toLocaleDateString('zh-TW', { weekday: 'long' })}
            </span>
          </div>
          <div className="ml-auto">
            <span className="stamp text-primary border-primary">
              {totalPending} 待辦
            </span>
          </div>
        </div>
      </div>

      {/* Workspace Badges - Clean pills */}
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
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all soft-hover',
                  'border bg-card hover:bg-muted/50'
                )}
                style={{
                  borderColor: `${workspace.color}40`,
                  color: workspace.color,
                }}
              >
                {workspace.icon && <span className="text-sm">{workspace.icon}</span>}
                <span className="font-semibold">{workspace.name}</span>
                <span 
                  className="ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{ backgroundColor: `${workspace.color}15` }}
                >
                  {count}
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
