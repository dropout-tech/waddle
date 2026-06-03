'use client'

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Calendar,
  TrendingUp,
  PieChart,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import { saveOrShareBlob } from '@/lib/share'
import type { Task, Workspace, ExportDataPayload } from '@/lib/types'

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  workspaces: Workspace[]
  dateRange: {
    start: Date
    end: Date
  }
  onExport?: (data: ExportDataPayload) => void
}

type TabType = 'overview' | 'workspace' | 'export'

export function ReportModal({
  isOpen,
  onClose,
  workspaces,
  dateRange,
  onExport,
}: ReportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  // Get all tasks from workspaces
  const allTasks = useMemo(() => {
    return workspaces.flatMap((w) => w.categories.flatMap((c) => c.tasks))
  }, [workspaces])

  // Filter tasks within date range
  const tasksInRange = useMemo(() => {
    const start = toDateString(dateRange.start)
    const end = toDateString(dateRange.end)
    return allTasks.filter((t) => {
      const date = t.scheduledDate || t.dueDate
      return date && date >= start && date <= end
    })
  }, [allTasks, dateRange])

  // Statistics
  const stats = useMemo(() => {
    const total = tasksInRange.length
    const completed = tasksInRange.filter((t) => t.isCompleted).length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0
    const totalEstimated = tasksInRange.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0)
    const totalActual = tasksInRange.reduce((sum, t) => sum + (t.actualMinutes || 0), 0)

    // By workspace
    const byWorkspace: Record<string, { total: number; completed: number; time: number }> = {}
    for (const task of tasksInRange) {
      const wsName = task.workspaceName
      if (!byWorkspace[wsName]) {
        byWorkspace[wsName] = { total: 0, completed: 0, time: 0 }
      }
      byWorkspace[wsName].total++
      if (task.isCompleted) byWorkspace[wsName].completed++
      byWorkspace[wsName].time += task.estimatedMinutes || 0
    }

    // By urgency
    const byUrgency: Record<string, number> = {
      '1-3': 0,
      '4-6': 0,
      '7-10': 0,
    }
    for (const task of tasksInRange) {
      if (task.urgency <= 3) byUrgency['1-3']++
      else if (task.urgency <= 6) byUrgency['4-6']++
      else byUrgency['7-10']++
    }

    return {
      total,
      completed,
      completionRate,
      totalEstimated,
      totalActual,
      byWorkspace,
      byUrgency,
    }
  }, [tasksInRange])

  // Format time
  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}分鐘`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}小時${mins}分鐘` : `${hours}小時`
  }

  // Handle export
  const handleExport = () => {
    const exportData: ExportDataPayload = {
      exportDate: new Date().toISOString(),
      dateRange: {
        start: toDateString(dateRange.start),
        end: toDateString(dateRange.end),
      },
      tasks: tasksInRange.map((t) => ({
        id: t.id,
        workspace: t.workspaceName,
        category: t.categoryName,
        title: t.title,
        urgency: t.urgency,
        estimatedMinutes: t.estimatedMinutes,
        dueDate: t.dueDate,
        scheduledDate: t.scheduledDate,
        scheduledStartTime: t.scheduledStartTime,
        scheduledEndTime: t.scheduledEndTime,
        isCompleted: t.isCompleted,
        completedAt: t.completedAt,
      })),
      completionStats: {
        total: stats.total,
        completed: stats.completed,
        rate: stats.completionRate,
      },
      timeStats: {
        totalEstimated: stats.totalEstimated,
        totalActual: stats.totalActual,
        byWorkspace: Object.fromEntries(
          Object.entries(stats.byWorkspace).map(([k, v]) => [k, v.time])
        ),
      },
    }

    if (onExport) {
      onExport(exportData)
    } else {
      // Download as JSON (native: opens the share sheet instead).
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      void saveOrShareBlob(blob, `huddle-report-${exportData.dateRange.start}-${exportData.dateRange.end}.json`)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="w-screen h-[100dvh] max-w-none rounded-none border-0 p-4 overflow-hidden flex flex-col md:w-full md:h-auto md:max-w-2xl md:max-h-[85vh] md:rounded-2xl md:border md:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span>報告與統計</span>
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {dateRange.start.toLocaleDateString('zh-TW')} - {dateRange.end.toLocaleDateString('zh-TW')}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl">
          {[
            { id: 'overview' as const, label: '總覽', icon: PieChart },
            { id: 'workspace' as const, label: '按工作區', icon: Sparkles },
            { id: 'export' as const, label: '匯出', icon: Download },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto mt-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-4 border border-primary/20">
                  <div className="flex items-center gap-2 text-primary mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-medium">完成率</span>
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {stats.completionRate}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {stats.completed} / {stats.total} 任務
                  </div>
                </div>

                <div className="bg-gradient-to-br from-accent/10 to-accent/5 rounded-xl p-4 border border-accent/20">
                  <div className="flex items-center gap-2 text-accent-foreground mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-medium">預估時間</span>
                  </div>
                  <div className="text-2xl font-bold text-accent-foreground">
                    {formatTime(stats.totalEstimated)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    總工作量
                  </div>
                </div>

                <div className="bg-gradient-to-br from-secondary to-secondary/50 rounded-xl p-4 border border-border">
                  <div className="flex items-center gap-2 text-secondary-foreground mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-medium">任務數量</span>
                  </div>
                  <div className="text-2xl font-bold text-secondary-foreground">
                    {stats.total}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    此期間內
                  </div>
                </div>
              </div>

              {/* Urgency Distribution */}
              <div className="bg-card rounded-xl p-4 border border-border">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  急迫度分佈
                </h4>
                <div className="space-y-2">
                  {[
                    { key: '7-10', label: '高 (7-10)', color: 'bg-destructive' },
                    { key: '4-6', label: '中 (4-6)', color: 'bg-warning' },
                    { key: '1-3', label: '低 (1-3)', color: 'bg-success' },
                  ].map(({ key, label, color }) => {
                    const count = stats.byUrgency[key]
                    const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-16">{label}</span>
                        <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', color)}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-8 text-right">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'workspace' && (
            <div className="space-y-3">
              {Object.entries(stats.byWorkspace).map(([name, data]) => {
                const workspace = workspaces.find((w) => w.name === name)
                const percentage = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
                
                return (
                  <div
                    key={name}
                    className="bg-card rounded-xl p-4 border border-border"
                    style={{ borderLeftWidth: '4px', borderLeftColor: workspace?.color }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{name}</h4>
                      <span className="text-sm text-muted-foreground">
                        {data.completed}/{data.total} 完成
                      </span>
                    </div>
                    
                    <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: workspace?.color || 'var(--primary)'
                        }}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{percentage}% 完成率</span>
                      <span>預估 {formatTime(data.time)}</span>
                    </div>
                  </div>
                )
              })}
              
              {Object.keys(stats.byWorkspace).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>此期間沒有任務資料</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-xl p-4 border border-border">
                <h4 className="font-medium mb-2">匯出數據</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  將選定日期範圍內的任務數據匯出為 JSON 格式，可用於 AI 分析或與其他系統整合。
                </p>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">任務數量</span>
                    <span className="font-medium">{stats.total}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">完成任務</span>
                    <span className="font-medium">{stats.completed}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">工作區數量</span>
                    <span className="font-medium">{Object.keys(stats.byWorkspace).length}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">總預估時間</span>
                    <span className="font-medium">{formatTime(stats.totalEstimated)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-card rounded-xl p-4 border border-border">
                <h4 className="font-medium mb-2">匯出格式</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-primary bg-primary/5 cursor-pointer">
                    <input type="radio" name="format" defaultChecked className="accent-primary" />
                    <div>
                      <div className="font-medium text-sm">JSON</div>
                      <div className="text-xs text-muted-foreground">結構化數據，適合 API 整合</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-not-allowed opacity-50">
                    <input type="radio" name="format" disabled />
                    <div>
                      <div className="font-medium text-sm">CSV (即將推出)</div>
                      <div className="text-xs text-muted-foreground">表格格式，適合 Excel</div>
                    </div>
                  </label>
                </div>
              </div>

              <Button onClick={handleExport} className="w-full" size="lg">
                <Download className="w-4 h-4 mr-2" />
                下載報告
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
