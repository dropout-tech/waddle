'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NotificationCenter } from '@/components/notifications/notification-center'
import { ZoomIn, ZoomOut, Clock, ChevronDown, ChevronLeft, ChevronRight, BookOpen, NotebookPen, BarChart3, Settings, Sparkles, MoreHorizontal, Download, Users, Bell, CircleUser, Eye, EyeOff, StickyNote as StickyNoteIcon, Plus } from 'lucide-react'
import { UndoRedoButtons } from '@/components/undo-redo-buttons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toDateString } from '@/lib/calendar-utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { UserMenu } from '@/components/user-menu'
import { useNotebookOverlay } from '@/components/notebook/notebook-overlay-provider'
import { useStickyNotesToggle } from '@/components/sticky-notes/sticky-notes-provider'
import { isPeerVisible, type SharePeer } from '@/hooks/use-calendar-sharing'
import { User as UserIcon } from 'lucide-react'
import type { Workspace, Task } from '@/lib/types'
import { useI18n } from '@/lib/i18n/react'
import { format } from 'date-fns'
import { HuddleFootprints } from '@/components/growth/huddle-footprints'
import { HubLauncherButton } from '@/components/floating/hub-launcher-button'

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
  onOpenGrowth?: () => void
  onOpenSettings?: () => void
  onOpenMeetings?: () => void
  pendingMeetingCount?: number
  onOpenSharing?: () => void
  onOpenOverdueReview?: () => void
  /** Open the "export schedule as PNG" modal. Lives in the calendar header
   *  next to journal / report / settings on desktop, in the overflow menu
   *  on mobile (where horizontal space is at a premium). */
  onOpenExport?: () => void
  /** When false, the top nav row is shifted right to leave room for the
   * floating "open task panel" button at the top-left of the calendar area. */
  leftPanelOpen?: boolean
  // Calendar sharing — connected peers + per-peer overlay visibility toggle.
  // When there are no peers, nothing sharing-related renders at all.
  sharePeers?: SharePeer[]
  visiblePeers?: Record<string, boolean>
  onTogglePeerVisible?: (peerId: string) => void
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
  onOpenGrowth,
  onOpenSettings,
  onOpenMeetings,
  pendingMeetingCount = 0,
  onOpenSharing,
  onOpenOverdueReview,
  onOpenExport,
  leftPanelOpen = true,
  sharePeers = [],
  visiblePeers = {},
  onTogglePeerVisible,
}: CalendarHeaderProps) {
  const isMobile = useIsMobile()
  const { t, lang } = useI18n()
  const { open: openNotebook } = useNotebookOverlay()
  const stickyNotes = useStickyNotesToggle()
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  // Independent view-mode picker on mobile: tap a single button to pick 日 / 週 / 月.
  const [viewPickerOpen, setViewPickerOpen] = useState(false)
  const viewPickerRef = useRef<HTMLDivElement>(null)
  // Mobile: bell / avatar / peer chips live inside the ⋯ menu so the date
  // title never gets truncated. These drive the (trigger-less) panels.
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [notifHigh, setNotifHigh] = useState(false)
  const handleNotifCount = useCallback((n: number, high: boolean) => {
    setNotifCount(n)
    setNotifHigh(high)
  }, [])

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

  // Bare "日/週/月" collide with WEEKDAY_NAMES' "日" (Sunday) in the shared
  // t() dictionary — a single-char key can't carry two unrelated meanings.
  // Resolve the compact view-mode label directly per language instead of
  // routing it through t().
  const dayWeekMonthLabel = (mode: 'day' | 'week' | 'month') =>
    lang === 'en'
      ? mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : 'Month'
      : mode === 'day' ? '日' : mode === 'week' ? '週' : '月'

  const viewModeLabel = dayWeekMonthLabel(viewMode)

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
      if (lang === 'en') return format(selectedDate, 'M/d EEE')
      const wd = ['日', '一', '二', '三', '四', '五', '六'][selectedDate.getDay()]
      return `${selectedDate.getMonth() + 1}/${selectedDate.getDate()} 週${wd}`
    }
    if (lang === 'en') return format(selectedDate, isMobile ? 'MMM yyyy' : 'MMMM yyyy')
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
    <div className="border-b border-border bg-card" role="toolbar" aria-label={t('日曆導航')}>
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
            aria-label={viewMode === 'day' ? t('前一天') : viewMode === 'week' ? t('前一週') : t('前一個月')}
            className="relative flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:content-[''] before:absolute before:inset-0 before:-m-1.5 md:before:hidden"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => stepDate(1)}
            aria-label={viewMode === 'day' ? t('後一天') : viewMode === 'week' ? t('後一週') : t('後一個月')}
            className="relative flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:content-[''] before:absolute before:inset-0 before:-m-1.5 md:before:hidden"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Month/date label — companion to the chevrons. */}
          <span
            className={cn(
              'px-1 truncate',
              isMobile ? 'text-[15px] font-semibold whitespace-nowrap' : 'text-sm md:font-medium'
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
              aria-label={t('檢視模式')}
            >
              {(['day', 'week', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onViewModeChange(mode)}
                  aria-pressed={viewMode === mode}
                  aria-label={mode === 'day' ? t('日檢視') : mode === 'week' ? t('週檢視') : t('月檢視')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    viewMode === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  {dayWeekMonthLabel(mode)}
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
                aria-label={
                  viewMode === 'day'
                    ? t('目前是日檢視，點擊更換')
                    : viewMode === 'week'
                    ? t('目前是週檢視，點擊更換')
                    : t('目前是月檢視，點擊更換')
                }
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
                <div className="absolute left-0 top-full mt-1 w-32 max-w-[calc(100vw-1.5rem)] bg-card border border-border rounded-xl shadow-lg overflow-hidden z-popover" role="menu">
                  {([
                    { id: 'day' as const, label: t('日檢視'), desc: t('單天時間軸') },
                    { id: 'week' as const, label: t('週檢視'), desc: t('七天概覽') },
                    { id: 'month' as const, label: t('月檢視'), desc: t('月曆格') },
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
            aria-label={isToday() ? t('已是今天') : t('回到今天')}
            className={cn(
              'text-xs font-medium rounded-lg border-border transition-colors',
              isMobile ? 'h-11 px-3' : 'h-8',
              isToday() && 'text-muted-foreground'
            )}
          >
            {t('今天')}
          </Button>

          <div className="hidden md:block">
            <TodayProgressRing workspaces={workspaces || []} />
          </div>

          {!isMobile && (
            <NotificationCenter
              workspaces={workspaces || []}
              onTaskClick={onTaskClick}
              onReviewOverdue={onOpenOverdueReview}
            />
          )}

          {/* Mobile-only overflow menu. Keep the permanent desktop hierarchy,
              but adapt it to one touch-safe menu instead of squeezing five
              icons into the already dense primary row. */}
          {isMobile && (
            <div className="relative" ref={overflowRef}>
              <button
                type="button"
                data-tour="mobile-more"
                onClick={() => setOverflowOpen(v => !v)}
                aria-label={notifCount > 0 ? t('更多（{n} 則通知）', { n: notifCount }) : t('更多')}
                aria-expanded={overflowOpen}
                className="relative flex items-center justify-center w-11 h-11 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
                {notifCount > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white',
                      notifHigh ? 'bg-urgency-critical' : 'bg-urgency-high',
                    )}
                  >
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </button>
              {/* Trigger-less panels opened from the menu below. */}
              <NotificationCenter
                workspaces={workspaces || []}
                onTaskClick={onTaskClick}
                onReviewOverdue={onOpenOverdueReview}
                hideTrigger
                open={notifOpen}
                onOpenChange={setNotifOpen}
                onCountChange={handleNotifCount}
              />
              <UserMenu
                className="absolute right-0 top-full"
                hideTrigger
                open={userMenuOpen}
                onOpenChange={setUserMenuOpen}
              />
              {overflowOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-8rem)] overflow-y-auto bg-card border border-border rounded-xl shadow-lg z-popover" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    data-tour="notification-center"
                    onClick={() => { setOverflowOpen(false); setNotifOpen(true) }}
                    className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                  >
                    <Bell className="w-4 h-4" />
                    <span className="flex-1 text-left">{t('通知')}</span>
                    {notifCount > 0 && (
                      <span className={cn('rounded-full px-1.5 text-[11px] font-semibold text-white', notifHigh ? 'bg-urgency-critical' : 'bg-urgency-high')}>
                        {notifCount > 9 ? '9+' : notifCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-tour="user-menu"
                    onClick={() => { setOverflowOpen(false); setUserMenuOpen(true) }}
                    className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                  >
                    <CircleUser className="w-4 h-4" />
                    <span>{t('帳號')}</span>
                  </button>
                  {sharePeers.length > 0 && onTogglePeerVisible && (
                    <div className="border-y border-border/60 py-1" role="group" aria-label={t('共享行事曆顯示')}>
                      <div className="px-3 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground">{t('共享對象')}</div>
                      {sharePeers.map((peer) => {
                        const visible = isPeerVisible(visiblePeers, peer.peerId)
                        const name = peer.displayName || t('未命名使用者')
                        return (
                          <button
                            key={peer.peerId}
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={visible}
                            onClick={() => onTogglePeerVisible(peer.peerId)}
                            className={cn(
                              'w-full min-h-11 flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60 transition-colors',
                              visible ? 'text-foreground' : 'text-muted-foreground'
                            )}
                          >
                            <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {peer.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer
                                <img src={peer.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <UserIcon className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                              )}
                            </span>
                            <span className="flex-1 min-w-0 truncate text-left">{name}</span>
                            {visible ? <Eye className="w-4 h-4 text-primary" aria-hidden="true" /> : <EyeOff className="w-4 h-4" aria-hidden="true" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <button
                    data-tour="notebook-entry"
                    onClick={() => { setOverflowOpen(false); openNotebook() }}
                    className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                  >
                    <NotebookPen className="w-4 h-4" />
                    <span>{t('記事本')}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={stickyNotes.enabled}
                    data-tour="sticky-notes-toggle"
                    onClick={() => stickyNotes.toggle()}
                    className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                  >
                    <StickyNoteIcon className="w-4 h-4" />
                    <span>{stickyNotes.enabled ? t('隱藏便條紙') : t('顯示便條紙')}</span>
                  </button>
                  {stickyNotes.enabled && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOverflowOpen(false); stickyNotes.addNote() }}
                      className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 pl-9 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{t('新增便條紙')}</span>
                    </button>
                  )}
                  {onOpenMeetings && <button type="button" onClick={() => { setOverflowOpen(false); onOpenMeetings() }} className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60"><Users className="h-4 w-4"/><span>{lang === 'en' ? 'Find a time' : '約交集'}</span>{pendingMeetingCount > 0 && <span className="rounded-full bg-primary px-1.5 text-primary-foreground">{pendingMeetingCount}</span>}</button>}
                  {onOpenSharing && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenSharing() }}
                      className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <Users className="w-4 h-4" />
                      <span>{t('共享')}</span>
                    </button>
                  )}
                  {onOpenJournal && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenJournal() }}
                      className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>{t('日記')}</span>
                    </button>
                  )}
                  {onOpenReport && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenReport() }}
                      className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>{t('報告')}</span>
                    </button>
                  )}
                  {onOpenGrowth && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenGrowth() }}
                      className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <HuddleFootprints className="h-4 w-4 gap-0.5" />
                      <span>{t('每日簽到')}</span>
                    </button>
                  )}
                  {onOpenExport && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenExport() }}
                      className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <Download className="w-4 h-4" />
                      <span>{t('匯出行程')}</span>
                    </button>
                  )}
                  {onOpenSettings && (
                    <button
                      onClick={() => { setOverflowOpen(false); onOpenSettings() }}
                      className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
                    >
                      <Settings className="w-4 h-4" />
                      <span>{t('設定')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Secondary Row — desktop only. Mobile uses pinch zoom + the
          overflow menu above for journal / report / settings.
          Peer chips (2026-09-26): used to be their own row that existed
          only to hold one avatar pill, pushing the calendar grid down.
          Now folded into this row's left side, next to zoom, so calendar
          height is identical whether or not anyone is sharing with you. */}
      <div className="hidden md:flex items-center justify-between px-4 py-2 gap-4 border-t border-border/50 bg-muted/30">
        {/* Left: Zoom Controls + shared-peer avatar stack */}
        <div className="flex items-center gap-3 min-w-0">
          {viewMode !== 'month' && onZoomChange && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-muted-foreground font-medium">{t('縮放')}</span>
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-background border border-border/50">
                <button
                  type="button"
                  onClick={() => onZoomChange(Math.max(1, zoomLevel - 1))}
                  disabled={zoomLevel <= 1}
                  aria-label={t('縮小')}
                  className={cn(
                    'p-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    zoomLevel <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary'
                  )}
                >
                  <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span className="text-[10px] text-muted-foreground min-w-[30px] text-center" aria-live="polite">
                  {t(ZOOM_LABELS[zoomLevel - 1])}
                </span>
                <button
                  type="button"
                  onClick={() => onZoomChange(Math.min(4, zoomLevel + 1))}
                  disabled={zoomLevel >= 4}
                  aria-label={t('放大')}
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
          )}

          {/* Shared-peer avatars — overlapping stack, tap toggles that
              peer's overlay on/off. Capped at 4 visible avatars; the rest
              collapse into a "+N" badge (names listed in its tooltip) so
              the row never grows taller or wraps regardless of peer count. */}
          {sharePeers.length > 0 && onTogglePeerVisible && (
            <div
              className="flex items-center -space-x-2 flex-shrink-0"
              role="group"
              aria-label={t('共享行事曆顯示')}
            >
              {sharePeers.slice(0, 4).map((peer) => {
                const visible = isPeerVisible(visiblePeers, peer.peerId)
                const name = peer.displayName || t('未命名使用者')
                return (
                  <button
                    key={peer.peerId}
                    type="button"
                    onClick={() => onTogglePeerVisible(peer.peerId)}
                    aria-pressed={visible}
                    title={visible ? t('點擊隱藏 {name} 的行事曆', { name }) : t('點擊顯示 {name} 的行事曆', { name })}
                    className={cn(
                      'relative w-6 h-6 rounded-full border-2 border-card flex items-center justify-center overflow-hidden transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-10',
                      visible ? 'bg-primary/10' : 'bg-muted opacity-50'
                    )}
                  >
                    {peer.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer
                      <img src={peer.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-3 h-3 text-primary" aria-hidden="true" />
                    )}
                  </button>
                )
              })}
              {sharePeers.length > 4 && (
                <div
                  className="relative w-6 h-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[9px] font-semibold text-muted-foreground"
                  title={sharePeers.slice(4).map((p) => p.displayName || t('未命名使用者')).join('、')}
                >
                  +{sharePeers.length - 4}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: frequent tools stay visible; lower-frequency views live in
            one stable disclosure menu so the toolbar never grows sideways. */}
        <div className="flex items-center gap-1">
          <UndoRedoButtons className="mr-1" />
          {/* 常駐的懸浮小視窗啟動鈕——不必先開計時（不支援 PiP 的環境自動不顯示） */}
          <HubLauncherButton />
          <button
            type="button"
            data-tour="notebook-entry"
            onClick={openNotebook}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <NotebookPen className="w-3.5 h-3.5" aria-hidden="true" />
            {t('記事本')}
          </button>
          <button
            type="button"
            data-tour="sticky-notes-toggle"
            onClick={() => stickyNotes.toggle()}
            aria-pressed={stickyNotes.enabled}
            aria-label={stickyNotes.enabled ? t('隱藏便條紙') : t('顯示便條紙')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              stickyNotes.enabled
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            <StickyNoteIcon className="w-3.5 h-3.5" aria-hidden="true" />
            {t('便條紙')}
          </button>
          {stickyNotes.enabled && (
            <button
              type="button"
              onClick={() => stickyNotes.addNote()}
              aria-label={t('新增便條紙')}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          {onOpenSharing && (
            <button
              type="button"
              onClick={onOpenSharing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              {t('共享')}
            </button>
          )}
          <DropdownMenu open={toolsOpen} onOpenChange={setToolsOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-tour="calendar-export"
                aria-label={t('更多工具')}
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  toolsOpen && 'bg-secondary text-foreground'
                )}
              >
                <ChevronDown
                  className={cn(
                    'w-3.5 h-3.5 transition-transform duration-200 motion-reduce:transition-none',
                    toolsOpen && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-xl p-1.5">
              {onOpenMeetings && (
                <DropdownMenuItem onSelect={onOpenMeetings} className="gap-2.5 rounded-lg py-2 text-xs justify-between">
                  <span className="flex items-center gap-2.5">
                    <Users className="w-3.5 h-3.5" />
                    {lang === 'en' ? 'Find a time' : '約交集'}
                  </span>
                  {pendingMeetingCount > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{pendingMeetingCount}</span>
                  )}
                </DropdownMenuItem>
              )}
              {onOpenJournal && (
                <DropdownMenuItem onSelect={onOpenJournal} className="gap-2.5 rounded-lg py-2 text-xs">
                  <BookOpen className="w-3.5 h-3.5" />
                  {t('日記')}
                </DropdownMenuItem>
              )}
              {onOpenReport && (
                <DropdownMenuItem onSelect={onOpenReport} className="gap-2.5 rounded-lg py-2 text-xs">
                  <BarChart3 className="w-3.5 h-3.5" />
                  {t('報告')}
                </DropdownMenuItem>
              )}
              {onOpenGrowth && (
                <DropdownMenuItem onSelect={onOpenGrowth} className="gap-2.5 rounded-lg py-2 text-xs">
                  <HuddleFootprints className="h-3.5 w-4 gap-0.5" />
                  {t('每日簽到')}
                </DropdownMenuItem>
              )}
              {onOpenExport && (
                <DropdownMenuItem
                  onSelect={onOpenExport}
                  className="gap-2.5 rounded-lg py-2 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t('匯出')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={t('設定')}
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
  const { t } = useI18n()
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
      ? t('今日尚無排程任務')
      : stats.allDone
      ? t('今天 {total} 個任務全部完成 ✨', { total: stats.total })
      : t('今天 {completed} / {total} 完成 · {pct}%', { completed: stats.completed, total: stats.total, pct: stats.pct })

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
