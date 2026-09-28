'use client'
import { useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { runImageCleanupOnLaunch } from '@/lib/image-cleanup'

// Wait until the launch data loads have settled before the background call.
const LAUNCH_DELAY_MS = 20_000

/** Renders nothing. Once per launch (and ≤ once per 24h per account) asks the
 *  server to delete this user's orphaned uploaded images — see lib/image-cleanup.ts. */
export function ImageCleanupBridge() {
  const { user } = useAuth()
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    const timer = setTimeout(() => runImageCleanupOnLaunch(userId), LAUNCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [userId])
  return null
}
