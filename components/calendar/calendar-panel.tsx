'use client'

import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { CalendarHeader } from './calendar-header'
import { PendingZone } from './pending-zone'
import { TimeGrid } from './time-grid'

interface CalendarPanelProps {
  selectedDate: Date
  viewMode: 'day' | 'week' | 'month'
  pendingTasks: Task[]
  scheduledTasks: Task[]
  timeBlocks: TimeBlock[]
  onDateChange: (date: Date) => void
  onViewModeChange: (mode: 'day' | 'week' | 'month') => void
  onTaskSelect: (task: Task) => void
  className?: string
}

export function CalendarPanel({
  selectedDate,
  viewMode,
  pendingTasks,
  scheduledTasks,
  timeBlocks,
  onDateChange,
  onViewModeChange,
  onTaskSelect,
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

      {/* Pending Zone */}
      <PendingZone tasks={pendingTasks} onTaskSelect={onTaskSelect} />

      {/* Time Grid */}
      <TimeGrid
        scheduledTasks={scheduledTasks}
        timeBlocks={timeBlocks}
        onTaskSelect={onTaskSelect}
      />
    </div>
  )
}
