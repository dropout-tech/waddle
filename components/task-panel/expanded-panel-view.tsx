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
  Filter,
  LayoutGrid,
  List
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace, Task } from '@/lib/types'

interface ExpandedPanelViewProps {
  workspaces: Workspace[]
  onTaskClick?: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
}

export function ExpandedPanelView({ 
  workspaces, 
  onTaskClick,
  onToggleComplete 
}: ExpandedPanelViewProps) {
  const [viewType, setViewType] = useState<'overview' | 'today' | 'upcoming' | 'overdue'>('overview')
  
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  
  // Gather all tasks
  const allTasks = useMemo(() => {
    const tasks: Task[] = []
    workspaces.forEach(ws => {
      if (!ws.isArchived) {
        ws.categories?.forEach(cat => {
          if (!cat.isArchived) {
            tasks.push(...(cat.tasks || []))
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
    const highPriority = allTasks.filter(t => !t.isCompleted && t.urgency === 'high')

    // Calculate streak (consecutive days with completed tasks)
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
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      today,
      todayCompleted,
      todayTotal: today.length + todayCompleted.length,
      overdue,
      upcoming,
      highPriority,
      streak
    }
  }, [allTasks, todayStr, now])

  // Get tasks based on view type
  const displayTasks = useMemo(() => {
    switch (viewType) {
      case 'today':
        return [...stats.today, ...stats.todayCompleted]
      case 'upcoming':
        return stats.upcoming
      case 'overdue':
        return stats.overdue
      default:
        return []
    }
  }, [viewType, stats])

  // Group tasks by workspace for overview
  const tasksByWorkspace = useMemo(() => {
    return workspaces
      .filter(ws => !ws.isArchived)
      .map(ws => {
        const tasks = ws.categories?.flatMap(cat => cat.tasks || []) || []
        const total = tasks.length
        const completed = tasks.filter(t => t.isCompleted).length
        const pending = total - completed
        const overdue = tasks.filter(t => {
          if (t.isCompleted || !t.dueDate) return false
          return new Date(t.dueDate) < now
        }).length

        return {
          id: ws.id,
          name: ws.name,
          color: ws.color,
          total,
          completed,
          pending,
          overdue,
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
        }
      })
      .filter(ws => ws.total > 0)
  }, [workspaces, now])

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

  return (
    <div className="h-full flex flex-col bg-panel">
      {/* Quick Stats Bar */}
      <div className="px-4 py-3 border-b border-border bg-card/50">
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={() => setViewType('overview')}
            className={cn(
              "p-3 rounded-xl text-left transition-all",
              viewType === 'overview' 
                ? "bg-primary/10 border border-primary/30" 
                : "bg-secondary/50 border border-transparent hover:border-border"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">總覽</span>
            </div>
            <div className="text-xl font-bold">{stats.completionRate}%</div>
          </button>

          <button
            onClick={() => setViewType('today')}
            className={cn(
              "p-3 rounded-xl text-left transition-all",
              viewType === 'today' 
                ? "bg-blue-500/10 border border-blue-500/30" 
                : "bg-secondary/50 border border-transparent hover:border-border"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">今日</span>
            </div>
            <div className="text-xl font-bold">
              {stats.todayCompleted.length}/{stats.todayTotal}
            </div>
          </button>

          <button
            onClick={() => setViewType('upcoming')}
            className={cn(
              "p-3 rounded-xl text-left transition-all",
              viewType === 'upcoming' 
                ? "bg-amber-500/10 border border-amber-500/30" 
                : "bg-secondary/50 border border-transparent hover:border-border"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">即將到期</span>
            </div>
            <div className="text-xl font-bold">{stats.upcoming.length}</div>
          </button>

          <button
            onClick={() => setViewType('overdue')}
            className={cn(
              "p-3 rounded-xl text-left transition-all",
              viewType === 'overdue' 
                ? "bg-red-500/10 border border-red-500/30" 
                : "bg-secondary/50 border border-transparent hover:border-border"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground">過期</span>
            </div>
            <div className="text-xl font-bold text-red-600">{stats.overdue.length}</div>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4">
        {viewType === 'overview' ? (
          <div className="space-y-6">
            {/* Streak and Progress */}
            <div className="grid grid-cols-2 gap-4">
              {/* Streak Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-orange-500/20">
                    <Flame className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{stats.streak}</div>
                    <div className="text-xs text-muted-foreground">連續完成天數</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {stats.streak > 0 ? '繼續保持！' : '今天開始新的連續紀錄'}
                </div>
              </div>

              {/* Today Progress Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {stats.todayTotal > 0 
                        ? Math.round((stats.todayCompleted.length / stats.todayTotal) * 100) 
                        : 0}%
                    </div>
                    <div className="text-xs text-muted-foreground">今日進度</div>
                  </div>
                </div>
                <div className="h-1.5 bg-blue-500/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${stats.todayTotal > 0 
                        ? (stats.todayCompleted.length / stats.todayTotal) * 100 
                        : 0}%` 
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Workspace Progress */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" />
                工作區進度
              </h3>
              <div className="space-y-2">
                {tasksByWorkspace.map(ws => (
                  <div 
                    key={ws.id}
                    className="p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: ws.color }}
                        />
                        <span className="font-medium text-sm">{ws.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {ws.overdue > 0 && (
                          <span className="text-red-500 font-medium">{ws.overdue} 過期</span>
                        )}
                        <span className="text-muted-foreground">
                          {ws.completed}/{ws.total}
                        </span>
                        <span className="font-medium">{ws.completionRate}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${ws.completionRate}%`,
                          backgroundColor: ws.color 
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* High Priority Tasks */}
            {stats.highPriority.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  高優先任務 ({stats.highPriority.length})
                </h3>
                <div className="space-y-2">
                  {stats.highPriority.slice(0, 5).map(task => (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick?.(task)}
                      className="w-full p-3 rounded-lg bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="flex-1 text-sm truncate">{task.title}</span>
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <List className="w-4 h-4" />
              {viewType === 'today' && '今日任務'}
              {viewType === 'upcoming' && '即將到期'}
              {viewType === 'overdue' && '過期任務'}
              <span className="text-xs">({displayTasks.length})</span>
            </h3>

            {displayTasks.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-4xl mb-3">
                  {viewType === 'today' && '🎯'}
                  {viewType === 'upcoming' && '📅'}
                  {viewType === 'overdue' && '✨'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {viewType === 'today' && '今天沒有排程的任務'}
                  {viewType === 'upcoming' && '沒有即將到期的任務'}
                  {viewType === 'overdue' && '太棒了！沒有過期任務'}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {displayTasks.map(task => (
                  <div
                    key={task.id}
                    className={cn(
                      "group p-3 rounded-lg border transition-all",
                      task.isCompleted 
                        ? "bg-green-500/5 border-green-500/20" 
                        : viewType === 'overdue'
                          ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                          : "bg-card border-border hover:border-primary/30"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => onToggleComplete?.(task.id)}
                        className={cn(
                          "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0",
                          task.isCompleted 
                            ? "bg-green-500 border-green-500" 
                            : "border-muted-foreground hover:border-primary"
                        )}
                      >
                        {task.isCompleted && (
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        )}
                      </button>

                      {/* Task Content */}
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => onTaskClick?.(task)}
                          className={cn(
                            "block text-left w-full text-sm",
                            task.isCompleted && "line-through text-muted-foreground"
                          )}
                        >
                          {task.title}
                        </button>
                        
                        <div className="flex items-center gap-2 mt-1">
                          {task.scheduledStartTime && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {task.scheduledStartTime}
                            </span>
                          )}
                          {task.dueDate && viewType === 'overdue' && (
                            <span className="text-xs text-red-500 font-medium">
                              過期 {getDaysOverdue(task.dueDate)} 天
                            </span>
                          )}
                          {task.dueDate && viewType === 'upcoming' && (
                            <span className="text-xs text-amber-600">
                              {formatDate(task.dueDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <button
                        onClick={() => onTaskClick?.(task)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-secondary transition-all"
                      >
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
