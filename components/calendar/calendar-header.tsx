'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NotificationCenter } from '@/components/notifications/notification-center'
import { ZoomIn, ZoomOut, Clock, ChevronLeft, ChevronRight, BookOpen, BarChart3, Settings, Sparkles, MoreHorizontal } from 'lucide-react'
import { toDateString } from '@/lib/calendar-utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { UserMenu } from '@/components/user-menu'
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
  /** When false, the top nav row is shifted right to leave room for the
   * floating "open task panel" button at the top-left of the calendar area. */
  leftPanelOpen?: boolean
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
  leftPanelOpen = true,
}: CalendarHeaderProps) {
  const isMobile = useIsMobile()
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!overflowOpen) return
    function onClick(ev: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(ev.target as Node)) {
        setOverflowOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [overflowOpen])

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

  const navUnitLabel = viewMode === 'week' ? '週' : '月'

  return (
    <div className="border-b border-border bg-card" role="toolbar" aria-label="日曆導航">
      {/* Primary Row: Navigation + View Mode + Today.
          Reserve ~56px on the left when the task panel is closed so the
          floating reopen button doesn't overlap the prev-month chevron.
          Reserve ~56px on the right unconditionally so the floating
          UserMenu (top-3 right-3, ~40px wide) doesn't sit on top of the
          notification bell. */}
      <div
        className={cn(
          'flex items-center justify-between py-3 gap-3 transition-[padding] duration-200',
          // Mobile uses balanced padding (no UserMenu floating overhead since
          // it lives inside the panel header on mobile).
          isMobile ? 'px-3' : leftPanelOpen ? 'pl-4 pr-14' : 'pl-16 pr-14'
        )}
      >
        {/* Left: Date Navigation */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {/* Prev/next chevrons — desktop only. Mobile uses swipe. */}
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label={`上一${navUnitLabel}`}
              className="hidden md:flex p-1.5 rounded-md hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold md:font-medium md:min-w-[140px] md:text-center" aria-live="polite">
              {getDisplayText()}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label={`下一${navUnitLabel}`}
              className="hidden md:flex p-1.5 rounded-md hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* View Mode Buttons — desktop only. Mobile is forced to day view. */}
          <div
            data-tour="view-modes"
            className="hidden md:flex items-center border border-border rounded-lg overflow-hidden ml-auto"
            role="group"
            aria-label="檢視模式"
          >
            {(['day', 'week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                aria-pressed={viewMode === mode}
                aria-label={mode === 'day' ? '日檢視' : mode === 'week' ? '週檢視' : '月檢視'}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  viewMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {mode === 'day' ? '日' : mode === 'week' ? '週' : '月'}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Today + Bell + (mobile) overflow menu */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant={isToday() ? 'secondary' : 'outline'}
            size="sm"
            onClick={onTodayClick}
            aria-label={isToday() ? '已是今天' : '回到今天'}
            className={cn(
              'text-xs font-medium rounded-lg h-8 border-border transition-colors',
              isToday() && 'text-muted-foreground'
            )}
          >
            今天
          </Button>

          <div className="hidden md:block">
            <TodayProgressRing workspaces={workspaces || []} />
          </div>

          <NotificationCenter
            workspaces={workspaces || []}
            onTaskClick={onTaskClick}
          />

          {/* Inline UserMenu on mobile (replaces the floating one) */}
          {isMobile && <UserMenu className="relative" />}

          {/* Mobile-only overflow menu: 日記 / 報告 / 設定 */}
          {isMobile && (onOpenJournal || onOpenReport || onOpenSettings) && (
            <div className="relative" ref={overflowRef}>
              <button
                type="button"
                onClick={() => setOverflowOpen(v => !v)}
                aria-label="更多"
                aria-expanded={overflowOpen}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
              {overflowOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50" role="menu">
                  {onOpenJournal && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenJournal() }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>日記</span>
                    </button>
                  )}
                  {onOpenReport && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenReport() }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>報告</span>
                    </button>
                  )}
                  {onOpenSettings && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenSettings() }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <Settings className="w-4 h-4" />
                      <span>設定</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Secondary Row — desktop only. Mobile uses pinch zoom + the
          overflow menu above for journal / report / settings. */}
      <div className="hidden md:flex items-center justify-between px-4 py-2 gap-4 border-t border-border/50 bg-muted/30">
        {/* Left: Zoom Controls */}
        {viewMode !== 'month' && onZoomChange ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-medium">縮放</span>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-background border border-border/50">
              <button
                type="button"
                onClick={() => onZoomChange(Math.max(1, zoomLevel - 1))}
                disabled={zoomLevel <= 1}
                aria-label="縮小"
                className={cn(
                  'p-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  zoomLevel <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary'
                )}
              >
                <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span className="text-[10px] text-muted-foreground min-w-[30px] text-center" aria-live="polite">
                {ZOOM_LABELS[zoomLevel - 1]}
              </span>
              <button
                type="button"
                onClick={() => onZoomChange(Math.min(4, zoomLevel + 1))}
                disabled={zoomLevel >= 4}
                aria-label="放大"
                className={cn(
                  'p-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  zoomLevel >= 4 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary'
                )}
              >
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {/* Time Range Display */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background border border-border/50 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{String(startHour).padStart(2, '0')}:00 - {String(endHour).padStart(2, '0')}:00</span>
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* Right: Journal / Report / Settings */}
        <div className="flex items-center gap-1">
          {onOpenJournal && (
            <button
              type="button"
              onClick={onOpenJournal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              日記
            </button>
          )}
          {onOpenReport && (
            <button
              type="button"
              onClick={onOpenReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              報告
            </button>
          )}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="設定"
              className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// TodayProgressRing — at-a-glance ring showing today's task completion.
// Hover for breakdown. Empty state shows a sparkle icon as a friendly prompt.
// ────────────────────────────────────────────────────────────────────────────

interface TodayProgressRingProps {
  workspaces: Workspace[]
}

function TodayProgressRing({ workspaces }: TodayProgressRingProps) {
  const stats = useMemo(() => {
    const today = toDateString(new Date())
    let total = 0
    let completed = 0
    for (const ws of workspaces) {
      if (ws.isArchived) continue
      for (const cat of ws.categories) {
        if (cat.isArchived) continue
        for (const t of cat.tasks) {
          // "Today" = scheduled today OR (no schedule but due today)
          const matches =
            t.scheduledDate === today ||
            (!t.scheduledDate && t.dueDate === today)
          if (!matches) continue
          total++
          if (t.isCompleted) completed++
        }
      }
    }
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
    return { total, completed, pct, allDone: total > 0 && completed === total }
  }, [workspaces])

  const r = 12
  const c = 2 * Math.PI * r
  const dash = (stats.pct / 100) * c

  // Color shifts as the user makes progress: muted → primary → emerald.
  const stroke =
    stats.allDone
      ? 'stroke-emerald-500'
      : stats.pct > 0
      ? 'stroke-primary'
      : 'stroke-muted-foreground/30'

  const tooltip =
    stats.total === 0
      ? '今日尚無排程任務'
      : stats.allDone
      ? `今天 ${stats.total} 個任務全部完成 ✨`
      : `今天 ${stats.completed} / ${stats.total} 完成 · ${stats.pct}%`

  return (
    <div
      className="relative w-9 h-8 flex items-center justify-center group"
      title={tooltip}
      aria-label={tooltip}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" className="transform -rotate-90">
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          strokeWidth="2.5"
          className="stroke-muted/40"
        />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className={cn(stroke, 'transition-[stroke-dasharray,stroke] duration-500 ease-out')}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {stats.total === 0 ? (
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground/50" aria-hidden="true" />
        ) : stats.allDone ? (
          <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" aria-hidden="true" />
        ) : (
          <span className="text-[9px] font-semibold text-foreground tabular-nums">
            {stats.completed}/{stats.total}
          </span>
        )}
      </div>
    </div>
  )
}
