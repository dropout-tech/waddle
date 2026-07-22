'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ResizeHandle } from './resize-handle'
import { TaskPanel } from '@/components/task-panel/task-panel'
import { FullScreenTaskView } from '@/components/task-panel/full-screen-task-view'
import { CalendarPanel } from '@/components/calendar/calendar-panel'
import { CalendarExportModal } from '@/components/calendar/calendar-export-modal'
import { PanelLeftOpen, BookOpen, BarChart3, Minimize2, ListChecks, CalendarDays, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { ReportDashboard } from '@/components/reports/report-dashboard'
import { FocusScratchpad } from '@/components/scratchpad/focus-scratchpad'
import { FocusTimer } from '@/components/timer/focus-timer'
import { CommandPalette } from '@/components/command-palette'
import { ErrorBoundary } from '@/components/error-boundary'
import { toDateString } from '@/lib/calendar-utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useWideScreen } from '@/hooks/use-wide-screen'
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation'
import { useCalendarSharing, usePeerCalendarEvents } from '@/hooks/use-calendar-sharing'
import { hapticSelection } from '@/lib/haptics'
import type { Workspace, Task, TimeBlock, SlotType, UserSettings, QuickLink, ScratchpadItem } from '@/lib/types'
import { QuickLinksBar } from '@/components/quick-links/quick-links-bar'
import { Link2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n/react'
import { GrowthJourneyDashboard } from '@/components/growth/growth-journey-dashboard'
import { HuddleFootprints } from '@/components/growth/huddle-footprints'

interface MainLayoutProps {
  workspaces: Workspace[]
  timeBlocks: TimeBlock[]
  slotTypes?: SlotType[]
  settings: UserSettings
  onToggleCategoryCollapse: (categoryId: string) => void
  onReorderCategories?: (workspaceId: string, orderedCategoryIds: string[]) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task, occurrenceDate?: string) => void
  onAddTask: (categoryId: string, title: string) => void
  onAddCategory?: (workspaceId: string, name: string) => void
  onDeleteCategory?: (categoryId: string) => void
  onSendTaskToCalendar?: (taskId: string, date: string, startTime?: string, endTime?: string) => void
  onAddWorkspace?: (name: string, color: string, icon: string) => void
  onUpdateWorkspaceColor?: (workspaceId: string, color: string) => void
  onUpdateWorkspace?: (workspaceId: string, updates: Partial<Pick<Workspace, 'name' | 'color' | 'icon'>>) => void
  onDeleteWorkspace?: (workspaceId: string) => void
  onArchiveWorkspace?: (workspaceId: string) => void
  onOpenSettings?: () => void
  onOpenOverdueReview?: () => void
  onCreateCalendarTask?: (date: string, startTime?: string, endTime?: string) => void
  onCreatePendingTask?: (title: string) => void
  onCreateCalendarTimeBlock?: (date: string, startTime: string, endTime: string, type: string, label: string, color: string, notes?: string, description?: string) => void
  onOpenCreateTask?: (slotType: SlotType, date: string, startTime: string, endTime: string) => void
  onRescheduleTask?: (taskId: string, newStart: string, newEnd: string) => void
  onUnscheduleTask?: (taskId: string, date?: string) => void
  onUpdateTimeBlock?: (id: string, updates: Partial<TimeBlock>) => void
  onDeleteTimeBlock?: (id: string) => void
  onTimeBlockSelect?: (block: TimeBlock) => void
  /** Narrow mutation for the quick-links bar (separate from saveSettings). */
  onSetQuickLinks?: (next: QuickLink[]) => void
  // Scratchpad — DB-backed; per-date map plus narrow mutations.
  scratchpadByDate?: Record<string, ScratchpadItem[]>
  onAddScratchpadItem?: (date: string, item: ScratchpadItem) => void
  onUpdateScratchpadItem?: (id: string, patch: Partial<ScratchpadItem>) => void
  onDeleteScratchpadItem?: (id: string) => void
  onReorderScratchpadItems?: (date: string, items: ScratchpadItem[]) => void
  onClearScratchpadDate?: (date: string) => void
  onPromoteToTask?: (title: string, description: string | undefined, sourceId: string) => void
}

const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 600
const DEFAULT_PANEL_WIDTH = 400

// Third column (review pane) — only mounted at ≥1680px, see use-wide-screen.
const REVIEW_PANE_WIDTH = 400
const REVIEW_PANE_COLLAPSED_WIDTH = 40
// Same per-device localStorage pattern as waddle-quick-links-open-v1.
const REVIEW_PANE_KEY = 'waddle-review-pane-open-v1'

export function MainLayout({
  workspaces,
  timeBlocks,
  slotTypes,
  settings,
  onToggleCategoryCollapse,
  onReorderCategories,
  onToggleComplete,
  onSelectTask,
  onAddTask,
  onAddCategory,
  onDeleteCategory,
  onSendTaskToCalendar,
  onAddWorkspace,
  onUpdateWorkspaceColor,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onArchiveWorkspace,
  onOpenSettings,
  onOpenOverdueReview,
  onCreateCalendarTask,
  onCreatePendingTask,
  onCreateCalendarTimeBlock,
  onOpenCreateTask,
  onRescheduleTask,
  onUnscheduleTask,
  onUpdateTimeBlock,
  onDeleteTimeBlock,
  onTimeBlockSelect,
  onSetQuickLinks,
  scratchpadByDate,
  onAddScratchpadItem,
  onUpdateScratchpadItem,
  onDeleteScratchpadItem,
  onReorderScratchpadItems,
  onClearScratchpadDate,
  onPromoteToTask,
}: MainLayoutProps) {
  const { t, lang } = useI18n()
  const isMobile = useIsMobile()
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
  // Export-as-image modal — lives here because all the required data
  // (workspaces, timeBlocks, selectedDate, settings.calendarStartHour/EndHour)
  // is already in scope. Toggled by the export button in CalendarHeader.
  const [exportModalOpen, setExportModalOpen] = useState(false)

  // Mobile single-panel tab. Only consulted when isMobile === true.
  const [mobileTab, setMobileTab] = useState<'tasks' | 'calendar'>('calendar')
  // Mobile-only overlay: pull-up sheet for the quick-links bar (parity
  // with scratchpad's pull-down). Toggled from the "連結" tab in the
  // bottom bar; mutually exclusive with scratchpad open state.
  const [mobileLinksOpen, setMobileLinksOpen] = useState(false)
  // Mobile-only — drives the FocusScratchpad open/close from the bottom tab bar.
  const [mobileScratchpadOpen, setMobileScratchpadOpen] = useState(false)
  // Mobile horizontal swipe between Tasks and Calendar tabs.
  // Lower thresholds than the desktop calendar swipe — phone gestures are
  // shorter and faster, and tab switching is binary (no chance of skipping
  // an intermediate state) so being eager is fine.
  const mobileContentRef = useRef<HTMLDivElement>(null)
  useSwipeNavigation({
    elementRef: mobileContentRef,
    threshold: 40,
    directionRatio: 1.4,
    onSwipeLeft: () => {
      // Tasks → Calendar. Calendar's own day-scroll consumes left swipes
      // when it's the active tab, so this only fires from the tasks tab.
      if (mobileTab === 'tasks') setMobileTab('calendar')
    },
    onSwipeRight: () => {
      // Calendar → Tasks. The day-scroll-view normally swallows horizontal
      // gestures into its own scroll-snap navigation, so this rarely fires
      // from the calendar; the dedicated edge-swipe catcher below covers
      // that path.
      if (mobileTab === 'calendar') setMobileTab('tasks')
    },
  })

  // Calendar → Tasks edge swipe. The calendar tab embeds a horizontal
  // scrolling day strip that natively absorbs horizontal pans, so the main
  // swipe handler above can never fire from inside the grid. To still let
  // users get back to the task list with a gesture, we attach a thin
  // capture zone hugging the left screen edge. Pans starting there get
  // their default scroll prevented and routed to a tab switch instead —
  // mirroring the iOS "back" edge swipe people already know.
  const leftEdgeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = leftEdgeRef.current
    if (!isMobile || mobileTab !== 'calendar' || !el) return

    let startX = 0
    let startY = 0
    let active = false
    let committed = false

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      active = true
      committed = false
    }
    const onMove = (e: TouchEvent) => {
      if (!active) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      // Once we're confident this is a horizontal-rightward gesture, take
      // it over so the inner scroll doesn't compete.
      if (!committed && dx > 8 && dx > dy * 1.4) {
        committed = true
      }
      if (committed) e.preventDefault()
    }
    const onEnd = (e: TouchEvent) => {
      if (!active) return
      active = false
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      if (committed && dx > 40 && dx > dy * 1.4) {
        setMobileTab('tasks')
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [isMobile, mobileTab])

  // Sidebar visibility states
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true)

  // ≥1680px third column: always-on review pane (溫柔覆盤). Collapsed state
  // is a per-device preference; default is open. isWide is false during
  // hydration (see getServerSnapshot), so SSR markup never contains the pane.
  const isWide = useWideScreen()
  const [isReviewPaneOpen, setIsReviewPaneOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(REVIEW_PANE_KEY) !== '0'
  })
  useEffect(() => {
    try { window.localStorage.setItem(REVIEW_PANE_KEY, isReviewPaneOpen ? '1' : '0') } catch {}
  }, [isReviewPaneOpen])
  // Gentle attention pulse on the pane when the header 報告 button is pressed
  // while the pane is already visible (replaces the old full-page takeover).
  const [reviewFlash, setReviewFlash] = useState(false)
  const reviewFlashTimer = useRef<number | null>(null)
  const reviewScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => {
    if (reviewFlashTimer.current) window.clearTimeout(reviewFlashTimer.current)
  }, [])

  // Focus mode for journal/report (full screen view)
  const [focusMode, setFocusMode] = useState<'none' | 'journal' | 'report' | 'growth'>('none')
  
  // Calendar zoom level - controls hour height and visible time range
  // Zoom levels: 1 = compact (40px/hour), 2 = normal (60px/hour), 3 = expanded (80px/hour), 4 = detailed (100px/hour)
  const [zoomLevel, setZoomLevel] = useState(2)
  
  // Calculate hour height based on zoom level
  const hourHeights = [40, 60, 80, 100]
  const hourHeight = hourHeights[zoomLevel - 1] || 60
  
  // Time range from settings (with defensive fallbacks)
  const startHour = settings?.calendarStartHour ?? 0
  const endHour = settings?.calendarEndHour ?? 24
  // Visible day count per view mode (1-3 for day, 5-7 for week)
  const dayViewDays = settings?.dayViewDays ?? 1
  const weekViewDays = settings?.weekViewDays ?? 7

  // Global D/W/M/T (view switch + jump-to-today) — window-level so it works
  // from a cold start, not just after the calendar panel itself has focus
  // (that was the previous bug: the handler lived on calendar-panel.tsx's
  // tabIndex=0 div and only fired once the user had already clicked in).
  // Skips while typing in a field, or while any modal/overlay is open
  // (ModalShell-based dialogs and Radix Dialog content both render
  // role="dialog", which covers task/settings/time-block modals and the
  // command palette in one check).
  useEffect(() => {
    if (isMobile) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if (document.querySelector('[role="dialog"]')) return

      switch (e.key.toLowerCase()) {
        case 't':
          e.preventDefault()
          setSelectedDate(new Date())
          break
        case 'd':
          e.preventDefault()
          setViewMode('day')
          break
        case 'w':
          e.preventDefault()
          setViewMode('week')
          break
        case 'm':
          e.preventDefault()
          setViewMode('month')
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMobile])

  const handleResize = useCallback((delta: number) => {
    setPanelWidth((prev) => {
      const newWidth = prev + delta
      return Math.min(Math.max(newWidth, MIN_PANEL_WIDTH), MAX_PANEL_WIDTH)
    })
  }, [])

  // ── Calendar sharing overlay ──────────────────────────────
  // Peers + per-peer visibility toggles live here (this component owns
  // selectedDate, which drives the fetch window). The settings modal has
  // its own hook instance for grant editing; the two only need to agree
  // via the DB + localStorage, refreshed on refocus — no realtime.
  const {
    peers: sharePeers,
    visiblePeers,
    togglePeerVisible,
  } = useCalendarSharing(true)

  // Viewer's slot-type key → label map, used to label the peer's busy
  // time-blocks with a human word (built-in keys are shared across users).
  const peerTypeLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of slotTypes ?? []) map[s.key] = s.label
    return map
  }, [slotTypes])

  const peerEvents = usePeerCalendarEvents({
    peers: sharePeers,
    visiblePeers,
    selectedDate,
    typeLabels: peerTypeLabels,
  })

  // Get all tasks flattened
  const getAllTasks = useCallback(() => {
    const tasks: Task[] = []
    for (const workspace of workspaces) {
      if (workspace.isArchived) continue
      for (const category of workspace.categories) {
        if (category.isArchived) continue
        tasks.push(...category.tasks.filter((task) => !task.isArchived))
      }
    }
    return tasks
  }, [workspaces])

  const allTasks = getAllTasks()

  // Filter tasks for selected date (local date — must match toDateString used elsewhere)
  const dateString = toDateString(selectedDate)

  const pendingTasks = allTasks.filter(
    (task) =>
      task.scheduledDate === dateString &&
      !task.scheduledStartTime &&
      !task.isCompleted
  )

  const scheduledTasks = allTasks.filter(
    (task) =>
      task.scheduledDate === dateString &&
      task.scheduledStartTime &&
      task.scheduledEndTime
  )

  // Handle opening journal in focus mode
  const handleOpenJournalFocus = useCallback(() => {
    setFocusMode('journal')
  }, [])

  // Handle opening report in focus mode
  const handleOpenReportFocus = useCallback(() => {
    setFocusMode('report')
  }, [])

  const handleOpenGrowthFocus = useCallback(() => {
    setFocusMode('growth')
  }, [])

  // Desktop 報告 entry: on wide screens the review pane is already (or can
  // be) on screen, so instead of replacing the calendar we expand the pane
  // if collapsed, scroll it to top, and pulse a soft accent wash over it.
  // Below 1680px this falls through to the existing full-page behavior.
  const handleOpenReportDesktop = useCallback(() => {
    if (!isWide) {
      setFocusMode('report')
      return
    }
    setIsReviewPaneOpen(true)
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      reviewScrollRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    })
    setReviewFlash(true)
    if (reviewFlashTimer.current) window.clearTimeout(reviewFlashTimer.current)
    reviewFlashTimer.current = window.setTimeout(() => setReviewFlash(false), 900)
  }, [isWide])

  // If the window grows past 1680px while the full-page report is open,
  // fold it back into the pane — showing both would duplicate the content.
  // Render-time state adjustment (the React-docs pattern for deriving
  // state from a changed input) instead of an effect, so there is no
  // extra committed frame showing both surfaces.
  const [prevIsWide, setPrevIsWide] = useState(isWide)
  if (isWide !== prevIsWide) {
    setPrevIsWide(isWide)
    if (isWide && focusMode === 'report') {
      setFocusMode('none')
      setIsReviewPaneOpen(true)
    }
  }

  // ─── MOBILE LAYOUT ─────────────────────────────────────────────
  // Single-panel layout: header (inside each panel) + active panel +
  // bottom tab bar. Floating UserMenu still works at top-right.
  if (isMobile) {
    return (
      // pt-[env(safe-area-inset-top)] keeps content clear of the iOS notch /
      // Dynamic Island. The tab bar already has pb-[env(safe-area-inset-bottom)].
      <div
        className="flex flex-col h-[100dvh] bg-background overflow-hidden relative"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <FocusScratchpad
          isOpen={mobileScratchpadOpen}
          onOpenChange={setMobileScratchpadOpen}
          hideTrigger
          scratchpadByDate={scratchpadByDate ?? {}}
          onAddItem={onAddScratchpadItem ?? (() => {})}
          onUpdateItem={onUpdateScratchpadItem ?? (() => {})}
          onDeleteItem={onDeleteScratchpadItem ?? (() => {})}
          onReorderItems={onReorderScratchpadItems ?? (() => {})}
          onClearDate={onClearScratchpadDate ?? (() => {})}
          onPromoteToTask={onPromoteToTask}
        />

        {/* Quick-links overlay — same pull-sheet pattern as scratchpad
            but pulls up from the bottom. Triggered by the "連結" tab in
            the bottom bar below. */}
        <QuickLinksBar
          isOpen={mobileLinksOpen}
          onOpenChange={setMobileLinksOpen}
          hideTrigger
          links={settings?.quickLinks ?? []}
          onSave={onSetQuickLinks ?? (() => {})}
        />

        {/* Calendar → Tasks edge-swipe capture zone. Only mounted on the
            calendar tab; sits above the content so its touch handler runs
            before day-scroll-view's native horizontal scroll. Stops short of
            the bottom tab bar so taps on the tab buttons still register. */}
        {mobileTab === 'calendar' && focusMode === 'none' && (
          <div
            ref={leftEdgeRef}
            aria-hidden="true"
            className="absolute left-0 top-0 bottom-[64px] w-5 z-30"
            style={{ touchAction: 'pan-y' }}
          />
        )}

        <div ref={mobileContentRef} className="flex-1 min-h-0 flex flex-col">
          {focusMode !== 'none' ? (
            // Journal/Report focus view full-screen on mobile too
            <div className="flex flex-col h-full bg-background">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  {focusMode === 'journal' ? (
                    <>
                      <BookOpen className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">{t('日記')}</span>
                    </>
                  ) : focusMode === 'report' ? (
                    <>
                      <BarChart3 className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">{t('報告')}</span>
                    </>
                  ) : (
                    <>
                      <HuddleFootprints className="h-4 w-5 gap-0.5" />
                      <span className="text-sm font-semibold">{t('成長旅程')}</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setFocusMode('none')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  {t('返回')}
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {focusMode === 'journal' ? (
                  <JournalFocusView workspaces={workspaces} onClose={() => setFocusMode('none')} />
                ) : focusMode === 'report' ? (
                  <ReportDashboard workspaces={workspaces} onClose={() => setFocusMode('none')} />
                ) : (
                  <GrowthJourneyDashboard
                    workspaces={workspaces}
                    scratchpadByDate={scratchpadByDate ?? {}}
                  />
                )}
              </div>
            </div>
          ) : mobileTab === 'tasks' ? (
            <ErrorBoundary>
              {/* key={mobileTab} forces a remount on tab change so the
                  slide-in-from-right animation fires fresh each time. */}
              <div key="tasks" className="h-full flex flex-col animate-in slide-in-from-left duration-200 fade-in">
              <TaskPanel
                workspaces={workspaces}
                isExpanded={true}
                keepCompletedTodayInList={settings?.keepCompletedTodayInList ?? true}
                onToggleCategoryCollapse={onToggleCategoryCollapse}
                onReorderCategories={onReorderCategories}
                onToggleComplete={onToggleComplete}
                onSelectTask={onSelectTask}
                onAddTask={onAddTask}
                onAddCategory={onAddCategory}
                onDeleteCategory={onDeleteCategory}
                onSendTaskToCalendar={onSendTaskToCalendar}
                // Auto-switch to calendar tab the moment a row's drag
                // activates so the user's finger ends up over the
                // calendar grid at release time.
                onTaskDragActivate={() => setMobileTab('calendar')}
                onAddWorkspace={onAddWorkspace}
                onUpdateWorkspaceColor={onUpdateWorkspaceColor}
                onUpdateWorkspace={onUpdateWorkspace}
                onDeleteWorkspace={onDeleteWorkspace}
                onArchiveWorkspace={onArchiveWorkspace}
                onOpenSettings={onOpenSettings}
                onOpenOverdueReview={onOpenOverdueReview}
              />
              </div>
            </ErrorBoundary>
          ) : (
            <ErrorBoundary>
              <div key="calendar" className="h-full flex flex-col animate-in slide-in-from-right duration-200 fade-in">
              <CalendarPanel
                selectedDate={selectedDate}
                viewMode={viewMode}
                pendingTasks={pendingTasks}
                scheduledTasks={scheduledTasks}
                allTasks={allTasks}
                timeBlocks={timeBlocks}
                slotTypes={slotTypes}
                workspaces={workspaces}
                startHour={startHour}
                endHour={endHour}
                hourHeight={hourHeight}
                zoomLevel={zoomLevel}
                dayViewDays={dayViewDays}
                weekViewDays={weekViewDays}
                onZoomChange={setZoomLevel}
                onDateChange={setSelectedDate}
                onViewModeChange={setViewMode}
                onTaskSelect={onSelectTask}
                onToggleComplete={onToggleComplete}
                onCreateTask={onCreateCalendarTask}
                onCreatePendingTask={onCreatePendingTask}
                onCreateTimeBlock={onCreateCalendarTimeBlock}
                onOpenCreateTask={onOpenCreateTask}
                onRescheduleTask={onRescheduleTask}
                onUnscheduleTask={onUnscheduleTask}
                onUpdateTimeBlock={onUpdateTimeBlock}
                onDeleteTimeBlock={onDeleteTimeBlock}
                onTimeBlockSelect={onTimeBlockSelect}
                onOpenJournal={handleOpenJournalFocus}
                onOpenReport={handleOpenReportFocus}
                onOpenGrowth={handleOpenGrowthFocus}
                onOpenSettings={onOpenSettings}
                onOpenOverdueReview={onOpenOverdueReview}
                onOpenExport={() => setExportModalOpen(true)}
                leftPanelOpen={true}
                peerEvents={peerEvents}
                sharePeers={sharePeers}
                visiblePeers={visiblePeers}
                onTogglePeerVisible={togglePeerVisible}
              />
              </div>
            </ErrorBoundary>
          )}
        </div>

        {/* Bottom Tab Bar (hidden during focus mode) */}
        {focusMode === 'none' && (() => {
          // Build the tab definitions in one place so the button render loop
          // stays trivial. Position drives both the icon-pill highlight and
          // the top sliding indicator — overlays (白板 / 連結) win over the
          // route tabs while open.
          const tabs = [
            {
              key: 'tasks' as const,
              // '任務' doubles as the singular time-block type label ("Task");
              // the tab wants the plural, so it bypasses the shared dict key.
              label: lang === 'en' ? 'Tasks' : '任務',
              Icon: ListChecks,
              active: mobileTab === 'tasks' && !mobileScratchpadOpen && !mobileLinksOpen,
              onClick: () => {
                hapticSelection()
                setMobileScratchpadOpen(false)
                setMobileLinksOpen(false)
                setMobileTab('tasks')
              },
            },
            {
              key: 'scratch' as const,
              label: t('白板'),
              Icon: Sparkles,
              active: mobileScratchpadOpen,
              onClick: () => {
                hapticSelection()
                setMobileLinksOpen(false)
                setMobileScratchpadOpen(v => !v)
              },
            },
            {
              key: 'calendar' as const,
              label: t('日曆'),
              Icon: CalendarDays,
              active: mobileTab === 'calendar' && !mobileScratchpadOpen && !mobileLinksOpen,
              onClick: () => {
                hapticSelection()
                setMobileScratchpadOpen(false)
                setMobileLinksOpen(false)
                setMobileTab('calendar')
              },
            },
            {
              key: 'links' as const,
              // '連結' doubles as the editor "Link" button; tab wants plural.
              label: lang === 'en' ? 'Links' : '連結',
              Icon: Link2,
              active: mobileLinksOpen,
              onClick: () => {
                hapticSelection()
                setMobileScratchpadOpen(false)
                setMobileLinksOpen(v => !v)
              },
            },
          ]
          const activeIndex = tabs.findIndex(t => t.active)
          return (
            <nav
              className="relative flex-shrink-0 grid grid-cols-4 border-t border-border/70 bg-card/95 backdrop-blur z-sticky pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_0_rgba(0,0,0,0.02)]"
              role="tablist"
              aria-label={t('主要分頁')}
            >
              {/* Sliding top indicator — wrapper takes one column width so
                  translateX(N * 100%) moves it by exactly one tab. The inner
                  pill is centered within the wrapper. */}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-0 left-0 h-[3px] w-1/4 flex items-center justify-center transition-[transform,opacity] duration-200 ease-quart pointer-events-none',
                  activeIndex < 0 && 'opacity-0',
                )}
                style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}
              >
                <span className="block w-8 h-full bg-primary rounded-b-full" />
              </span>
              {tabs.map(({ key, label, Icon, active, onClick }) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={onClick}
                  className={cn(
                    'group flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 min-h-[60px] transition-all active:scale-[0.96]',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center w-11 h-7 rounded-full transition-all',
                      active ? 'bg-primary/10 scale-100' : 'scale-95 group-active:bg-secondary/60',
                    )}
                  >
                    <Icon className={cn('w-5 h-5 transition-transform', active && 'scale-105')} />
                  </span>
                  <span className={cn('text-[11px] tracking-tight', active ? 'font-semibold' : 'font-medium')}>
                    {label}
                  </span>
                </button>
              ))}
            </nav>
          )
        })()}

        {/* Floating widgets — repositioned for mobile */}
        <FocusTimer
          workspaces={workspaces}
          onCreateTimeBlock={onCreateCalendarTimeBlock}
        />
      </div>
    )
  }

  // ─── DESKTOP LAYOUT ────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden relative">
      {/* Focus Scratchpad - Pull down from top */}
      <FocusScratchpad
        scratchpadByDate={scratchpadByDate ?? {}}
        onAddItem={onAddScratchpadItem ?? (() => {})}
        onUpdateItem={onUpdateScratchpadItem ?? (() => {})}
        onDeleteItem={onDeleteScratchpadItem ?? (() => {})}
        onReorderItems={onReorderScratchpadItems ?? (() => {})}
        onClearDate={onClearScratchpadDate ?? (() => {})}
        onPromoteToTask={onPromoteToTask}
      />

      {/* ⌘K / Ctrl+K command palette — desktop only, self-mounts its own
          keyboard listener. See components/command-palette.tsx. */}
      <CommandPalette
        tasks={allTasks}
        onSelectTask={onSelectTask}
        onOpenSettings={onOpenSettings}
        onCreateTask={() => onCreateCalendarTask?.(toDateString(new Date()))}
        onJumpToday={() => setSelectedDate(new Date())}
        onSetViewMode={setViewMode}
        onReturnToCalendar={() => setFocusMode('none')}
      />

      <div className="flex flex-1 min-h-0 relative">
      {/* Left Panel Toggle Button (when panel is closed) */}
      {!isLeftPanelOpen && (
        <div className="absolute left-0 top-0 z-20 p-2">
          <button
            onClick={() => setIsLeftPanelOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-card border border-border shadow-sm hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={t('開啟任務面板')}
            aria-label={t('開啟任務面板')}
          >
            <PanelLeftOpen className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Full Screen Task View (when calendar is hidden) */}
      {!isRightPanelOpen ? (
        <div className="flex-1 h-full">
          <FullScreenTaskView
            workspaces={workspaces}
            onTaskClick={onSelectTask}
            onToggleComplete={onToggleComplete}
            onClose={() => setIsRightPanelOpen(true)}
            onAddTask={onAddTask}
          />
        </div>
      ) : (
        <>
          {/* Left Panel - Task Panel */}
          <div
            className={cn(
              "h-full transition-all duration-300 ease-quart relative flex-shrink-0",
              isLeftPanelOpen ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
            )}
            style={{ width: isLeftPanelOpen ? `${panelWidth}px` : '0px' }}
          >
            <ErrorBoundary>
              <TaskPanel
                workspaces={workspaces}
                isExpanded={false}
                keepCompletedTodayInList={settings?.keepCompletedTodayInList ?? true}
                onToggleCategoryCollapse={onToggleCategoryCollapse}
                onReorderCategories={onReorderCategories}
                onToggleComplete={onToggleComplete}
                onSelectTask={onSelectTask}
                onAddTask={onAddTask}
                onAddCategory={onAddCategory}
                onDeleteCategory={onDeleteCategory}
                onSendTaskToCalendar={onSendTaskToCalendar}
                onAddWorkspace={onAddWorkspace}
                onUpdateWorkspaceColor={onUpdateWorkspaceColor}
                onUpdateWorkspace={onUpdateWorkspace}
                onDeleteWorkspace={onDeleteWorkspace}
                onArchiveWorkspace={onArchiveWorkspace}
                onOpenSettings={onOpenSettings}
                onOpenOverdueReview={onOpenOverdueReview}
                onClosePanel={() => setIsLeftPanelOpen(false)}
                onToggleExpand={() => setIsRightPanelOpen(false)}
              />
            </ErrorBoundary>
          </div>

          {/* Resize Handle */}
          {isLeftPanelOpen && <ResizeHandle onResize={handleResize} />}

          {/* Right Panel - Calendar or Focus View */}
          <div className="flex-1 h-full min-w-0 flex flex-col">
            {focusMode !== 'none' ? (
              /* Full-page Journal / Report - replaces calendar inline */
              <div className="flex flex-col h-full bg-background">
                {/* Slim header bar */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    {focusMode === 'journal' ? (
                      <>
                        <BookOpen className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">{t('日記')}</span>
                      </>
                    ) : focusMode === 'report' ? (
                      <>
                        <BarChart3 className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">{t('報告')}</span>
                      </>
                    ) : (
                      <>
                        <HuddleFootprints className="h-4 w-5 gap-0.5" />
                        <span className="text-sm font-semibold">{t('成長旅程')}</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setFocusMode('none')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    {t('返回日曆')}
                  </button>
                </div>
                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                  {focusMode === 'journal' ? (
                    <div className="max-w-3xl mx-auto">
                      <JournalFocusView
                        workspaces={workspaces}
                        onClose={() => setFocusMode('none')}
                      />
                    </div>
                  ) : focusMode === 'report' ? (
                    <div className="max-w-5xl mx-auto">
                      <ReportDashboard
                        workspaces={workspaces}
                        onClose={() => setFocusMode('none')}
                      />
                    </div>
                  ) : (
                    <GrowthJourneyDashboard
                      workspaces={workspaces}
                      scratchpadByDate={scratchpadByDate ?? {}}
                    />
                  )}
                </div>
              </div>
            ) : (
              <ErrorBoundary>
                <CalendarPanel
                  selectedDate={selectedDate}
                  viewMode={viewMode}
                  pendingTasks={pendingTasks}
                  scheduledTasks={scheduledTasks}
                  allTasks={allTasks}
                  timeBlocks={timeBlocks}
                  slotTypes={slotTypes}
                  workspaces={workspaces}
                  startHour={startHour}
                  endHour={endHour}
                  hourHeight={hourHeight}
                  zoomLevel={zoomLevel}
                  dayViewDays={dayViewDays}
                  weekViewDays={weekViewDays}
                  onZoomChange={setZoomLevel}
                  onDateChange={setSelectedDate}
                  onViewModeChange={setViewMode}
                  onTaskSelect={onSelectTask}
                  onToggleComplete={onToggleComplete}
                  onCreateTask={onCreateCalendarTask}
                  onCreatePendingTask={onCreatePendingTask}
                  onCreateTimeBlock={onCreateCalendarTimeBlock}
                  onOpenCreateTask={onOpenCreateTask}
                  onRescheduleTask={onRescheduleTask}
                  onUnscheduleTask={onUnscheduleTask}
                  onUpdateTimeBlock={onUpdateTimeBlock}
                  onDeleteTimeBlock={onDeleteTimeBlock}
                  onTimeBlockSelect={onTimeBlockSelect}
                  onOpenJournal={handleOpenJournalFocus}
                  onOpenReport={handleOpenReportDesktop}
                  onOpenGrowth={handleOpenGrowthFocus}
                  onOpenSettings={onOpenSettings}
                  onOpenOverdueReview={onOpenOverdueReview}
                  onOpenExport={() => setExportModalOpen(true)}
                  leftPanelOpen={isLeftPanelOpen}
                  peerEvents={peerEvents}
                  sharePeers={sharePeers}
                  visiblePeers={visiblePeers}
                  onTogglePeerVisible={togglePeerVisible}
                />
              </ErrorBoundary>
            )}
          </div>

          {/* Third column — always-on review pane (≥1680px only). Warm
              panel surface + hairline divider, no card chrome (DESIGN.md
              container rules). Width transition mirrors the left task
              panel's existing collapse language (300ms ease-quart); the
              inner content keeps a fixed width so text never reflows
              mid-animation, and only fades. */}
          {isWide && (
            <aside
              aria-label={t('回顧欄')}
              className="relative h-full flex-shrink-0 border-l border-border bg-panel overflow-hidden transition-[width] duration-300 ease-quart motion-reduce:transition-none"
              style={{
                width: isReviewPaneOpen
                  ? `${REVIEW_PANE_WIDTH}px`
                  : `${REVIEW_PANE_COLLAPSED_WIDTH}px`,
              }}
            >
              {/* Expanded content — fixed inner width, fades on collapse */}
              <div
                className={cn(
                  'h-full flex flex-col transition-opacity duration-300 ease-quart motion-reduce:transition-none',
                  isReviewPaneOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                style={{ width: `${REVIEW_PANE_WIDTH}px` }}
                aria-hidden={!isReviewPaneOpen}
              >
                <div ref={reviewScrollRef} className="flex-1 overflow-y-auto pl-8 pr-6 py-6">
                  <ErrorBoundary>
                    <ReportDashboard
                      workspaces={workspaces}
                      onClose={() => setIsReviewPaneOpen(false)}
                    />
                  </ErrorBoundary>
                </div>
              </div>

              {/* Collapse handle — pull-tab riding the pane's left edge,
                  continuing the resize-handle / pull-tab visual language. */}
              {isReviewPaneOpen && (
                <button
                  onClick={() => setIsReviewPaneOpen(false)}
                  aria-label={t('收合回顧欄')}
                  title={t('收合回顧欄')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-panel w-5 h-14 flex items-center justify-center rounded-r-lg border border-l-0 border-border bg-card text-muted-foreground/70 hover:text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}

              {/* Collapsed strip — the whole 40px rail re-expands the pane */}
              {!isReviewPaneOpen && (
                <button
                  onClick={() => setIsReviewPaneOpen(true)}
                  aria-label={t('展開回顧欄')}
                  title={t('展開回顧欄')}
                  // pt-16 clears the floating UserMenu avatar (fixed top-3
                  // right-3, ~52px tall) that rides over this rail.
                  className="absolute inset-0 flex flex-col items-center gap-3 pt-16 pb-4 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <BarChart3 className="w-4 h-4" aria-hidden="true" />
                  <span className="text-xs tracking-widest [writing-mode:vertical-rl]">{t('回顧')}</span>
                  <ChevronLeft className="w-3.5 h-3.5 mt-auto" aria-hidden="true" />
                </button>
              )}

              {/* 報告-button attention pulse — opacity-only accent wash */}
              <div
                aria-hidden="true"
                className={cn(
                  'absolute inset-0 pointer-events-none bg-accent/35 transition-opacity duration-500 ease-quart motion-reduce:transition-none',
                  reviewFlash ? 'opacity-100' : 'opacity-0'
                )}
              />
            </aside>
          )}
        </>
      )}
      </div>

      {/* Quick-links bar — floating pull-up sheet (desktop). Pull-tab
          lives at viewport bottom-center; expanded panel slides up as
          an overlay. Mirror of the scratchpad's top pull-down. */}
      <QuickLinksBar
        links={settings?.quickLinks ?? []}
        onSave={onSetQuickLinks ?? (() => {})}
      />

      {/* Focus Timer - Floating Widget */}
      <FocusTimer
        workspaces={workspaces}
        onCreateTimeBlock={onCreateCalendarTimeBlock}
      />

      {/* Calendar Export Modal — image-of-schedule generator. */}
      <CalendarExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        workspaces={workspaces}
        timeBlocks={timeBlocks}
        startHour={startHour}
        endHour={endHour}
        selectedDate={selectedDate}
      />
    </div>
  )
}

// Journal Focus View Component
function JournalFocusView({ workspaces, onClose }: { workspaces: Workspace[], onClose: () => void }) {
  const { t, lang } = useI18n()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [content, setContent] = useState('')

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
  }

  // Get tasks for selected date (local date)
  const dateStr = toDateString(selectedDate)
  const tasksForDate = workspaces.flatMap(ws =>
    ws.categories.flatMap(cat =>
      cat.tasks.filter(t => t.scheduledDate === dateStr)
    )
  )

  const completedTasks = tasksForDate.filter(t => t.isCompleted)
  const incompleteTasks = tasksForDate.filter(t => !t.isCompleted)

  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setSelectedDate(d => new Date(d.getTime() - 86400000))}
          className="px-3 py-1.5 rounded-lg text-sm hover:bg-secondary transition-colors"
        >
          {t('前一天')}
        </button>
        <h2 className="text-xl font-medium">{formatDate(selectedDate)}</h2>
        <button
          onClick={() => setSelectedDate(d => new Date(d.getTime() + 86400000))}
          className="px-3 py-1.5 rounded-lg text-sm hover:bg-secondary transition-colors"
        >
          {t('後一天')}
        </button>
      </div>

      {/* Daily Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-success/10 border border-success/30">
          <div className="text-2xl font-bold text-success">{completedTasks.length}</div>
          <div className="text-sm text-muted-foreground">{t('已完成任務')}</div>
        </div>
        <div className="p-4 rounded-xl bg-urgency-high/10 border border-urgency-high/30">
          <div className="text-2xl font-bold text-urgency-high">{incompleteTasks.length}</div>
          <div className="text-sm text-muted-foreground">{t('未完成任務')}</div>
        </div>
        <div className="p-4 rounded-xl bg-info/10 border border-info/30">
          <div className="text-2xl font-bold text-info">{tasksForDate.length}</div>
          <div className="text-sm text-muted-foreground">{t('總任務數')}</div>
        </div>
      </div>

      {/* Tasks Overview */}
      {tasksForDate.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">{t('今日任務')}</h3>
          <div className="space-y-2">
            {tasksForDate.map(task => (
              <div 
                key={task.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border",
                  task.isCompleted 
                    ? "bg-success/5 border-success/30"
                    : "bg-card border-border"
                )}
              >
                <div 
                  className={cn(
                    "w-4 h-4 rounded-full border-2 flex-shrink-0",
                    task.isCompleted 
                      ? "bg-success border-success"
                      : "border-muted-foreground"
                  )}
                />
                <span className={cn(
                  "flex-1",
                  task.isCompleted && "line-through text-muted-foreground"
                )}>
                  {task.title}
                </span>
                {task.scheduledStartTime && (
                  <span className="text-xs text-muted-foreground">
                    {task.scheduledStartTime}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Journal Entry */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t('日記內容')}</h3>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('今天發生了什麼事？有什麼想法或感受？...')}
          className="w-full h-64 p-4 rounded-xl border border-border bg-card resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Prompts */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t('反思提示')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            '今天最有成就感的事是什麼？',
            '有什麼事情可以做得更好？',
            '今天學到了什麼新東西？',
            '明天最重要的任務是什麼？'
          ].map((prompt, i) => (
            <button
              key={i}
              onClick={() => setContent(prev => prev + (prev ? '\n\n' : '') + t(prompt) + '\n')}
              className="p-3 text-left rounded-lg border border-border hover:bg-secondary transition-colors text-sm"
            >
              {t(prompt)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
