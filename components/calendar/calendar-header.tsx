'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
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

  // Format week range — week starts on Saturday (matching WeekView)
  const getWeekRange = () => {
    const start = new Date(selectedDate)
    const day = start.getDay() // 0=Sun … 6=Sat
    const diff = day === 6 ? 0 : -(day + 1)
    start.setDate(start.getDate() + diff)

    const end = new Date(start)
    end.setDate(start.getDate() + 6)

    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`

    // If week spans two months show both month numbers
    if (start.getMonth() !== end.getMonth()) {
      return `${start.getFullYear()}年 ${fmt(start)} - ${fmt(end)}`
    }
    return `${start.getFullYear()}年 ${start.getMonth() + 1}月 ${start.getDate()}-${end.getDate()}日`
  }

  const getDisplayText = () => {
    if (viewMode === 'day') {
      return `${selectedDate.getFullYear()}年 ${selectedDate.getMonth() + 1}月 ${selectedDate.getDate()}日`
    }
    if (viewMode === 'week') return getWeekRange()
    return `${selectedDate.getFullYear()}年 ${selectedDate.getMonth() + 1}月`
  }

  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
      {/* Left: Date Navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-muted"
          onClick={handlePrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-[180px] text-center">
          <span className="text-base font-semibold text-foreground">
            {getDisplayText()}
          </span>
          {viewMode === 'day' && (
            <span className="ml-2 text-xs text-muted-foreground">
              ({selectedDate.toLocaleDateString('zh-TW', { weekday: 'short' })})
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-muted"
          onClick={handleNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: View Mode + Today */}
      <div className="flex items-center gap-2">
        {/* View Mode Tabs - Clean underline style */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          {(['day', 'week', 'month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              disabled={mode === 'month'}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-all',
                viewMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                mode === 'month' && 'opacity-40 cursor-not-allowed'
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
      </div>
    </div>
  )
}
