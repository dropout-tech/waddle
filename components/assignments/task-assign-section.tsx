'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, UserPlus, Undo2, X } from 'lucide-react'
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
  const style = { width: size, height: size }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />
  }
  return (
    <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  )
}

/** Status pill shared by the modal, the task row and the /assignments page. */
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

/** Owner side: pick / change / withdraw the assignee. */
export function TaskAssignSection({ task }: { task: Task }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState<AssignablePerson[] | null>(null)
  const [busy, setBusy] = useState(false)
  const assignment = task.assignment

  async function openPicker() {
    setOpen(true)
    if (people) return
    try {
      setPeople(await listAssignablePeople())
    } catch (err) {
      setPeople([])
      toast.error(assignmentErrorMessage(err))
    }
  }

  async function pick(person: AssignablePerson) {
    setBusy(true)
    try {
      await assignTask(task.id, person.userId, person.orgId)
      toast.success(t('已指派給 {name}', { name: person.displayName }))
      setOpen(false)
      notifyAssignmentsChanged()
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function withdraw() {
    setBusy(true)
    try {
      await unassignTask(task.id)
      toast.success(t('已取消指派'))
      notifyAssignmentsChanged()
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (task.isRecurring) {
    return <p className="text-xs text-muted-foreground">{t('重複任務暫不支援指派')}</p>
  }

  return (
    <div data-testid="task-assign-section" className="rounded-xl border border-border bg-secondary/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('指派給')}</span>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {assignment ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <PersonAvatar name={assignment.peerName} url={assignment.peerAvatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{assignment.peerName}</p>
              {assignment.organizationName && (
                <p className="truncate text-xs text-muted-foreground">{assignment.organizationName}</p>
              )}
            </div>
            <AssignmentStatusPill task={task} />
          </div>
          {assignment.status === 'returned' && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t('對方退回了這個任務：{note}', { note: assignment.returnNote || '—' })}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={openPicker} className="min-h-11 flex-1 rounded-lg border border-border px-3 text-sm hover:bg-muted/60 disabled:opacity-50">
              {t('改派')}
            </button>
            <button type="button" disabled={busy} onClick={withdraw} className="min-h-11 flex-1 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted/60 disabled:opacity-50">
              {t('取消指派')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={openPicker} className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground hover:bg-muted/60 disabled:opacity-50">
          <UserPlus className="h-4 w-4" />
          {t('選擇成員…')}
        </button>
      )}
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-card" role="listbox" aria-label={t('可指派的成員')}>
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span className="text-xs text-muted-foreground">{t('可指派的成員')}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('關閉')} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted/60">
              <X className="h-4 w-4" />
            </button>
          </div>
          {people === null ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : people.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {t('還沒有可指派的人。先在「設定 → 共享」邀請夥伴，或')}{' '}
              <Link href="/org" className="text-primary underline">{t('加入組織')}</Link>
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {people.map((p) => (
                <li key={`${p.userId}:${p.orgId ?? 'share'}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={assignment?.peerId === p.userId}
                    disabled={busy}
                    onClick={() => pick(p)}
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/60 disabled:opacity-50"
                  >
                    <PersonAvatar name={p.displayName} url={p.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.source === 'org' ? p.orgName : t('共享行事曆夥伴')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Tiny chip for task rows: "指派給 Y" / "Y 已退回" (owner) or "來自 X" (assignee). */
export function TaskAssignmentChip({ task }: { task: Task }) {
  const { t } = useI18n()
  const a = task.assignment
  if (!a) return null
  const returned = a.status === 'returned'
  const label = a.role === 'assignee'
    ? t('來自 {name}', { name: a.peerName })
    : returned
      ? t('{name} 已退回', { name: a.peerName })
      : t('指派給 {name}', { name: a.peerName })
  return (
    <span
      data-testid="assignment-chip"
      title={returned && a.returnNote ? `${label}：${a.returnNote}` : label}
      className={cn(
        'max-w-[8rem] flex-shrink-0 truncate rounded px-1.5 py-0.5 text-[10px] font-medium',
        returned ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

/** Assignee side: who it's from + return with a reason. */
export function AssigneeBanner({ task, onReturned }: { task: Task; onReturned?: () => void }) {
  const { t } = useI18n()
  const [returning, setReturning] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const a = task.assignment
  if (!a) return null

  async function submit() {
    if (!note.trim()) {
      toast.error(t('退回時請寫一句理由'))
      return
    }
    setBusy(true)
    try {
      await returnTask(task.id, note.trim())
      toast.success(t('已退回給 {name}', { name: a!.peerName }))
      notifyAssignmentsChanged()
      onReturned?.()
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="assignee-banner" className="rounded-xl border border-border bg-secondary/20 p-3">
      <div className="flex items-center gap-2">
        <PersonAvatar name={a.peerName} url={a.peerAvatar} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{t('來自 {name}', { name: a.peerName })}</p>
          <p className="text-xs text-muted-foreground">{t('你可以更新完成狀態、實際時間與排程；其他內容由指派人維護。')}</p>
        </div>
      </div>
      {returning ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            rows={2}
            placeholder={t('寫一句退回理由（對方會看到）')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => setReturning(false)} className="min-h-11 flex-1 rounded-lg border border-border px-3 text-sm">
              {t('取消')}
            </button>
            <button type="button" disabled={busy} onClick={submit} className="min-h-11 flex-1 rounded-lg bg-destructive px-3 text-sm text-destructive-foreground disabled:opacity-50">
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t('確認退回')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setReturning(true)} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted/60">
          <Undo2 className="h-4 w-4" />
          {t('退回這個任務')}
        </button>
      )}
    </div>
  )
}
