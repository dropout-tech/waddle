'use client'

import { useRef, useState, useMemo } from 'react'
import { FolderTree, Clock, SlidersHorizontal, ChevronDown, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace, Task } from '@/lib/types'
import { PanelHeader } from './panel-header'
import { WorkspaceSection } from './workspace-section'
import { FilterBar, type FilterState } from './filter-bar'
import { UnifiedTaskList } from './unified-task-list'

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
  onToggleCategoryCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
  onAddCategory?: (workspaceId: string, name: string) => void
  onDeleteCategory?: (categoryId: string) => void
  onSendTaskToCalendar?: (taskId: string, date: string, startTime?: string, endTime?: string) => void
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
  onToggleCategoryCollapse,
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
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    urgency: [],
    showCompleted: true,
    workspaceIds: [],
  })

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
              // Search filter
              if (filters.search && !task.title.toLowerCase().includes(filters.search.toLowerCase())) {
                return false
              }
              // Urgency filter
              if (filters.urgency.length > 0 && !filters.urgency.includes(task.urgency)) {
                return false
              }
              // Completed filter
              if (!filters.showCompleted && task.isCompleted) {
                return false
              }
              return true
            }),
          })),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }, [workspaces, filters])

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
        'flex h-full bg-card border-r border-border shadow-sm',
        className
      )}
    >
      {/* Left Column: Task List */}
      <div className={cn(
        'flex flex-col h-full',
        isExpanded ? 'w-[360px] border-r border-border' : 'flex-1'
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
    </div>
  )
}
