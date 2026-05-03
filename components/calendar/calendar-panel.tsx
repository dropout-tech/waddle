'use client'

import { useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock, SlotType, Workspace } from '@/lib/types'
// Re-import SlotType type as it's used in the callback signature
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
  slotTypes?: SlotType[]
  workspaces: Workspace[]
  // Time range and zoom
  startHour?: number
  endHour?: number
  hourHeight?: number
  zoomLevel?: number
  onZoomChange?: (level: number) => void
  // Callbacks
  onDateChange: (date: Date) => void
  onViewModeChange: (mode: 'day' | 'week' | 'month') => void
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (date: string, startTime: string, endTime: string) => void
  onCreatePendingTask?: (title: string) => void
  onCreateTimeBlock?: (date: string, startTime: string, endTime: string, type: string, label: string, color: string, notes?: string, description?: string) => void
  onOpenCreateTask?: (slotType: SlotType, date: string, startTime: string, endTime: string) => void
  onRescheduleTask?: (taskId: string, newStartOrDate: string, newEndOrStart: string, newEnd?: string) => void
  onUnscheduleTask?: (taskId: string, date?: string) => void
  onUpdateTimeBlock?: (id: string, updates: Partial<TimeBlock>) => void
  onDeleteTimeBlock?: (id: string) => void
  // Focus mode callbacks
  onOpenJournal?: () => void
  onOpenReport?: () => void
  onOpenSettings?: () => void
  /** When the left task panel is closed, the calendar header reserves space
   * on the left so the floating reopen button doesn't cover the prev chevron. */
  leftPanelOpen?: boolean
  className?: string
}

export function CalendarPanel({
  selectedDate,
  viewMode,
  pendingTasks,
  scheduledTasks,
  allTasks,
  timeBlocks,
  slotTypes,
  workspaces,
  startHour = 0,
  endHour = 24,
  hourHeight = 60,
  zoomLevel = 2,
  onZoomChange,
  onDateChange,
  onViewModeChange,
  onTaskSelect,
  onToggleComplete,
  onCreateTask,
  onCreatePendingTask,
  onCreateTimeBlock,
  onOpenCreateTask,
  onRescheduleTask,
  onUnscheduleTask,
  onUpdateTimeBlock,
  onDeleteTimeBlock,
  onOpenJournal,
  onOpenReport,
  onOpenSettings,
  leftPanelOpen = true,
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

  // Touch swipe only — mouse drags are reserved for in-calendar interactions
  // (task block drag, time block resize, new-slot creation). Letting mouse
  // drags double as swipe-to-navigate caused tasks dragged ≥60px horizontally
  // to incorrectly trigger week navigation, making them appear to jump weeks.
  useSwipeNavigation({
    onSwipeLeft: () => navigate('next'),
    onSwipeRight: () => navigate('prev'),
    elementRef: panelRef,
    enableMouseDrag: false,
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Skip when user is typing in an input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return

    if (e.key === 'ArrowLeft') { e.preventDefault(); navigate('prev'); return }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigate('next'); return }
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); handleTodayClick(); return }
    if (e.key === 'd' || e.key === 'D') { e.preventDefault(); onViewModeChange('day'); return }
    if (e.key === 'w' || e.key === 'W') { e.preventDefault(); onViewModeChange('week'); return }
    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); onViewModeChange('month'); return }
  }

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="日曆"
      data-tour="calendar-panel"
      className={cn('flex flex-col h-full bg-panel focus:outline-none', className)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Calendar Header */}
      <CalendarHeader
        selectedDate={selectedDate}
        viewMode={viewMode}
        workspaces={workspaces}
        zoomLevel={zoomLevel}
        startHour={startHour}
        endHour={endHour}
        onZoomChange={onZoomChange}
        onDateChange={onDateChange}
        onViewModeChange={onViewModeChange}
        onTodayClick={handleTodayClick}
        onTaskClick={onTaskSelect}
        onOpenJournal={onOpenJournal}
        onOpenReport={onOpenReport}
        onOpenSettings={onOpenSettings}
        leftPanelOpen={leftPanelOpen}
      />

      {viewMode === 'day' && (
        <DayScrollView
          selectedDate={selectedDate}
          tasks={allTasks}
          timeBlocks={timeBlocks}
          slotTypes={slotTypes}
          startHour={startHour}
          endHour={endHour}
          hourHeight={hourHeight}
          onTaskSelect={onTaskSelect}
          onToggleComplete={onToggleComplete}
          onCreateTask={onCreateTask}
          onCreateTimeBlock={onCreateTimeBlock}
          onOpenCreateTask={onOpenCreateTask}
          onRescheduleTask={onRescheduleTask}
          onUnscheduleTask={onUnscheduleTask}
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
          slotTypes={slotTypes}
          startHour={startHour}
          endHour={endHour}
          hourHeight={hourHeight}
          onTaskSelect={onTaskSelect}
          onToggleComplete={onToggleComplete}
          onCreateTask={onCreateTask}
          onCreateTimeBlock={onCreateTimeBlock}
          onOpenCreateTask={onOpenCreateTask}
          onRescheduleTask={onRescheduleTask}
          onUnscheduleTask={onUnscheduleTask}
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
