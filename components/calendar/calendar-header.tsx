'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/task-utils'
import { Button } from '@/components/ui/button'

interface CalendarHeaderProps {
  selectedDate: Date
  viewMode: 'day' | 'week' | 'month'
  onDateChange: (date: Date) => void
  onViewModeChange: (mode: 'day' | 'week' | 'month') => void
  onTodayClick: () => void
}

export function CalendarHeader({
  selectedDate,
  viewMode,
  onDateChange,
  onViewModeChange,
  onTodayClick,
}: CalendarHeaderProps) {
  const handlePrevDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 1)
    onDateChange(newDate)
  }

  const handleNextDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 1)
    onDateChange(newDate)
  }

  const isToday = () => {
    const today = new Date()
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    )
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-panel">
      {/* Left: Date Navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handlePrevDay}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-base font-bold font-mono text-foreground min-w-[180px] text-center">
          {formatDate(selectedDate)}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleNextDay}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: View Mode + Today */}
      <div className="flex items-center gap-3">
        {/* View Mode Pills */}
        <div className="flex items-center bg-secondary/50 rounded-lg p-0.5 border border-border">
          {(['day', 'week', 'month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => mode === 'day' && onViewModeChange(mode)}
              disabled={mode !== 'day'}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                viewMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                mode !== 'day' && 'opacity-50 cursor-not-allowed'
              )}
            >
              {mode === 'day' ? '日' : mode === 'week' ? '週' : '月'}
            </button>
          ))}
        </div>

        {/* Today Button */}
        <Button
          variant={isToday() ? 'secondary' : 'default'}
          size="sm"
          onClick={onTodayClick}
          className={cn(
            'text-xs font-medium',
            isToday() && 'opacity-50'
          )}
          disabled={isToday()}
        >
          今天
        </Button>
      </div>
    </div>
  )
}
