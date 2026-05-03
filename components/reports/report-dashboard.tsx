'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import type { Workspace, Task } from '@/lib/types'
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Clock, 
  Target, 
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  BarChart3,
  PieChart,
  Activity,
  Flame,
  Award,
  ArrowRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface ReportDashboardProps {
  workspaces: Workspace[]
  onClose: () => void
}

type TabType = 'overview' | 'productivity' | 'habits' | 'insights'
type DateRangeType = 'week' | 'month' | 'quarter' | 'year'

export function ReportDashboard({ workspaces, onClose }: ReportDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [dateRange, setDateRange] = useState<DateRangeType>('week')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']))

  const now = new Date()
  
  // Calculate date range boundaries
  const rangeConfig = useMemo(() => {
    const start = new Date()
    const prevStart = new Date()
    
    switch (dateRange) {
      case 'week':
        start.setDate(now.getDate() - 7)
        prevStart.setDate(now.getDate() - 14)
        return { start, prevStart, label: '本週', prevLabel: '上週', days: 7 }
      case 'month':
        start.setMonth(now.getMonth() - 1)
        prevStart.setMonth(now.getMonth() - 2)
        return { start, prevStart, label: '本月', prevLabel: '上月', days: 30 }
      case 'quarter':
        start.setMonth(now.getMonth() - 3)
        prevStart.setMonth(now.getMonth() - 6)
        return { start, prevStart, label: '本季', prevLabel: '上季', days: 90 }
      case 'year':
        start.setFullYear(now.getFullYear() - 1)
        prevStart.setFullYear(now.getFullYear() - 2)
        return { start, prevStart, label: '今年', prevLabel: '去年', days: 365 }
    }
  }, [dateRange, now])

  // Gather all tasks with workspace info
  const allTasks = useMemo(() => {
    const tasks: (Task & { workspaceName: string; workspaceColor: string })[] = []
    workspaces.forEach(ws => {
      if (!ws.isArchived) {
        ws.categories?.forEach(cat => {
          cat.tasks?.forEach(task => {
            tasks.push({
              ...task,
              workspaceName: ws.name,
              workspaceColor: ws.color
            })
          })
        })
      }
    })
    return tasks
  }, [workspaces])

  // Filter tasks by date range
  const currentPeriodTasks = useMemo(() => 
    allTasks.filter(t => new Date(t.createdAt) >= rangeConfig.start),
    [allTasks, rangeConfig.start]
  )

  const previousPeriodTasks = useMemo(() => 
    allTasks.filter(t => {
      const created = new Date(t.createdAt)
      return created >= rangeConfig.prevStart && created < rangeConfig.start
    }),
    [allTasks, rangeConfig.start, rangeConfig.prevStart]
  )

  // Calculate statistics
  const stats = useMemo(() => {
    const completed = currentPeriodTasks.filter(t => t.isCompleted)
    const prevCompleted = previousPeriodTasks.filter(t => t.isCompleted)
    
    const completionRate = currentPeriodTasks.length > 0 
      ? Math.round((completed.length / currentPeriodTasks.length) * 100) 
      : 0
    const prevCompletionRate = previousPeriodTasks.length > 0
      ? Math.round((prevCompleted.length / previousPeriodTasks.length) * 100)
      : 0

    const overdue = allTasks.filter(t => 
      !t.isCompleted && t.dueDate && new Date(t.dueDate) < now
    )

    const highPriority = allTasks.filter(t =>
      !t.isCompleted && t.urgency >= 8
    )

    const scheduled = currentPeriodTasks.filter(t => t.scheduledDate)
    const withDueDate = currentPeriodTasks.filter(t => t.dueDate)

    return {
      total: currentPeriodTasks.length,
      completed: completed.length,
      completionRate,
      prevTotal: previousPeriodTasks.length,
      prevCompleted: prevCompleted.length,
      prevCompletionRate,
      overdue: overdue.length,
      highPriority: highPriority.length,
      scheduled: scheduled.length,
      withDueDate: withDueDate.length,
      pending: currentPeriodTasks.filter(t => !t.isCompleted).length
    }
  }, [currentPeriodTasks, previousPeriodTasks, allTasks, now])

  // Daily completion data for chart
  const dailyData = useMemo(() => {
    const days: { date: string; completed: number; created: number; label: string }[] = []
    const dayCount = Math.min(rangeConfig.days, 14)
    
    for (let i = dayCount - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = toDateString(date)
      
      const completed = allTasks.filter(t => 
        t.isCompleted && t.completedAt?.split('T')[0] === dateStr
      ).length
      
      const created = allTasks.filter(t => 
        t.createdAt.split('T')[0] === dateStr
      ).length

      days.push({
        date: dateStr,
        completed,
        created,
        label: `${date.getMonth() + 1}/${date.getDate()}`
      })
    }
    return days
  }, [allTasks, rangeConfig.days])

  // Workspace breakdown
  const workspaceStats = useMemo(() => 
    workspaces
      .filter(ws => !ws.isArchived)
      .map(ws => {
        const tasks = ws.categories?.flatMap(c => c.tasks || []) || []
        const completed = tasks.filter(t => t.isCompleted)
        const inPeriod = tasks.filter(t => new Date(t.createdAt) >= rangeConfig.start)
        const completedInPeriod = inPeriod.filter(t => t.isCompleted)
        
        return {
          id: ws.id,
          name: ws.name,
          icon: ws.icon,
          color: ws.color,
          total: tasks.length,
          completed: completed.length,
          periodTotal: inPeriod.length,
          periodCompleted: completedInPeriod.length,
          rate: tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0
        }
      })
      .sort((a, b) => b.periodCompleted - a.periodCompleted),
    [workspaces, rangeConfig.start]
  )

  // Hour distribution (when tasks are scheduled)
  const hourDistribution = useMemo(() => {
    const hours: number[] = new Array(24).fill(0)
    allTasks.forEach(t => {
      if (t.scheduledStartTime) {
        const hour = parseInt(t.scheduledStartTime.split(':')[0])
        hours[hour]++
      }
    })
    return hours
  }, [allTasks])

  // Peak productivity hours
  const peakHours = useMemo(() => {
    const hourCompletions: { hour: number; count: number }[] = []
    for (let i = 0; i < 24; i++) {
      const count = allTasks.filter(t => {
        if (!t.isCompleted || !t.scheduledStartTime) return false
        return parseInt(t.scheduledStartTime.split(':')[0]) === i
      }).length
      hourCompletions.push({ hour: i, count })
    }
    return hourCompletions.sort((a, b) => b.count - a.count).slice(0, 3)
  }, [allTasks])

  // Streak calculation
  const streak = useMemo(() => {
    let currentStreak = 0
    let maxStreak = 0
    let tempStreak = 0
    
    for (let i = 0; i < 30; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = toDateString(date)
      
      const hasCompletedTask = allTasks.some(t => 
        t.isCompleted && t.completedAt?.split('T')[0] === dateStr
      )
      
      if (hasCompletedTask) {
        tempStreak++
        if (i === 0 || currentStreak > 0) {
          currentStreak = tempStreak
        }
        maxStreak = Math.max(maxStreak, tempStreak)
      } else {
        if (i === 0) currentStreak = 0
        tempStreak = 0
      }
    }
    
    return { current: currentStreak, max: maxStreak }
  }, [allTasks])

  // Priority breakdown — urgency 8-10 high, 5-7 medium, 1-4 low
  const priorityStats = useMemo(() => {
    const pending = allTasks.filter(t => !t.isCompleted)
    return {
      high: pending.filter(t => t.urgency >= 8).length,
      medium: pending.filter(t => t.urgency >= 5 && t.urgency < 8).length,
      low: pending.filter(t => t.urgency >= 1 && t.urgency < 5).length,
      none: pending.filter(t => !t.urgency).length,
    }
  }, [allTasks])

  // Overdue tasks by severity
  const overdueAnalysis = useMemo(() => {
    const overdue = allTasks.filter(t => 
      !t.isCompleted && t.dueDate && new Date(t.dueDate) < now
    )
    
    return {
      critical: overdue.filter(t => {
        const days = Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / 86400000)
        return days > 7
      }),
      warning: overdue.filter(t => {
        const days = Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / 86400000)
        return days > 3 && days <= 7
      }),
      minor: overdue.filter(t => {
        const days = Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / 86400000)
        return days <= 3
      })
    }
  }, [allTasks, now])

  const toggleSection = (section: string) => {
    const newSet = new Set(expandedSections)
    if (newSet.has(section)) {
      newSet.delete(section)
    } else {
      newSet.add(section)
    }
    setExpandedSections(newSet)
  }

  // Calculate trend
  const getTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  const completionTrend = getTrend(stats.completionRate, stats.prevCompletionRate)
  const tasksTrend = getTrend(stats.total, stats.prevTotal)

  return (
    <div className="space-y-6">
      {/* Header with Date Range */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">生產力報告</h2>
          <p className="text-sm text-muted-foreground mt-1">
            追蹤你的任務完成情況和工作習慣
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {(['week', 'month', 'quarter', 'year'] as const).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                dateRange === range
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {range === 'week' ? '週' : range === 'month' ? '月' : range === 'quarter' ? '季' : '年'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-secondary/30 rounded-xl">
        {[
          { id: 'overview', label: '總覽', icon: BarChart3 },
          { id: 'productivity', label: '生產力', icon: Activity },
          { id: 'habits', label: '習慣', icon: Flame },
          { id: 'insights', label: '洞察', icon: Target }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="任務完成"
              value={stats.completed}
              subtitle={`共 ${stats.total} 個任務`}
              trend={tasksTrend}
              trendLabel={`較${rangeConfig.prevLabel}`}
              icon={CheckCircle2}
              color="green"
            />
            <MetricCard
              title="完成率"
              value={`${stats.completionRate}%`}
              subtitle={`目標: 80%`}
              trend={completionTrend}
              trendLabel={`較${rangeConfig.prevLabel}`}
              icon={Target}
              color="blue"
            />
            <MetricCard
              title="過期任務"
              value={stats.overdue}
              subtitle="需要立即處理"
              icon={AlertTriangle}
              color={stats.overdue > 0 ? "red" : "green"}
            />
            <MetricCard
              title="連續天數"
              value={streak.current}
              subtitle={`最高紀錄: ${streak.max} 天`}
              icon={Flame}
              color="orange"
            />
          </div>

          {/* Completion Chart */}
          <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">每日完成趨勢</h3>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">已完成</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">新建立</span>
                </div>
              </div>
            </div>
            <div className="h-40 flex items-end gap-1">
              {dailyData.map((day, i) => {
                const maxVal = Math.max(...dailyData.map(d => Math.max(d.completed, d.created)), 1)
                const completedHeight = (day.completed / maxVal) * 100
                const createdHeight = (day.created / maxVal) * 100
                
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center gap-0.5 h-32">
                      <div 
                        className="w-2 bg-green-500 rounded-t transition-all"
                        style={{ height: `${completedHeight}%`, minHeight: day.completed > 0 ? '4px' : '0' }}
                        title={`完成: ${day.completed}`}
                      />
                      <div 
                        className="w-2 bg-blue-500 rounded-t transition-all"
                        style={{ height: `${createdHeight}%`, minHeight: day.created > 0 ? '4px' : '0' }}
                        title={`建立: ${day.created}`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{day.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Workspace Breakdown */}
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="font-medium mb-4">工作區表現</h3>
            <div className="space-y-4">
              {workspaceStats.map(ws => (
                <div key={ws.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: ws.color }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-sm">{ws.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {ws.periodCompleted}/{ws.periodTotal} {rangeConfig.label}
                      </span>
                      <span className={cn(
                        "font-medium",
                        ws.rate >= 80 ? "text-green-600" : ws.rate >= 50 ? "text-yellow-600" : "text-red-600"
                      )}>
                        {ws.rate}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${ws.rate}%`,
                        backgroundColor: ws.color 
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Productivity Tab */}
      {activeTab === 'productivity' && (
        <div className="space-y-6">
          {/* Time Distribution */}
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="font-medium mb-4">任務時間分佈</h3>
            <div className="grid grid-cols-6 gap-1">
              {hourDistribution.map((count, hour) => {
                const maxCount = Math.max(...hourDistribution, 1)
                const intensity = count / maxCount
                
                return (
                  <div 
                    key={hour}
                    className="aspect-square rounded-md flex items-center justify-center text-[10px] transition-colors"
                    style={{
                      backgroundColor: `rgba(59, 130, 246, ${intensity * 0.8 + 0.1})`,
                      color: intensity > 0.5 ? 'white' : 'inherit'
                    }}
                    title={`${hour}:00 - ${count} 個任務`}
                  >
                    {hour}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <span>較少任務</span>
              <div className="flex items-center gap-1">
                {[0.1, 0.3, 0.5, 0.7, 0.9].map(opacity => (
                  <div 
                    key={opacity}
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: `rgba(59, 130, 246, ${opacity})` }}
                  />
                ))}
              </div>
              <span>較多任務</span>
            </div>
          </div>

          {/* Peak Hours */}
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="font-medium mb-4">最高效率時段</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {peakHours.map((peak, i) => (
                <div 
                  key={peak.hour}
                  className={cn(
                    "p-4 rounded-xl border",
                    i === 0 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-secondary/30 border-border"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {i === 0 && <Award className="w-5 h-5 text-yellow-600" />}
                    <span className="text-2xl font-bold">
                      {peak.hour.toString().padStart(2, '0')}:00
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {peak.count} 個任務在此時段完成
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Priority Distribution */}
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="font-medium mb-4">待處理任務優先級</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="text-2xl font-bold text-red-600">{priorityStats.high}</div>
                <div className="text-sm text-muted-foreground mt-1">高優先</div>
              </div>
              <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <div className="text-2xl font-bold text-yellow-600">{priorityStats.medium}</div>
                <div className="text-sm text-muted-foreground mt-1">中優先</div>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <div className="text-2xl font-bold text-blue-600">{priorityStats.low}</div>
                <div className="text-sm text-muted-foreground mt-1">低優先</div>
              </div>
              <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                <div className="text-2xl font-bold">{priorityStats.none}</div>
                <div className="text-sm text-muted-foreground mt-1">未設定</div>
              </div>
            </div>
          </div>

          {/* Task Planning Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium">排程率</div>
                  <div className="text-sm text-muted-foreground">有設定排程的任務比例</div>
                </div>
              </div>
              <div className="text-3xl font-bold">
                {stats.total > 0 ? Math.round((stats.scheduled / stats.total) * 100) : 0}%
              </div>
              <div className="h-2 bg-secondary rounded-full mt-3 overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${stats.total > 0 ? (stats.scheduled / stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="p-5 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="font-medium">截止日設定率</div>
                  <div className="text-sm text-muted-foreground">有設定截止日的任務比例</div>
                </div>
              </div>
              <div className="text-3xl font-bold">
                {stats.total > 0 ? Math.round((stats.withDueDate / stats.total) * 100) : 0}%
              </div>
              <div className="h-2 bg-secondary rounded-full mt-3 overflow-hidden">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${stats.total > 0 ? (stats.withDueDate / stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Habits Tab */}
      {activeTab === 'habits' && (
        <div className="space-y-6">
          {/* Streak Card */}
          <div className="p-6 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-500/20">
                <Flame className="w-8 h-8 text-orange-600" />
              </div>
              <div>
                <div className="text-4xl font-bold">{streak.current} 天</div>
                <div className="text-sm text-muted-foreground mt-1">
                  目前連續完成天數 {streak.current > 0 && '(繼續保持!)'}
                </div>
              </div>
            </div>
            {streak.max > streak.current && (
              <div className="mt-4 p-3 rounded-lg bg-background/50">
                <div className="flex items-center gap-2 text-sm">
                  <Award className="w-4 h-4 text-yellow-600" />
                  <span>最高紀錄: {streak.max} 天連續完成</span>
                </div>
              </div>
            )}
          </div>

          {/* Weekly Activity Heatmap */}
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="font-medium mb-4">過去 4 週活動</h3>
            <div className="space-y-2">
              {['日', '一', '二', '三', '四', '五', '六'].map((day, dayIndex) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-6 text-xs text-muted-foreground">{day}</span>
                  <div className="flex gap-1 flex-1">
                    {Array.from({ length: 4 }).map((_, weekIndex) => {
                      const date = new Date()
                      const currentDay = date.getDay()
                      const daysBack = (currentDay - dayIndex + 7) % 7 + weekIndex * 7
                      date.setDate(date.getDate() - daysBack)
                      const dateStr = toDateString(date)
                      
                      const completed = allTasks.filter(t => 
                        t.isCompleted && t.completedAt?.split('T')[0] === dateStr
                      ).length
                      
                      const intensity = Math.min(completed / 5, 1)
                      
                      return (
                        <div
                          key={weekIndex}
                          className="flex-1 h-8 rounded-md transition-colors"
                          style={{
                            backgroundColor: completed > 0 
                              ? `rgba(34, 197, 94, ${intensity * 0.8 + 0.2})`
                              : 'var(--secondary)'
                          }}
                          title={`${dateStr}: ${completed} 個任務完成`}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
              <span>較少</span>
              <div className="flex gap-1">
                {[0, 0.25, 0.5, 0.75, 1].map(intensity => (
                  <div 
                    key={intensity}
                    className="w-4 h-4 rounded"
                    style={{ 
                      backgroundColor: intensity > 0 
                        ? `rgba(34, 197, 94, ${intensity * 0.8 + 0.2})`
                        : 'var(--secondary)'
                    }}
                  />
                ))}
              </div>
              <span>較多</span>
            </div>
          </div>

          {/* Consistency Score */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-card border border-border">
              <h3 className="font-medium mb-3">一致性分數</h3>
              <div className="relative pt-4">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-bold">
                    {Math.round((streak.current / 7) * 100)}
                  </span>
                </div>
                <svg className="w-32 h-32 mx-auto" viewBox="0 0 100 100">
                  <circle
                    cx="50" cy="50" r="40"
                    fill="none"
                    stroke="var(--secondary)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50" cy="50" r="40"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="8"
                    strokeDasharray={`${(streak.current / 7) * 251.2} 251.2`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground text-center mt-2">
                基於過去 7 天的活動
              </p>
            </div>
            <div className="p-5 rounded-xl bg-card border border-border">
              <h3 className="font-medium mb-3">習慣建議</h3>
              <div className="space-y-3">
                {streak.current === 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">開始新的連續紀錄</p>
                      <p className="text-muted-foreground mt-1">今天完成至少一個任務來開始你的連續天數</p>
                    </div>
                  </div>
                )}
                {streak.current >= 3 && streak.current < 7 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10">
                    <TrendingUp className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">保持勢頭</p>
                      <p className="text-muted-foreground mt-1">再 {7 - streak.current} 天就能達到一週連續！</p>
                    </div>
                  </div>
                )}
                {streak.current >= 7 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10">
                    <Award className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">太棒了！</p>
                      <p className="text-muted-foreground mt-1">你已經連續 {streak.current} 天保持生產力</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="space-y-6">
          {/* Overdue Analysis */}
          <CollapsibleSection
            title="過期任務分析"
            icon={AlertTriangle}
            isOpen={expandedSections.has('overdue')}
            onToggle={() => toggleSection('overdue')}
            badge={stats.overdue > 0 ? stats.overdue : undefined}
            badgeColor="red"
          >
            <div className="space-y-4">
              {overdueAnalysis.critical.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-600">嚴重過期 ({">"}7 天)</h4>
                  {overdueAnalysis.critical.slice(0, 5).map(task => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              )}
              {overdueAnalysis.warning.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-yellow-600">需要關注 (3-7 天)</h4>
                  {overdueAnalysis.warning.slice(0, 5).map(task => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              )}
              {overdueAnalysis.minor.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-orange-600">輕微過期 ({"<"}3 天)</h4>
                  {overdueAnalysis.minor.slice(0, 5).map(task => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              )}
              {stats.overdue === 0 && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm">太棒了！目前沒有過期的任務</span>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Smart Suggestions */}
          <div className="p-5 rounded-xl bg-card border border-border">
            <h3 className="font-medium mb-4">智慧建議</h3>
            <div className="space-y-3">
              {stats.completionRate < 50 && (
                <SuggestionCard
                  type="warning"
                  title="提升完成率"
                  description="目前完成率低於 50%。建議將大任務拆分成更小的可執行項目，或重新評估任務的必要性。"
                  action="查看待辦任務"
                />
              )}
              {stats.overdue > 5 && (
                <SuggestionCard
                  type="error"
                  title="清理過期任務"
                  description={`有 ${stats.overdue} 個過期任務。建議重新評估優先級，歸檔不需要的任務，或重新設定截止日。`}
                  action="查看過期任務"
                />
              )}
              {priorityStats.high > 5 && (
                <SuggestionCard
                  type="warning"
                  title="過多高優先任務"
                  description="當所有任務都是高優先時，實際上沒有任務是高優先的。建議重新評估優先級分配。"
                  action="檢視優先級"
                />
              )}
              {stats.scheduled < stats.total * 0.3 && (
                <SuggestionCard
                  type="info"
                  title="增加任務排程"
                  description="只有不到 30% 的任務有排程。為任務設定具體時間可以提高完成率。"
                  action="安排任務"
                />
              )}
              {stats.completionRate >= 80 && (
                <SuggestionCard
                  type="success"
                  title="表現優秀"
                  description="你的完成率超過 80%！繼續保持這個節奏，並考慮挑戰更具野心的目標。"
                />
              )}
              {streak.current >= 7 && (
                <SuggestionCard
                  type="success"
                  title="連續達標"
                  description={`你已經連續 ${streak.current} 天完成任務！這是建立持久習慣的關鍵。`}
                />
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <QuickStat label="平均每日完成" value={Math.round(stats.completed / rangeConfig.days * 10) / 10} unit="個" />
            <QuickStat label="待處理任務" value={stats.pending} unit="個" />
            <QuickStat label="高優先待辦" value={priorityStats.high} unit="個" warning={priorityStats.high > 3} />
            <QuickStat label="已排程任務" value={stats.scheduled} unit="個" />
          </div>
        </div>
      )}
    </div>
  )
}

// Helper Components
function MetricCard({ 
  title, 
  value, 
  subtitle, 
  trend, 
  trendLabel,
  icon: Icon, 
  color 
}: {
  title: string
  value: string | number
  subtitle: string
  trend?: number
  trendLabel?: string
  icon: React.ElementType
  color: 'green' | 'blue' | 'red' | 'orange' | 'purple'
}) {
  const colorClasses = {
    green: 'bg-green-500/10 border-green-500/20 text-green-600',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
    red: 'bg-red-500/10 border-red-500/20 text-red-600',
    orange: 'bg-orange-500/10 border-orange-500/20 text-orange-600',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-600'
  }

  return (
    <div className={cn("p-4 rounded-xl border", colorClasses[color])}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5" />
        {trend !== undefined && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            trend >= 0 ? "text-green-600" : "text-red-600"
          )}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
      {trendLabel && trend !== undefined && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{trendLabel}</div>
      )}
    </div>
  )
}

function CollapsibleSection({
  title,
  icon: Icon,
  isOpen,
  onToggle,
  badge,
  badgeColor,
  children
}: {
  title: string
  icon: React.ElementType
  isOpen: boolean
  onToggle: () => void
  badge?: number
  badgeColor?: 'red' | 'yellow' | 'green'
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium">{title}</span>
          {badge !== undefined && (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              badgeColor === 'red' ? "bg-red-500/20 text-red-600" :
              badgeColor === 'yellow' ? "bg-yellow-500/20 text-yellow-600" :
              "bg-green-500/20 text-green-600"
            )}>
              {badge}
            </span>
          )}
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function TaskRow({ task }: { task: Task }) {
  const daysOverdue = task.dueDate 
    ? Math.floor((Date.now() - new Date(task.dueDate).getTime()) / 86400000)
    : 0

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
      <div className="flex items-center gap-3">
        <div 
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: task.workspaceColor || '#666' }}
        />
        <span className="text-sm truncate">{task.title}</span>
      </div>
      <span className="text-xs text-red-600 font-medium whitespace-nowrap ml-2">
        {daysOverdue} 天
      </span>
    </div>
  )
}

function SuggestionCard({
  type,
  title,
  description,
  action
}: {
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  description: string
  action?: string
}) {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/20',
    warning: 'bg-yellow-500/10 border-yellow-500/20',
    error: 'bg-red-500/10 border-red-500/20',
    success: 'bg-green-500/10 border-green-500/20'
  }

  const iconColors = {
    info: 'text-blue-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
    success: 'text-green-600'
  }

  const icons = {
    info: Target,
    warning: AlertTriangle,
    error: AlertTriangle,
    success: CheckCircle2
  }

  const Icon = icons[type]

  return (
    <div className={cn("p-4 rounded-xl border", styles[type])}>
      <div className="flex items-start gap-3">
        <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", iconColors[type])} />
        <div className="flex-1">
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
          {action && (
            <button className="flex items-center gap-1 text-sm text-primary mt-2 hover:underline">
              {action}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function QuickStat({ 
  label, 
  value, 
  unit, 
  warning 
}: { 
  label: string
  value: number
  unit: string
  warning?: boolean 
}) {
  return (
    <div className={cn(
      "p-4 rounded-xl border",
      warning ? "bg-yellow-500/10 border-yellow-500/20" : "bg-card border-border"
    )}>
      <div className="text-2xl font-bold">
        {value}
        <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  )
}
