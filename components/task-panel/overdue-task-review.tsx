'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
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
import { useIsMobile } from '@/hooks/use-mobile'
import { hapticSelection, hapticTaskComplete } from '@/lib/haptics'
import { beginGestureSuppression, endGestureSuppression } from '@/hooks/use-swipe-navigation'
import { useI18n } from '@/lib/i18n/react'
import type { Task, Workspace } from '@/lib/types'

interface OverdueTaskReviewProps {
  isOpen: boolean
  workspaces: Workspace[]
  onClose: () => void
  onComplete: (taskId: string) => Promise<void>
  onCompleteAll: (taskIds: string[]) => Promise<void>
  onReturnToBacklog: (taskId: string) => Promise<void>
  onScheduleToday: (taskId: string) => Promise<void>
  onArchive: (taskId: string) => Promise<void>
  onSelectTask: (task: Task) => void
}

type ReviewMode = 'list' | 'review'

/** The four one-decision gestures available on the review card (mobile only).
 *  Every one of them also has a visible button underneath — the swipe is an
 *  accelerator, never the only way in. */
type SwipeDir = 'right' | 'left' | 'up' | 'down'

/** Travel (px) needed before a drag counts as a decision. */
const SWIPE_COMMIT_PX = 88
/** Travel (px) before we lock the drag to one axis, so a diagonal wobble at
 *  the start of a vertical drag doesn't register as a horizontal one. */
