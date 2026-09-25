'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { checkInDate, type CheckInStatus } from '@/lib/daily-check-in'

/** The parent keys this hook's component by account and Taipei calendar date. */
export function useDailyCheckIn(date: string) {
  const supabase = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<CheckInStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<'read' | 'write' | null>(null)
  const request = useRef(0)
  const saving = useRef(false)

  const reload = useCallback(async () => {
    if (saving.current) return
    const id = ++request.current
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: readError } = await supabase.rpc('get_daily_check_in_status').single()
      if (readError) throw readError
      if (id === request.current) setStatus(data)
    } catch {
      if (id === request.current) setError('read')
    } finally {
      if (id === request.current) setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    // Initial load and foreground refresh share the same request fencing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
    const refresh = () => { if (document.visibilityState === 'visible') void reload() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      // This is a request counter, not a DOM ref; invalidate every pending response.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      request.current++
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [reload])

  const checkIn = async () => {
    if (saving.current || isLoading || status?.checked_in || checkInDate() !== date) return
    saving.current = true
    setIsSaving(true)
    setError(null)
    const id = ++request.current
    try {
      // Server computes the day and reward, and commits the check-in + ledger together.
      const { data, error: writeError } = await supabase.rpc('claim_daily_check_in').single()
      if (writeError) throw writeError
      if (id === request.current) setStatus(data)
    } catch {
      if (id === request.current) setError('write')
    } finally {
      saving.current = false
      if (id === request.current) setIsSaving(false)
    }
  }

  return { status, checkedIn: status?.checked_in ?? false, isLoading, isSaving, error, reload, checkIn }
}
