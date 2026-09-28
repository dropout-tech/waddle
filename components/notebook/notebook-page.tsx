'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NotebookWorkspace } from './notebook-workspace'
import { useFocusTimer } from '@/components/timer/focus-timer-provider'
import { focusNoteTitle } from '@/lib/widgets/model'
import { toDateString } from '@/lib/calendar-utils'

/**
 * Full-page /notebook route shell — kept for bookmarks / deep links. The
 * default entry points (calendar header, ⌘K) now open the notebook as a
 * pop-up overlay instead (see notebook-overlay-provider.tsx); this route
 * still works if a user navigates here directly.
 *
 * Home-screen widgets land here with `?note=<id>` / `?note=new` /
 * `?note=focus` (today's 專注記事 note, created on first use).
 */
export function NotebookPage() {
  const router = useRouter()
  const timer = useFocusTimer()
  const [launchNote] = useState(() => {
    if (typeof window === 'undefined') return undefined
    const note = new URLSearchParams(window.location.search).get('note')
    if (!note) return undefined
    if (note === 'new') return { create: true as const }
    if (note === 'focus') return { title: focusNoteTitle(toDateString(new Date()), timer.session?.label) }
    return /^[a-zA-Z0-9-]{1,80}$/.test(note) ? { id: note } : undefined
  })
  // Drop the one-shot query so a reload doesn't create another new note.
  useEffect(() => {
    if (launchNote) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [launchNote])

  return (
    <div className="flex h-[100dvh] flex-col bg-background pt-[env(safe-area-inset-top)]">
      <NotebookWorkspace onExit={() => router.push('/')} exitVariant="back" launchNote={launchNote} />
    </div>
  )
}
