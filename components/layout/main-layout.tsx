'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ResizeHandle } from './resize-handle'
import { TaskPanel } from '@/components/task-panel/task-panel'
import { FullScreenTaskView } from '@/components/task-panel/full-screen-task-view'
import { CalendarPanel } from '@/components/calendar/calendar-panel'
import { PanelLeftOpen, BookOpen, BarChart3, Minimize2 } from 'lucide-react'
import { ReportDashboard } from '@/components/reports/report-dashboard'
import { FocusScratchpad } from '@/components/scratchpad/focus-scratchpad'
import { FocusTimer } from '@/components/timer/focus-timer'
import type { Workspace, Task, TimeBlock, SlotType, UserSettings } from '@/lib/types'

interface MainLayoutProps {
  workspaces: Workspace[]
  timeBlocks: TimeBlock[]
  slotTypes?: SlotType[]
  settings?: UserSettings
  onToggleCategoryCollapse: (categoryId: string) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
  onAddCategory?: (workspaceId: string, name: string) => void
  onAddWorkspace?: (name: string, color: string, icon: string) => void
  onUpdateWorkspaceColor?: (workspaceId: string, color: string) => void
  onUpdateWorkspace?: (workspaceId: string, updates: Partial<Pick<Workspace, 'name' | 'color' | 'icon'>>) => void
  onDeleteWorkspace?: (workspaceId: string) => void
  onArchiveWorkspace?: (workspaceId: string) => void
  onOpenJournal: () => void
  onOpenReport: () => void
  onOpenSettings?: () => void
  onCreateCalendarTask?: (date: string, startTime: string, endTime: string) => void
  onCreatePendingTask?: (title: string) => void
  onCreateCalendarTimeBlock?: (date: string, startTime: string, endTime: string, type: string, label: string, color: string) => void
  onRescheduleTask?: (taskId: string, newStart: string, newEnd: string) => void
  onUpdateTimeBlock?: (id: string, updates: Partial<TimeBlock>) => void
  onDeleteTimeBlock?: (id: string) => void
}

const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 600
const DEFAULT_PANEL_WIDTH = 400

