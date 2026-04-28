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
  const handlePrev = () => {
    const newDate = new Date(selectedDate)
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() - 1)
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    onDateChange(newDate)
  }

  const handleNext = () => {
    const newDate = new Date(selectedDate)
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + 1)
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
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

  // Format week range
  const getWeekRange = () => {
    const start = new Date(selectedDate)
    const day = start.getDay()
    start.setDate(start.getDate() - day)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    
    const startStr = `${start.getMonth() + 1}/${start.getDate()}`
    const endStr = `${end.getMonth() + 1}/${end.getDate()}`
    return `${start.getFullYear()} 年 ${startStr} - ${endStr}`
  }

  const getDisplayText = () => {
    if (viewMode === 'week') {
      return getWeekRange()
    }
    return formatDate(selectedDate)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-panel rounded-t-xl">
      {/* Left: Date Navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-secondary"
          onClick={handlePrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-base font-bold font-mono text-foreground min-w-[200px] text-center">
          {getDisplayText()}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-secondary"
          onClick={handleNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: View Mode + Today */}
      <div className="flex items-center gap-3">
        {/* View Mode Pills */}
        <div className="flex items-center bg-secondary/50 rounded-full p-1 border border-border">
          {(['day', 'week', 'month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              disabled={mode === 'month'}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full transition-all',
                viewMode === mode
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                mode === 'month' && 'opacity-50 cursor-not-allowed'
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
            'text-xs font-medium rounded-full',
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
