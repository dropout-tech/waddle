'use client'

import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { CalendarHeader } from './calendar-header'
import { PendingZone } from './pending-zone'
import { TimeGrid } from './time-grid'
import { WeekView } from './week-view'

interface CalendarPanelProps {
  selectedDate: Date
  viewMode: 'day' | 'week' | 'month'
  pendingTasks: Task[]
  scheduledTasks: Task[]
  allTasks: Task[]
  timeBlocks: TimeBlock[]
  onDateChange: (date: Date) => void
  onViewModeChange: (mode: 'day' | 'week' | 'month') => void
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  className?: string
}

export function CalendarPanel({
  selectedDate,
  viewMode,
  pendingTasks,
  scheduledTasks,
  allTasks,
  timeBlocks,
  onDateChange,
  onViewModeChange,
  onTaskSelect,
  onToggleComplete,
  className,
}: CalendarPanelProps) {
  const handleTodayClick = () => {
    onDateChange(new Date())
  }

  return (
    <div className={cn('flex flex-col h-full bg-panel', className)}>
      {/* Calendar Header */}
      <CalendarHeader
        selectedDate={selectedDate}
        viewMode={viewMode}
        onDateChange={onDateChange}
        onViewModeChange={onViewModeChange}
        onTodayClick={handleTodayClick}
      />

      {viewMode === 'day' && (
        <>
          {/* Pending Zone */}
          <PendingZone
            tasks={pendingTasks}
            onTaskSelect={onTaskSelect}
            onToggleComplete={onToggleComplete}
          />

          {/* Time Grid */}
          <TimeGrid
            scheduledTasks={scheduledTasks}
            timeBlocks={timeBlocks}
            onTaskSelect={onTaskSelect}
            onToggleComplete={onToggleComplete}
          />
        </>
      )}

      {viewMode === 'week' && (
        <WeekView
          selectedDate={selectedDate}
          tasks={allTasks}
          timeBlocks={timeBlocks}
          onTaskSelect={onTaskSelect}
          onToggleComplete={onToggleComplete}
        />
      )}

      {viewMode === 'month' && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg font-medium">月視圖</p>
            <p className="text-sm mt-1">即將推出</p>
          </div>
        </div>
      )}
    </div>
  )
}