const AXIS_LOCK_PX = 10
/** Must outlast the card's fly-out transition below. */
const EXIT_MS = 220

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
  onScheduleToday,
  onArchive,
  onSelectTask,
}: OverdueTaskReviewProps) {
  const { t, lang } = useI18n()
  const displayColor = useDisplayColor()
  const isMobile = useIsMobile()
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

  // ---- Swipe-to-decide (mobile) ------------------------------------------
  // Each direction maps 1:1 onto a button below the card. Right = the happy
  // path (done), left = push it back to the backlog, up = do it today,
  // down = let it go.
  const swipeEnabled = isMobile && mode === 'review'
  const dragRef = useRef<{ id: number; x: number; y: number; axis: 'none' | 'x' | 'y' } | null>(null)
  const suppressingRef = useRef(false)
  const [drag, setDrag] = useState({ dx: 0, dy: 0 })
  const [exit, setExit] = useState<{ taskId: string; dir: SwipeDir } | null>(null)

  const releaseSuppression = useCallback(() => {
    if (!suppressingRef.current) return
    suppressingRef.current = false
    endGestureSuppression()
  }, [])

  // A drag interrupted by an unmount (sheet closed mid-swipe) would otherwise
  // leave the app-wide swipe navigation permanently suppressed.
  useEffect(() => releaseSuppression, [releaseSuppression])

  const swipeAction = useCallback(
    (dir: SwipeDir) => {
      switch (dir) {
        case 'right':
          return { key: 'complete', label: t('標記為已完成'), Icon: Check, tone: 'text-success', bg: 'bg-success/12' }
        case 'left':
          return { key: 'backlog', label: t('移回任務欄'), Icon: Inbox, tone: 'text-primary', bg: 'bg-primary/12' }
        case 'up':
          return { key: 'today', label: t('排今天'), Icon: CalendarPlus, tone: 'text-primary', bg: 'bg-primary/12' }
        case 'down':
          return { key: 'archive', label: t('封存'), Icon: Archive, tone: 'text-muted-foreground', bg: 'bg-secondary' }
      }
    },
    [t],
  )

  const commitSwipe = (dir: SwipeDir) => {
    const task = currentTask
    if (!task || busyAction) return
    setExit({ taskId: task.id, dir })
    if (dir === 'right') hapticTaskComplete()
    else hapticSelection()
    const run = () => {
      switch (dir) {
        case 'right':
          return onComplete(task.id)
        case 'left':
          return onReturnToBacklog(task.id)
        case 'up':
          return onScheduleToday(task.id)
        case 'down':
          return onArchive(task.id)
      }
    }
    // Hold the card off-screen until the write lands, then drop the exit
    // state — by that point the list has advanced, so the incoming card is
    // matched by id and renders untransformed instead of flying back in.
    void (async () => {
      const started = Date.now()
      await runAction(swipeAction(dir).key, run)
      const wait = Math.max(0, EXIT_MS - (Date.now() - started))
      if (wait) await new Promise(resolve => setTimeout(resolve, wait))
      setExit(null)
    })()
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled || busyAction || event.pointerType === 'mouse') return
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: 'none' }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current
    if (!state || state.id !== event.pointerId) return
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    if (state.axis === 'none') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      state.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      event.currentTarget.setPointerCapture(event.pointerId)
      // Stop the calendar/tasks panel swipe from also reading this gesture.
      if (!suppressingRef.current) {
        suppressingRef.current = true
        beginGestureSuppression()
      }
    }
    setDrag(state.axis === 'x' ? { dx, dy: 0 } : { dx: 0, dy })
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current
    if (!state || state.id !== event.pointerId) return
    dragRef.current = null
    releaseSuppression()
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    setDrag({ dx: 0, dy: 0 })
    if (state.axis === 'x' && Math.abs(dx) >= SWIPE_COMMIT_PX) commitSwipe(dx > 0 ? 'right' : 'left')
    else if (state.axis === 'y' && Math.abs(dy) >= SWIPE_COMMIT_PX) commitSwipe(dy < 0 ? 'up' : 'down')
  }

  const isExiting = !!exit && !!currentTask && exit.taskId === currentTask.id
  const activeDir: SwipeDir | null =
    isExiting
      ? exit!.dir
      : Math.abs(drag.dx) > AXIS_LOCK_PX
        ? drag.dx > 0
          ? 'right'
          : 'left'
        : Math.abs(drag.dy) > AXIS_LOCK_PX
          ? drag.dy < 0
            ? 'up'
            : 'down'
          : null

  const cardOffset = isExiting
    ? { x: exit!.dir === 'right' ? 520 : exit!.dir === 'left' ? -520 : 0, y: exit!.dir === 'up' ? -720 : exit!.dir === 'down' ? 720 : 0 }
    : { x: drag.dx, y: drag.dy }
  const swipeProgress = Math.min(1, Math.max(Math.abs(cardOffset.x), Math.abs(cardOffset.y)) / SWIPE_COMMIT_PX)

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

          <div className="flex flex-1 flex-col justify-center py-6">
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              style={{
                transform: `translate3d(${cardOffset.x}px, ${cardOffset.y}px, 0) rotate(${Math.max(-12, Math.min(12, cardOffset.x / 18))}deg)`,
                transition:
                  drag.dx === 0 && drag.dy === 0
                    ? 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1), opacity 220ms ease-out'
                    : 'none',
                opacity: isExiting ? 0 : 1,
                touchAction: swipeEnabled ? 'none' : undefined,
              }}
              className={
                swipeEnabled
                  ? 'relative select-none rounded-2xl border border-border bg-secondary/35 p-5 will-change-transform'
                  : 'relative'
              }
            >
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
                <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground text-pretty line-clamp-4">
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

              {/* What this swipe is about to do. Fades in with the drag so the
                  decision is confirmed before the finger lifts. */}
              {swipeEnabled && activeDir && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
                  {/* Only the scrim and the colour wash fade with the drag —
                      putting the opacity on a shared parent would make the
                      label itself translucent and let the task title bleed
                      straight through it. */}
                  <div className="absolute inset-0 bg-card/95 backdrop-blur-[2px]" style={{ opacity: swipeProgress }} />
                  <div className={`absolute inset-0 ${swipeAction(activeDir).bg}`} style={{ opacity: swipeProgress }} />
                  <div
                    className="relative flex h-full items-center justify-center"
                    style={{ opacity: Math.min(1, swipeProgress * 3) }}
                  >
                    <span className={`flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold shadow-lg ${swipeAction(activeDir).tone}`}>
                      {(() => {
                        const { Icon } = swipeAction(activeDir)
                        return <Icon className="size-4" />
                      })()}
                      {swipeAction(activeDir).label}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {swipeEnabled && (
              <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
                {t('滑動卡片：右＝完成，左＝移回任務欄')}
                <br />
                {t('上＝排今天，下＝封存')}
              </p>
            )}
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
              onClick={() => runAction('today', () => onScheduleToday(currentTask.id))}
            >
              {busyAction === 'today' ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
              <span className="flex-1 text-left">{t('排今天')}</span>
              <span className="text-xs font-normal text-muted-foreground">{t('重新排到今天')}</span>
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
