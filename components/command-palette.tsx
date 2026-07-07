'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarClock,
  Calendar as CalendarIcon,
  CalendarRange,
  CalendarDays,
  NotebookPen,
  LayoutGrid,
  Settings,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import { ModalShell } from '@/components/modals/modal-shell'
import { useDisplayColor } from '@/hooks/use-display-color'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'

interface CommandPaletteProps {
  tasks: Task[]
  onSelectTask: (task: Task) => void
  onOpenSettings?: () => void
  onCreateTask: () => void
  onJumpToday: () => void
  onSetViewMode: (mode: 'day' | 'week' | 'month') => void
  onReturnToCalendar: () => void
}

/**
 * Desktop-only ⌘K / Ctrl+K command palette (W2.3, first version).
 *
 * Self-manages its own open state and global keyboard listener, mirroring
 * the pattern already used by KeyboardShortcutsHint / FocusScratchpad —
 * mount it once and it wires itself up.
 *
 * Built on ModalShell (not the generic shadcn CommandDialog) specifically
 * because ModalShell already renders the DESIGN.md-correct backdrop
 * (bg-black/25 + blur, not a heavy bg-black/50 wash), the correct
 * 200ms ease-quart motion, and role="dialog" — which is also what the
 * global D/W/M/T shortcut in MainLayout checks for to know an overlay is
 * open and stay quiet.
 */
export function CommandPalette({
  tasks,
  onSelectTask,
  onOpenSettings,
  onCreateTask,
  onJumpToday,
  onSetViewMode,
  onReturnToCalendar,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const displayColor = useDisplayColor()

  // ⌘K / Ctrl+K toggles the palette. Deliberately NOT gated on input focus —
  // unlike single-letter shortcuts, this chord isn't something people type by
  // accident, and every reference command palette (Linear, Notion, Slack...)
  // keeps it live even while a text field has focus. It IS gated on another
  // modal already being open, so it doesn't stack on top of e.g. the task
  // detail editor — `data-command-palette` marks our own instance so that
  // check doesn't block re-toggling itself.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k') return
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
      const anotherModalOpen = dialogs.some((d) => !d.querySelector('[data-command-palette]'))
      if (anotherModalOpen) return
      setOpen((v) => {
        const next = !v
        if (!next) setSearch('')
        return next
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const matchingTasks = useMemo(() => {
    if (!search.trim()) return []
    return tasks
  }, [tasks, search])

  const close = () => {
    setOpen(false)
    setSearch('')
  }

  const runAction = (fn: () => void) => {
    fn()
    close()
  }

  return (
    <ModalShell
      isOpen={open}
      onClose={close}
      size="xl"
      ariaLabel="指令面板"
    >
      <div data-command-palette className="contents">
        <Command className="rounded-2xl">
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="搜尋任務、或輸入指令…"
            autoFocus
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>沒有符合的結果</CommandEmpty>

            <CommandGroup heading="動作">
              <CommandItem value="跳到今天" onSelect={() => runAction(onJumpToday)}>
                <CalendarClock />
                <span>跳到今天</span>
              </CommandItem>
              <CommandItem value="切換為日檢視" onSelect={() => runAction(() => onSetViewMode('day'))}>
                <CalendarIcon />
                <span>切換為日檢視</span>
              </CommandItem>
              <CommandItem value="切換為週檢視" onSelect={() => runAction(() => onSetViewMode('week'))}>
                <CalendarRange />
                <span>切換為週檢視</span>
              </CommandItem>
              <CommandItem value="切換為月檢視" onSelect={() => runAction(() => onSetViewMode('month'))}>
                <CalendarDays />
                <span>切換為月檢視</span>
              </CommandItem>
              <CommandItem value="開記事本" onSelect={() => runAction(() => router.push('/notebook'))}>
                <NotebookPen />
                <span>開記事本</span>
              </CommandItem>
              <CommandItem value="返回日曆" onSelect={() => runAction(onReturnToCalendar)}>
                <LayoutGrid />
                <span>返回日曆</span>
              </CommandItem>
              {onOpenSettings && (
                <CommandItem value="開設定" onSelect={() => runAction(onOpenSettings)}>
                  <Settings />
                  <span>開設定</span>
                </CommandItem>
              )}
              <CommandItem value="新增任務" onSelect={() => runAction(onCreateTask)}>
                <Plus />
                <span>新增任務</span>
              </CommandItem>
            </CommandGroup>

            {search.trim() && matchingTasks.length > 0 && (
              <CommandGroup heading="任務">
                {matchingTasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={`task-${task.id}`}
                    keywords={[task.title]}
                    onSelect={() => runAction(() => onSelectTask(task))}
                  >
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: displayColor(task.workspaceColor) }}
                    />
                    <span className={cn('flex-1 truncate', task.isCompleted && 'line-through text-muted-foreground')}>
                      {task.title}
                    </span>
                    {task.isCompleted && <CheckCircle2 className="text-muted-foreground" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </div>
    </ModalShell>
  )
}
