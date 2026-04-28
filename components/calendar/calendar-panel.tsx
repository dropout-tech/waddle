'use client'

import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { CalendarHeader } from './calendar-header'
import { PendingZone } from './pending-zone'
import { TimeGrid } from './time-grid'
import { WeekView } from './week-view'
import { MonthView } from './month-view'

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
  onCreateTask?: (startTime: string, endTime: string) => void
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
  onCreateTask,
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
            onCreateTask={onCreateTask}
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
        <MonthView
          selectedDate={selectedDate}
          tasks={allTasks}
          timeBlocks={timeBlocks}
          onTaskSelect={onTaskSelect}
          onToggleComplete={onToggleComplete}
          onDateSelect={(date) => {
            onDateChange(date)
            onViewModeChange('day')
          }}
          onCreateTask={(dateString) => {
            onCreateTask?.('09:00', '09:30')
          }}
        />
      )}
    </div>
  )
}
