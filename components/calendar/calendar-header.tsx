'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NotificationCenter } from '@/components/notifications/notification-center'
import { ZoomIn, ZoomOut, Clock, ChevronLeft, ChevronRight, BookOpen, BarChart3, Settings } from 'lucide-react'
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
  // Focus mode
  onOpenJournal?: () => void
  onOpenReport?: () => void
  onOpenSettings?: () => void
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
  onOpenJournal,
  onOpenReport,
  onOpenSettings,
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

  const handlePrevMonth = () => {
    const newDate = new Date(selectedDate)
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    onDateChange(newDate)
  }

  const handleNextMonth = () => {
    const newDate = new Date(selectedDate)
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    onDateChange(newDate)
  }

  return (
    <div className="border-b border-border bg-card">
      {/* Primary Row: Navigation + View Mode + Today */}
      <div className="flex items-center justify-between px-4 py-3 gap-4">
        {/* Left: Date Navigation */}
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors"
              title="上一個"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[140px] text-sm font-medium text-center">
              {getDisplayText()}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors"
              title="下一個"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View Mode Buttons */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden ml-auto">
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

          {/* Today + Actions */}
          <div className="flex items-center gap-2">
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
      </div>

      {/* Secondary Row: Zoom + Time Range + Focus Mode */}
      <div className="flex items-center justify-between px-4 py-2 gap-4 border-t border-border/50 bg-muted/30">
        {/* Left: Zoom Controls */}
        {viewMode !== 'month' && onZoomChange ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-medium">縮放</span>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-background border border-border/50">
              <button
                onClick={() => onZoomChange(Math.max(1, zoomLevel - 1))}
                disabled={zoomLevel <= 1}
                className={cn(
                  'p-0.5 rounded transition-colors',
                  zoomLevel <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary'
                )}
                title="縮小"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-muted-foreground min-w-[30px] text-center">
                {ZOOM_LABELS[zoomLevel - 1]}
              </span>
              <button
                onClick={() => onZoomChange(Math.min(4, zoomLevel + 1))}
                disabled={zoomLevel >= 4}
                className={cn(
                  'p-0.5 rounded transition-colors',
                  zoomLevel >= 4 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary'
                )}
                title="放大"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Time Range Display */}
            {viewMode !== 'month' && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background border border-border/50 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{String(startHour).padStart(2, '0')}:00 - {String(endHour).padStart(2, '0')}:00</span>
              </div>
            )}
          </div>
        ) : (
          <div />
        )}

        {/* Right: Journal / Report / Settings */}
        <div className="flex items-center gap-1">
          {onOpenJournal && (
            <button
              onClick={onOpenJournal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="日記"
            >
              <BookOpen className="w-3.5 h-3.5" />
              日記
            </button>
          )}
          {onOpenReport && (
            <button
              onClick={onOpenReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="報告"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              報告
            </button>
          )}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ml-1"
              title="設定"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
