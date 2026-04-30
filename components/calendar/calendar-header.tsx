'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NotificationCenter } from '@/components/notifications/notification-center'
import { ZoomIn, ZoomOut, Clock } from 'lucide-react'
import type { Workspace, Task } from '@/lib/types'

interface CalendarHeaderProps {
  selectedDate: Date
  viewMode: 'day' | 'week' | 'month'
  workspaces: Workspace[]
  // Zoom controls
  zoomLevel?: number
  startHour?: number
  endHour?: number
  onZoomChange?: (level: number) => void
  // Callbacks
  onDateChange: (date: Date) => void
  onViewModeChange: (mode: 'day' | 'week' | 'month') => void
  onTodayClick: () => void
  onTaskClick?: (task: Task) => void
}

const ZOOM_LABELS = ['緊湊', '標準', '寬鬆', '詳細']

export function CalendarHeader({
  selectedDate,
  viewMode,
  workspaces,
  zoomLevel = 2,
  startHour = 0,
  endHour = 24,
  onZoomChange,
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

        {/* Zoom Controls - Only show in day/week view */}
        {viewMode !== 'month' && onZoomChange && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/50 border border-border/50">
            <button
              onClick={() => onZoomChange(Math.max(1, zoomLevel - 1))}
              disabled={zoomLevel <= 1}
              className={cn(
                'p-1 rounded transition-colors',
                zoomLevel <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary'
              )}
              title="縮小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1 px-1.5 min-w-[52px] justify-center">
              <span className="text-[10px] text-muted-foreground">{ZOOM_LABELS[zoomLevel - 1]}</span>
            </div>
            <button
              onClick={() => onZoomChange(Math.min(4, zoomLevel + 1))}
              disabled={zoomLevel >= 4}
              className={cn(
                'p-1 rounded transition-colors',
                zoomLevel >= 4 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary'
              )}
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Time Range Display */}
        {viewMode !== 'month' && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/30 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{String(startHour).padStart(2, '0')}:00 - {String(endHour).padStart(2, '0')}:00</span>
          </div>
        )}

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
