'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/auth-provider'
import { dateKey, normalizeLine, type Mood } from '@/lib/life-grid/compute'
import { deleteDailyLine, getDailyLines, saveDailyLine, type DailyLine } from '@/lib/life-grid/data'
import { announceLifeGridSaved } from '@/lib/life-grid/events'

export type LifeGridStatus = 'loading' | 'ready' | 'error'

/**
 * One year of「每日一句」for the signed-in user. Own hook (not part of
 * use-waddle-data) because the life grid is a self-contained surface.
 * Writes are optimistic with rollback, like the rest of the app: the cell
 * lights up immediately and goes back if the save fails.
 */
export function useLifeGrid(year: number) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const supabase = useMemo(() => createClient(), [])
  const [lines, setLines] = useState<Map<string, DailyLine>>(() => new Map())
  const [status, setStatus] = useState<LifeGridStatus>('loading')
  const request = useRef(0)
  const linesRef = useRef(lines)
  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  const reload = useCallback(async () => {
    if (!userId) return
    const id = ++request.current
    setStatus('loading')
    try {
      const rows = await getDailyLines(userId, dateKey(year, 1, 1), dateKey(year, 12, 31), supabase)
      if (id !== request.current) return
      setLines(new Map(rows.map((r) => [r.date, r])))
      setStatus('ready')
    } catch {
      if (id === request.current) setStatus('error')
    }
  }, [userId, year, supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; request fencing guards stale responses
    void reload()
  }, [reload])

  /** Save (or replace) one day. Empty text + no mood clears the day. Resolves false on failure (already rolled back). */
  const save = useCallback(
    async (date: string, content: string, mood: Mood | null): Promise<boolean> => {
      if (!userId) return false
      const text = normalizeLine(content)
      const before = linesRef.current.get(date)
      const clearing = text === '' && mood === null
      const next: DailyLine = { date, content: text, mood }
      setLines((prev) => {
        const m = new Map(prev)
        if (clearing) m.delete(date)
        else m.set(date, next)
        return m
      })
      try {
        if (clearing) await deleteDailyLine(supabase, userId, date)
        else await saveDailyLine(supabase, userId, next)
        announceLifeGridSaved(date)
        return true
      } catch {
        setLines((prev) => {
          const m = new Map(prev)
          if (before) m.set(date, before)
          else m.delete(date)
          return m
        })
        return false
      }
    },
    [userId, supabase],
  )

  return { lines, status, reload, save, userId }
}
