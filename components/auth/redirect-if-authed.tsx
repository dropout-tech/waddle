'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { pendingMeetingPath } from '@/lib/auth/meeting-return'
import { PENDING_SHARE_INVITE_KEY } from '@/hooks/use-calendar-sharing'

/**
 * Rendered inside the (auth) layout. Sends already-logged-in users away from
 * /login and /signup back to the app — replicates the old middleware rule
 * "if (user && pathname === '/login') redirect('/')" on the client.
 *
 * This effect races the login form's own post-submit navigation (both fire
 * on the same session change), so it must honor stashed meeting and share invites —
 * otherwise it wins the race and strands the user on "/" with the invite
 * still pending in sessionStorage.
 */
export function RedirectIfAuthed() {
  const { session, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && session) {
      let pendingInvite: string | null = null
      try { pendingInvite = window.sessionStorage.getItem(PENDING_SHARE_INVITE_KEY) } catch { /* Storage can be unavailable in private browsers. */ }
      router.replace(pendingMeetingPath() || (pendingInvite ? '/share/invite' : '/'))
    }
  }, [loading, session, router])

  return null
}
