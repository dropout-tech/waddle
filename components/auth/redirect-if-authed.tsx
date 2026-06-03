'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'

/**
 * Rendered inside the (auth) layout. Sends already-logged-in users away from
 * /login and /signup back to the app — replicates the old middleware rule
 * "if (user && pathname === '/login') redirect('/')" on the client.
 */
export function RedirectIfAuthed() {
  const { session, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && session) {
      router.replace('/')
    }
  }, [loading, session, router])

  return null
}
