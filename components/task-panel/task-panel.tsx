'use client'

import { useRef, useState, useMemo } from 'react'
import { FolderTree, Clock, SlidersHorizontal, ChevronDown, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import type { Workspace, Task } from '@/lib/types'
import { PanelHeader } from './panel-header'
import { WorkspaceSection } from './workspace-section'
import { FilterBar, type FilterState } from './filter-bar'
import { UnifiedTaskList } from './unified-task-list'
import { CompletedTasksDrawer } from './completed-tasks-drawer'

import { Button } from '@/components/ui/button'

export type Density = 'compact' | 'comfortable'
export type ViewMode = 'category' | 'unified' | 'urgency'
export type MetaField = 'duration' | 'time' | 'date'

const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  category: '依分類',
  unified: '依時間',
  urgency: '依急迫程度',
}

interface TaskPanelProps {
  workspaces: Workspace[]
  isExpanded?: boolean
  /**
   * If true (the user setting default), tasks completed today stay
   * greyed-out in the list until the date rolls over. If false they vanish
   * from the list as soon as the user prompts complete; either way they
   * stay reachable in the "已完成" drawer.
   */
  keepCompletedTodayInList?: boolean
  onToggleCategoryCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
  onAddCategory?: (workspaceId: string, name: string) => void
  onDeleteCategory?: (categoryId: string) => void
  onSendTaskToCalendar?: (taskId: string, date: string, startTime?: string, endTime?: string) => void
  onTaskDragActivate?: () => void
  onAddWorkspace?: (name: string, color: string, icon: string) => void
  onUpdateWorkspaceColor?: (workspaceId: string, color: string) => void
  onUpdateWorkspace?: (workspaceId: string, updates: Partial<Pick<import('@/lib/types').Workspace, 'name' | 'color' | 'icon'>>) => void
  onDeleteWorkspace?: (workspaceId: string) => void
  onArchiveWorkspace?: (workspaceId: string) => void
  onOpenSettings?: () => void
  onClosePanel?: () => void
  onToggleExpand?: () => void
  className?: string
}

