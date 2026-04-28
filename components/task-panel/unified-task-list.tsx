'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import type { Density } from './task-panel'
import { TaskRow } from './task-row'

interface UnifiedTaskListProps {
  tasks: Task[]
  density: Density
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
}

export function UnifiedTaskList({
  tasks,
  density,
  onToggleComplete,
  onSelectTask,
}: UnifiedTaskListProps) {
  // Sort tasks by: urgency (desc), then by scheduled time (asc), then by due date (asc)
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Completed tasks go to bottom
      if (a.isCompleted !== b.isCompleted) {
        return a.isCompleted ? 1 : -1
      }

      // Sort by urgency (high to low)
      if (a.urgency !== b.urgency) {
        return b.urgency - a.urgency
      }

      // Sort by scheduled time
      if (a.scheduledStartTime && b.scheduledStartTime) {
        return a.scheduledStartTime.localeCompare(b.scheduledStartTime)
      }
      if (a.scheduledStartTime) return -1
      if (b.scheduledStartTime) return 1

      // Sort by due date
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate)
      }
      if (a.dueDate) return -1
      if (b.dueDate) return 1

      return 0
    })
  }, [tasks])

  // Group tasks by urgency level
  const groupedTasks = useMemo(() => {
    const groups: { urgency: number; label: string; tasks: Task[] }[] = []

    // Define urgency groups
    const urgencyRanges = [
      { min: 9, max: 10, label: '極度緊急' },
      { min: 7, max: 8, label: '高度緊急' },
      { min: 5, max: 6, label: '中等' },
      { min: 3, max: 4, label: '一般' },
      { min: 1, max: 2, label: '輕鬆' },
    ]

    for (const range of urgencyRanges) {
      const rangeTasks = sortedTasks.filter(
        (t) => t.urgency >= range.min && t.urgency <= range.max
      )
      if (rangeTasks.length > 0) {
        groups.push({
          urgency: range.max,
          label: range.label,
          tasks: rangeTasks,
        })
      }
    }

    return groups
  }, [sortedTasks])

  const getUrgencyColor = (urgency: number) => {
    if (urgency >= 9) return 'oklch(0.55 0.22 25)'
    if (urgency >= 7) return 'oklch(0.60 0.18 35)'
    if (urgency >= 5) return 'oklch(0.70 0.14 70)'
    if (urgency >= 3) return 'oklch(0.68 0.12 145)'
    return 'oklch(0.65 0.10 230)'
  }

  if (sortedTasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        沒有任務
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groupedTasks.map((group) => (
        <div key={group.urgency}>
          {/* Group Header */}
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getUrgencyColor(group.urgency) }}
            />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {group.label}
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              ({group.tasks.length})
            </span>
          </div>

          {/* Tasks */}
          <div className={cn(density === 'compact' ? 'space-y-0.5' : 'space-y-2')}>
            {group.tasks.map((task) => (
              <div key={task.id} className="relative">
                {/* Workspace Tag */}
                <div
                  className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full"
                  style={{ backgroundColor: task.workspaceColor }}
                  title={`${task.workspaceName} / ${task.categoryName}`}
                />
                <div className="pl-2">
                  <TaskRow
                    task={task}
                    density={density}
                    onToggleComplete={onToggleComplete}
                    onSelect={onSelectTask}
                    showWorkspaceTag
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
