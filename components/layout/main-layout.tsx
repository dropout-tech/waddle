'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ResizeHandle } from './resize-handle'
import { TaskPanel } from '@/components/task-panel/task-panel'
import { CalendarPanel } from '@/components/calendar/calendar-panel'
import type { Workspace, Task, TimeBlock } from '@/lib/types'

interface MainLayoutProps {
  workspaces: Workspace[]
  timeBlocks: TimeBlock[]
  onToggleCategoryCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
  onOpenJournal: () => void
}

const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 600
const DEFAULT_PANEL_WIDTH = 380

export function MainLayout({
  workspaces,
  timeBlocks,
  onToggleCategoryCollapse,
  onToggleComplete,
  onSelectTask,
  onAddTask,
  onOpenJournal,
}: MainLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')

  const handleResize = useCallback((delta: number) => {
    setPanelWidth((prev) => {
      const newWidth = prev + delta
      return Math.min(Math.max(newWidth, MIN_PANEL_WIDTH), MAX_PANEL_WIDTH)
    })
  }, [])

  // Get all tasks flattened
  const getAllTasks = useCallback(() => {
    const tasks: Task[] = []
    for (const workspace of workspaces) {
      for (const category of workspace.categories) {
        tasks.push(...category.tasks)
      }
    }
    return tasks
  }, [workspaces])

  // Filter tasks for selected date
  const dateString = selectedDate.toISOString().split('T')[0]

  const pendingTasks = getAllTasks().filter(
    (task) =>
      task.scheduledDate === dateString &&
      !task.scheduledStartTime &&
      !task.isCompleted
  )

  const scheduledTasks = getAllTasks().filter(
    (task) =>
      task.scheduledDate === dateString &&
      task.scheduledStartTime &&
      task.scheduledEndTime
  )

  const filteredTimeBlocks = timeBlocks.filter(
    (block) => block.date === dateString
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left Panel - Task Panel */}
      <div
        className="flex-shrink-0 h-full"
        style={{ width: `${panelWidth}px` }}
      >
        <TaskPanel
          workspaces={workspaces}
          onToggleCategoryCollapse={onToggleCategoryCollapse}
          onToggleComplete={onToggleComplete}
          onSelectTask={onSelectTask}
          onAddTask={onAddTask}
          onOpenJournal={onOpenJournal}
        />
      </div>

      {/* Resize Handle */}
      <ResizeHandle onResize={handleResize} />

      {/* Right Panel - Calendar */}
      <div className="flex-1 h-full min-w-0">
        <CalendarPanel
          selectedDate={selectedDate}
          viewMode={viewMode}
          pendingTasks={pendingTasks}
          scheduledTasks={scheduledTasks}
          timeBlocks={filteredTimeBlocks}
          onDateChange={setSelectedDate}
          onViewModeChange={setViewMode}
          onTaskSelect={onSelectTask}
        />
      </div>
    </div>
  )
}
