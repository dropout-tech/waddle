'use client'

import { useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation'
import { CalendarHeader } from './calendar-header'
import { PendingZone } from './pending-zone'
import { TimeGrid } from './time-grid'
import { DayScrollView } from './day-scroll-view'
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
  const panelRef = useRef<HTMLDivElement>(null)

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

  useSwipeNavigation({
    onSwipeLeft: () => navigate('next'),
    onSwipeRight: () => navigate('prev'),
    elementRef: panelRef,
  })

  return (
    <div
      ref={panelRef}
      className={cn('flex flex-col h-full bg-panel focus:outline-none', className)}
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
        <DayScrollView
          selectedDate={selectedDate}
          tasks={allTasks}
          timeBlocks={timeBlocks}
          onTaskSelect={onTaskSelect}
          onToggleComplete={onToggleComplete}
          onCreateTask={onCreateTask}
          onCreateTimeBlock={onCreateTimeBlock}
          onNavigate={navigate}
          onDateChange={onDateChange}
        />
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
          onCreateTimeBlock={onCreateTimeBlock}
          onNavigate={navigate}
          onDateChange={onDateChange}
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
          onNavigate={navigate}
        />
      )}
    </div>
  )
}
