'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { PENDING_SHARE_INVITE_KEY } from '@/hooks/use-calendar-sharing'

/**
 * Rendered inside the (auth) layout. Sends already-logged-in users away from
 * /login and /signup back to the app — replicates the old middleware rule
 * "if (user && pathname === '/login') redirect('/')" on the client.
 *
 * This effect races the login form's own post-submit navigation (both fire
 * on the same session change), so it must honor a stashed share invite too —
 * otherwise it wins the race and strands the user on "/" with the invite
 * still pending in sessionStorage.
 */
export function RedirectIfAuthed() {
  const { session, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && session) {
      const pendingInvite =
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem(PENDING_SHARE_INVITE_KEY)
      router.replace(pendingInvite ? '/share/invite' : '/')
    }
  }, [loading, session, router])

  return null
}
