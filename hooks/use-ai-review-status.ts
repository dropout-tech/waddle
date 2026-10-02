'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAiStatus, type AiStatus } from '@/lib/ai-review/api'
import { getOperator, type OperatorInfo } from '@/lib/ai-review/operator'

/**
 * The launch gate for every AI review surface (review page block + settings).
 *
 * `status` is non-null only when ALL of these hold:
 *   1. operator name and contact Email are both filled in (lib/ai-review/operator.ts)
 *   2. the `status` call succeeded with a well-formed body
 *   3. the server says `enabled === true`
 * Anything else (no operator info, failure, 404, 503, timeout, bad body) leaves
 * `status` null and callers render nothing at all — no error, no console output.
 * The request is not even sent while the operator info is missing.
 */
export function useAiReviewStatus(): {
  status: AiStatus | null
  operator: OperatorInfo | null
  refresh: () => Promise<AiStatus | null>
} {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [operator, setOperator] = useState<OperatorInfo | null>(null)
  const seq = useRef(0)
  const alive = useRef(true)

  const refresh = useCallback(async (): Promise<AiStatus | null> => {
    const op = getOperator()
    if (!alive.current) return null
    setOperator(op)
    const mine = ++seq.current
    if (!op) {
      setStatus(null)
      return null
    }
    const next = await fetchAiStatus('ai_review')
    // A newer refresh (or unmount) supersedes this answer.
    if (!alive.current || mine !== seq.current) return next && next.enabled ? next : null
    const open = next && next.enabled === true ? next : null
    setStatus(open)
    return open
  }, [])

  useEffect(() => {
    alive.current = true
    // Initial load; setState happens after the awaited network call.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount
    void refresh()
    return () => {
      alive.current = false
    }
  }, [refresh])

  return { status, operator, refresh }
}
