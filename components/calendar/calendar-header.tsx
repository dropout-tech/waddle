'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NotificationCenter } from '@/components/notifications/notification-center'
import type { Workspace, Task } from '@/lib/types'

interface CalendarHeaderProps {
  selectedDate: Date
  viewMode: 'day' | 'week' | 'month'
  workspaces: Workspace[]
  onDateChange: (date: Date) => void
  onViewModeChange: (mode: 'day' | 'week' | 'month') => void
  onTodayClick: () => void
  onTaskClick?: (task: Task) => void
}

export function CalendarHeader({
  selectedDate,
  viewMode,
  workspaces,
  onDateChange,
  onViewModeChange,
  onTodayClick,
  onTaskClick,
}: CalendarHeaderProps) {
  const isToday = () => {
    const today = new Date()
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    )
  }

  const getDisplayText = () => {
    return `${selectedDate.getFullYear()}年 ${selectedDate.getMonth() + 1}月`
  }

  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
      {/* Left: Year & Month */}
      <div className="flex items-center">
        <span className="text-base font-semibold text-foreground">
          {getDisplayText()}
        </span>
      </div>

      {/* Right: View Mode + Today */}
      <div className="flex items-center gap-2">
        {/* View Mode Tabs - Clean underline style */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          {(['day', 'week', 'month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-all',
                viewMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {mode === 'day' ? '日' : mode === 'week' ? '週' : '月'}
            </button>
          ))}
        </div>

        {/* Today Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onTodayClick}
          className={cn(
            'text-xs font-medium rounded-lg h-8 border-border',
            isToday() && 'opacity-40'
          )}
          disabled={isToday()}
        >
          今天
        </Button>

        {/* Notification Center */}
        <NotificationCenter
          workspaces={workspaces || []}
          onTaskClick={onTaskClick}
        />
      </div>
    </div>
  )
}
