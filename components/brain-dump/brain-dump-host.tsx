'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ModalShell } from '@/components/modals/modal-shell'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/lib/i18n/react'
import { resolveGlobalDefaultCategory } from '@/lib/default-category'
import type { PlannedItem } from '@/lib/brain-dump/types'
import type { Task, TimeBlock, UserSettings, Workspace } from '@/lib/types'
import { BRAIN_DUMP_OPEN_EVENT, BRAIN_DUMP_SHOW_TODAY_EVENT } from './brain-dump-events'
import { BrainDumpPanel, type CommitResult } from './brain-dump-panel'
import { BrainDumpToast } from './brain-dump-toast'
import { busiestRecentCategory } from './brain-dump-utils'

interface HostProps {
  workspaces: Workspace[]
  assignedTasks: Task[]
  timeBlocks: TimeBlock[]
  settings: Pick<UserSettings, 'defaultCategoryEnabled'>
  createTask: (task: Task) => Promise<boolean>
}

/**
 * 「丟給企鵝」— mounted once next to MainLayout. Opens on
 * BRAIN_DUMP_OPEN_EVENT (header button / mobile FAB) or the P key
 * (desktop). Phones get a bottom sheet, desktop a centred card.
 */
export function BrainDumpHost({ workspaces, assignedTasks, timeBlocks, settings, createTask }: HostProps) {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  // Kept across close/reopen so an accidental tap outside doesn't lose the list.
  const [text, setText] = useState('')

  // Default category for this feature, picked at open time: the one the
  // user filled most in the last 7 days, else the global 未分類 default.
  const [fallback, setFallback] = useState<string | undefined>()
  const show = useCallback(() => {
    setFallback(
      busiestRecentCategory(workspaces, Date.now())
        ?? resolveGlobalDefaultCategory(workspaces, settings.defaultCategoryEnabled)?.category.id,
    )
    writtenRef.current.splice(0)
    setSession((s) => s + 1)
    setOpen(true)
  }, [workspaces, settings.defaultCategoryEnabled])

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


  // Today-scheduled tasks written in this panel session (across retries),
  // so the calendar can show and glow all of them once everything is in.
  const writtenRef = useRef<{ id: string; start: string }[]>([])

  const commit = useCallback(async (items: PlannedItem[], today: string, categoryId: string): Promise<CommitResult> => {
    let target = resolveGlobalDefaultCategory(workspaces, settings.defaultCategoryEnabled)
    for (const w of workspaces) {
      const c = w.categories.find((x) => x.id === categoryId && !x.isArchived)
      if (c && !w.isArchived) target = { workspace: w, category: c }
    }
    if (!target) {
      toast.error(t('找不到可以放任務的分類，先建立一個分類再試試。'))
      return { created: 0, failedIds: items.map((x) => x.draft.id) }
    }
    const { workspace, category } = target
    let created = 0
    let scheduled = 0
    const failedIds: string[] = []
    // One by one; a refusal or a thrown error (offline, signed out…) only
    // marks that note — the rest still get their turn.
    for (const item of items) {
      const stamp = new Date().toISOString()
      const task: Task = {
        id: crypto.randomUUID(),
        categoryId: category.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceColor: workspace.color,
        categoryName: category.name,
        title: item.draft.title.trim(),
        taskType: 'one_time',
        urgency: item.draft.urgency ?? 5,
        estimatedMinutes: item.draft.estimatedMinutes,
        calendarColor: workspace.color,
        isCompleted: false,
        sortOrder: category.tasks.length + created,
        scheduledDate: item.date,
        ...(item.status === 'scheduled' && item.start && item.end
          ? { scheduledStartTime: item.start, scheduledEndTime: item.end }
          : {}),
        ...(item.draft.dueDate ? { dueDate: item.draft.dueDate } : {}),
        createdAt: stamp,
        updatedAt: stamp,
      }
      let ok = false
      try {
        ok = await createTask(task)
      } catch (err) {
        console.error('[brain-dump] createTask threw', err)
      }
      if (!ok) {
        failedIds.push(item.draft.id)
        continue
      }
      created++
      if (item.status === 'scheduled') scheduled++
      if (item.status === 'scheduled' && item.date === today && item.start) writtenRef.current.push({ id: task.id, start: item.start })
    }

    if (created) {
      // This feature's own toast (penguin + terracotta) — the global sonner
      // style is untouched. Lifted above the phone tab bar and FABs.
      toast.custom(
        () => <BrainDumpToast scheduled={scheduled} pending={created - scheduled} failed={failedIds.length} />,
        {
          duration: 4500,
          style: window.matchMedia('(max-width: 767px)').matches
            // Clear the tab bar and the stacked 丟給企鵝 / ＋ buttons (top at 252px).
            ? { marginBottom: 'calc(244px + env(safe-area-inset-bottom))' }
            : undefined,
        },
      )
    }
    // Anything failed → keep the panel and the text; the panel offers a retry.
    if (failedIds.length) return { created, failedIds }

    setText('')
    setOpen(false)

    // Show today on the calendar, bring the first new task into view, and
    // let every new block glow softly once (~600ms) so the eye finds them.
    const written = writtenRef.current.splice(0)
    if (written.length) {
      const first = written.reduce((a, b) => (b.start < a.start ? b : a))
      window.dispatchEvent(new CustomEvent(BRAIN_DUMP_SHOW_TODAY_EVENT))
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-task-block-id="${first.id}"]`)
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
        if (reduced) return
        window.setTimeout(() => {
          for (const { id } of written) {
            document.querySelectorAll<HTMLElement>(`[data-task-block-id="${id}"]`).forEach((block) => {
              block.setAttribute('data-bd-glow', '')
              block.animate(
                [
                  { filter: 'brightness(1) drop-shadow(0 0 0 rgba(207, 87, 49, 0))' },
                  { filter: 'brightness(1.18) drop-shadow(0 0 7px rgba(207, 87, 49, 0.75))', offset: 0.35 },
                  { filter: 'brightness(1) drop-shadow(0 0 0 rgba(207, 87, 49, 0))' },
                ],
                { duration: 600, easing: 'ease-out' },
              ).finished.then(() => block.removeAttribute('data-bd-glow'), () => {})
            })
          }
        }, 350)
      }, 450)
    }
    return { created, failedIds }
  }, [workspaces, settings.defaultCategoryEnabled, createTask, t])

  const panel = (
    <BrainDumpPanel
      key={session}
      workspaces={workspaces}
      assignedTasks={assignedTasks}
      timeBlocks={timeBlocks}
      isMobile={isMobile}
      text={text}
      onTextChange={setText}
      onClose={close}
      defaultCategoryId={fallback}
      onCommit={commit}
    />
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          className="bg-card data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-3xl"
        >
          <DrawerTitle className="sr-only">{t('丟給企鵝')}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('亂丟一串待辦，企鵝幫你排進今天的空檔。')}</DrawerDescription>
          {open && panel}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <ModalShell isOpen={open} onClose={close} ariaLabel={t('丟給企鵝')} className="md:max-w-[760px]">
      {panel}
    </ModalShell>
  )
}
