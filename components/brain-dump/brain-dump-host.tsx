'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ModalShell } from '@/components/modals/modal-shell'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/lib/i18n/react'
import { resolveGlobalDefaultCategory } from '@/lib/default-category'
import type { PlannedItem } from '@/lib/brain-dump/types'
import type { Task, TimeBlock, UserSettings, Workspace } from '@/lib/types'
import { BRAIN_DUMP_OPEN_EVENT, BRAIN_DUMP_SHOW_TODAY_EVENT } from './brain-dump-events'
import { BrainDumpPanel } from './brain-dump-panel'

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

  const commit = useCallback(async (items: PlannedItem[], today: string): Promise<number> => {
    const target = resolveGlobalDefaultCategory(workspaces, settings.defaultCategoryEnabled)
    if (!target) {
      toast.error(t('找不到可以放任務的分類，先建立一個分類再試試。'))
      return 0
    }
    const { workspace, category } = target
    let created = 0
    let firstToday: { id: string; start: string } | null = null
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
      // Refused (offline, plan limit…): createTask already told the user why.
      if (!(await createTask(task))) break
      created++
      if (item.status === 'scheduled' && item.date === today && item.start && (!firstToday || item.start < firstToday.start)) {
        firstToday = { id: task.id, start: item.start }
      }
    }
    if (!created) return 0

    if (created < items.length) toast(t('先放進 {n} 件，其餘的沒放成功。', { n: created }))
    else toast.success(t('企鵝排好了 {n} 件事', { n: created }))
    setText('')
    setOpen(false)

    // Show today on the calendar and bring the first new task into view.
    if (firstToday) {
      const id = firstToday.id
      window.dispatchEvent(new CustomEvent(BRAIN_DUMP_SHOW_TODAY_EVENT))
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-task-block-id="${id}"]`)
        if (!el) return
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
        if (!reduced) {
          el.animate(
            [{ filter: 'brightness(1)' }, { filter: 'brightness(1.12) saturate(1.25)' }, { filter: 'brightness(1)' }],
            { duration: 700, iterations: 2, easing: 'ease-in-out' },
          )
        }
      }, 450)
    }
    return created
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
