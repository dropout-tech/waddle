'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/react'
import { AssignmentInbox } from '@/components/meetings/assignment-inbox'
import { PersonAvatar, AssignmentStatusPill } from './task-assign-section'
import {
  listAssignments,
  returnTask,
  unassignTask,
  assignmentErrorMessage,
  notifyAssignmentsChanged,
  type AssignmentRecord,
} from '@/lib/assignments'

type Tab = 'mine' | 'sent' | 'meetings'

export function AssignmentsCenter() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('mine')
  const [items, setItems] = useState<AssignmentRecord[] | null>(null)
  const [error, setError] = useState('')
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const rows = await listAssignments()
      if (alive.current) { setItems(rows); setError('') }
    } catch (err) {
      if (alive.current) { setItems([]); setError(assignmentErrorMessage(err)) }
    }
  }, [])

  useEffect(() => {
    alive.current = true
    const q = new URLSearchParams(window.location.search).get('tab')
    if (q === 'sent' || q === 'meetings' || q === 'mine') setTab(q)
    void refresh()
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { alive.current = false; window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const mine = (items ?? []).filter((a) => a.role === 'assignee')
  const sent = (items ?? []).filter((a) => a.role === 'assigner')
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'mine', label: t('指派給我'), count: mine.filter((a) => !a.isCompleted).length },
    { id: 'sent', label: t('我指派的'), count: sent.filter((a) => a.status === 'returned').length },
    { id: 'meetings', label: t('會議提案') },
  ]

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors',
              tab === x.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {x.label}
            {!!x.count && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1 text-[11px] text-primary">{x.count}</span>
            )}
          </button>
        ))}
      </div>
      {error && tab !== 'meetings' && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {tab === 'meetings' ? (
        <AssignmentInbox />
      ) : items === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : tab === 'mine' ? (
        <List empty={t('目前沒有別人指派給你的任務。')}>
          {mine.map((a) => <MineRow key={a.taskId} item={a} onChanged={refresh} />)}
        </List>
      ) : (
        <List empty={t('你還沒有指派任務給別人。打開任何任務，在「指派給」選擇成員即可。')}>
          {sent.map((a) => <SentRow key={a.taskId} item={a} onChanged={refresh} />)}
        </List>
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        {t('想讓團隊彼此指派？')}{' '}
        <Link href="/org" className="text-primary underline">{t('前往組織')}</Link>
      </p>
    </div>
  )
}

function List({ empty, children }: { empty: string; children: React.ReactNode[] }) {
  if (children.length === 0) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return <ul className="space-y-2">{children}</ul>
}

function Meta({ item }: { item: AssignmentRecord }) {
  const { t } = useI18n()
  const parts = [
    item.organizationName,
    item.dueDate && t('期限 {date}', { date: item.dueDate }),
    item.scheduledDate && t('排程 {date}', { date: item.scheduledDate }),
  ].filter(Boolean)
  return parts.length ? <p className="truncate text-xs text-muted-foreground">{parts.join(' · ')}</p> : null
}

function MineRow({ item, onChanged }: { item: AssignmentRecord; onChanged: () => Promise<void> }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [returning, setReturning] = useState(false)
  const [note, setNote] = useState('')

  async function toggle() {
    setBusy(true)
    const next = !item.isCompleted
    const { data, error } = await createClient().from('tasks')
      .update({ is_completed: next, completed_at: next ? new Date().toISOString() : null })
      .eq('id', item.taskId).select('id')
    if (error || !data?.length) toast.error(t('操作失敗，請再試一次'))
    notifyAssignmentsChanged()
    await onChanged()
    setBusy(false)
  }
  async function submitReturn() {
    if (!note.trim()) { toast.error(t('退回時請寫一句理由')); return }
    setBusy(true)
    try {
      await returnTask(item.taskId, note.trim())
      toast.success(t('已退回給 {name}', { name: item.peerName }))
      notifyAssignmentsChanged()
      await onChanged()
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li data-testid="assigned-to-me-item" className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-label={item.isCompleted ? t('標記為未完成') : t('標記為完成')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        >
          <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border-2', item.isCompleted ? 'border-primary bg-primary' : 'border-muted-foreground/40')}>
            {item.isCompleted && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', item.isCompleted && 'text-muted-foreground line-through')}>{item.title}</p>
          <p className="truncate text-xs text-muted-foreground">{t('來自 {name}', { name: item.peerName })}</p>
          <Meta item={item} />
        </div>
        {!returning && (
          <button type="button" disabled={busy} onClick={() => setReturning(true)} className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted">
            {t('退回')}
          </button>
        )}
      </div>
      {returning && (
        <div className="mt-2 space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} rows={2}
            placeholder={t('寫一句退回理由（對方會看到）')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => setReturning(false)} className="min-h-11 flex-1 rounded-lg border border-border text-sm">{t('取消')}</button>
            <button type="button" disabled={busy} onClick={submitReturn} className="min-h-11 flex-1 rounded-lg bg-destructive text-sm text-destructive-foreground">{t('確認退回')}</button>
          </div>
        </div>
      )}
    </li>
  )
}

function SentRow({ item, onChanged }: { item: AssignmentRecord; onChanged: () => Promise<void> }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  async function withdraw() {
    setBusy(true)
    try {
      await unassignTask(item.taskId)
      toast.success(t('已取消指派'))
      notifyAssignmentsChanged()
      await onChanged()
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li data-testid="assigned-by-me-item" className={cn('rounded-xl border bg-card p-3', item.status === 'returned' ? 'border-destructive/40' : 'border-border')}>
      <div className="flex items-center gap-3">
        <PersonAvatar name={item.peerName} url={item.peerAvatar} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <p className="truncate text-xs text-muted-foreground">{t('指派給 {name}', { name: item.peerName })}</p>
          <Meta item={item} />
        </div>
        <AssignmentStatusPill task={{ isCompleted: item.isCompleted, assignment: item }} />
        <button type="button" disabled={busy} onClick={withdraw} className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted">
          {item.status === 'returned' ? t('收回') : t('取消指派')}
        </button>
      </div>
      {item.status === 'returned' && (
        <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('對方退回了這個任務：{note}', { note: item.returnNote || '—' })}
        </p>
      )}
    </li>
  )
}
