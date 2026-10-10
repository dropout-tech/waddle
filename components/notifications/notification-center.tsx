'use client'

import { useState, useMemo, useEffect, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useMeetingNotifications } from '@/hooks/use-meeting-notifications'
import {
  Bell,
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  Archive,
  ChevronRight,
  X,
  Sparkles,
} from 'lucide-react'
import { InkBellLg } from '@/components/icons/huddle-icons'
import { cn } from '@/lib/utils'
import type { Task, Workspace } from '@/lib/types'
import { toDateString } from '@/lib/calendar-utils'
import { useI18n } from '@/lib/i18n/react'
import { brandQuote } from '@/lib/brand'
import { t } from '@/lib/i18n'
import { useUserSettings } from '@/components/user-settings-context'
import { useAuth } from '@/components/auth/auth-provider'
import { mergeNotificationSettings } from '@/lib/notifications/settings'
import {
  arrangeBell,
  collectOpenTasks,
  computeTaskReminders,
  type BellGroup,
  type TaskReminderItem,
} from '@/lib/notifications/task-reminders'
import {
  dailyBellKey,
  markDismissed,
  markSeen,
  parseDailyBell,
  readDailyBellRaw,
  subscribeDailyBell,
  updateDailyBell,
} from '@/lib/notifications/daily-bell'

interface NotificationCenterProps {
  workspaces: Workspace[]
  onTaskClick?: (task: Task) => void
  onReviewOverdue?: () => void
  /** Controlled open state — lets the mobile calendar header open the panel
   *  from its ⋯ menu instead of a standalone bell. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Render only the panel (no bell button); pair with open/onOpenChange. */
  hideTrigger?: boolean
  /** Reports the badge count so a host button can show it. */
  onCountChange?: (count: number, hasHighPriority: boolean) => void
}

interface Notification {
  id: string
  type: TaskReminderItem['type']
  priority: 'high' | 'medium' | 'low'
  title: string
  message: string
  tasks?: Task[]
  actionLabel?: string
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

export function NotificationCenter({
  workspaces,
  onTaskClick,
  onReviewOverdue,
  open,
  onOpenChange,
  hideTrigger = false,
  onCountChange,
}: NotificationCenterProps) {
  const { t, lang } = useI18n()
  const meetingInbox = useMeetingNotifications()
  const router = useRouter()
  const english = lang === 'en'
  const [readingId, setReadingId] = useState<string>()
  const readMeeting = async (id: string, meetingId?: string) => {
    if (readingId) return
    setReadingId(id)
    try {
      if (await meetingInbox.markRead(id)) {
        if (meetingId) {
          setIsOpen(false)
          router.push(`/meetings/invitations?invite=${meetingId}`)
        }
      }
    } finally {
      setReadingId(undefined)
    }
  }
  const [innerOpen, setInnerOpen] = useState(false)
  const isOpen = open ?? innerOpen
  const setIsOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setInnerOpen(next)
  }
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  // 設定 › 提醒設定: every switch and number there is applied by lib/notifications/task-reminders.ts
  // (computeTaskReminders / arrangeBell). Meeting-invite messages below are not task reminders and always show.
  // A stored blob that lacks a section is filled in from the defaults (lib/notifications/settings.ts).
  const storedPrefs = useUserSettings()?.notifications
  const prefs = useMemo(() => mergeNotificationSettings(storedPrefs), [storedPrefs])

