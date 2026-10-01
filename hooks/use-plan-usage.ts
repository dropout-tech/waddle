'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { fetchPlanUsage, type PlanUsage } from '@/lib/billing/plan-usage'

/**
 * Shared read of the user's plan usage. `usage` is null while loading AND
 * whenever limits are unavailable / off-by-failure — callers treat null as
 * "not enforced" (fail open; the database still enforces the real limits).
 */
export function usePlanUsage() {
  const { user } = useAuth()
  const uid = user?.id
  const [usage, setUsage] = useState<PlanUsage | null>(null)
  const [loading, setLoading] = useState(!!uid)

  const refresh = useCallback(async () => {
    const next = await fetchPlanUsage({ force: true })
    setUsage(next)
  }, [])

  useEffect(() => {
    let alive = true
    setUsage(null)
    if (!uid) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchPlanUsage().then((next) => {
      if (!alive) return
      setUsage(next)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [uid])

  return { usage, loading, refresh }
}
