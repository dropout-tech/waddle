'use client'

import { useMemo, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronRight,
  Inbox,
  Loader2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/modals/modal-shell'
import { getTaskOverdueDate } from '@/lib/task-utils'
import { parseDateString, toDateString } from '@/lib/calendar-utils'
import { useDisplayColor } from '@/hooks/use-display-color'
import { useI18n } from '@/lib/i18n/react'
import type { Task, Workspace } from '@/lib/types'

interface OverdueTaskReviewProps {
  isOpen: boolean
  workspaces: Workspace[]
  onClose: () => void
  onComplete: (taskId: string) => Promise<void>
  onCompleteAll: (taskIds: string[]) => Promise<void>
  onReturnToBacklog: (taskId: string) => Promise<void>
  onArchive: (taskId: string) => Promise<void>
  onSelectTask: (task: Task) => void
}

type ReviewMode = 'list' | 'review'

function daysAgo(date: string, today: string): number {
  const start = parseDateString(date).getTime()
  const end = parseDateString(today).getTime()
  return Math.max(1, Math.round((end - start) / 86_400_000))
}

export function OverdueTaskReview({
  isOpen,
  workspaces,
  onClose,
  onComplete,
  onCompleteAll,
  onReturnToBacklog,
  onArchive,
  onSelectTask,
}: OverdueTaskReviewProps) {
  const { t, lang } = useI18n()
  const displayColor = useDisplayColor()
  const [mode, setMode] = useState<ReviewMode>('list')
  const [activeIndex, setActiveIndex] = useState(0)
  const [startingCount, setStartingCount] = useState(0)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const today = toDateString(new Date())

  const overdueTasks = useMemo(() => {
    const tasks: Task[] = []
    for (const workspace of workspaces) {
      if (workspace.isArchived) continue
      for (const category of workspace.categories) {
        if (category.isArchived) continue
        for (const task of category.tasks) {
          if (getTaskOverdueDate(task, today)) tasks.push(task)
        }
      }
    }
    return tasks.sort((a, b) => {
      const aDate = getTaskOverdueDate(a, today) ?? ''
      const bDate = getTaskOverdueDate(b, today) ?? ''
      return aDate.localeCompare(bDate) || b.urgency - a.urgency
    })
  }, [today, workspaces])

  const handleClose = () => {
    setMode('list')
    setActiveIndex(0)
    setStartingCount(0)
    setBusyAction(null)
    onClose()
  }

  const currentIndex = Math.min(activeIndex, Math.max(0, overdueTasks.length - 1))
  const currentTask = overdueTasks[currentIndex]
  const handledCount = Math.max(0, startingCount - overdueTasks.length)

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (busyAction) return
    setBusyAction(key)
    try {
      await action()
    } finally {
      setBusyAction(null)
    }
  }

  const formatDate = (value: string) =>
    parseDateString(value).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    })

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      variant="drawer"
      ariaLabel={t('整理待處理任務')}
    >
      <header className="flex items-start gap-3 border-b border-border px-5 py-4 md:px-6 md:py-5">
        {mode === 'review' && overdueTasks.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMode('list')}
            aria-label={t('回到任務清單')}
            className="-ml-2 flex-shrink-0"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        ) : (
          <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <CalendarClock className="size-5" aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">
            {mode === 'review' && overdueTasks.length > 0 ? t('一件一件整理') : t('整理待處理任務')}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {overdueTasks.length > 0
              ? mode === 'review'
                ? t('做一個決定就好，下一件會接著出現。')
                : t('這些事情過了原本的時間，現在可以重新決定要怎麼放。')
              : t('原本卡在過去的事情都整理好了。')}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClose}
          aria-label={t('關閉')}
          className="-mr-2 flex-shrink-0"
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      {overdueTasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 pb-20 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-success/15 text-success">
            <CheckCheck className="size-8" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-foreground">{t('都整理好了')}</h3>
          <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-muted-foreground">
            {handledCount > 0
              ? t('剛剛整理了 {count} 件事，任務欄和日曆都輕一點了。', { count: handledCount })
              : t('目前沒有需要回頭整理的任務。')}
          </p>
          <Button type="button" variant="secondary" onClick={handleClose} className="mt-6">
            {t('回到日曆')}
          </Button>
        </div>
      ) : mode === 'list' ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-5 py-3 md:px-6">
            <Button
              type="button"
              onClick={() => {
                setStartingCount(overdueTasks.length)
                setActiveIndex(0)
                setMode('review')
              }}
            >
              <ChevronRight aria-hidden="true" />
              {t('逐一整理')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!!busyAction}
              onClick={() => {
                setStartingCount(overdueTasks.length)
                runAction('complete-all', () => onCompleteAll(overdueTasks.map((task) => task.id)))
              }}
            >
              {busyAction === 'complete-all' ? <Loader2 className="animate-spin" /> : <CheckCheck />}
              {t('全部標記完成')}
            </Button>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {t('共 {count} 件', { count: overdueTasks.length })}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 md:px-4">
            <ul className="space-y-1.5">
              {overdueTasks.map((task) => {
                const overdueDate = getTaskOverdueDate(task, today)!
                const isScheduled = task.scheduledDate === overdueDate
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => {
                        handleClose()
                        onSelectTask(task)
                      }}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-200 ease-quart hover:bg-secondary/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        className="size-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: displayColor(task.workspaceColor) }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{task.title || t('未命名任務')}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{task.workspaceName} · {task.categoryName}</span>
                          <span>
                            {isScheduled ? t('原排程') : t('原截止日')} {formatDate(overdueDate)}
                          </span>
                        </span>
                      </span>
                      <span className="flex-shrink-0 rounded-md bg-overdue/10 px-2 py-1 text-[11px] font-medium text-overdue">
                        {t('{days} 天前', { days: daysAgo(overdueDate, today) })}
                      </span>
                      <ChevronRight className="size-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      ) : currentTask ? (
        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-6 md:px-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('已整理 {done} 件', { done: handledCount })}</span>
            <span className="tabular-nums">{t('還有 {count} 件', { count: overdueTasks.length })}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary transition-transform duration-300 ease-quart origin-left"
              style={{ transform: `scaleX(${startingCount > 0 ? handledCount / startingCount : 0})` }}
            />
          </div>

          <div className="flex flex-1 flex-col justify-center py-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: displayColor(currentTask.workspaceColor) }}
                aria-hidden="true"
              />
              <span>{currentTask.workspaceName} · {currentTask.categoryName}</span>
            </div>
            <h3 className="mt-4 text-2xl font-semibold leading-snug text-foreground text-pretty">
              {currentTask.title || t('未命名任務')}
            </h3>
            {currentTask.description && (
              <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground text-pretty">
                {currentTask.description}
              </p>
            )}
            {(() => {
              const overdueDate = getTaskOverdueDate(currentTask, today)!
              const isScheduled = currentTask.scheduledDate === overdueDate
              return (
                <div className="mt-5 flex items-center gap-2 text-sm text-overdue">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  <span>
                    {isScheduled
                      ? t('原本排在 {date}', { date: formatDate(overdueDate) })
                      : t('原本截止於 {date}', { date: formatDate(overdueDate) })}
                    {currentTask.scheduledStartTime && ` · ${currentTask.scheduledStartTime}`}
                  </span>
                </div>
              )
            })()}
          </div>

          <div className="space-y-2.5 pb-[max(0px,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              className="h-12 w-full justify-start rounded-xl px-4"
              disabled={!!busyAction}
              onClick={() => runAction('complete', () => onComplete(currentTask.id))}
            >
              {busyAction === 'complete' ? <Loader2 className="animate-spin" /> : <Check />}
              <span className="flex-1 text-left">{t('標記為已完成')}</span>
              <span className="text-xs font-normal opacity-80">{t('事情做完了')}</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-12 w-full justify-start rounded-xl px-4"
              disabled={!!busyAction}
              onClick={() => runAction('backlog', () => onReturnToBacklog(currentTask.id))}
            >
              {busyAction === 'backlog' ? <Loader2 className="animate-spin" /> : <Inbox />}
              <span className="flex-1 text-left">{t('移回任務欄')}</span>
              <span className="text-xs font-normal text-muted-foreground">{t('清除日期與時段')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-12 w-full justify-start rounded-xl px-4 text-muted-foreground hover:text-foreground"
              disabled={!!busyAction}
              onClick={() => runAction('archive', () => onArchive(currentTask.id))}
            >
              {busyAction === 'archive' ? <Loader2 className="animate-spin" /> : <Archive />}
              <span className="flex-1 text-left">{t('取消並封存')}</span>
              <span className="text-xs font-normal">{t('不再顯示')}</span>
            </Button>
          </div>
        </div>
      ) : null}
    </ModalShell>
  )
}
