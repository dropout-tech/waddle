'use client'

import { useMemo, useState } from 'react'
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp,
  Target,
  Flame,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  List,
  Filter,
  Minimize2,
  Circle,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace, Task } from '@/lib/types'

interface FullScreenTaskViewProps {
  workspaces: Workspace[]
  onTaskClick?: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onClose: () => void
  onAddTask?: (categoryId: string, title: string) => void
}

export function FullScreenTaskView({ 
  workspaces, 
  onTaskClick,
  onToggleComplete,
  onClose,
  onAddTask
}: FullScreenTaskViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'workspaces'>('overview')
  const [taskFilter, setTaskFilter] = useState<'all' | 'today' | 'upcoming' | 'overdue' | 'unscheduled'>('all')
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  
  // Gather all tasks
  const allTasks = useMemo(() => {
    const tasks: (Task & { workspaceName: string; workspaceColor: string; categoryName: string })[] = []
    workspaces.forEach(ws => {
      if (!ws.isArchived) {
        ws.categories?.forEach(cat => {
          if (!cat.isArchived) {
            cat.tasks?.forEach(task => {
              tasks.push({
                ...task,
                workspaceName: ws.name,
                workspaceColor: ws.color,
                categoryName: cat.name
              })
            })
          }
        })
      }
    })
    return tasks
  }, [workspaces])

  // Calculate statistics
  const stats = useMemo(() => {
    const total = allTasks.length
    const completed = allTasks.filter(t => t.isCompleted).length
    const today = allTasks.filter(t => t.scheduledDate === todayStr && !t.isCompleted)
    const todayCompleted = allTasks.filter(t => t.scheduledDate === todayStr && t.isCompleted)
    const overdue = allTasks.filter(t => {
      if (t.isCompleted || !t.dueDate) return false
      return new Date(t.dueDate) < now
    })
    const upcoming = allTasks.filter(t => {
      if (t.isCompleted || !t.dueDate) return false
      const due = new Date(t.dueDate)
      const threeDaysLater = new Date(now)
      threeDaysLater.setDate(threeDaysLater.getDate() + 3)
      return due >= now && due <= threeDaysLater
    })
    const unscheduled = allTasks.filter(t => !t.isCompleted && !t.scheduledDate)
    const highPriority = allTasks.filter(t => !t.isCompleted && t.urgency === 'high')

    // Calculate streak
    let streak = 0
    const checkDate = new Date(now)
    for (let i = 0; i < 30; i++) {
      const dateStr = checkDate.toISOString().split('T')[0]
      const hasCompleted = allTasks.some(t => 
        t.isCompleted && t.completedAt && t.completedAt.split('T')[0] === dateStr
      )
      if (hasCompleted) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else if (i > 0) {
        break
      } else {
        checkDate.setDate(checkDate.getDate() - 1)
      }
    }

    return {
      total,
      completed,
      pending: total - completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      today,
      todayCompleted,
      todayTotal: today.length + todayCompleted.length,
      overdue,
      upcoming,
      unscheduled,
      highPriority,
      streak
    }
  }, [allTasks, todayStr, now])

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let tasks = allTasks.filter(t => !t.isCompleted)
    
    // Apply workspace filter
    if (selectedWorkspace) {
      tasks = tasks.filter(t => {
        const ws = workspaces.find(w => w.name === t.workspaceName)
        return ws?.id === selectedWorkspace
      })
    }

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      tasks = tasks.filter(t => 
        t.title.toLowerCase().includes(query) ||
        t.workspaceName.toLowerCase().includes(query) ||
        t.categoryName.toLowerCase().includes(query)
      )
    }
    
    // Apply filter
    switch (taskFilter) {
      case 'today':
        return tasks.filter(t => t.scheduledDate === todayStr)
      case 'upcoming':
        return tasks.filter(t => {
          if (!t.dueDate) return false
          const due = new Date(t.dueDate)
          const threeDaysLater = new Date(now)
          threeDaysLater.setDate(threeDaysLater.getDate() + 3)
          return due >= now && due <= threeDaysLater
        })
      case 'overdue':
        return tasks.filter(t => {
          if (!t.dueDate) return false
          return new Date(t.dueDate) < now
        })
      case 'unscheduled':
        return tasks.filter(t => !t.scheduledDate)
      default:
        return tasks
    }
  }, [allTasks, taskFilter, selectedWorkspace, searchQuery, todayStr, now, workspaces])

  // Workspace stats
  const workspaceStats = useMemo(() => {
    return workspaces
      .filter(ws => !ws.isArchived)
      .map(ws => {
        const tasks = ws.categories?.flatMap(cat => cat.tasks || []) || []
        const total = tasks.length
        const completed = tasks.filter(t => t.isCompleted).length
        const overdue = tasks.filter(t => {
          if (t.isCompleted || !t.dueDate) return false
          return new Date(t.dueDate) < now
        }).length
        const today = tasks.filter(t => t.scheduledDate === todayStr && !t.isCompleted).length

        return {
          ...ws,
          stats: {
            total,
            completed,
            pending: total - completed,
            overdue,
            today,
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
          }
        }
      })
      .filter(ws => ws.stats.total > 0)
  }, [workspaces, now, todayStr])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const isToday = dateStr === todayStr
    if (isToday) return '今天'
    
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (dateStr === tomorrow.toISOString().split('T')[0]) return '明天'
    
    return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
  }

  const getDaysOverdue = (dueDate: string) => {
    return Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86400000)
  }

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(catId)) {
        next.delete(catId)
      } else {
        next.add(catId)
      }
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">任務管理</h1>
            <p className="text-sm text-muted-foreground">
              {stats.pending} 個待完成 · {stats.completed} 個已完成
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium"
          >
            <Minimize2 className="w-4 h-4" />
            返回日曆
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1">
          {[
            { id: 'overview', label: '總覽', icon: LayoutGrid },
            { id: 'tasks', label: '所有任務', icon: List },
            { id: 'workspaces', label: '工作區', icon: Target },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && (
          <div className="p-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-5 gap-4 mb-8">
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Target className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">完成率</span>
                </div>
                <div className="text-2xl font-bold">{stats.completionRate}%</div>
                <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${stats.completionRate}%` }}
                  />
                </div>
              </div>

              <div 
                className={cn(
                  "p-4 rounded-xl cursor-pointer transition-all",
                  taskFilter === 'today' 
                    ? "bg-blue-500/10 border-2 border-blue-500" 
                    : "bg-card border border-border hover:border-blue-500/50"
                )}
                onClick={() => { setActiveTab('tasks'); setTaskFilter('today') }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Calendar className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="text-sm text-muted-foreground">今日任務</span>
                </div>
                <div className="text-2xl font-bold">{stats.today.length}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  已完成 {stats.todayCompleted.length} 個
                </div>
              </div>

              <div 
                className={cn(
                  "p-4 rounded-xl cursor-pointer transition-all",
                  taskFilter === 'upcoming' 
                    ? "bg-amber-500/10 border-2 border-amber-500" 
                    : "bg-card border border-border hover:border-amber-500/50"
                )}
                onClick={() => { setActiveTab('tasks'); setTaskFilter('upcoming') }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <span className="text-sm text-muted-foreground">即將到期</span>
                </div>
                <div className="text-2xl font-bold">{stats.upcoming.length}</div>
                <div className="text-xs text-muted-foreground mt-1">3 天內</div>
              </div>

              <div 
                className={cn(
                  "p-4 rounded-xl cursor-pointer transition-all",
                  taskFilter === 'overdue' 
                    ? "bg-red-500/10 border-2 border-red-500" 
                    : "bg-card border border-border hover:border-red-500/50"
                )}
                onClick={() => { setActiveTab('tasks'); setTaskFilter('overdue') }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                  <span className="text-sm text-muted-foreground">已過期</span>
                </div>
                <div className="text-2xl font-bold text-red-600">{stats.overdue.length}</div>
                <div className="text-xs text-red-500 mt-1">需要處理</div>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-orange-500/20">
                    <Flame className="w-4 h-4 text-orange-500" />
                  </div>
                  <span className="text-sm text-muted-foreground">連續天數</span>
                </div>
                <div className="text-2xl font-bold text-orange-600">{stats.streak}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stats.streak > 0 ? '繼續保持！' : '今天開始'}
                </div>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-6">
              {/* Left: Workspace Progress */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5" />
                  工作區進度
                </h2>
                <div className="space-y-3">
                  {workspaceStats.map(ws => (
                    <div 
                      key={ws.id}
                      className="p-4 rounded-xl bg-card border border-border hover:shadow-md transition-all cursor-pointer"
                      onClick={() => { setActiveTab('workspaces'); setSelectedWorkspace(ws.id) }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-4 h-4 rounded-full" 
                            style={{ backgroundColor: ws.color }}
                          />
                          <span className="font-medium">{ws.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {ws.stats.overdue > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 text-xs font-medium">
                              {ws.stats.overdue} 過期
                            </span>
                          )}
                          {ws.stats.today > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-xs font-medium">
                              {ws.stats.today} 今日
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {ws.stats.completed}/{ws.stats.total}
                          </span>
                          <span className="font-semibold">{ws.stats.completionRate}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ 
                            width: `${ws.stats.completionRate}%`,
                            backgroundColor: ws.color 
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Priority Tasks + Quick Actions */}
              <div className="space-y-6">
                {/* Overdue Alert */}
                {stats.overdue.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-red-600">
                      <AlertTriangle className="w-5 h-5" />
                      需要立即處理
                    </h2>
                    <div className="space-y-2">
                      {stats.overdue.slice(0, 5).map(task => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 transition-colors cursor-pointer"
                          onClick={() => onTaskClick?.(task)}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task.id) }}
                            className="w-5 h-5 rounded-full border-2 border-red-400 hover:bg-red-500/20 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{task.title}</div>
                            <div className="text-xs text-red-500">
                              過期 {getDaysOverdue(task.dueDate!)} 天
                            </div>
                          </div>
                          <div 
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: task.workspaceColor }}
                          />
                        </div>
                      ))}
                      {stats.overdue.length > 5 && (
                        <button 
                          className="w-full text-center text-sm text-red-600 py-2 hover:underline"
                          onClick={() => { setActiveTab('tasks'); setTaskFilter('overdue') }}
                        >
                          查看全部 {stats.overdue.length} 個過期任務
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* High Priority */}
                {stats.highPriority.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Target className="w-5 h-5 text-orange-500" />
                      高優先任務
                    </h2>
                    <div className="space-y-2">
                      {stats.highPriority.slice(0, 4).map(task => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-orange-500/50 transition-colors cursor-pointer"
                          onClick={() => onTaskClick?.(task)}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task.id) }}
                            className="w-5 h-5 rounded-full border-2 border-orange-400 hover:bg-orange-500/20 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{task.title}</div>
                            {task.dueDate && (
                              <div className="text-xs text-muted-foreground">
                                {formatDate(task.dueDate)}
                              </div>
                            )}
                          </div>
                          <div 
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: task.workspaceColor }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unscheduled */}
                {stats.unscheduled.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Clock className="w-5 h-5 text-muted-foreground" />
                      待安排時間
                      <span className="text-sm font-normal text-muted-foreground">
                        ({stats.unscheduled.length})
                      </span>
                    </h2>
                    <button
                      className="w-full p-3 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground"
                      onClick={() => { setActiveTab('tasks'); setTaskFilter('unscheduled') }}
                    >
                      查看並安排 {stats.unscheduled.length} 個未排程任務
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="p-6">
            {/* Filter Bar */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜尋任務..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
              </div>
              
              <div className="flex items-center gap-2">
                {[
                  { id: 'all', label: '全部' },
                  { id: 'today', label: '今日' },
                  { id: 'upcoming', label: '即將到期' },
                  { id: 'overdue', label: '已過期' },
                  { id: 'unscheduled', label: '未排程' },
                ].map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setTaskFilter(filter.id as typeof taskFilter)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm transition-colors",
                      taskFilter === filter.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <select
                value={selectedWorkspace || ''}
                onChange={(e) => setSelectedWorkspace(e.target.value || null)}
                className="px-3 py-2 rounded-lg border border-border bg-card text-sm"
              >
                <option value="">所有工作區</option>
                {workspaces.filter(w => !w.isArchived).map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>

            {/* Task List */}
            <div className="space-y-2">
              {filteredTasks.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-4xl mb-4">
                    {taskFilter === 'overdue' ? '🎉' : '📋'}
                  </div>
                  <div className="text-lg font-medium text-muted-foreground">
                    {taskFilter === 'overdue' ? '太棒了！沒有過期任務' : '沒有符合條件的任務'}
                  </div>
                </div>
              ) : (
                filteredTasks.map(task => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer group",
                      taskFilter === 'overdue'
                        ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                        : "bg-card border-border hover:border-primary/30 hover:shadow-sm"
                    )}
                    onClick={() => onTaskClick?.(task)}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task.id) }}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0",
                        taskFilter === 'overdue'
                          ? "border-red-400 hover:bg-red-500/20"
                          : "border-muted-foreground hover:border-primary hover:bg-primary/10"
                      )}
                    >
                      <Circle className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                    </button>

                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: task.workspaceColor }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{task.title}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{task.workspaceName}</span>
                        <span>·</span>
                        <span>{task.categoryName}</span>
                        {task.estimatedMinutes && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {task.estimatedMinutes}m
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {task.urgency === 'high' && (
                        <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 text-xs font-medium">
                          高優先
                        </span>
                      )}
                      {task.dueDate && (
                        <span className={cn(
                          "text-sm",
                          new Date(task.dueDate) < now ? "text-red-500 font-medium" : "text-muted-foreground"
                        )}>
                          {new Date(task.dueDate) < now 
                            ? `過期 ${getDaysOverdue(task.dueDate)} 天`
                            : formatDate(task.dueDate)
                          }
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'workspaces' && (
          <div className="p-6">
            <div className="grid grid-cols-3 gap-6">
              {workspaceStats.map(ws => (
                <div 
                  key={ws.id}
                  className={cn(
                    "rounded-xl border transition-all overflow-hidden",
                    selectedWorkspace === ws.id 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-border hover:shadow-md"
                  )}
                >
                  {/* Header */}
                  <div 
                    className="p-4 cursor-pointer"
                    style={{ backgroundColor: `${ws.color}10` }}
                    onClick={() => setSelectedWorkspace(selectedWorkspace === ws.id ? null : ws.id)}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div 
                        className="w-5 h-5 rounded-full"
                        style={{ backgroundColor: ws.color }}
                      />
                      <span className="text-lg font-semibold">{ws.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {ws.stats.completed}/{ws.stats.total} 完成
                      </span>
                      <span className="font-bold text-lg">{ws.stats.completionRate}%</span>
                    </div>
                    <div className="mt-2 h-2 bg-white/50 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full"
                        style={{ 
                          width: `${ws.stats.completionRate}%`,
                          backgroundColor: ws.color 
                        }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="p-4 bg-card grid grid-cols-3 gap-2 text-center border-t border-border">
                    <div>
                      <div className="text-lg font-bold text-blue-600">{ws.stats.today}</div>
                      <div className="text-xs text-muted-foreground">今日</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-red-600">{ws.stats.overdue}</div>
                      <div className="text-xs text-muted-foreground">過期</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{ws.stats.pending}</div>
                      <div className="text-xs text-muted-foreground">待處理</div>
                    </div>
                  </div>

                  {/* Categories */}
                  {selectedWorkspace === ws.id && (
                    <div className="border-t border-border">
                      {ws.categories?.filter(c => !c.isArchived).map(cat => {
                        const catTasks = cat.tasks || []
                        const catCompleted = catTasks.filter(t => t.isCompleted).length
                        const catPending = catTasks.filter(t => !t.isCompleted)
                        const isExpanded = expandedCategories.has(cat.id)

                        return (
                          <div key={cat.id} className="border-b border-border last:border-0">
                            <button
                              onClick={() => toggleCategory(cat.id)}
                              className="w-full flex items-center justify-between p-3 hover:bg-secondary/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <ChevronDown className={cn(
                                  "w-4 h-4 transition-transform",
                                  !isExpanded && "-rotate-90"
                                )} />
                                <span className="font-medium text-sm">{cat.name}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {catCompleted}/{catTasks.length}
                              </span>
                            </button>
                            
                            {isExpanded && catPending.length > 0 && (
                              <div className="px-3 pb-3 space-y-1">
                                {catPending.slice(0, 5).map(task => (
                                  <div
                                    key={task.id}
                                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer text-sm"
                                    onClick={() => onTaskClick?.(task)}
                                  >
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task.id) }}
                                      className="w-4 h-4 rounded-full border border-muted-foreground flex-shrink-0"
                                    />
                                    <span className="truncate">{task.title}</span>
                                  </div>
                                ))}
                                {catPending.length > 5 && (
                                  <div className="text-xs text-muted-foreground pl-6">
                                    還有 {catPending.length - 5} 個任務...
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
