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
  ChevronsDownUp,
  LayoutGrid,
  List,
  Filter,
  Minimize2,
  Circle,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Hourglass,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import type { Workspace, Task } from '@/lib/types'

type TaskSortKey = 'category' | 'dueDate' | 'urgency' | 'created'

/**
 * Returns a new array of tasks sorted according to the chosen key.
 *
 * Used in two places: the flat list view (sorts the whole list) and the
 * grouped view (sorts within each category). 'category' is a no-op for the
 * grouped view because tasks are already grouped by workspace+category;
 * the flat list version uses workspace/category names as the sort key
 * instead, but for grouped per-category lists we just preserve insertion
 * order (which already follows sortOrder).
 */
function applySortBy(tasks: Task[], sortBy: TaskSortKey): Task[] {
  const sorted = [...tasks]
  switch (sortBy) {
    case 'urgency':
      sorted.sort((a, b) => (b.urgency || 0) - (a.urgency || 0))
      break
    case 'dueDate':
      sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      })
      break
    case 'created':
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      break
    case 'category':
    default:
      sorted.sort((a, b) => {
        const ws = (a.workspaceName || '').localeCompare(b.workspaceName || '')
        if (ws !== 0) return ws
        return (a.categoryName || '').localeCompare(b.categoryName || '')
      })
      break
  }
  return sorted
}

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
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set(workspaces.map(w => w.id)))
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('grouped')
  const [sortBy, setSortBy] = useState<'category' | 'dueDate' | 'urgency' | 'created'>('category')
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'relaxed'>('comfortable')
  const [addingTaskInCategory, setAddingTaskInCategory] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  
  const now = new Date()
  const todayStr = toDateString(now)
  
  // Gather all tasks. Tasks marked 加入左側任務欄 = false (e.g. recurring
  // meetings) live only on the calendar — exclude them from this view too
  // so the task-management screen stays in sync with the left panel.
  const allTasks = useMemo(() => {
    const tasks: (Task & { workspaceName: string; workspaceColor: string; categoryName: string })[] = []
    workspaces.forEach(ws => {
      if (!ws.isArchived) {
        ws.categories?.forEach(cat => {
          if (!cat.isArchived) {
            cat.tasks?.forEach(task => {
              if (task.showInTaskList === false) return
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
    const highPriority = allTasks.filter(t => !t.isCompleted && t.urgency >= 8)

    // Calculate streak
    let streak = 0
    const checkDate = new Date(now)
    for (let i = 0; i < 30; i++) {
      const dateStr = toDateString(checkDate)
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
        tasks = tasks.filter(t => t.scheduledDate === todayStr)
        break
      case 'upcoming':
        tasks = tasks.filter(t => {
          if (!t.dueDate) return false
          const due = new Date(t.dueDate)
          const threeDaysLater = new Date(now)
          threeDaysLater.setDate(threeDaysLater.getDate() + 3)
          return due >= now && due <= threeDaysLater
        })
        break
      case 'overdue':
        tasks = tasks.filter(t => {
          if (!t.dueDate) return false
          return new Date(t.dueDate) < now
        })
        break
      case 'unscheduled':
        tasks = tasks.filter(t => !t.scheduledDate)
        break
    }

    // Apply sort. Returns a new array — don't mutate the source filter result.
    return applySortBy(tasks, sortBy)
  }, [allTasks, taskFilter, selectedWorkspace, searchQuery, sortBy, todayStr, now, workspaces])

  // Workspace stats
  const workspaceStats = useMemo(() => {
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const upcoming = new Date(now)
    upcoming.setDate(upcoming.getDate() + 3)

    return workspaces
      .filter(ws => !ws.isArchived)
      .map(ws => {
        const cats = ws.categories?.filter(c => !c.isArchived) ?? []
        const tasks = cats.flatMap(cat => cat.tasks || [])
        const total = tasks.length
        const pending = tasks.filter(t => !t.isCompleted)
        const completed = tasks.filter(t => t.isCompleted)

        const overdueTasks = pending.filter(t => t.dueDate && new Date(t.dueDate) < now)
        const todayTasks = pending.filter(t => t.scheduledDate === todayStr)
        const upcomingTasks = pending.filter(t => {
          if (!t.dueDate) return false
          const d = new Date(t.dueDate)
          return d >= now && d <= upcoming
        })
        const stuckTasks = pending.filter(t => !t.scheduledDate && !t.dueDate && new Date(t.createdAt) < sevenDaysAgo)

        // Workload — sum of estimated minutes for incomplete tasks
        const estimatedMin = pending.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0)

        // "Most urgent next-up" — surfaces a single task to the PM:
        //   priority: overdue (most days first) → today → high urgency → others
        const sortedByUrgency = [...pending].sort((a, b) => {
          const aOver = a.dueDate ? Math.max(0, now.getTime() - new Date(a.dueDate).getTime()) : 0
          const bOver = b.dueDate ? Math.max(0, now.getTime() - new Date(b.dueDate).getTime()) : 0
          if (aOver !== bOver) return bOver - aOver
          const aToday = a.scheduledDate === todayStr ? 1 : 0
          const bToday = b.scheduledDate === todayStr ? 1 : 0
          if (aToday !== bToday) return bToday - aToday
          if ((a.urgency || 0) !== (b.urgency || 0)) return (b.urgency || 0) - (a.urgency || 0)
          return 0
        })
        const mostUrgent = sortedByUrgency[0] ?? null

        // Per-category progress — for a quick structural overview
        const categoryProgress = cats.map(c => {
          const cTotal = c.tasks?.length || 0
          const cDone = c.tasks?.filter(t => t.isCompleted).length || 0
          return {
            id: c.id,
            name: c.name,
            total: cTotal,
            completed: cDone,
            percent: cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0,
          }
        })

        // Health signal — at-a-glance trust indicator
        const overdueRatio = total > 0 ? overdueTasks.length / total : 0
        let health: 'healthy' | 'caution' | 'warning' = 'healthy'
        if (overdueTasks.length >= 5 || overdueRatio > 0.3) health = 'warning'
        else if (overdueTasks.length >= 1 || stuckTasks.length >= 3) health = 'caution'

        return {
          ...ws,
          categoryProgress,
          mostUrgent,
          stats: {
            total,
            completed: completed.length,
            pending: pending.length,
            overdue: overdueTasks.length,
            today: todayTasks.length,
            upcoming: upcomingTasks.length,
            stuck: stuckTasks.length,
            estimatedMin,
            completionRate: total > 0 ? Math.round((completed.length / total) * 100) : 0,
            health,
          },
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
    if (dateStr === toDateString(tomorrow)) return '明天'
    
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
                    ? "bg-info/10 border-2 border-info" 
                    : "bg-card border border-border hover:border-info/50"
                )}
                onClick={() => { setActiveTab('tasks'); setTaskFilter('today') }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-info/10">
                    <Calendar className="w-4 h-4 text-info" />
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
                    ? "bg-urgency-medium/10 border-2 border-urgency-medium" 
                    : "bg-card border border-border hover:border-urgency-medium/50"
                )}
                onClick={() => { setActiveTab('tasks'); setTaskFilter('upcoming') }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-urgency-medium/10">
                    <Clock className="w-4 h-4 text-urgency-medium" />
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
                    ? "bg-urgency-critical/10 border-2 border-urgency-critical" 
                    : "bg-card border border-border hover:border-urgency-critical/50"
                )}
                onClick={() => { setActiveTab('tasks'); setTaskFilter('overdue') }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-urgency-critical/10">
                    <AlertTriangle className="w-4 h-4 text-urgency-critical" />
                  </div>
                  <span className="text-sm text-muted-foreground">已過期</span>
                </div>
                <div className="text-2xl font-bold text-urgency-critical">{stats.overdue.length}</div>
                <div className="text-xs text-urgency-critical mt-1">可以先看看</div>
              </div>

              <div className="p-4 rounded-xl bg-urgency-high/10 border border-urgency-high/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-urgency-high/20">
                    <Flame className="w-4 h-4 text-urgency-high" />
                  </div>
                  <span className="text-sm text-muted-foreground">連續天數</span>
                </div>
                <div className="text-2xl font-bold text-urgency-high">{stats.streak}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stats.streak > 0 ? '保持這個節奏' : '今天開始'}
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
                            <span className="px-2 py-0.5 rounded-full bg-urgency-critical/10 text-urgency-critical text-xs font-medium">
                              {ws.stats.overdue} 過期
                            </span>
                          )}
                          {ws.stats.today > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-info/10 text-info text-xs font-medium">
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
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-urgency-critical">
                      <AlertTriangle className="w-5 h-5" />
                      可以先處理
                    </h2>
                    <div className="space-y-2">
                      {stats.overdue.slice(0, 5).map(task => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-urgency-critical/5 border border-urgency-critical/30 hover:bg-urgency-critical/10 transition-colors cursor-pointer"
                          onClick={() => onTaskClick?.(task)}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task.id) }}
                            className="w-5 h-5 rounded-full border-2 border-urgency-critical/50 hover:bg-urgency-critical/20 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{task.title}</div>
                            <div className="text-xs text-urgency-critical">
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
                          className="w-full text-center text-sm text-urgency-critical py-2 hover:underline"
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
                      <Target className="w-5 h-5 text-urgency-high" />
                      高優先任務
                    </h2>
                    <div className="space-y-2">
                      {stats.highPriority.slice(0, 4).map(task => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-urgency-high/50 transition-colors cursor-pointer"
                          onClick={() => onTaskClick?.(task)}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task.id) }}
                            className="w-5 h-5 rounded-full border-2 border-urgency-high/50 hover:bg-urgency-high/20 flex-shrink-0"
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
            {/* Filter Bar Row 1 */}
            <div className="flex items-center gap-4 mb-4">
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

            {/* Filter Bar Row 2: View Controls */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {/* View Mode */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary">
                  <button
                    onClick={() => setViewMode('grouped')}
                    aria-pressed={viewMode === 'grouped'}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-all",
                      viewMode === 'grouped'
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                    )}
                  >
                    依分類
                  </button>
                  <button
                    onClick={() => setViewMode('flat')}
                    aria-pressed={viewMode === 'flat'}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-all",
                      viewMode === 'flat'
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                    )}
                  >
                    列表
                  </button>
                </div>

                {/* Sort By */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs"
                >
                  <option value="category">依分類</option>
                  <option value="dueDate">依到期日</option>
                  <option value="urgency">依優先度</option>
                  <option value="created">依建立時間</option>
                </select>

                {/* Expand/Collapse All - only show in grouped view */}
                {viewMode === 'grouped' && (
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => {
                        // Expand all workspaces and categories
                        const allWsIds = workspaces.filter(w => !w.isArchived).map(w => w.id)
                        const allCatIds = workspaces.flatMap(w => w.categories?.map(c => c.id) || [])
                        setExpandedWorkspaces(new Set(allWsIds))
                        setExpandedCategories(new Set(allCatIds))
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="展開全部"
                    >
                      <ChevronsDownUp className="w-3.5 h-3.5 rotate-180" />
                    </button>
                    <button
                      onClick={() => {
                        // Collapse all
                        setExpandedWorkspaces(new Set())
                        setExpandedCategories(new Set())
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="收合全部"
                    >
                      <ChevronsDownUp className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Density */}
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary">
                  {[
                    { id: 'compact', label: '緊湊' },
                    { id: 'comfortable', label: '舒適' },
                    { id: 'relaxed', label: '寬鬆' },
                  ].map(d => (
                    <button
                      key={d.id}
                      onClick={() => setDensity(d.id as typeof density)}
                      aria-pressed={density === d.id}
                      className={cn(
                        "px-2.5 py-1 rounded text-xs font-medium transition-all",
                        density === d.id
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Task List */}
            <div className="space-y-4">
              {filteredTasks.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary/50 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div className="text-lg font-medium text-muted-foreground">
                    {taskFilter === 'overdue' ? '太棒了！沒有過期任務' : '沒有符合條件的任務'}
                  </div>
                </div>
              ) : viewMode === 'grouped' ? (
                /* Grouped View */
                workspaces.filter(ws => !ws.isArchived && (!selectedWorkspace || ws.id === selectedWorkspace)).map(workspace => {
                  const wsTasksRaw = workspace.categories?.flatMap(cat => 
                    cat.tasks?.filter(t => !t.isCompleted).map(t => ({
                      ...t,
                      workspaceName: workspace.name,
                      workspaceColor: workspace.color,
                      categoryName: cat.name,
                      categoryId: cat.id
                    })) || []
                  ) || []
                  
                  // Apply filters
                  const wsTasks = wsTasksRaw.filter(task => {
                    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
                    if (taskFilter === 'today') return task.scheduledDate === todayStr || task.dueDate === todayStr
                    if (taskFilter === 'upcoming') {
                      if (!task.dueDate) return false
                      const due = new Date(task.dueDate)
                      const threeDaysFromNow = new Date(now)
                      threeDaysFromNow.setDate(now.getDate() + 3)
                      return due > now && due <= threeDaysFromNow
                    }
                    if (taskFilter === 'overdue') return task.dueDate && new Date(task.dueDate) < now
                    if (taskFilter === 'unscheduled') return !task.scheduledDate && !task.dueDate
                    return true
                  })

                  if (wsTasks.length === 0) return null
                  
                  const isExpanded = expandedWorkspaces.has(workspace.id)
                  
                  return (
                    <div key={workspace.id} className="rounded-xl border border-border overflow-hidden">
                      {/* Workspace Header */}
                      <button
                        onClick={() => {
                          const newSet = new Set(expandedWorkspaces)
                          if (isExpanded) newSet.delete(workspace.id)
                          else newSet.add(workspace.id)
                          setExpandedWorkspaces(newSet)
                        }}
                        className="w-full flex items-center gap-3 p-4 bg-card hover:bg-secondary/50 transition-colors"
                      >
                        <ChevronDown className={cn("w-4 h-4 transition-transform", !isExpanded && "-rotate-90")} />
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: workspace.color }} />
                        <span className="font-semibold">{workspace.name}</span>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-secondary">
                          {wsTasks.length}
                        </span>
                      </button>

                      {/* Categories */}
                      {isExpanded && (
                        <div className="border-t border-border">
                          {workspace.categories?.filter(cat => !cat.isArchived).map(category => {
                            // Apply the same sort key inside each category so the
                            // sort dropdown actually does something in grouped view.
                            const catTasks = applySortBy(
                              wsTasks.filter(t => t.categoryId === category.id),
                              sortBy
                            )
                            if (catTasks.length === 0 && addingTaskInCategory !== category.id) return null
                            const isCatExpanded = expandedCategories.has(category.id)
                            
                            return (
                              <div key={category.id} className="border-b border-border last:border-b-0">
                                {/* Category Header */}
                                <button
                                  onClick={() => {
                                    const newSet = new Set(expandedCategories)
                                    if (isCatExpanded) newSet.delete(category.id)
                                    else newSet.add(category.id)
                                    setExpandedCategories(newSet)
                                  }}
                                  className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-secondary/30 transition-colors"
                                >
                                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", !isCatExpanded && "-rotate-90")} />
                                  <span className="text-sm font-medium">{category.name}</span>
                                  <span className="text-xs text-muted-foreground">{catTasks.length}</span>
                                </button>

                                {/* Tasks */}
                                {isCatExpanded && (
                                  <div className={cn(
                                    "px-4 pb-2",
                                    density === 'compact' && "space-y-1",
                                    density === 'comfortable' && "space-y-2",
                                    density === 'relaxed' && "space-y-3"
                                  )}>
                                    {catTasks.map(task => (
                                      <div
                                        key={task.id}
                                        className={cn(
                                          "flex items-center gap-3 rounded-lg border transition-all cursor-pointer group",
                                          "bg-card border-border hover:border-primary/30 hover:shadow-sm",
                                          density === 'compact' && "px-3 py-2",
                                          density === 'comfortable' && "px-4 py-3",
                                          density === 'relaxed' && "px-4 py-4"
                                        )}
                                        style={{ borderLeftColor: workspace.color, borderLeftWidth: '3px' }}
                                        onClick={() => onTaskClick?.(task)}
                                      >
                                        <button
                                          onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task.id) }}
                                          className="w-5 h-5 rounded-full border-2 border-muted-foreground hover:border-primary hover:bg-primary/10 flex-shrink-0 transition-colors"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className={cn(
                                            "font-medium truncate",
                                            density === 'compact' && "text-sm"
                                          )}>{task.title}</div>
                                          {density !== 'compact' && task.estimatedMinutes && (
                                            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                                              <Clock className="w-3 h-3" />
                                              {task.estimatedMinutes}m
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {task.urgency > 0 && (
                                            <span className={cn(
                                              "px-1.5 py-0.5 rounded text-[10px] font-medium",
                                              task.urgency >= 8 && "bg-urgency-critical/10 text-urgency-critical",
                                              task.urgency >= 5 && task.urgency < 8 && "bg-urgency-high/10 text-urgency-high",
                                              task.urgency < 5 && "bg-success/10 text-success"
                                            )}>
                                              {task.urgency >= 8 ? '高' : task.urgency >= 5 ? '中' : '低'}
                                            </span>
                                          )}
                                          {task.dueDate && (
                                            <span className={cn(
                                              "text-xs",
                                              new Date(task.dueDate) < now ? "text-urgency-critical font-medium" : "text-muted-foreground"
                                            )}>
                                              {formatDate(task.dueDate)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}

                                    {/* Add Task Button */}
                                    {addingTaskInCategory === category.id ? (
                                      <div className="flex items-center gap-2 px-3 py-2">
                                        <input
                                          type="text"
                                          value={newTaskTitle}
                                          onChange={(e) => setNewTaskTitle(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newTaskTitle.trim()) {
                                              onAddTask?.(category.id, newTaskTitle.trim())
                                              setNewTaskTitle('')
                                              setAddingTaskInCategory(null)
                                            } else if (e.key === 'Escape') {
                                              setNewTaskTitle('')
                                              setAddingTaskInCategory(null)
                                            }
                                          }}
                                          placeholder="輸入任務名稱..."
                                          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                                          autoFocus
                                        />
                                        <button
                                          onClick={() => {
                                            if (newTaskTitle.trim()) {
                                              onAddTask?.(category.id, newTaskTitle.trim())
                                              setNewTaskTitle('')
                                            }
                                            setAddingTaskInCategory(null)
                                          }}
                                          className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                                        >
                                          新增
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setAddingTaskInCategory(category.id)}
                                        className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        新增任務
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                /* Flat List View — density controls how much information is shown:
                   緊湊 = title + workspace tag only
                   舒適 = + category, duration, urgency badge, due date
                   寬鬆 = + description preview, larger spacing */
                filteredTasks.map(task => {
                  const isOverdue = !!(task.dueDate && new Date(task.dueDate) < now)
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'flex rounded-xl border transition-all cursor-pointer group',
                        taskFilter === 'overdue'
                          ? 'bg-urgency-critical/5 border-urgency-critical/30 hover:bg-urgency-critical/10'
                          : 'bg-card border-border hover:border-primary/30 hover:shadow-sm',
                        density === 'compact' && 'items-center gap-3 px-3 py-2',
                        density === 'comfortable' && 'items-center gap-4 px-4 py-3',
                        density === 'relaxed' && 'items-start gap-4 px-5 py-4'
                      )}
                      onClick={() => onTaskClick?.(task)}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task.id) }}
                        aria-label={task.isCompleted ? '標記為未完成' : '標記為完成'}
                        className={cn(
                          'rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0',
                          density === 'compact' ? 'w-4 h-4 mt-0' : 'w-5 h-5',
                          density === 'relaxed' && 'mt-1',
                          isOverdue
                            ? 'border-urgency-critical/50 hover:bg-urgency-critical/20'
                            : 'border-muted-foreground hover:border-primary hover:bg-primary/10'
                        )}
                      />

                      <div className="flex-1 min-w-0">
                        {/* Title row: workspace tag + title (always visible) */}
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Workspace tag in front — identifies the bucket at a glance */}
                          <span
                            className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${task.workspaceColor}20`,
                              color: task.workspaceColor,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: task.workspaceColor }}
                            />
                            {task.workspaceName}
                          </span>
                          <div
                            className={cn(
                              'font-medium truncate',
                              density === 'compact' ? 'text-sm' : 'text-base'
                            )}
                          >
                            {task.title}
                          </div>
                        </div>

                        {/* Comfortable + Relaxed: meta line */}
                        {density !== 'compact' && (
                          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                            <span>{task.categoryName}</span>
                            {task.estimatedMinutes && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" aria-hidden="true" />
                                  {task.estimatedMinutes}m
                                </span>
                              </>
                            )}
                            {task.scheduledDate && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>排程 {formatDate(task.scheduledDate)}</span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Relaxed only: description preview */}
                        {density === 'relaxed' && task.description && (
                          <p className="mt-2 text-xs text-foreground/70 leading-relaxed line-clamp-2">
                            {task.description}
                          </p>
                        )}
                      </div>

                      {/* Right side: badges (舒適+寬鬆) — compact mode hides these */}
                      <div
                        className={cn(
                          'flex items-center gap-2 flex-shrink-0',
                          density === 'relaxed' && 'mt-0.5'
                        )}
                      >
                        {density !== 'compact' && task.urgency >= 8 && (
                          <span className="px-2 py-0.5 rounded-full bg-urgency-high/10 text-urgency-high text-xs font-medium">
                            高優先
                          </span>
                        )}
                        {density !== 'compact' && task.dueDate && (
                          <span
                            className={cn(
                              'text-xs whitespace-nowrap',
                              isOverdue ? 'text-urgency-critical font-medium' : 'text-muted-foreground'
                            )}
                          >
                            {isOverdue
                              ? `過期 ${getDaysOverdue(task.dueDate)} 天`
                              : formatDate(task.dueDate)}
                          </span>
                        )}
                        {/* Compact: a single tiny urgency dot or overdue mark, no labels */}
                        {density === 'compact' && task.urgency >= 8 && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-urgency-high"
                            aria-label="高優先"
                            title="高優先"
                          />
                        )}
                        {density === 'compact' && isOverdue && (
                          <span
                            className="text-[10px] font-medium text-urgency-critical whitespace-nowrap"
                            aria-label="已過期"
                          >
                            過期
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity [@media(hover:none)]:opacity-100" />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'workspaces' && (
          <WorkspacesView
            workspaceStats={workspaceStats}
            now={now}
            todayStr={todayStr}
            formatDate={formatDate}
            getDaysOverdue={getDaysOverdue}
            onTaskClick={onTaskClick}
            onToggleComplete={onToggleComplete}
            onDrillIn={(wsId, filter) => {
              setSelectedWorkspace(wsId)
              setTaskFilter(filter)
              setActiveTab('tasks')
              setViewMode('flat')
            }}
          />
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Workspaces tab — designed to answer the PM's primary question at a glance:
//   "Can I trust this workspace to hit its targets, and what should I do
//    about the ones I can't?"
//
// Layout:
//   1. Cross-workspace summary banner (overall numbers, scannable)
//   2. Per-workspace cards with:
//        · Health badge (healthy / caution / warning) + workload
//        · Visual progress ring + completion text
//        · Three clickable KPI tiles (today / overdue / pending) → drill in
//        · "Most urgent next-up" task (the one to act on first)
//        · Top-N category progress bars
//        · CTA to open the filtered task list
// ────────────────────────────────────────────────────────────────────────────

type DrillFilter = 'all' | 'today' | 'overdue' | 'unscheduled' | 'upcoming'

interface WorkspaceStat {
  id: string
  name: string
  color: string
  icon?: string
  categoryProgress: { id: string; name: string; total: number; completed: number; percent: number }[]
  mostUrgent: Task | null
  stats: {
    total: number
    completed: number
    pending: number
    overdue: number
    today: number
    upcoming: number
    stuck: number
    estimatedMin: number
    completionRate: number
    health: 'healthy' | 'caution' | 'warning'
  }
}

function formatHours(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes < 60) return `${minutes} 分`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} 小時` : `${h}.${Math.round((m / 60) * 10)} 小時`
}

interface WorkspacesViewProps {
  workspaceStats: WorkspaceStat[]
  now: Date
  todayStr: string
  formatDate: (d: string) => string
  getDaysOverdue: (d: string) => number
  onTaskClick?: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onDrillIn: (workspaceId: string, filter: DrillFilter) => void
}

function WorkspacesView({
  workspaceStats,
  now,
  formatDate,
  getDaysOverdue,
  onTaskClick,
  onToggleComplete,
  onDrillIn,
}: WorkspacesViewProps) {
  // Aggregate cross-workspace summary
  const summary = useMemo(() => {
    return workspaceStats.reduce(
      (acc, ws) => {
        acc.total += ws.stats.total
        acc.completed += ws.stats.completed
        acc.pending += ws.stats.pending
        acc.overdue += ws.stats.overdue
        acc.today += ws.stats.today
        acc.upcoming += ws.stats.upcoming
        acc.stuck += ws.stats.stuck
        acc.estimatedMin += ws.stats.estimatedMin
        return acc
      },
      { total: 0, completed: 0, pending: 0, overdue: 0, today: 0, upcoming: 0, stuck: 0, estimatedMin: 0 }
    )
  }, [workspaceStats])

  if (workspaceStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <LayoutGrid className="w-10 h-10 mb-3 opacity-40" aria-hidden="true" />
        <p className="text-sm">尚無工作區，先建立一個來開始排程任務。</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary banner */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-card to-secondary/30 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">整體狀態</h2>
            <p className="text-xs text-muted-foreground">
              {workspaceStats.length} 個工作區 · {summary.pending} 個待處理任務
            </p>
          </div>
          {summary.overdue > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-urgency-critical/10 text-urgency-critical text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              {summary.overdue} 個過期需處理
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryStat icon={<Calendar className="w-3.5 h-3.5" aria-hidden="true" />} label="今日排程" value={summary.today} tone="primary" />
          <SummaryStat icon={<Clock className="w-3.5 h-3.5" aria-hidden="true" />} label="七日內到期" value={summary.upcoming} tone="amber" />
          <SummaryStat icon={<AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />} label="過期" value={summary.overdue} tone={summary.overdue > 0 ? 'red' : 'neutral'} />
          <SummaryStat icon={<Hourglass className="w-3.5 h-3.5" aria-hidden="true" />} label="估計工時" value={formatHours(summary.estimatedMin)} tone="neutral" />
        </div>
      </div>

      {/* Workspace cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {workspaceStats.map((ws) => (
          <WorkspaceCard
            key={ws.id}
            ws={ws}
            now={now}
            formatDate={formatDate}
            getDaysOverdue={getDaysOverdue}
            onTaskClick={onTaskClick}
            onToggleComplete={onToggleComplete}
            onDrillIn={onDrillIn}
          />
        ))}
      </div>
    </div>
  )
}

function SummaryStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  tone: 'primary' | 'red' | 'amber' | 'neutral'
}) {
  const toneClasses =
    tone === 'red'
      ? 'text-urgency-critical'
      : tone === 'amber'
      ? 'text-urgency-medium'
      : tone === 'primary'
      ? 'text-primary'
      : 'text-foreground'
  return (
    <div className="rounded-lg bg-background/60 border border-border/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn('text-xl font-bold tabular-nums', toneClasses)}>{value}</div>
    </div>
  )
}

interface WorkspaceCardProps {
  ws: WorkspaceStat
  now: Date
  formatDate: (d: string) => string
  getDaysOverdue: (d: string) => number
  onTaskClick?: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onDrillIn: (workspaceId: string, filter: DrillFilter) => void
}

function WorkspaceCard({
  ws,
  now,
  formatDate,
  getDaysOverdue,
  onTaskClick,
  onToggleComplete,
  onDrillIn,
}: WorkspaceCardProps) {
  const { stats, mostUrgent, categoryProgress } = ws

  // Sort categories by completion rate desc to surface progress; cap to 4
  const topCategories = useMemo(() => {
    return [...categoryProgress].sort((a, b) => b.percent - a.percent).slice(0, 4)
  }, [categoryProgress])
  const remainingCats = categoryProgress.length - topCategories.length

  const urgentMeta = mostUrgent
    ? mostUrgent.dueDate && new Date(mostUrgent.dueDate) < now
      ? { tone: 'red' as const, label: `過期 ${getDaysOverdue(mostUrgent.dueDate)} 天` }
      : mostUrgent.scheduledStartTime
      ? { tone: 'primary' as const, label: `${mostUrgent.scheduledStartTime}` }
      : mostUrgent.dueDate
      ? { tone: 'amber' as const, label: `截止 ${formatDate(mostUrgent.dueDate)}` }
      : { tone: 'neutral' as const, label: '未排程' }
    : null

  const r = 22
  const c = 2 * Math.PI * r
  const dash = (stats.completionRate / 100) * c

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col transition-shadow hover:shadow-md">
      {/* Card Header */}
      <div className="px-5 pt-4 pb-3" style={{ backgroundColor: `${ws.color}10` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl flex-shrink-0" aria-hidden="true">
              {ws.icon || '📁'}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{ws.name}</h3>
              <p className="text-[11px] text-muted-foreground">
                {stats.total} 個任務 · 估計 {formatHours(stats.estimatedMin)}
              </p>
            </div>
          </div>
          <HealthBadge health={stats.health} />
        </div>
      </div>

      {/* Progress + KPIs */}
      <div className="px-5 py-4 flex items-center gap-4 border-b border-border/60">
        {/* Donut */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted/40" />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              style={{ stroke: ws.color }}
              className="transition-[stroke-dasharray] duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-bold tabular-nums leading-none">
              {stats.completionRate}%
            </span>
            <span className="text-[9px] text-muted-foreground leading-none mt-0.5">
              {stats.completed}/{stats.total}
            </span>
          </div>
        </div>
        {/* KPI tiles (clickable, drill into filtered task list) */}
        <div className="flex-1 grid grid-cols-3 gap-1.5 min-w-0">
          <KpiTile label="今日" value={stats.today} tone="primary" onClick={() => onDrillIn(ws.id, 'today')} />
          <KpiTile label="過期" value={stats.overdue} tone={stats.overdue > 0 ? 'red' : 'neutral'} onClick={() => onDrillIn(ws.id, 'overdue')} />
          <KpiTile label="待處理" value={stats.pending} tone="neutral" onClick={() => onDrillIn(ws.id, 'all')} />
        </div>
      </div>

      {/* Most urgent next-up */}
      {mostUrgent && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onTaskClick?.(mostUrgent)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onTaskClick?.(mostUrgent)
            }
          }}
          aria-label={`開啟最緊急任務：${mostUrgent.title}`}
          className="text-left px-5 py-3 border-b border-border/60 hover:bg-secondary/40 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset cursor-pointer"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Flame className="w-3 h-3 text-urgency-high" aria-hidden="true" />
            <span className="text-[10px] font-semibold text-urgency-high uppercase tracking-wide">最緊急</span>
          </div>
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleComplete?.(mostUrgent.id) }}
              aria-label="標記為完成"
              className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 border-muted-foreground hover:border-primary hover:bg-primary/10 transition"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{mostUrgent.title}</div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                <span className="text-muted-foreground">{mostUrgent.categoryName}</span>
                {urgentMeta && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 font-medium',
                      urgentMeta.tone === 'red' && 'text-urgency-critical',
                      urgentMeta.tone === 'amber' && 'text-urgency-medium',
                      urgentMeta.tone === 'primary' && 'text-primary',
                      urgentMeta.tone === 'neutral' && 'text-muted-foreground'
                    )}
                  >
                    · {urgentMeta.label}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity [@media(hover:none)]:opacity-100 flex-shrink-0 mt-0.5" />
          </div>
        </div>
      )}

      {/* Categories */}
      {topCategories.length > 0 && (
        <div className="px-5 py-3 space-y-2 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">分類進度</span>
            {remainingCats > 0 && (
              <span className="text-[10px] text-muted-foreground/70">+{remainingCats} 個</span>
            )}
          </div>
          <div className="space-y-1.5">
            {topCategories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 min-w-0 truncate text-foreground/85">{c.name}</span>
                <div className="w-16 h-1 rounded-full bg-muted overflow-hidden flex-shrink-0">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${c.percent}%`, backgroundColor: ws.color }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums text-muted-foreground text-[11px]">
                  {c.completed}/{c.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Caution footer (stuck tasks) */}
      {stats.stuck > 0 && (
        <div className="px-5 py-2 border-t border-border/60 bg-urgency-medium/5">
          <button
            type="button"
            onClick={() => onDrillIn(ws.id, 'unscheduled')}
            className="w-full flex items-center gap-1.5 text-[11px] text-urgency-medium hover:text-urgency-high transition-colors"
          >
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            <span>{stats.stuck} 個任務超過 7 天未排程</span>
            <ArrowRight className="w-3 h-3 ml-auto" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* CTA footer */}
      <button
        type="button"
        onClick={() => onDrillIn(ws.id, 'all')}
        className="px-5 py-3 border-t border-border/60 flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span>檢視所有任務</span>
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

function HealthBadge({ health }: { health: 'healthy' | 'caution' | 'warning' }) {
  const config = {
    healthy: { Icon: ShieldCheck, label: '健康', cls: 'bg-success/10 text-success' },
    caution: { Icon: Shield, label: '注意', cls: 'bg-urgency-medium/10 text-urgency-medium' },
    warning: { Icon: ShieldAlert, label: '警示', cls: 'bg-urgency-critical/10 text-urgency-critical' },
  } as const
  const { Icon, label, cls } = config[health]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0',
        cls
      )}
      aria-label={`狀態：${label}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {label}
    </span>
  )
}

function KpiTile({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: number
  tone: 'primary' | 'red' | 'neutral'
  onClick: () => void
}) {
  const toneClasses =
    tone === 'red'
      ? 'text-urgency-critical'
      : tone === 'primary'
      ? 'text-primary'
      : 'text-foreground'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={value === 0}
      className={cn(
        'rounded-lg px-2 py-1.5 text-left transition-all',
        'bg-secondary/40 hover:bg-secondary border border-transparent hover:border-border',
        'disabled:opacity-50 disabled:cursor-default disabled:hover:bg-secondary/40 disabled:hover:border-transparent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-bold tabular-nums', toneClasses)}>{value}</div>
    </button>
  )
}
