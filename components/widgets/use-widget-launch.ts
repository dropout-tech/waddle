'use client'
import { useEffect, useRef } from 'react'
import { useFocusTimer } from '@/components/timer/focus-timer-provider'
import { takeWidgetLaunch, WIDGET_LAUNCH_EVENT, STICKY_OPEN_EVENT } from '@/lib/widgets/launch'
import { toDateString } from '@/lib/calendar-utils'
import type { Task, Workspace } from '@/lib/types'

interface WidgetLaunchTargets {
  workspaces: Workspace[]
  setSelectedDate: (d: Date) => void
  setMobileTab: (tab: 'tasks' | 'calendar') => void
  setViewMode: (mode: 'day' | 'week' | 'month') => void
  openWhiteboard: () => void
  selectTask: (task: Task) => void
  createTask?: (date: string) => void
}

function findTask(workspaces: Workspace[], id: string) {
  return workspaces.flatMap(w => w.categories.flatMap(c => c.tasks)).find(t => t.id === id)
}

/**
 * Consumes `/?widget=<kind>&date=&task=` (see widgetPath in lib/widgets/model.ts)
 * and lands on the real screen: calendar kinds → 日曆 tab (week view, or month
 * for the plain 小月曆 tap), tasks → 任務 tab, whiteboard → 白板 overlay,
 * focus → expanded timer, sticky → the 便條紙
 * overlay (StickyNotesProvider), month → month view. A task id is held
 * until the board has loaded and the task exists.
 */
export function useWidgetLaunch(targets: WidgetLaunchTargets) {
  const timer = useFocusTimer()
  const latest = useRef({ targets, timer })
  const pendingTask = useRef<string | null>(null)
  useEffect(() => { latest.current = { targets, timer } })

  useEffect(() => {
    const resolveTask = () => {
      const id = pendingTask.current; if (!id) return
      const task = findTask(latest.current.targets.workspaces, id)
      if (task) { pendingTask.current = null; latest.current.targets.selectTask(task) }
    }
    const run = () => {
      const q = takeWidgetLaunch(); if (!q) return
      const { targets: t, timer: ft } = latest.current
      const kind = q.get('widget'), date = q.get('date'), id = q.get('task')
      const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
      if (day) t.setSelectedDate(new Date(`${day}T12:00:00`))
      // Widgets only exist on the phone, where the calendar defaults to 週 — a
      // widget tap must not force 日 (owner, 2026-09-28).
      if (kind === 'calendar' || kind === 'month' || kind === 'overview' || kind === 'agenda' || kind === 'week') {
        t.setMobileTab('calendar'); t.setViewMode((kind === 'calendar' || kind === 'month') && !day ? 'month' : 'week')
      } else if (kind === 'tasks' || kind === 'top-three') t.setMobileTab('tasks')
      else if (kind === 'whiteboard') t.openWhiteboard()
      else if (kind === 'focus') ft.setIsExpanded(true)
      else if (kind === 'new-task') t.createTask?.(toDateString(new Date()))
      else if (kind === 'sticky') {
        const note = q.get('note')
        window.dispatchEvent(new CustomEvent(STICKY_OPEN_EVENT, { detail: note && /^[a-zA-Z0-9-]{1,80}$/.test(note) ? note : null }))
      }
      pendingTask.current = id && /^[a-zA-Z0-9-]{1,80}$/.test(id) ? id : null
      resolveTask()
    }
    run()
    window.addEventListener(WIDGET_LAUNCH_EVENT, run)
    return () => window.removeEventListener(WIDGET_LAUNCH_EVENT, run)
  }, [])

  // The board may still be loading when the tap arrives; open the task once it shows up.
  useEffect(() => {
    const id = pendingTask.current; if (!id) return
    const task = findTask(targets.workspaces, id)
    if (task) { pendingTask.current = null; targets.selectTask(task) }
  }, [targets.workspaces]) // eslint-disable-line react-hooks/exhaustive-deps
}
