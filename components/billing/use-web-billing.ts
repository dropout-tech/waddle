'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWebBilling, toWebBillingError, type WebBillingError, type WebBillingSnapshot } from '@/lib/billing/web-billing-client'

/** Loads my_web_billing() once, and again on reload() or when `set` pushes a fresher snapshot. */
export function useWebBilling() {
  const [snapshot, setSnapshot] = useState<WebBillingSnapshot | null>(null)
  const [error, setError] = useState<WebBillingError | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)

  const reload = useCallback(async () => {
    try {
      const next = await fetchWebBilling()
      if (!alive.current) return
      setSnapshot(next)
      setError(null)
    } catch (e) {
      if (alive.current) setError(toWebBillingError(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void reload()
    return () => {
      alive.current = false
    }
  }, [reload])

  return { snapshot, error, loading, reload, set: setSnapshot }
}
