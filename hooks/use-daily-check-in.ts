'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toDateString } from '@/lib/calendar-utils'

/** The parent keys this hook's component by account and local calendar date. */
export function useDailyCheckIn(userId: string, date: string) {
  const supabase = useMemo(() => createClient(), [])
  const [checkedIn, setCheckedIn] = useState(false)
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
      const { data, error: readError } = await supabase.from('daily_check_ins')
        .select('check_in_date').eq('user_id', userId).eq('check_in_date', date).maybeSingle()
      if (readError) throw readError
      if (id === request.current) setCheckedIn(Boolean(data))
    } catch {
      if (id === request.current) setError('read')
    } finally {
      if (id === request.current) setIsLoading(false)
    }
  }, [date, supabase, userId])

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
    if (saving.current || isLoading || checkedIn || toDateString(new Date()) !== date) return
    saving.current = true
    setIsSaving(true)
    setError(null)
    const id = ++request.current
    try {
      // The unique account/date key makes retries and simultaneous tabs idempotent.
      const { error: writeError } = await supabase.from('daily_check_ins').upsert(
        { user_id: userId, check_in_date: date },
        { onConflict: 'user_id,check_in_date', ignoreDuplicates: true },
      )
      if (writeError) throw writeError
      if (id === request.current) setCheckedIn(true)
    } catch {
      if (id === request.current) setError('write')
    } finally {
      saving.current = false
      if (id === request.current) setIsSaving(false)
    }
  }

  return { checkedIn, isLoading, isSaving, error, reload, checkIn }
}