export function MainLayout({
  workspaces,
  timeBlocks,
  slotTypes,
  settings = {},
  onToggleCategoryCollapse,
  onToggleComplete,
  onSelectTask,
  onAddTask,
  onAddCategory,
  onAddWorkspace,
  onUpdateWorkspaceColor,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onArchiveWorkspace,
  onOpenJournal,
  onOpenReport,
  onOpenSettings,
  onCreateCalendarTask,
  onCreatePendingTask,
  onCreateCalendarTimeBlock,
  onRescheduleTask,
  onUpdateTimeBlock,
  onDeleteTimeBlock,
}: MainLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
  
  // Sidebar visibility states
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true)
  
  // Focus mode for journal/report (full screen view)
  const [focusMode, setFocusMode] = useState<'none' | 'journal' | 'report'>('none')
  
  // Calendar zoom level - controls hour height and visible time range
  // Zoom levels: 1 = compact (40px/hour), 2 = normal (60px/hour), 3 = expanded (80px/hour), 4 = detailed (100px/hour)
  const [zoomLevel, setZoomLevel] = useState(2)
  
  // Calculate hour height based on zoom level
  const hourHeights = [40, 60, 80, 100]
  const hourHeight = hourHeights[zoomLevel - 1] || 60
  
  // Time range from settings (with defensive fallbacks)
  const startHour = settings?.calendarStartHour ?? 0
  const endHour = settings?.calendarEndHour ?? 24

  const handleResize = useCallback((delta: number) => {
    setPanelWidth((prev) => {
      const newWidth = prev + delta
      return Math.min(Math.max(newWidth, MIN_PANEL_WIDTH), MAX_PANEL_WIDTH)
    })
  }, [])

  // Get all tasks flattened
  const getAllTasks = useCallback(() => {
    const tasks: Task[] = []
    for (const workspace of workspaces) {
      for (const category of workspace.categories) {
        tasks.push(...category.tasks)
      }
    }
    return tasks
  }, [workspaces])

  const allTasks = getAllTasks()

  // Filter tasks for selected date
  const dateString = selectedDate.toISOString().split('T')[0]

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

  const filteredTimeBlocks = timeBlocks.filter(
    (block) => block.date === dateString
  )

  // Handle opening journal in focus mode
  const handleOpenJournalFocus = useCallback(() => {
    setFocusMode('journal')
    onOpenJournal()
  }, [onOpenJournal])

  // Handle opening report in focus mode
  const handleOpenReportFocus = useCallback(() => {
    setFocusMode('report')
    onOpenReport()
  }, [onOpenReport])

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden relative">
      {/* Focus Scratchpad - Pull down from top */}
      <FocusScratchpad />
      
      <div className="flex flex-1 min-h-0 relative">
      {/* Left Panel Toggle Button (when panel is closed) */}
      {!isLeftPanelOpen && (
        <div className="absolute left-0 top-0 z-20 p-2">
          <button
            onClick={() => setIsLeftPanelOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-card border border-border shadow-sm hover:bg-secondary transition-colors"
            title="開啟任務面板"
          >
            <PanelLeftOpen className="w-5 h-5 text-muted-foreground" />
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
              "h-full transition-all duration-300 ease-in-out relative flex-shrink-0",
              isLeftPanelOpen ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
            )}
            style={{ width: isLeftPanelOpen ? `${panelWidth}px` : '0px' }}
          >
            <TaskPanel
              workspaces={workspaces}
              isExpanded={false}
              onToggleCategoryCollapse={onToggleCategoryCollapse}
              onToggleComplete={onToggleComplete}
              onSelectTask={onSelectTask}
              onAddTask={onAddTask}
              onAddCategory={onAddCategory}
              onAddWorkspace={onAddWorkspace}
              onUpdateWorkspaceColor={onUpdateWorkspaceColor}
              onUpdateWorkspace={onUpdateWorkspace}
              onDeleteWorkspace={onDeleteWorkspace}
              onArchiveWorkspace={onArchiveWorkspace}
              onOpenJournal={onOpenJournal}
              onOpenReport={onOpenReport}
              onOpenSettings={onOpenSettings}
              onClosePanel={() => setIsLeftPanelOpen(false)}
              onToggleExpand={() => setIsRightPanelOpen(false)}
            />
          </div>

          {/* Resize Handle */}
          {isLeftPanelOpen && <ResizeHandle onResize={handleResize} />}

          {/* Right Panel - Calendar */}
          <div className="flex-1 h-full min-w-0">
        <CalendarPanel
          selectedDate={selectedDate}
          viewMode={viewMode}
          pendingTasks={pendingTasks}
          scheduledTasks={scheduledTasks}
          allTasks={allTasks}
          timeBlocks={filteredTimeBlocks}
          slotTypes={slotTypes}
          workspaces={workspaces}
          startHour={startHour}
          endHour={endHour}
          hourHeight={hourHeight}
          zoomLevel={zoomLevel}
          onZoomChange={setZoomLevel}
          onDateChange={setSelectedDate}
          onViewModeChange={setViewMode}
          onTaskSelect={onSelectTask}
          onToggleComplete={onToggleComplete}
          onCreateTask={onCreateCalendarTask}
          onCreatePendingTask={onCreatePendingTask}
          onCreateTimeBlock={onCreateCalendarTimeBlock}
          onRescheduleTask={onRescheduleTask}
          onUpdateTimeBlock={onUpdateTimeBlock}
          onDeleteTimeBlock={onDeleteTimeBlock}
          onOpenJournal={handleOpenJournalFocus}
          onOpenReport={handleOpenReportFocus}
        />
      </div>
        </>
      )}

      {/* Focus Mode Overlay for Journal/Report */}
      {focusMode !== 'none' && (
        <div className="absolute inset-0 z-50 bg-background flex flex-col">
          {/* Focus Mode Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              {focusMode === 'journal' ? (
                <>
                  <BookOpen className="w-5 h-5 text-primary" />
                  <h1 className="text-lg font-semibold">日記</h1>
                </>
              ) : (
                <>
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <h1 className="text-lg font-semibold">報告</h1>
                </>
              )}
            </div>
            <button
              onClick={() => setFocusMode('none')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Minimize2 className="w-4 h-4" />
              返回主畫面
            </button>
          </div>
          
          {/* Focus Mode Content */}
          <div className="flex-1 overflow-auto p-6">
            {focusMode === 'journal' ? (
              <div className="max-w-4xl mx-auto">
                <JournalFocusView 
                  workspaces={workspaces}
                  onClose={() => setFocusMode('none')}
                />
              </div>
            ) : (
              <div className="max-w-6xl mx-auto">
                <ReportDashboard 
                  workspaces={workspaces}
                  onClose={() => setFocusMode('none')}
                />
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Focus Timer - Floating Widget */}
      <FocusTimer
        workspaces={workspaces}
        onCreateTimeBlock={onCreateCalendarTimeBlock}
      />
    </div>
  )
}

// Journal Focus View Component
function JournalFocusView({ workspaces, onClose }: { workspaces: Workspace[], onClose: () => void }) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [content, setContent] = useState('')
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
  }

  // Get tasks for selected date
  const tasksForDate = workspaces.flatMap(ws => 
    ws.categories.flatMap(cat => 
      cat.tasks.filter(t => t.scheduledDate === selectedDate.toISOString().split('T')[0])
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
          前一天
        </button>
        <h2 className="text-xl font-medium">{formatDate(selectedDate)}</h2>
        <button
          onClick={() => setSelectedDate(d => new Date(d.getTime() + 86400000))}
          className="px-3 py-1.5 rounded-lg text-sm hover:bg-secondary transition-colors"
        >
          後一天
        </button>
      </div>

      {/* Daily Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
          <div className="text-2xl font-bold text-green-600">{completedTasks.length}</div>
          <div className="text-sm text-muted-foreground">已完成任務</div>
        </div>
        <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
          <div className="text-2xl font-bold text-orange-600">{incompleteTasks.length}</div>
          <div className="text-sm text-muted-foreground">未完成任務</div>
        </div>
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="text-2xl font-bold text-blue-600">{tasksForDate.length}</div>
          <div className="text-sm text-muted-foreground">總任務數</div>
        </div>
      </div>

      {/* Tasks Overview */}
      {tasksForDate.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">今日任務</h3>
          <div className="space-y-2">
            {tasksForDate.map(task => (
              <div 
                key={task.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border",
                  task.isCompleted 
                    ? "bg-green-500/5 border-green-500/20" 
                    : "bg-card border-border"
                )}
              >
                <div 
                  className={cn(
                    "w-4 h-4 rounded-full border-2 flex-shrink-0",
                    task.isCompleted 
                      ? "bg-green-500 border-green-500" 
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
        <h3 className="text-sm font-medium text-muted-foreground">日記內容</h3>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="今天發生了什麼事？有什麼想法或感受？..."
          className="w-full h-64 p-4 rounded-xl border border-border bg-card resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Prompts */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">反思提示</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            '今天最有成就感的事是什麼？',
            '有什麼事情可以做得更好？',
            '今天學到了什麼新東西？',
            '明天最重要的任務是什麼？'
          ].map((prompt, i) => (
            <button
              key={i}
              onClick={() => setContent(prev => prev + (prev ? '\n\n' : '') + prompt + '\n')}
              className="p-3 text-left rounded-lg border border-border hover:bg-secondary transition-colors text-sm"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}


