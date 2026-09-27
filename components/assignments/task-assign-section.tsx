'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'
import { useI18n } from '@/lib/i18n/react'
import {
  assignTask,
  unassignTask,
  returnTask,
  listAssignablePeople,
  assignmentErrorMessage,
  notifyAssignmentsChanged,
  type AssignablePerson,
} from '@/lib/assignments'

export function PersonAvatar({ name, url, size = 28 }: { name: string; url?: string; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.45)) }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />
  }
  return (
    <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold leading-none text-primary" aria-hidden>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  )
}

/** Status pill used by the /assignments page. */
export function AssignmentStatusPill({ task }: { task: Pick<Task, 'isCompleted'> & { assignment?: Task['assignment'] } }) {
  const { t } = useI18n()
  const a = task.assignment
  if (!a) return null
  const label = a.status === 'returned' ? t('已退回') : task.isCompleted ? t('已完成') : t('進行中')
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        a.status === 'returned'
          ? 'bg-destructive/10 text-destructive'
          : task.isCompleted
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

function assignmentLabel(t: ReturnType<typeof useI18n>['t'], a: NonNullable<Task['assignment']>) {
  if (a.role === 'assignee') return t('來自 {name}', { name: a.peerName })
  return a.status === 'returned' ? t('{name} 已退回', { name: a.peerName }) : t('指派給 {name}', { name: a.peerName })
}

/**
 * Task-row marker: a ~16px avatar at the end of the row, name only in the
 * tooltip / aria-label; a small red dot when returned. Dimmed with the row
 * when the task is completed.
 */
export function TaskAssignmentChip({ task }: { task: Task }) {
  const { t } = useI18n()
  const a = task.assignment
  if (!a) return null
  const label = assignmentLabel(t, a)
  const title = a.status === 'returned' && a.returnNote ? `${label}：${a.returnNote}` : label
  return (
    <span
      data-testid="assignment-chip"
      role="img"
      aria-label={title}
      title={title}
      className={cn('relative inline-flex flex-shrink-0', task.isCompleted && 'opacity-50')}
    >
      <PersonAvatar name={a.peerName} url={a.peerAvatar} size={16} />
      {a.status === 'returned' && (
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive ring-1 ring-card" aria-hidden />
      )}
    </span>
  )
}

/**
 * Task modal header control. Unassigned: a small person icon. Assigned: the
 * other person's ~20px avatar (red dot when returned). Tapping opens a
 * popover with everything else — candidates, withdraw, privacy hint, and for
 * the assignee the return-with-reason form — so the modal body stays
 * untouched. The visual is small; the hit area is 44×44.
 */
export function TaskAssignButton({ task, onReturned, staged, onStage }: {
  task: Task
  onReturned?: () => void
  /** Create mode: the person picked so far (nothing is written until save). */
  staged?: AssignablePerson | null
  /** Create mode: picking only stages the choice; the caller assigns after insert. */
  onStage?: (person: AssignablePerson | null) => void
}) {
  const { t } = useI18n()
  const stageMode = !!onStage
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState<AssignablePerson[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const a = stageMode ? undefined : task.assignment
  const isAssignee = a?.role === 'assignee'

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    // Capture phase + preventDefault: ModalShell skips an Escape that a
    // nested layer already handled, so only the popover closes.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // Recurring tasks can't be assigned (RPC rejects); don't advertise it.
  if (!a && task.isRecurring && !stageMode) return null

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !isAssignee && people === null) {
      try {
        setPeople(await listAssignablePeople())
      } catch (err) {
        setPeople([])
        toast.error(assignmentErrorMessage(err))
      }
    }
  }
  async function run(action: () => Promise<unknown>, success: string, after?: () => void) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      notifyAssignmentsChanged()
      setOpen(false)
      after?.()
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const label = a
    ? assignmentLabel(t, a)
    : staged
      ? t('建立後指派給 {name}', { name: staged.displayName })
      : t('指派給…')
  // What the header shows: the real assignment, or the staged pick.
  const shown = a ? { name: a.peerName, url: a.peerAvatar } : staged ? { name: staged.displayName, url: staged.avatarUrl } : null

  return (
    <div ref={wrapRef}>
      <button
        type="button"
        data-testid="task-assign-button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        className="relative -my-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {shown ? (
          <span className="relative inline-flex">
            <PersonAvatar name={shown.name} url={shown.url} size={20} />
            {a?.status === 'returned' && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" aria-hidden />
            )}
          </span>
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          data-testid="task-assign-popover"
          className="absolute right-3 top-full z-50 mt-1 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-2 text-sm shadow-lg"
        >
          {shown && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <PersonAvatar name={shown.name} url={shown.url} size={24} />
              <p className="min-w-0 flex-1 truncate font-medium">{label}</p>
              {a && !isAssignee && <AssignmentStatusPill task={task} />}
            </div>
          )}
          {a?.status === 'returned' && !isAssignee && (
            <p className="mx-2 mb-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              {t('對方退回了這個任務：{note}', { note: a.returnNote || '—' })}
            </p>
          )}

          {isAssignee ? (
            <div className="space-y-2 px-2 pb-1 pt-1">
              <p className="text-xs text-muted-foreground">{t('你可以更新完成狀態、實際時間與排程；其他內容由指派人維護。')}</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                rows={2}
                placeholder={t('寫一句退回理由（對方會看到）')}
                aria-label={t('退回理由')}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy || !note.trim()}
                onClick={() => run(() => returnTask(task.id, note.trim()), t('已退回給 {name}', { name: a!.peerName }), onReturned)}
                className="flex min-h-11 w-full items-center justify-center rounded-lg bg-destructive px-3 text-sm text-destructive-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('退回這個任務')}
              </button>
            </div>
          ) : (
            <>
              <p className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">{t('對方可以看到描述與備註')}</p>
              {people === null ? (
                <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div>
              ) : people.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  {t('還沒有可指派的人。先在「設定 → 共享」邀請夥伴，或')}{' '}
                  <Link href="/org" className="text-primary underline">{t('加入組織')}</Link>
                </p>
              ) : (
                <ul role="listbox" aria-label={t('可指派的成員')} className="max-h-56 overflow-y-auto">
                  {people.map((p) => (
                    <li key={`${p.userId}:${p.orgId ?? 'share'}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={(a?.peerId ?? staged?.userId) === p.userId}
                        disabled={busy}
                        onClick={() => {
                          if (onStage) { onStage(p); setOpen(false); return }
                          void run(() => assignTask(task.id, p.userId, p.orgId), t('已指派給 {name}', { name: p.displayName }))
                        }}
                        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-muted/60 disabled:opacity-50"
                      >
                        <PersonAvatar name={p.displayName} url={p.avatarUrl} size={24} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{p.displayName}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {p.source === 'org' ? p.orgName : t('共享行事曆夥伴')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {stageMode && staged && (
                <button
                  type="button"
                  onClick={() => { onStage!(null); setOpen(false) }}
                  className="mt-1 flex min-h-11 w-full items-center justify-center rounded-lg border-t border-border text-sm text-muted-foreground hover:bg-muted/60"
                >
                  {t('不指派')}
                </button>
              )}
              {a && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => unassignTask(task.id), t('已取消指派'))}
                  className="mt-1 flex min-h-11 w-full items-center justify-center rounded-lg border-t border-border text-sm text-muted-foreground hover:bg-muted/60 disabled:opacity-50"
                >
                  {t('取消指派')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