  // "Now" moves while the bell stays mounted: the planning card appears at its time and the day rolls over.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNowMs(Date.now())
    const id = window.setInterval(tick, 60 * 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  const todayStr = toDateString(new Date(nowMs))

  // Per-day memory of the two daily cards (digest, planning): seen → no longer counted on the badge; dismissed → hidden.
  // Lives in localStorage per account (lib/notifications/daily-bell.ts); a state from another day counts as empty.
  const userId = useAuth().user?.id ?? null
  const dailyKey = dailyBellKey(userId)
  const dailyRaw = useSyncExternalStore(
    subscribeDailyBell,
    () => readDailyBellRaw(dailyKey),
    () => null,
  )
  const daily = useMemo(() => parseDailyBell(dailyRaw, todayStr), [dailyRaw, todayStr])

  // Gather all open tasks from workspaces
  const allTasks = useMemo(() => collectOpenTasks(workspaces), [workspaces])

  // Which reminders apply right now (pure; see lib/notifications/task-reminders.ts), minus the ones dismissed.
  const items = useMemo(
    () =>
      computeTaskReminders({ tasks: allTasks, settings: prefs, now: new Date(nowMs) }).filter(
        (i) => !dismissedIds.has(i.id) && !(i.daily && daily.dismissed.includes(i.id)),
      ),
    [allTasks, prefs, nowMs, dismissedIds, daily.dismissed],
  )

  // The words for one reminder item.
  const describe = (item: TaskReminderItem): Notification => {
    const base = { id: item.id, type: item.type, priority: item.priority, tasks: item.tasks }
    switch (item.id) {
      case 'daily-digest': {
        const parts: string[] = []
        if (item.meta.overdue) parts.push(t('{n} 件逾期', { n: item.meta.overdue }))
        if (item.meta.dueToday) parts.push(t('今天 {n} 件到期', { n: item.meta.dueToday }))
        if (item.meta.dueTomorrow) parts.push(t('明天 {n} 件到期', { n: item.meta.dueTomorrow }))
        return { ...base, tasks: undefined, title: t('今天的摘要'), message: parts.join(english ? ', ' : '、') }
      }
      case 'daily-planning':
        return {
          ...base,
          tasks: undefined,
          title: t('每日規劃時間到了'),
          message: t('花一分鐘看看待辦，把接下來的時間排一排。'),
        }
      case 'critical-overdue':
        return {
          ...base,
          title: t('{n} 個任務已經放了一陣子', { n: item.count }),
          message: t(
            '最久的一件是{time}的。有些也許已經不用做了——放心整理掉，留下真正想做的就好。',
            { time: formatRelativeTime(item.meta.oldestDays ?? 0) },
          ),
          actionLabel: t('整理任務'),
        }
      case 'recent-overdue':
        return {
          ...base,
          title: t('{n} 個任務剛過了預定日', { n: item.count }),
          message: t('日子過了也沒關係，挑個合適的時段重新安排就好。'),
          actionLabel: t('查看任務'),
        }
      case 'due-today':
        return {
          ...base,
          title: t('今天排了 {n} 件事', { n: item.count }),
          message: t('還有時間，可以慢慢做——一件一件來就好。'),
          actionLabel: t('查看任務'),
        }
      case 'due-tomorrow':
        return {
          ...base,
          title: t('{n} 個任務明天到期', { n: item.count }),
          message: t('先看看要不要準備什麼，順手把它們放上日曆吧。'),
          actionLabel: t('查看任務'),
        }
      case 'due-soon':
        return {
          ...base,
          title: t('{n} 個任務這幾天到期', { n: item.count }),
          message: t(
            '接下來 {days} 天會陸續到期，先挑個順手的時段放上日曆，到時候就從容多了。',
            { days: item.meta.windowDays ?? 3 },
          ),
          actionLabel: t('查看任務'),
        }
      case 'stale-tasks':
        return {
          ...base,
          title: t('{n} 個任務靜靜躺了 {days} 天以上', { n: item.count, days: item.meta.staleDays ?? 14 }),
          message: t('還想做的話，挑個日子放上日曆；不想做了也沒關係，歸檔就好。'),
          actionLabel: t('整理任務'),
        }
      case 'too-many-urgent':
        return {
          ...base,
          title: t('急件好像有點多'),
          message: t(
            '有 {n} 個任務的優先等級在 {level}/10 以上。全部都急，反而不知道從哪開始——挑出真正的前幾名，其他的緩緩也可以。',
            { n: item.count, level: item.meta.level ?? 8 },
          ),
          actionLabel: t('調整優先順序'),
        }
      case 'unscheduled-tasks':
        return {
          ...base,
          title: item.meta.majority ? t('多數任務未排程') : t('不少任務還沒排程'),
          message: t('有 {n} 個任務還沒排到日曆上。挑個時段放進去，比較容易把事情做完。', { n: item.count }),
          actionLabel: t('排程任務'),
        }
    }
  }

  // Order / group / cut the list the way 設定 › 顯示設定 asks.
  const arranged = useMemo(
    () => arrangeBell(items, prefs.appearance, showAll),
    [items, prefs.appearance, showAll],
  )
  const groupLabel = (group: BellGroup): string => {
    switch (group) {
      case 'today':
        return t('今天')
      case 'overdue':
        return t('已逾期')
      case 'due_soon':
        return t('快到期')
      case 'stale':
        return t('閒置中')
      default:
        return t('小建議')
    }
  }

  // Badge: everything listed, except daily cards that were already seen today. 顯示通知數量徽章 off → no number anywhere.
  const unreadItems = items.filter((i) => !(i.daily && daily.seen.includes(i.id)))
  const highPriorityCount = unreadItems.filter((i) => i.priority === 'high').length
  const listedCount = items.length + meetingInbox.unreadCount
  const totalCount = prefs.appearance.showBadgeCount ? unreadItems.length + meetingInbox.unreadCount : 0
  const hasHighPriority = highPriorityCount > 0
  useEffect(() => {
    onCountChange?.(totalCount, hasHighPriority)
  }, [onCountChange, totalCount, hasHighPriority])
  // Looking at the bell is how the daily cards get "read": they count on the badge until the panel that showed
  // them is closed (so the badge and the panel agree while it is open).
  const dailyIdsKey = items.filter((i) => i.daily).map((i) => i.id).join(',')
  useEffect(() => {
    if (!isOpen || !dailyIdsKey) return
    const shown = dailyIdsKey.split(',')
    return () => updateDailyBell(dailyKey, todayStr, (state) => markSeen(state, shown))
  }, [isOpen, dailyIdsKey, dailyKey, todayStr])
  // Opened from outside (mobile ⋯ menu): refresh the meeting inbox the same
  // way the bell click does.
  const refreshInbox = meetingInbox.refresh
  useEffect(() => {
    if (hideTrigger && isOpen) void refreshInbox()
  }, [hideTrigger, isOpen, refreshInbox])

  const dismissNotification = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]))
    if (items.find((i) => i.id === id)?.daily) updateDailyBell(dailyKey, todayStr, (state) => markDismissed(state, id))
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-urgency-critical-ink bg-urgency-critical/10'
      case 'medium':
        return 'text-urgency-medium bg-urgency-medium/10'
      case 'low':
        return 'text-info bg-info/10'
      default:
        return 'text-muted-foreground bg-secondary'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'overdue':
        return AlertTriangle
      case 'due_soon':
        return Clock
      case 'stale':
        return Archive
      case 'insight':
        return Sparkles
      case 'reminder':
      case 'planning':
        return Calendar
      default:
        return Bell
    }
  }

  return (
    <div className="relative">
      {!hideTrigger && (<>
      {/* Notification Bell Button — visual size stays 36x36 (p-2 + w-5 h-5
          icon); on touch devices an invisible ::before extends the hit box
          to 44x44 without changing what's painted, same trick as the
          Waddle skill's small-icon-btn pattern. */}
      <button
        data-tour="notification-center"
        onClick={() => {
          setIsOpen(!isOpen)
          if (!isOpen) void meetingInbox.refresh()
        }}
        aria-label={
          totalCount > 0 ? t('通知 ({n})', { n: totalCount }) : t('通知')
        }
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          isOpen ? 'bg-secondary' : 'hover:bg-secondary/50',
          '[@media(hover:none)]:before:content-[""] [@media(hover:none)]:before:absolute [@media(hover:none)]:before:inset-[-4px]',
        )}
      >
        <InkBellLg className="w-5 h-5 text-muted-foreground" />
        {totalCount > 0 && (
          <span
            role="status"
            aria-live="polite"
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white',
              highPriorityCount > 0 ? 'bg-urgency-critical-strong' : 'bg-urgency-high',
            )}
          >
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>
      </>)}

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
                {listedCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                    {listedCount}
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
              {meetingInbox.error && (
                <div role="alert" className="p-4 text-sm text-destructive">
                  {english
                    ? 'Unable to update meeting notifications.'
                    : '無法更新會議通知。'}
                  <button
                    className="ml-2 underline"
                    onClick={() => void meetingInbox.refresh()}
                  >
                    {english ? 'Retry' : '重試'}
                  </button>
                </div>
              )}
              {meetingInbox.items.map((item) => (
                <div
                  key={item.id}
                  data-meeting-notification={item.id}
                  className="p-4 border-b border-border"
                >
                  <p className="text-xs text-muted-foreground">
                    {item.kind === 'invitation'
                      ? english
                        ? 'New meeting invitation'
                        : '收到會議邀請'
                      : item.kind === 'cancellation'
                        ? english
                          ? 'Meeting cancelled'
                          : '會議已取消'
                        : english
                          ? 'Meeting response'
                          : '會議回覆'}
                  </p>
                  <p className="mt-1 text-sm font-medium break-words">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground break-words">
                    {item.actor_name}
                    {item.response
                      ? ` · ${english ? { accepted: 'Accepted', tentative: 'Tentative', declined: 'Declined' }[item.response] : { accepted: '接受', tentative: '暫定', declined: '婉拒' }[item.response]}`
                      : ''}
                  </p>
                  <div className="mt-2 flex gap-3">
                    <button
                      disabled={!!readingId}
                      className="text-xs text-primary underline disabled:opacity-50"
                      onClick={() => void readMeeting(item.id, item.meeting_id)}
                    >
                      {english ? 'View invitation' : '查看邀請'}
                    </button>
                    <button
                      disabled={!!readingId}
                      className="text-xs text-muted-foreground underline disabled:opacity-50"
                      onClick={() => void readMeeting(item.id)}
                    >
                      {english ? 'Mark as read' : '標為已讀'}
                    </button>
                  </div>
                </div>
              ))}
              {meetingInbox.unreadCount > meetingInbox.items.length && (
                <p className="p-3 text-xs text-muted-foreground">
                  {english
                    ? 'Showing the latest 50. Read these to see earlier notifications.'
                    : '顯示最新 50 則，讀取後會接續顯示較早通知。'}
                </p>
              )}
              {items.length === 0 &&
              meetingInbox.unreadCount === 0 &&
              !meetingInbox.error ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  </div>
                  <p className="font-medium text-foreground">
                    {t('一切順利！')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('目前沒有需要注意的事項')}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {arranged.rows.map((row) => {
                    if (row.kind === 'header') {
                      return (
                        <div
                          key={`group-${row.group}`}
                          data-bell-group={row.group}
                          className="px-4 pt-3 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground bg-secondary/20"
                        >
                          {groupLabel(row.group)}
                        </div>
                      )
                    }
                    const notification = describe(row.item)
                    const TypeIcon = getTypeIcon(notification.type)
                    return (
                      <div
                        key={notification.id}
                        data-bell-item={notification.id}
                        className="p-4 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex gap-3">
                          {/* Icon */}
                          <div
                            className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                              getPriorityColor(notification.priority),
                            )}
                          >
                            <TypeIcon className="w-4 h-4" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-medium text-sm text-foreground">
                                {notification.title}
                              </h4>
                              <button
                                onClick={() =>
                                  dismissNotification(notification.id)
                                }
                                className="p-1 rounded hover:bg-secondary transition-colors flex-shrink-0"
                              >
                                <X className="w-3 h-3 text-muted-foreground" />
                              </button>
                            </div>

                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                              {notification.message}
                            </p>

                            {/* Task list preview */}
                            {notification.tasks &&
                              notification.tasks.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {notification.tasks
                                    .slice(0, 3)
                                    .map((task) => (
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
                                          style={{
                                            backgroundColor:
                                              task.workspaceColor,
                                          }}
                                        />
                                        <span className="text-xs truncate flex-1">
                                          {task.title}
                                        </span>
                                        <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity [@media(hover:none)]:opacity-100" />
                                      </button>
                                    ))}
                                  {notification.tasks.length > 3 && (
                                    <p className="text-[10px] text-muted-foreground pl-2">
                                      {t('還有 {n} 個任務...', {
                                        n: notification.tasks.length - 3,
                                      })}
                                    </p>
                                  )}
                                </div>
                              )}

                            {/* Actions */}
                            {notification.actionLabel && (
                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={() => {
                                    if (
                                      notification.type === 'overdue' &&
                                      onReviewOverdue
                                    ) {
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
            {items.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-secondary/20">
                {(arranged.hidden > 0 || showAll) && arranged.total > prefs.appearance.maxVisible && (
                  <button
                    type="button"
                    data-bell-show-all
                    onClick={() => setShowAll((v) => !v)}
                    className="mb-2 w-full text-center text-xs text-primary underline"
                  >
                    {showAll
                      ? t('只顯示前 {n} 則', { n: prefs.appearance.maxVisible })
                      : t('顯示其餘 {n} 則', { n: arranged.hidden })}
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground text-center">
                  {brandQuote(lang).quote}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