export function TaskPanel({
  workspaces,
  isExpanded = false,
  keepCompletedTodayInList = true,
  onToggleCategoryCollapse,
  onToggleComplete,
  onSelectTask,
  onAddTask,
  onAddCategory,
  onDeleteCategory,
  onSendTaskToCalendar,
  onTaskDragActivate,
  onAddWorkspace,
  onUpdateWorkspaceColor,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onArchiveWorkspace,
  onOpenSettings,
  onClosePanel,
  onToggleExpand,
  className,
}: TaskPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [density, setDensity] = useState<Density>('comfortable')
  const [viewMode, setViewMode] = useState<ViewMode>('category')
  const [metaOrder, setMetaOrder] = useState<MetaField[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('waddle-meta-order')
      if (saved) return JSON.parse(saved) as MetaField[]
    }
    return ['duration', 'date', 'time']
  })
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const [completedDrawerOpen, setCompletedDrawerOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    urgency: [],
    showCompleted: true,
    workspaceIds: [],
  })

  // Recompute "today" once per render — cheap, and we don't need second
  // precision. A user keeping the panel open across midnight will see
  // yesterday's completed tasks slide out of the list on the next render
  // (no special handling required).
  const todayStr = useMemo(() => toDateString(new Date()), [])

  // Total count of completed tasks across all workspaces — drives the
  // "已完成 (N)" trigger badge. Built separately from filteredWorkspaces so
  // the count never disappears when the filter bar is set to "hide
  // completed" (it's the count for the drawer, not the inline list).
  const totalCompleted = useMemo(() => {
    let n = 0
    for (const w of workspaces) {
      if (w.isArchived) continue
      for (const c of w.categories) {
        if (c.isArchived) continue
        for (const t of c.tasks) {
          if (t.isCompleted) n++
        }
      }
    }
    return n
  }, [workspaces])

  // Filter workspaces and tasks
  const filteredWorkspaces = useMemo(() => {
    return workspaces
      .filter((w) => !w.isArchived)
      .filter((w) => filters.workspaceIds.length === 0 || filters.workspaceIds.includes(w.id))
      .map((workspace) => ({
        ...workspace,
        categories: workspace.categories
          .filter((c) => !c.isArchived)
          .map((category) => ({
            ...category,
            tasks: category.tasks.filter((task) => {
              // Calendar-only opt-out: user unchecked "加入左側任務欄" on this task.
              if (task.showInTaskList === false) {
                return false
              }
              // Search filter
              if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase())) {
                return false
              }
              // Urgency filter
              if (filters.urgency.length > 0 && !filters.urgency.includes(task.urgency)) {
                return false
              }
              // Completed-task visibility: by default they all live in the
              // "已完成" drawer, NOT inline with the active list. The
              // exception is today's completions, which can stay greyed-out
              // in place if the user has the setting on — handy for the
              // "what did I get done today" glance without context-switching.
              // The filter-bar showCompleted toggle is still respected as a
              // hard hide-all-completed override.
              if (task.isCompleted) {
                if (!filters.showCompleted) return false
                if (!keepCompletedTodayInList) return false
                if (!task.completedAt) return false
                const completedDay = task.completedAt.split('T')[0]
                if (completedDay !== todayStr) return false
              }
              return true
            }),
          })),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }, [workspaces, filters, keepCompletedTodayInList, todayStr])

  // Flatten all tasks for unified view
  const allFilteredTasks = useMemo(() => {
    const tasks: Task[] = []
    filteredWorkspaces.forEach((ws) => {
      ws.categories.forEach((cat) => {
        tasks.push(...cat.tasks)
      })
    })
    return tasks
  }, [filteredWorkspaces])

  const hasActiveFilters =
    filters.urgency.length > 0 ||
    !filters.showCompleted ||
    filters.workspaceIds.length > 0

  const handleWorkspaceClick = (workspaceId: string) => {
    // Scroll to workspace section
    const element = document.getElementById(`workspace-${workspaceId}`)
    if (element && scrollContainerRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div
      data-tour="left-panel"
      className={cn(
        // min-w-0 + overflow-hidden so a task with long meta text (e.g. a
        // DB-returned "08:15:00 - 09:15:00") can't push the inner column
        // wider than the parent flex slot — without this, content spilled
        // visibly into the calendar panel.
        'flex h-full bg-card border-r border-border shadow-sm min-w-0 overflow-hidden',
        className
      )}
    >
      {/* Left Column: Task List */}
      <div className={cn(
        'flex flex-col h-full min-w-0',
        isExpanded ? 'w-full md:w-[360px] md:border-r md:border-border' : 'flex-1'
      )}>
        {/* Header */}
        <PanelHeader
          workspaces={workspaces}
          isExpanded={isExpanded}
          onWorkspaceClick={handleWorkspaceClick}
          onAddWorkspace={onAddWorkspace}
          onUpdateWorkspaceColor={onUpdateWorkspaceColor}
          onUpdateWorkspace={onUpdateWorkspace}
          onDeleteWorkspace={onDeleteWorkspace}
          onArchiveWorkspace={onArchiveWorkspace}
          onClosePanel={onClosePanel}
          onToggleExpand={onToggleExpand}
        />

        {/* Completed-tasks entrypoint. Always visible above the toolbar so
            the user can pop into the drawer regardless of how many tasks
            they currently have on screen. Renders as a flat row with a
            count badge and a right-chevron so it reads as "tap to enter". */}
        <button
          type="button"
          onClick={() => setCompletedDrawerOpen(true)}
          className="w-full flex items-center justify-between px-4 py-2 border-b border-border bg-card/50 hover:bg-muted/40 transition-colors group"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            已完成
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
              {totalCompleted}
            </span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Toolbar Toggle Row */}
      <div className="border-b border-border bg-card/50">
        <button
          onClick={() => setToolbarOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/40 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {VIEW_MODE_LABEL[viewMode]}
              {hasActiveFilters && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                  {filters.urgency.length + filters.workspaceIds.length + (filters.showCompleted ? 0 : 1)}
                </span>
              )}
            </span>
          </div>
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200',
              toolbarOpen && 'rotate-180'
            )}
          />
        </button>

        {/* Collapsible Content */}
        {toolbarOpen && (
          <div className="border-t border-border/60">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 px-3 pt-2 pb-1 flex-wrap">
              <button
                onClick={() => setViewMode('category')}
                aria-pressed={viewMode === 'category'}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  viewMode === 'category'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                <FolderTree className="w-3 h-3" aria-hidden="true" />
                <span>依分類</span>
              </button>
              <button
                onClick={() => setViewMode('unified')}
                aria-pressed={viewMode === 'unified'}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  viewMode === 'unified'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                <Clock className="w-3 h-3" aria-hidden="true" />
                <span>依時間</span>
              </button>
              <button
                onClick={() => setViewMode('urgency')}
                aria-pressed={viewMode === 'urgency'}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  viewMode === 'urgency'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                <span>依急迫程度</span>
              </button>
            </div>

            {/* Filter Bar */}
            <FilterBar
              filters={filters}
              onFiltersChange={setFilters}
              workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, color: w.color }))}
              density={density}
              onDensityChange={setDensity}
              metaOrder={metaOrder}
              onMetaOrderChange={(order) => {
                setMetaOrder(order)
                localStorage.setItem('waddle-meta-order', JSON.stringify(order))
              }}
            />
          </div>
        )}
      </div>

      {/* Task List - Scrollable */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        {viewMode === 'category' ? (
          filteredWorkspaces.map((workspace) => (
            <div key={workspace.id} id={`workspace-${workspace.id}`}>
              <WorkspaceSection
                workspace={workspace}
                density={density}
                metaOrder={metaOrder}
                onToggleCategoryCollapse={onToggleCategoryCollapse}
                onToggleComplete={onToggleComplete}
                onSelectTask={onSelectTask}
                onAddTask={onAddTask}
                onAddCategory={onAddCategory}
                onDeleteCategory={onDeleteCategory}
                onSendTaskToCalendar={onSendTaskToCalendar}
                onTaskDragActivate={onTaskDragActivate}
              />
            </div>
          ))
        ) : (
          <UnifiedTaskList
            tasks={allFilteredTasks}
            density={density}
            metaOrder={metaOrder}
            groupBy={viewMode === 'urgency' ? 'urgency' : 'time'}
            onToggleComplete={onToggleComplete}
            onSelectTask={onSelectTask}
          />
        )}
      </div>

      </div>

      {/* Completed-tasks drawer. Mounted at the panel root so the slide-in
          animation lives outside the scroll container; the drawer itself
          portals into <body>, so this just wires open/close. */}
      <CompletedTasksDrawer
        workspaces={workspaces}
        isOpen={completedDrawerOpen}
        onClose={() => setCompletedDrawerOpen(false)}
        onSelectTask={(task) => {
          setCompletedDrawerOpen(false)
          onSelectTask(task)
        }}
      />
    </div>
  )
}
