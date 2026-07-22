'use client'

import { useState, useMemo } from 'react'
import { Bell, AlertTriangle, Clock, Calendar, CheckCircle2, Archive, ChevronRight, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, Workspace } from '@/lib/types'
import { getTaskOverdueDate, isTaskOverdue } from '@/lib/task-utils'
import { toDateString } from '@/lib/calendar-utils'
import { useI18n } from '@/lib/i18n/react'
import { t } from '@/lib/i18n'

interface NotificationCenterProps {
  workspaces: Workspace[]
  onTaskClick?: (task: Task) => void
  onReviewOverdue?: () => void
}

interface Notification {
  id: string
  type: 'overdue' | 'due_soon' | 'stale' | 'insight' | 'reminder'
  priority: 'high' | 'medium' | 'low'
  title: string
  message: string
  tasks?: Task[]
  actionLabel?: string
  createdAt: Date
}

// Calculate days difference
const daysDiff = (date1: Date, date2: Date): number => {
  const diffTime = date1.getTime() - date2.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

// Format relative time
const formatRelativeTime = (days: number): string => {
  if (days === 0) return t('今天')
  if (days === 1) return t('昨天')
  if (days < 7) return t('{n} 天前', { n: days })
  if (days < 30) return t('{n} 週前', { n: Math.floor(days / 7) })
  if (days < 365) return t('{n} 個月前', { n: Math.floor(days / 30) })
  return t('{n} 年前', { n: Math.floor(days / 365) })
}

export function NotificationCenter({ workspaces, onTaskClick, onReviewOverdue }: NotificationCenterProps) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  // Gather all tasks from workspaces
  const allTasks = useMemo(() => {
    if (!workspaces || workspaces.length === 0) return []
    const tasks: Task[] = []
    workspaces.forEach(ws => {
      if (!ws.isArchived) {
        ws.categories?.forEach(cat => {
          if (!cat.isArchived) {
            tasks.push(...(cat.tasks?.filter(t => !t.isCompleted && !t.isArchived) || []))
          }
        })
      }
    })
    return tasks
  }, [workspaces])

  // Generate notifications based on task analysis
  const notifications = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const notifs: Notification[] = []

    const todayStr = toDateString(today)

    // 1. Tasks whose calendar slot or due date has passed. Recurring masters
    // and meetings are intentionally excluded by isTaskOverdue so the cleanup
    // flow cannot rewrite an entire series.
    const overdueTasks = allTasks.filter(task => isTaskOverdue(task, todayStr))

    if (overdueTasks.length > 0) {
      // Group by how long overdue
      const criticalOverdue = overdueTasks.filter(t => {
        const days = daysDiff(today, new Date(`${getTaskOverdueDate(t, todayStr)}T00:00:00`))
        return days >= 7
      })
      const recentOverdue = overdueTasks.filter(t => {
        const days = daysDiff(today, new Date(`${getTaskOverdueDate(t, todayStr)}T00:00:00`))
        return days < 7
      })

      if (criticalOverdue.length > 0) {
        const oldestTask = criticalOverdue.reduce((oldest, task) => {
          return getTaskOverdueDate(task, todayStr)! < getTaskOverdueDate(oldest, todayStr)! ? task : oldest
        })
        const daysOverdue = daysDiff(today, new Date(`${getTaskOverdueDate(oldestTask, todayStr)}T00:00:00`))

        notifs.push({
          id: 'critical-overdue',
          type: 'overdue',
          priority: 'high',
          title: t('{n} 個任務已經放了一陣子', { n: criticalOverdue.length }),
          message: t(
            '最久的一件是{time}的。有些也許已經不用做了——放心整理掉，留下真正想做的就好。',
            { time: formatRelativeTime(daysOverdue) }
          ),
          tasks: criticalOverdue,
          actionLabel: t('整理任務'),
          createdAt: new Date(),
        })
      }

      if (recentOverdue.length > 0) {
        notifs.push({
          id: 'recent-overdue',
          type: 'overdue',
          priority: 'medium',
          title: t('{n} 個任務剛過了預定日', { n: recentOverdue.length }),
          message: t('日子過了也沒關係，挑個合適的時段重新安排就好。'),
          tasks: recentOverdue,
          actionLabel: t('查看任務'),
          createdAt: new Date(),
        })
      }
    }

    // 2. Due soon (within 3 days)
    const dueSoonTasks = allTasks.filter(task => {
      if (!task.dueDate) return false
      const dueDate = new Date(task.dueDate)
      dueDate.setHours(0, 0, 0, 0)
      const daysUntil = daysDiff(dueDate, today)
      return daysUntil >= 0 && daysUntil <= 3
    })

    if (dueSoonTasks.length > 0) {
      const todayTasks = dueSoonTasks.filter(t => daysDiff(new Date(t.dueDate!), today) === 0)
      const upcomingTasks = dueSoonTasks.filter(t => daysDiff(new Date(t.dueDate!), today) > 0)

      if (todayTasks.length > 0) {
        notifs.push({
          id: 'due-today',
          type: 'due_soon',
          priority: 'high',
          title: t('今天排了 {n} 件事', { n: todayTasks.length }),
          message: t('還有時間，可以慢慢做——一件一件來就好。'),
          tasks: todayTasks,
          actionLabel: t('查看任務'),
          createdAt: new Date(),
        })
      }

      if (upcomingTasks.length > 0) {
        notifs.push({
          id: 'due-soon',
          type: 'due_soon',
          priority: 'low',
          title: t('{n} 個任務這幾天到期', { n: upcomingTasks.length }),
          message: t('接下來三天會陸續到期，先挑個順手的時段放上日曆，到時候就從容多了。'),
          tasks: upcomingTasks,
          actionLabel: t('查看任務'),
          createdAt: new Date(),
        })
      }
    }

    // 3. Stale tasks (created long ago, no due date, not scheduled)
    const staleTasks = allTasks.filter(task => {
      if (task.dueDate || task.scheduledDate) return false
      const createdAt = new Date(task.createdAt)
      const daysOld = daysDiff(today, createdAt)
      return daysOld >= 14
    })

    if (staleTasks.length > 0) {
      notifs.push({
        id: 'stale-tasks',
        type: 'stale',
        priority: 'low',
        title: t('{n} 個任務靜靜躺了兩週', { n: staleTasks.length }),
        message: t('還想做的話，挑個日子放上日曆；不想做了也沒關係，歸檔就好。'),
        tasks: staleTasks,
        actionLabel: t('整理任務'),
        createdAt: new Date(),
      })
    }

    // 4. Insights and suggestions
    const totalPending = allTasks.length
    const highUrgencyTasks = allTasks.filter(t => t.urgency >= 8)
    const noScheduleTasks = allTasks.filter(t => !t.scheduledDate && !t.dueDate)

    if (highUrgencyTasks.length >= 5) {
      notifs.push({
        id: 'too-many-urgent',
        type: 'insight',
        priority: 'medium',
        title: t('急件好像有點多'),
        message: t(
          '有 {n} 個任務都標了高優先。全部都急，反而不知道從哪開始——挑出真正的前幾名，其他的緩緩也可以。',
          { n: highUrgencyTasks.length }
        ),
        tasks: highUrgencyTasks,
        actionLabel: t('調整優先順序'),
        createdAt: new Date(),
      })
    }

    if (noScheduleTasks.length > totalPending * 0.5 && noScheduleTasks.length >= 5) {
      notifs.push({
        id: 'unscheduled-tasks',
        type: 'reminder',
        priority: 'low',
        title: t('多數任務未排程'),
        message: t('有 {n} 個任務還沒排到日曆上。挑個時段放進去，比較容易把事情做完。', {
          n: noScheduleTasks.length,
        }),
        tasks: noScheduleTasks.slice(0, 5),
        actionLabel: t('排程任務'),
        createdAt: new Date(),
      })
    }

    // Filter out dismissed notifications
    return notifs.filter(n => !dismissedIds.has(n.id))
  }, [allTasks, dismissedIds, t])

  // Count by priority
  const highPriorityCount = notifications.filter(n => n.priority === 'high').length
  const totalCount = notifications.length

  const dismissNotification = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]))
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-urgency-critical bg-urgency-critical/10'
      case 'medium': return 'text-urgency-medium bg-urgency-medium/10'
      case 'low': return 'text-info bg-info/10'
      default: return 'text-muted-foreground bg-secondary'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'overdue': return AlertTriangle
      case 'due_soon': return Clock
      case 'stale': return Archive
      case 'insight': return Sparkles
      case 'reminder': return Calendar
      default: return Bell
    }
  }

  return (
    <div className="relative">
      {/* Notification Bell Button — visual size stays 36x36 (p-2 + w-5 h-5
          icon); on touch devices an invisible ::before extends the hit box
          to 44x44 without changing what's painted, same trick as the
          Waddle skill's small-icon-btn pattern. */}
      <button
        data-tour="notification-center"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={totalCount > 0 ? t('通知 ({n})', { n: totalCount }) : t('通知')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          isOpen ? 'bg-secondary' : 'hover:bg-secondary/50',
          '[@media(hover:none)]:before:content-[""] [@media(hover:none)]:before:absolute [@media(hover:none)]:before:inset-[-4px]'
        )}
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {totalCount > 0 && (
          <span
            role="status"
            aria-live="polite"
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white',
              highPriorityCount > 0 ? 'bg-urgency-critical' : 'bg-urgency-high'
            )}
          >
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-overlay"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel:
              - mobile: detach from the bell and fix to the viewport so it
                doesn't overflow the left edge (the bell sits ~50px from
                the right, so a right-anchored 24rem panel ran off-screen).
                Sits below the header (safe area + header height).
              - desktop: original behavior — right-aligned popover under
                the bell. */}
          <div className="fixed left-2 right-2 top-[calc(env(safe-area-inset-top,0px)+56px)] max-h-[70vh] z-popover md:absolute md:left-auto md:right-0 md:top-full md:max-h-[80vh] md:mt-2 md:w-96 bg-card rounded-xl shadow-xl border border-border overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">{t('通知中心')}</span>
                {totalCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                    {totalCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  </div>
                  <p className="font-medium text-foreground">{t('一切順利！')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('目前沒有需要注意的事項')}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((notification) => {
                    const TypeIcon = getTypeIcon(notification.type)
                    return (
                      <div
                        key={notification.id}
                        className="p-4 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex gap-3">
                          {/* Icon */}
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                            getPriorityColor(notification.priority)
                          )}>
                            <TypeIcon className="w-4 h-4" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-medium text-sm text-foreground">
                                {notification.title}
                              </h4>
                              <button
                                onClick={() => dismissNotification(notification.id)}
                                className="p-1 rounded hover:bg-secondary transition-colors flex-shrink-0"
                              >
                                <X className="w-3 h-3 text-muted-foreground" />
                              </button>
                            </div>

                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                              {notification.message}
                            </p>

                            {/* Task list preview */}
                            {notification.tasks && notification.tasks.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {notification.tasks.slice(0, 3).map((task) => (
                                  <button
                                    key={task.id}
                                    onClick={() => {
                                      onTaskClick?.(task)
                                      setIsOpen(false)
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left group"
                                  >
                                    <div
                                      className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: task.workspaceColor }}
                                    />
                                    <span className="text-xs truncate flex-1">{task.title}</span>
                                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity [@media(hover:none)]:opacity-100" />
                                  </button>
                                ))}
                                {notification.tasks.length > 3 && (
                                  <p className="text-[10px] text-muted-foreground pl-2">
                                    {t('還有 {n} 個任務...', { n: notification.tasks.length - 3 })}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Actions */}
                            {notification.actionLabel && (
                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={() => {
                                    if (notification.type === 'overdue' && onReviewOverdue) {
                                      onReviewOverdue()
                                    } else if (notification.tasks?.[0]) {
                                      onTaskClick?.(notification.tasks[0])
                                    }
                                    setIsOpen(false)
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                                >
                                  {notification.actionLabel}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-secondary/20">
                <p className="text-[10px] text-muted-foreground text-center">
                  {t('慢慢搖擺，把事情做完')}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
