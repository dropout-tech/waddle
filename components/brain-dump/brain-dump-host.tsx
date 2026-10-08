'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ModalShell } from '@/components/modals/modal-shell'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/lib/i18n/react'
import { resolveGlobalDefaultCategory } from '@/lib/default-category'
import type { BrainDumpDraft } from '@/lib/brain-dump/types'
import type { Task, UserSettings, Workspace } from '@/lib/types'
import { BRAIN_DUMP_OPEN_EVENT } from './brain-dump-events'
import { BrainDumpPanel, type CommitResult } from './brain-dump-panel'
import { BrainDumpToast } from './brain-dump-toast'

interface HostProps {
  workspaces: Workspace[]
  settings: Pick<UserSettings, 'defaultCategoryEnabled'>
  createTask: (task: Task) => Promise<boolean>
}

/**
 * 「丟給企鵝」— mounted once next to MainLayout. Opens on
 * BRAIN_DUMP_OPEN_EVENT (header button / mobile FAB) or the P key
 * (desktop). Phones get a bottom sheet, desktop a centred card.
 * Like meeting-to-tasks: the to-dos land in the 未分類 inbox, unscheduled.
 */
export function BrainDumpHost({ workspaces, settings, createTask }: HostProps) {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  // Kept across close/reopen so an accidental tap outside doesn't lose the list.
  const [text, setText] = useState('')

  const show = useCallback(() => {
    setSession((s) => s + 1)
    setOpen(true)
  }, [])

  useEffect(() => {
    window.addEventListener(BRAIN_DUMP_OPEN_EVENT, show)
    return () => window.removeEventListener(BRAIN_DUMP_OPEN_EVENT, show)
  }, [show])

  // P = 丟給企鵝 (Penguin). Same guards as the D/W/M/T shortcuts in main-layout.
  useEffect(() => {
    if (isMobile) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'p') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      show()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMobile, show])

  const close = useCallback(() => setOpen(false), [])
  const inbox = resolveGlobalDefaultCategory(workspaces, settings.defaultCategoryEnabled)
  const inboxName = inbox?.category.name ?? '未分類'

  const commit = useCallback(async (drafts: BrainDumpDraft[]): Promise<CommitResult> => {
    const target = resolveGlobalDefaultCategory(workspaces, settings.defaultCategoryEnabled)
    if (!target) {
      toast.error(t('找不到可以放任務的分類，先建立一個分類再試試。'))
      return { created: 0, failedIds: drafts.map((d) => d.id) }
    }
    const { workspace, category } = target
    let created = 0
    const failedIds: string[] = []
    // One by one; a refusal or a thrown error (offline, signed out…) only
    // marks that note — the rest still get their turn.
    for (const draft of drafts) {
      const stamp = new Date().toISOString()
      const task: Task = {
        id: crypto.randomUUID(),
        categoryId: category.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceColor: workspace.color,
        categoryName: category.name,
        title: draft.title.trim(),
        taskType: 'one_time',
        urgency: draft.urgency ?? 5,
        ...(draft.minutesGuessed ? {} : { estimatedMinutes: draft.estimatedMinutes }),
        calendarColor: workspace.color,
        isCompleted: false,
        sortOrder: category.tasks.length + created,
        ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
        ...(draft.note ? { notes: draft.note } : {}),
        createdAt: stamp,
        updatedAt: stamp,
      }
      let ok = false
      try {
        ok = await createTask(task)
      } catch (err) {
        console.error('[brain-dump] createTask threw', err)
      }
      if (ok) created++
      else failedIds.push(draft.id)
    }
    // Partial: say what made it now; the panel stays open for the retry.
    if (created && failedIds.length) showToast(created, failedIds.length, category.name)
    return { created, failedIds }
  }, [workspaces, settings.defaultCategoryEnabled, createTask, t])

  const done = useCallback((created: number) => {
    showToast(created, 0, inboxName)
    setText('')
    setOpen(false)
  }, [inboxName])

  const panel = (
    <BrainDumpPanel
      key={session}
      isMobile={isMobile}
      text={text}
      onTextChange={setText}
      onClose={close}
      // The seeded inbox is stored in the signup language; t() shows the
      // English name for the default 未分類 and leaves other names alone.
      inboxName={t(inboxName)}
      onCommit={commit}
      onDone={done}
    />
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="bg-card data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-3xl">
          <DrawerTitle className="sr-only">{t('丟給企鵝')}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('亂丟一段待辦，企鵝用 AI 拆好，放進「未分類」。')}</DrawerDescription>
          {open && panel}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <ModalShell isOpen={open} onClose={close} ariaLabel={t('丟給企鵝')} className="md:max-w-[640px]">
      {panel}
    </ModalShell>
  )
}

/** This feature's own toast (penguin + terracotta) — the global sonner style
 *  is untouched. Lifted above the phone tab bar and floating buttons. */
function showToast(created: number, failed: number, inboxName: string) {
  toast.custom(
    () => <BrainDumpToast created={created} failed={failed} inboxName={inboxName} />,
    {
      duration: 4500,
      style: window.matchMedia('(max-width: 767px)').matches
        ? { marginBottom: 'calc(244px + env(safe-area-inset-bottom))' }
        : undefined,
    },
  )
}
