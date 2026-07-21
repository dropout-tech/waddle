'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import type { Workspace, Task } from '@/lib/types'
import { Check } from 'lucide-react'
import { useDisplayColor } from '@/hooks/use-display-color'
import { WaddleMascot } from '@/components/branding/waddle-mascot'
import { useI18n } from '@/lib/i18n/react'
import { t as translate } from '@/lib/i18n'

interface ReportDashboardProps {
  workspaces: Workspace[]
  onClose: () => void
}

type DateRangeType = 'week' | 'month' | 'quarter' | 'year'
type DecoratedTask = Task & { workspaceName: string; workspaceColor: string }

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * 溫柔覆盤 — a single-scroll retrospective, not a KPI dashboard.
 *
 * IA (deliberately kept flat so the future weekly/monthly review and the
 * conversational "ask Huddle about my month" agent can each grow out of a
 * section without restructuring):
 *   ① 節奏   — narrative summary + small daily bars
 *   ② 時間   — where scheduled time went (hours-of-day strip + workspaces)
 *   ③ 完成   — scrollable, day-grouped list of finished tasks
 *   ④ 觀察   — one rule-generated gentle observation from Huddle
 */
export function ReportDashboard({ workspaces }: ReportDashboardProps) {
  const { t, lang } = useI18n()
  const displayColor = useDisplayColor()
  const [dateRange, setDateRange] = useState<DateRangeType>('week')
  // Stable "now" for the lifetime of this view — the dashboard remounts on
  // every open, so this stays fresh while keeping the memos below stable.
  const [now] = useState(() => new Date())

  const rangeConfig = useMemo(() => {
    const start = new Date(now)
    const prevStart = new Date(now)

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

  // Localized range labels, recomputed every render so they always track the
  // current language without needing to thread `lang` through rangeConfig's
  // own memo deps.
  const labelText = t(rangeConfig.label)
  const prevLabelText = t(rangeConfig.prevLabel)
  const labelLower = labelText.charAt(0).toLowerCase() + labelText.slice(1)

  // All tasks across live workspaces, decorated with workspace identity.
  const allTasks = useMemo(() => {
    const tasks: DecoratedTask[] = []
    workspaces.forEach(ws => {
      if (!ws.isArchived) {
        ws.categories?.forEach(cat => {
          cat.tasks?.forEach(task => {
            tasks.push({ ...task, workspaceName: ws.name, workspaceColor: ws.color })
          })
        })
      }
    })
    return tasks
  }, [workspaces])

  // ---- Completions (the heart of a retrospective: what actually got done) ----

  const completedInPeriod = useMemo(
    () =>
      allTasks.filter(
        t => t.isCompleted && t.completedAt && new Date(t.completedAt) >= rangeConfig.start
      ),
    [allTasks, rangeConfig.start]
  )

  const prevCompletedCount = useMemo(
    () =>
      allTasks.filter(t => {
        if (!t.isCompleted || !t.completedAt) return false
        const d = new Date(t.completedAt)
        return d >= rangeConfig.prevStart && d < rangeConfig.start
      }).length,
    [allTasks, rangeConfig.start, rangeConfig.prevStart]
  )

  const createdInPeriod = useMemo(
    () => allTasks.filter(t => new Date(t.createdAt) >= rangeConfig.start),
    [allTasks, rangeConfig.start]
  )

  // ---- Scheduled time (meetings vs. focus, hours of day, workspaces) ----

  const timeStats = useMemo(() => {
    const startStr = toDateString(rangeConfig.start)
    const prevStartStr = toDateString(rangeConfig.prevStart)
    const todayStr = toDateString(now)

    const minutesOf = (t: DecoratedTask) => {
      if (!t.scheduledStartTime || !t.scheduledEndTime) return 0
      const [ah, am] = t.scheduledStartTime.split(':').map(Number)
      const [bh, bm] = t.scheduledEndTime.split(':').map(Number)
      return Math.max(0, bh * 60 + bm - (ah * 60 + am))
    }

    const inWindow = allTasks.filter(
      t => t.scheduledDate && t.scheduledDate >= startStr && t.scheduledDate <= todayStr
    )
    const inPrev = allTasks.filter(
      t => t.scheduledDate && t.scheduledDate >= prevStartStr && t.scheduledDate < startStr
    )

    const scheduledMinutes = inWindow.reduce((s, t) => s + minutesOf(t), 0)
    const meetingMinutes = inWindow.filter(t => t.isMeeting).reduce((s, t) => s + minutesOf(t), 0)
    const focusMinutes = scheduledMinutes - meetingMinutes
    const meetingCount = inWindow.filter(t => t.isMeeting && minutesOf(t) > 0).length

    const prevScheduled = inPrev.reduce((s, t) => s + minutesOf(t), 0)
    const prevMeeting = inPrev.filter(t => t.isMeeting).reduce((s, t) => s + minutesOf(t), 0)
    const prevFocusMinutes = prevScheduled - prevMeeting

    const hourCounts: number[] = new Array(24).fill(0)
    inWindow.forEach(t => {
      if (t.scheduledStartTime) hourCounts[parseInt(t.scheduledStartTime.split(':')[0], 10)]++
    })

    const wsMap = new Map<string, { name: string; color: string; minutes: number; count: number }>()
    inWindow.forEach(t => {
      const entry = wsMap.get(t.workspaceName) ?? {
        name: t.workspaceName,
        color: t.workspaceColor,
        minutes: 0,
        count: 0,
      }
      entry.minutes += minutesOf(t)
      entry.count += 1
      wsMap.set(t.workspaceName, entry)
    })
    const totalWsMinutes = [...wsMap.values()].reduce((s, w) => s + w.minutes, 0)
    const totalWsCount = [...wsMap.values()].reduce((s, w) => s + w.count, 0)
    const useMinutes = totalWsMinutes > 0
    const workspaceShare = [...wsMap.values()]
      .filter(w => (useMinutes ? w.minutes > 0 : w.count > 0))
      .sort((a, b) => (useMinutes ? b.minutes - a.minutes : b.count - a.count))
      .slice(0, 5)
      .map(w => ({
        ...w,
        share: useMinutes
          ? (w.minutes / totalWsMinutes) * 100
          : (w.count / Math.max(totalWsCount, 1)) * 100,
        detail: useMinutes ? formatHours(w.minutes) : t('{n} 件', { n: w.count }),
      }))

    return {
      scheduledMinutes,
      meetingMinutes,
      focusMinutes,
      meetingCount,
      prevFocusMinutes,
      hourCounts,
      workspaceShare,
    }
  }, [allTasks, rangeConfig, now, t])

  // ---- Daily completion bars (7 days for week view, 14 otherwise) ----

  const dailyData = useMemo(() => {
    const dayCount = dateRange === 'week' ? 7 : 14
    const weekdayChars =
      lang === 'en'
        ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        : ['日', '一', '二', '三', '四', '五', '六']
    const days: { label: string; full: string; completed: number; isToday: boolean }[] = []

    for (let i = dayCount - 1; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateStr = toDateString(date)
      const completed = allTasks.filter(
        t => t.isCompleted && t.completedAt?.split('T')[0] === dateStr
      ).length
      days.push({
        label:
          dayCount === 7
            ? weekdayChars[date.getDay()]
            : `${date.getMonth() + 1}/${date.getDate()}`,
        full:
          lang === 'en'
            ? `${MONTH_ABBR[date.getMonth()]} ${date.getDate()}`
            : `${date.getMonth() + 1}月${date.getDate()}日`,
        completed,
        isToday: i === 0,
      })
    }
    return days
  }, [allTasks, dateRange, now, lang])

  // ---- Day-grouped completed list ----

  const completedGroups = useMemo(() => {
    const sorted = [...completedInPeriod].sort((a, b) =>
      (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    )
    const todayStr = toDateString(now)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = toDateString(yesterday)

    const groups: { key: string; label: string; items: DecoratedTask[] }[] = []
    for (const task of sorted) {
      const key = task.completedAt!.split('T')[0]
      let group = groups[groups.length - 1]
      if (!group || group.key !== key) {
        const [, m, d] = key.split('-').map(Number)
        group = {
          key,
          label:
            key === todayStr
              ? t('今天')
              : key === yesterdayStr
                ? t('昨天')
                : lang === 'en'
                  ? `${MONTH_ABBR[m - 1]} ${d}`
                  : `${m}月${d}日`,
          items: [],
        }
        groups.push(group)
      }
      group.items.push(task)
    }
    return groups
  }, [completedInPeriod, now, lang, t])

  // ---- Narrative & observation (rule-based, tone: a friend, not a system) ----

  // "Most completions happened in the morning" clause — only claimed when
  // there is enough signal (≥3 timed completions, majority in one bucket).
  // Bucket names stay in Chinese internally; they're translated at the point
  // of use (in the narrative paragraph and inside `observation` below).
  const timeOfDayClause = useMemo(() => {
    const withTime = completedInPeriod.filter(t => t.scheduledStartTime)
    if (withTime.length < 3) return null
    const buckets = { 早上: 0, 下午: 0, 晚上: 0 }
    withTime.forEach(t => {
      const h = parseInt(t.scheduledStartTime!.split(':')[0], 10)
      if (h >= 5 && h < 12) buckets['早上']++
      else if (h >= 12 && h < 18) buckets['下午']++
      else buckets['晚上']++
    })
    const [name, count] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]
    return count / withTime.length >= 0.5 ? name : null
  }, [completedInPeriod])

  const peakHour = useMemo(() => {
    const counts = new Map<number, number>()
    completedInPeriod.forEach(t => {
      if (!t.scheduledStartTime) return
      const h = parseInt(t.scheduledStartTime.split(':')[0], 10)
      counts.set(h, (counts.get(h) ?? 0) + 1)
    })
    let best: { hour: number; count: number } | null = null
    for (const [hour, count] of counts) {
      if (!best || count > best.count) best = { hour, count }
    }
    return best
  }, [completedInPeriod])

  const overdueCount = useMemo(
    () => allTasks.filter(t => !t.isCompleted && t.dueDate && new Date(t.dueDate) < now).length,
    [allTasks, now]
  )

  const meetingShare =
    timeStats.scheduledMinutes > 0
      ? Math.round((timeStats.meetingMinutes / timeStats.scheduledMinutes) * 100)
      : 0

  const observation = useMemo(() => {
    if (meetingShare > 50 && timeStats.meetingCount >= 2) {
      return t(
        '{label}有超過一半的排程時間在會議裡。也許可以幫自己留一段不被打擾的專注時光。',
        { label: labelText }
      )
    }
    if (peakHour && peakHour.count >= 2) {
      const h = peakHour.hour
      const phase = h < 12 ? t('早上') : h < 18 ? t('下午') : t('晚上')
      const display = h > 12 ? h - 12 : h
      return t('{phase} {display} 點左右的你最有進展，把重要的事留給那段時間，也許會更輕鬆。', {
        phase,
        display,
      })
    }
    if (overdueCount >= 3) {
      return t('有 {overdueCount} 件事悄悄過了原本的日期。不用急，挑一件最想完成的開始就好。', {
        overdueCount,
      })
    }
    if (completedInPeriod.length > prevCompletedCount && prevCompletedCount > 0) {
      return t('{label}比{prevLabel}更有節奏了，保持這個舒服的步調就好。', {
        label: labelText,
        prevLabel: prevLabelText,
      })
    }
    if (completedInPeriod.length > 0) {
      return t('不論快慢，{label}走過的每一步都算數。', { label: labelLower })
    }
    return t('{label}還沒有完成的紀錄。沒關係，慢慢來，Huddle 會在這裡陪你。', {
      label: labelText,
    })
  }, [
    meetingShare,
    timeStats.meetingCount,
    peakHour,
    overdueCount,
    completedInPeriod.length,
    prevCompletedCount,
    labelText,
    prevLabelText,
    labelLower,
    t,
  ])

  const hasActivity =
    completedInPeriod.length > 0 || createdInPeriod.length > 0 || timeStats.scheduledMinutes > 0

  const completedDiff = completedInPeriod.length - prevCompletedCount
  const focusDiff = timeStats.focusMinutes - timeStats.prevFocusMinutes

  return (
    <div className="space-y-8">
      {/* Header + range switch */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t('回顧')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('慢慢回頭看，走過的都算數')}</p>
        </div>
        <div className="flex items-center gap-2">
          {(['week', 'month', 'quarter', 'year'] as const).map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={cn(
                // 44px min touch target on mobile; compact for pointer devices.
                'px-3.5 min-h-11 sm:min-h-0 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-colors',
                dateRange === range
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              {t(range === 'week' ? '週' : range === 'month' ? '月' : range === 'quarter' ? '季' : '年')}
            </button>
          ))}
        </div>
      </div>

      {!hasActivity ? (
        <Reveal index={0}>
          <div className="flex flex-col items-center text-center py-16">
            <WaddleMascot className="w-20 h-20" phase="auto" />
            <p className="mt-5 text-base font-medium">
              {t('{label}還沒有留下紀錄', { label: labelText })}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-prose">
              {t('等你記下第一件事，Huddle 就開始幫你回顧')}
            </p>
          </div>
        </Reveal>
      ) : (
        <>
          {/* ① 節奏 — narrative + small daily bars */}
          <Reveal index={0}>
            <section aria-label={t('{label}的節奏', { label: labelText })}>
              <h3 className="text-base font-semibold mb-4">
                {t('{label}的節奏', { label: labelText })}
              </h3>
              <p className="text-base leading-relaxed max-w-prose">
                {completedInPeriod.length > 0 ? (
                  <>
                    {t('{label}你完成了', { label: labelText })}
                    <Num>{completedInPeriod.length}</Num>
                    {timeOfDayClause
                      ? t('件事，大多在{clause}。', { clause: t(timeOfDayClause) })
                      : t('件事。')}
                    {prevCompletedCount > 0 && completedDiff > 0 && (
                      <>
                        {t('比{prevLabel}多完成了{diff}件。', {
                          prevLabel: prevLabelText,
                          diff: completedDiff,
                        })}
                      </>
                    )}
                    {prevCompletedCount > 0 && completedDiff === 0 && (
                      <>{t('和{prevLabel}的步調差不多。', { prevLabel: prevLabelText })}</>
                    )}
                    {prevCompletedCount > 0 && completedDiff < 0 && (
                      <>
                        {t('比{prevLabel}少一些——節奏本來就有起伏，沒關係。', {
                          prevLabel: prevLabelText,
                        })}
                      </>
                    )}
                    {timeStats.focusMinutes > 0 && (
                      <>
                        {t('留給自己的專注時間約')}
                        <Num>{hoursText(timeStats.focusMinutes)}</Num>
                        {timeStats.prevFocusMinutes > 0 && focusDiff > 0
                          ? t('小時，比{prevLabel}多了一點。', { prevLabel: prevLabelText })
                          : timeStats.prevFocusMinutes > 0 && focusDiff < 0
                            ? t('小時，比{prevLabel}短一些。', { prevLabel: prevLabelText })
                            : t('小時。')}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {t('{label}你記下了', { label: labelText })}
                    <Num>{createdInPeriod.length}</Num>
                    {t('件事，還沒有完成的紀錄——正在進行，也是一種前進。')}
                  </>
                )}
              </p>

              <p className="text-xs text-muted-foreground mt-6 mb-2">
                {t('每日完成 · 最近 {n} 天', { n: dailyData.length })}
              </p>
              <DailyBars data={dailyData} />
            </section>
          </Reveal>

          {/* ② 時間都花在哪 */}
          <Reveal index={1}>
            <section aria-label={t('時間都花在哪')} className="border-t border-border/70 pt-7">
              <h3 className="text-base font-semibold mb-1">{t('時間都花在哪')}</h3>
              {timeStats.scheduledMinutes > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground mb-5">
                    {timeStats.meetingMinutes > 0 ? (
                      <>
                        {lang === 'en' ? 'Meetings' : '會議'} <MutedNum>{hoursText(timeStats.meetingMinutes)}</MutedNum>{' '}
                        {t('小時')} · {t('專注')}{' '}
                        <MutedNum>{hoursText(timeStats.focusMinutes)}</MutedNum> {t('小時')}
                      </>
                    ) : (
                      <>
                        {t('專注')} <MutedNum>{hoursText(timeStats.focusMinutes)}</MutedNum>{' '}
                        {t('小時')} · {t('沒有會議打擾')}
                      </>
                    )}
                  </p>

                  <HourStrip counts={timeStats.hourCounts} />

                  {timeStats.workspaceShare.length > 0 && (
                    <div className="mt-7 space-y-4">
                      {timeStats.workspaceShare.map(ws => {
                        const wsColor = displayColor(ws.color)
                        return (
                          <div key={ws.name} className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: wsColor }}
                                  aria-hidden="true"
                                />
                                <span className="text-sm truncate">{ws.name}</span>
                              </div>
                              <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                                {ws.detail}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${ws.share}%`,
                                  backgroundColor: wsColor,
                                }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground mt-3">
                  {t('{label}還沒有排上時間軸的事。想試著把一件事放進日曆看看嗎？', {
                    label: labelText,
                  })}
                </p>
              )}
            </section>
          </Reveal>

          {/* ③ 完成的事 */}
          <Reveal index={2}>
            <section aria-label={t('完成的事')} className="border-t border-border/70 pt-7">
              <h3 className="text-base font-semibold mb-4">
                {t('完成的事')}
                {completedInPeriod.length > 0 && (
                  <span className="ml-2 text-sm font-mono font-normal text-muted-foreground">
                    {completedInPeriod.length}
                  </span>
                )}
              </h3>
              {completedGroups.length > 0 ? (
                <div className="max-h-80 overflow-y-auto pr-1 space-y-5">
                  {completedGroups.map(group => (
                    <div key={group.key}>
                      <p className="text-xs text-muted-foreground mb-2">{group.label}</p>
                      <ul className="space-y-1">
                        {group.items.map(task => (
                          <li key={task.id} className="flex items-center gap-2.5 py-1">
                            <span className="w-5 h-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                              <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" />
                            </span>
                            <span className="text-sm truncate flex-1">{task.title}</span>
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: displayColor(task.workspaceColor) }}
                              aria-hidden="true"
                            />
                            {task.completedAt && (
                              <span className="text-[11px] font-mono text-muted-foreground w-11 text-right tabular-nums">
                                {timeOf(task.completedAt)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('{label}還沒有完成的紀錄。沒關係，正在進行也是一種前進。', {
                    label: labelText,
                  })}
                </p>
              )}
            </section>
          </Reveal>

          {/* ④ Huddle 的觀察 */}
          <Reveal index={3}>
            <section aria-label={t('Huddle 的觀察')} className="border-t border-border/70 pt-7">
              <h3 className="text-base font-semibold mb-4">{t('Huddle 的觀察')}</h3>
              <div className="flex items-center gap-4 rounded-xl bg-accent/30 p-4 sm:p-5">
                <WaddleMascot className="w-11 h-11 shrink-0" phase="auto" />
                <p className="text-sm leading-relaxed text-accent-foreground max-w-prose">
                  {observation}
                </p>
              </div>
            </section>
          </Reveal>
        </>
      )}
    </div>
  )
}

// ---------- Presentational helpers ----------

/** Staggered entrance: fade + 8px rise, ease-out-quart, honors reduced motion. */
function Reveal({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
      style={{
        animationDelay: `${index * 80}ms`,
        animationDuration: '300ms',
        animationTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
        animationFillMode: 'backwards',
      }}
    >
      {children}
    </div>
  )
}

/** Inline narrative number — mono, terracotta, one step above body text. */
function Num({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-lg font-medium text-primary tabular-nums mx-1">
      {children}
    </span>
  )
}

function MutedNum({ children }: { children: ReactNode }) {
  return <span className="font-mono text-foreground/80 tabular-nums">{children}</span>
}

/** Small daily completion bars, terracotta on warm neutral baseline. */
function DailyBars({
  data,
}: {
  data: { label: string; full: string; completed: number; isToday: boolean }[]
}) {
  const { t, lang } = useI18n()
  const max = Math.max(...data.map(d => d.completed), 1)
  const itemSep = lang === 'en' ? ', ' : '、'
  const items = data.map(d => t('{full} {n} 件', { full: d.full, n: d.completed })).join(itemSep)
  return (
    <div
      className="flex items-end gap-1.5"
      role="img"
      aria-label={t('每日完成數量：{items}', { items })}
    >
      {data.map((day, i) => (
        <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
          <div className="w-full h-16 flex items-end justify-center">
            <div
              className="w-full max-w-7 rounded-t"
              style={
                day.completed > 0
                  ? {
                      height: `${Math.max((day.completed / max) * 100, 8)}%`,
                      backgroundColor: 'var(--chart-1)',
                      opacity: 0.45 + 0.55 * (day.completed / max),
                    }
                  : { height: '3px', backgroundColor: 'var(--border)' }
              }
              title={t('{full}：完成 {n} 件', { full: day.full, n: day.completed })}
            />
          </div>
          <span
            className={cn(
              'text-[10px] font-mono',
              day.isToday ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {day.label}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 24-hour strip of scheduled activity — height + warmth encode intensity. */
function HourStrip({ counts }: { counts: number[] }) {
  const { t } = useI18n()
  const max = Math.max(...counts, 1)
  return (
    <div role="img" aria-label={t('一天之中排程活動的分佈')}>
      <div className="flex items-end gap-[3px] h-12">
        {counts.map((count, hour) => (
          <div
            key={hour}
            className="flex-1 rounded-t-sm"
            style={
              count > 0
                ? {
                    height: `${Math.max((count / max) * 100, 12)}%`,
                    backgroundColor: 'var(--chart-1)',
                    opacity: 0.35 + 0.65 * (count / max),
                  }
                : { height: '2px', backgroundColor: 'var(--border)' }
            }
            title={t('{hour}:00 · {n} 件', { hour, n: count })}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] font-mono text-muted-foreground">
        <span>0:00</span>
        <span>6:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  )
}

// ---------- Pure helpers ----------

function hoursText(minutes: number): string {
  return String(Math.round((minutes / 60) * 10) / 10)
}

function formatHours(minutes: number): string {
  if (minutes < 60) return translate('{n} 分鐘', { n: minutes })
  return translate('{n} 小時', { n: hoursText(minutes) })
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
