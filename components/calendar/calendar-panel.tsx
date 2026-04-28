'use client'

import { useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation'
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
  onCreateTask?: (date: string, startTime: string, endTime: string) => void
  onCreatePendingTask?: (title: string) => void
  onCreateTimeBlock?: (date: string, startTime: string, endTime: string, type: TimeBlock['type'], label: string, color: string) => void
  onRescheduleTask?: (taskId: string, newStart: string, newEnd: string) => void
  onUpdateTimeBlock?: (id: string, updates: Partial<TimeBlock>) => void
  onDeleteTimeBlock?: (id: string) => void
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
  onCreatePendingTask,
  onCreateTimeBlock,
  onRescheduleTask,
  onUpdateTimeBlock,
  onDeleteTimeBlock,
  className,
}: CalendarPanelProps) {
  const handleTodayClick = () => {
    onDateChange(new Date())
  }

  const navigate = useCallback((direction: 'prev' | 'next') => {
    const d = new Date(selectedDate)
    if (viewMode === 'day') {
      d.setDate(d.getDate() + (direction === 'next' ? 1 : -1))
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + (direction === 'next' ? 7 : -7))
    } else {
      d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1))
    }
    onDateChange(d)
  }, [selectedDate, viewMode, onDateChange])

  const swipe = useSwipeNavigation({
    onSwipeLeft: () => navigate('next'),
    onSwipeRight: () => navigate('prev'),
  })

  return (
    <div
      className={cn('flex flex-col h-full bg-panel focus:outline-none', className)}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigate('prev') }
        if (e.key === 'ArrowRight') { e.preventDefault(); navigate('next') }
      }}
      tabIndex={0}
    >
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
            onCreateTask={onCreatePendingTask}
          />

          {/* Time Grid */}
          <TimeGrid
            scheduledTasks={scheduledTasks}
            timeBlocks={timeBlocks}
            onTaskSelect={onTaskSelect}
            onToggleComplete={onToggleComplete}
            onCreateTask={(startTime, endTime) => {
              const dateStr = selectedDate.toISOString().split('T')[0]
              onCreateTask?.(dateStr, startTime, endTime)
            }}
            onCreateTimeBlock={(startTime, endTime, type, label, color) => {
              const dateStr = selectedDate.toISOString().split('T')[0]
              onCreateTimeBlock?.(dateStr, startTime, endTime, type, label, color)
            }}
            onRescheduleTask={onRescheduleTask}
            onUpdateTimeBlock={onUpdateTimeBlock}
            onDeleteTimeBlock={onDeleteTimeBlock}
          />
        </>
      )}

      {viewMode === 'week' && (
        <WeekView
          selectedDate={selectedDate}
          tasks={allTasks}
          pendingTasks={pendingTasks}
          timeBlocks={timeBlocks}
          onTaskSelect={onTaskSelect}
          onToggleComplete={onToggleComplete}
          onCreateTask={onCreateTask}
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
            onCreateTask?.(dateString, '09:00', '09:30')
          }}
        />
      )}
    </div>
  )
}
