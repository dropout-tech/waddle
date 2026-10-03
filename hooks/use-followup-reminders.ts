'use client'

import { useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import type { Workspace } from '@/lib/types'
import { isNative } from '@/lib/platform'
import { syncFollowupReminders } from '@/lib/notifications'
import { listMeetingFollowups } from '@/lib/meeting-followups'

/**
 * Native only: keep the "chase it today" local notifications (one per open meeting
 * follow-up with a due date, 09:00 on the day) in step with reality. Runs on app open
 * and whenever the task tree is refetched/changed (a task completed, deleted or its
 * due date moved), debounced so a burst of edits costs one RPC. Web: does nothing.
 * If the follow-up RPC is not deployed it returns [] and any old reminders are cleared.
 */
export function useFollowupReminders(workspaces: Workspace[]) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  useEffect(() => {
    if (typeof window === 'undefined' || !isNative()) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const items = userId ? await listMeetingFollowups(false) : []
        if (cancelled) return
        await syncFollowupReminders(items)
      })().catch(() => {
        /* reminders are best-effort; the in-app list is the source of truth */
      })
    }, 3000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [userId, workspaces])
}
