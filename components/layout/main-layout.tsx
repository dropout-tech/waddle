'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ResizeHandle } from './resize-handle'
import { TaskPanel } from '@/components/task-panel/task-panel'
import { CalendarPanel } from '@/components/calendar/calendar-panel'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, BookOpen, BarChart3, Maximize2, Minimize2 } from 'lucide-react'
import type { Workspace, Task, TimeBlock, SlotType } from '@/lib/types'

interface MainLayoutProps {
  workspaces: Workspace[]
  timeBlocks: TimeBlock[]
  slotTypes?: SlotType[]
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
    <div className="flex h-screen bg-background overflow-hidden relative">
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

      {/* Left Panel - Task Panel */}
      <div
        className={cn(
          "flex-shrink-0 h-full transition-all duration-300 ease-in-out relative",
          isLeftPanelOpen ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
        )}
        style={{ width: isLeftPanelOpen ? `${panelWidth}px` : '0px' }}
      >
        <TaskPanel
          workspaces={workspaces}
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
        />
        
        {/* Close left panel button */}
        <button
          onClick={() => setIsLeftPanelOpen(false)}
          className="absolute right-2 top-2 z-10 flex items-center justify-center w-8 h-8 rounded-md hover:bg-secondary transition-colors"
          title="收起任務面板"
        >
          <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Resize Handle */}
      {isLeftPanelOpen && <ResizeHandle onResize={handleResize} />}

      {/* Right Panel - Calendar */}
      <div className={cn(
        "flex-1 h-full min-w-0 transition-all duration-300 ease-in-out relative",
        !isRightPanelOpen && "hidden"
      )}>
        {/* Panel Control Bar */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
          {/* Focus Mode Buttons */}
          <div className="flex items-center gap-1 mr-2 px-2 py-1 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50">
            <button
              onClick={handleOpenJournalFocus}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="開啟日記 (專注模式)"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">日記</span>
            </button>
            <button
              onClick={handleOpenReportFocus}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="開啟報告 (專注模式)"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">報告</span>
            </button>
          </div>
          
          {/* Toggle Buttons */}
          {!isLeftPanelOpen && (
            <button
              onClick={() => setIsLeftPanelOpen(true)}
              className="flex items-center justify-center w-8 h-8 rounded-md bg-card/80 backdrop-blur-sm border border-border/50 hover:bg-secondary transition-colors"
              title="開啟任務面板"
            >
              <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <CalendarPanel
          selectedDate={selectedDate}
          viewMode={viewMode}
          pendingTasks={pendingTasks}
          scheduledTasks={scheduledTasks}
          allTasks={allTasks}
          timeBlocks={filteredTimeBlocks}
          slotTypes={slotTypes}
          workspaces={workspaces}
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
        />
      </div>

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
                <ReportFocusView 
                  workspaces={workspaces}
                  onClose={() => setFocusMode('none')}
                />
              </div>
            )}
          </div>
        </div>
      )}
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

// Report Focus View Component
function ReportFocusView({ workspaces, onClose }: { workspaces: Workspace[], onClose: () => void }) {
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter'>('week')
  
  // Calculate stats
  const allTasks = workspaces.flatMap(ws => 
    ws.categories.flatMap(cat => cat.tasks)
  )

  const now = new Date()
  const rangeStart = new Date()
  if (dateRange === 'week') rangeStart.setDate(now.getDate() - 7)
  else if (dateRange === 'month') rangeStart.setMonth(now.getMonth() - 1)
  else rangeStart.setMonth(now.getMonth() - 3)

  const tasksInRange = allTasks.filter(t => {
    const created = new Date(t.createdAt)
    return created >= rangeStart && created <= now
  })

  const completedInRange = tasksInRange.filter(t => t.isCompleted)
  const completionRate = tasksInRange.length > 0 
    ? Math.round((completedInRange.length / tasksInRange.length) * 100) 
    : 0

  // Overdue tasks
  const overdueTasks = allTasks.filter(t => {
    if (t.isCompleted || !t.dueDate) return false
    return new Date(t.dueDate) < now
  })

  // Tasks by workspace
  const tasksByWorkspace = workspaces.map(ws => ({
    name: ws.name,
    color: ws.color,
    total: ws.categories.flatMap(c => c.tasks).length,
    completed: ws.categories.flatMap(c => c.tasks.filter(t => t.isCompleted)).length,
  }))

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center gap-2">
        {(['week', 'month', 'quarter'] as const).map(range => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              dateRange === range
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {range === 'week' ? '本週' : range === 'month' ? '本月' : '本季'}
          </button>
        ))}
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-card border border-border">
          <div className="text-3xl font-bold">{tasksInRange.length}</div>
          <div className="text-sm text-muted-foreground mt-1">總任務數</div>
        </div>
        <div className="p-5 rounded-xl bg-green-500/10 border border-green-500/20">
          <div className="text-3xl font-bold text-green-600">{completedInRange.length}</div>
          <div className="text-sm text-muted-foreground mt-1">已完成</div>
        </div>
        <div className="p-5 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="text-3xl font-bold text-blue-600">{completionRate}%</div>
          <div className="text-sm text-muted-foreground mt-1">完成率</div>
        </div>
        <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="text-3xl font-bold text-red-600">{overdueTasks.length}</div>
          <div className="text-sm text-muted-foreground mt-1">過期任務</div>
        </div>
      </div>

      {/* Workspace Breakdown */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">工作區概覽</h3>
        <div className="space-y-3">
          {tasksByWorkspace.map(ws => (
            <div key={ws.name} className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: ws.color }}
                  />
                  <span className="font-medium">{ws.name}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {ws.completed} / {ws.total} 完成
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${ws.total > 0 ? (ws.completed / ws.total) * 100 : 0}%`,
                    backgroundColor: ws.color 
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Overdue Tasks Alert */}
      {overdueTasks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-red-600">需要關注的過期任務</h3>
          <div className="space-y-2">
            {overdueTasks.slice(0, 10).map(task => {
              const daysOverdue = Math.floor((now.getTime() - new Date(task.dueDate!).getTime()) / 86400000)
              return (
                <div 
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: task.workspaceColor || '#999' }}
                    />
                    <span>{task.title}</span>
                  </div>
                  <span className="text-sm text-red-600 font-medium">
                    過期 {daysOverdue} 天
                  </span>
                </div>
              )
            })}
            {overdueTasks.length > 10 && (
              <div className="text-sm text-muted-foreground text-center py-2">
                還有 {overdueTasks.length - 10} 個過期任務...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Productivity Tips */}
      <div className="p-5 rounded-xl bg-primary/5 border border-primary/20">
        <h3 className="font-medium mb-3">生產力建議</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {completionRate < 50 && (
            <li>完成率偏低，建議將大任務拆分成更小的可執行項目</li>
          )}
          {overdueTasks.length > 5 && (
            <li>過期任務較多，建議重新評估任務優先級並清理不必要的任務</li>
          )}
          {completionRate >= 80 && (
            <li>表現出色！繼續保持良好的工作節奏</li>
          )}
          <li>定期回顧任務清單，移除已不再需要的任務</li>
        </ul>
      </div>
    </div>
  )
}
