'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NotificationCenter } from '@/components/notifications/notification-center'
import { ZoomIn, ZoomOut, Clock, ChevronDown, ChevronLeft, ChevronRight, BookOpen, NotebookPen, BarChart3, Settings, Sparkles, MoreHorizontal, Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { UndoRedoButtons } from '@/components/undo-redo-buttons'
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
  /** Open the "export schedule as PNG" modal. Lives in the calendar header
   *  next to journal / report / settings on desktop, in the overflow menu
   *  on mobile (where horizontal space is at a premium). */
  onOpenExport?: () => void
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
  onOpenExport,
  leftPanelOpen = true,
}: CalendarHeaderProps) {
  const isMobile = useIsMobile()
  const router = useRouter()
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  // Independent view-mode picker on mobile: tap a single button to pick 日 / 週 / 月.
  const [viewPickerOpen, setViewPickerOpen] = useState(false)
  const viewPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overflowOpen && !viewPickerOpen) return
    function onClick(ev: MouseEvent) {
      if (overflowOpen && overflowRef.current && !overflowRef.current.contains(ev.target as Node)) {
        setOverflowOpen(false)
      }
      if (viewPickerOpen && viewPickerRef.current && !viewPickerRef.current.contains(ev.target as Node)) {
        setViewPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [overflowOpen, viewPickerOpen])

  const viewModeLabel = viewMode === 'day' ? '日' : viewMode === 'week' ? '週' : '月'

  const isToday = () => {
    const today = new Date()
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    )
  }

  const getDisplayText = () => {
    // Mobile + day view: show the actual visible day so users always know
    // where they are after swiping. Desktop keeps the year + month label.
    if (isMobile && viewMode === 'day') {
      const wd = ['日', '一', '二', '三', '四', '五', '六'][selectedDate.getDay()]
      return `${selectedDate.getMonth() + 1}/${selectedDate.getDate()} 週${wd}`
    }
    return `${selectedDate.getFullYear()}年 ${selectedDate.getMonth() + 1}月`
  }

  // Step amount per chevron click: day-view nudges by one day, week-view
  // by a full week, month-view by a month. Keeps "previous / next" predictable
  // regardless of which view the user is in.
  const stepDate = (direction: -1 | 1) => {
    const next = new Date(selectedDate)
    if (viewMode === 'day') {
      next.setDate(next.getDate() + direction)
    } else if (viewMode === 'week') {
      next.setDate(next.getDate() + direction * 7)
    } else {
      next.setMonth(next.getMonth() + direction)
    }
    onDateChange(next)
  }

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
          'flex items-center justify-between gap-2 transition-[padding] duration-200',
          // Mobile uses balanced padding (no UserMenu floating overhead since
          // it lives inside the panel header on mobile). Slimmer vertical
          // rhythm on mobile so the calendar grid gets more screen estate.
          isMobile ? 'px-2.5 py-2' : 'py-3 gap-3',
          !isMobile && (leftPanelOpen ? 'pl-4 pr-14' : 'pl-16 pr-14')
        )}
      >
        {/* Left: Date Navigation */}
        <div className={cn('flex items-center flex-1 min-w-0 gap-2')}>
          {/* Prev / Next chevrons — restored 2026-05-07 because horizontal
              scroll is awkward on Windows trackpads / mice without a touch
              gesture. Click steps by the current view's natural unit
              (day / week / month).
              Mobile: visual icon stays 32px box, but the tap target grows
              to 44px via an invisible ::before overlay (same trick as the
              shadcn Button `icon` size) so it doesn't shove neighboring
              elements around — disabled on md: so desktop mouse precision
              is untouched. */}
          <button
            type="button"
            onClick={() => stepDate(-1)}
            aria-label={viewMode === 'day' ? '前一天' : viewMode === 'week' ? '前一週' : '前一個月'}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:content-[''] before:absolute before:inset-0 before:-m-1.5 md:before:hidden"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => stepDate(1)}
            aria-label={viewMode === 'day' ? '後一天' : viewMode === 'week' ? '後一週' : '後一個月'}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:content-[''] before:absolute before:inset-0 before:-m-1.5 md:before:hidden"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Month/date label — companion to the chevrons. */}
          <span
            className={cn(
              'px-1 truncate',
              isMobile ? 'text-[15px] font-semibold' : 'text-sm md:font-medium'
            )}
            aria-live="polite"
          >
            {getDisplayText()}
          </span>

          {/* View Mode picker — desktop renders inline segmented control,
              mobile renders a single button + popover so it's tappable. */}
          {!isMobile ? (
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
          ) : (
            <div className="relative" ref={viewPickerRef}>
              <button
                type="button"
                onClick={() => setViewPickerOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={viewPickerOpen}
                aria-label={`目前是${viewModeLabel}檢視，點擊更換`}
                className={cn(
                  // Mobile-only button (desktop renders the segmented control
                  // above instead) — h-11 keeps the tap target at the 44px floor.
                  'flex items-center gap-1 px-2.5 h-11 rounded-lg border border-border text-xs font-medium transition-colors',
                  'hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  viewPickerOpen && 'bg-secondary'
                )}
              >
                <span>{viewModeLabel}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', viewPickerOpen && 'rotate-180')} />
              </button>
              {viewPickerOpen && (
                <div className="absolute left-0 top-full mt-1 w-32 max-w-[calc(100vw-1.5rem)] bg-card border border-border rounded-xl shadow-lg overflow-hidden z-[60]" role="menu">
                  {([
                    { id: 'day' as const, label: '日檢視', desc: '單天時間軸' },
                    { id: 'week' as const, label: '週檢視', desc: '七天概覽' },
                    { id: 'month' as const, label: '月檢視', desc: '月曆格' },
                  ]).map(item => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => { setViewPickerOpen(false); onViewModeChange(item.id) }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors',
                        viewMode === item.id
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'hover:bg-muted/60 text-foreground'
                      )}
                    >
                      <div>{item.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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

          {/* Mobile-only overflow menu: 記事本 / 日記 / 報告 / 匯出 / 設定 */}
          {isMobile && (
            <div className="relative" ref={overflowRef}>
              <button
                type="button"
                onClick={() => setOverflowOpen(v => !v)}
                aria-label="更多"
                aria-expanded={overflowOpen}
                className="flex items-center justify-center w-11 h-11 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
              {overflowOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 max-w-[calc(100vw-1.5rem)] bg-card border border-border rounded-xl shadow-lg overflow-hidden z-[60]" role="menu">
                  <button
                    data-tour="notebook-entry"
                    onClick={() => { setOverflowOpen(false); router.push('/notebook') }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                  >
                    <NotebookPen className="w-4 h-4" />
                    <span>記事本</span>
                  </button>
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
                  {onOpenExport && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenExport() }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <Download className="w-4 h-4" />
                      <span>匯出行程</span>
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

        {/* Right: Undo/Redo / Journal / Report / Settings */}
        <div className="flex items-center gap-1">
          <UndoRedoButtons className="mr-1" />
          <button
            type="button"
            data-tour="notebook-entry"
            onClick={() => router.push('/notebook')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <NotebookPen className="w-3.5 h-3.5" aria-hidden="true" />
            記事本
          </button>
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
          {onOpenExport && (
            <button
              type="button"
              data-tour="calendar-export"
              onClick={onOpenExport}
              aria-label="匯出行程圖檔"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              匯出
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
      ? 'stroke-success'
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
          <Sparkles className="w-3.5 h-3.5 text-success" aria-hidden="true" />
        ) : (
          <span className="text-[9px] font-semibold text-foreground tabular-nums">
            {stats.completed}/{stats.total}
          </span>
        )}
      </div>
    </div>
  )
}
