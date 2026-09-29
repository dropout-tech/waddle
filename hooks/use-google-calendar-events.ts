'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PeerEvent } from '@/hooks/use-calendar-sharing'
import {
  fetchGoogleCalendarStatus,
  invokeGoogleCalendar,
  mapGoogleEvents,
  type GoogleCalendarApiEvent,
  type GoogleCalendarStatus,
} from '@/lib/google-calendar'

const EMPTY: PeerEvent[] = []

type EventsReply = { status?: string; events?: GoogleCalendarApiEvent[] }

/**
 * The viewer's own Google Calendar (primary) as read-only overlay events —
 * modelled on usePeerCalendarEvents. Window = [selectedMonth - 1,
 * selectedMonth + 2] like the peer feed; the Edge Function caps one request
 * at 120 days, so the 4-month window is fetched as two ≤ 62-day halves and
 * merged by event id. Status is checked on mount and whenever the page becomes
 * visible again (that also drops the cache and refetches). Without a
 * configured + connected integration no `events` request is ever made.
 */
export function useGoogleCalendarEvents(opts: { selectedDate: Date }): PeerEvent[] {
  const { selectedDate } = opts
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null)
  const [events, setEvents] = useState<PeerEvent[]>(EMPTY)
  const [refreshTick, setRefreshTick] = useState(0)
  // Shared across effect re-runs (StrictMode double-mount): same idea as the peer hook.
  const cache = useRef<Map<string, Promise<EventsReply | null>>>(new Map())

  useEffect(() => {
    let cancelled = false
    const load = () => fetchGoogleCalendarStatus().then((s) => { if (!cancelled) setStatus(s) })
    void load()
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      cache.current.clear()
      void load()
      setRefreshTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const active = !!status?.configured && status.connected && status.status === 'connected'
  const y = selectedDate.getFullYear()
  const m = selectedDate.getMonth()
  const from = new Date(y, m - 1, 1).toISOString()
  const mid = new Date(y, m + 1, 1).toISOString()
  const to = new Date(y, m + 3, 1).toISOString()

  useEffect(() => {
    if (!active) return // the returned list is gated on `active` below
    let cancelled = false
    const halves: [string, string][] = [[from, mid], [mid, to]]
    void Promise.all(
      halves.map(([a, b]) => {
        const key = `${a}|${b}`
        let promise = cache.current.get(key)
        if (!promise) {
          promise = invokeGoogleCalendar<EventsReply>({ action: 'events', time_min: a, time_max: b }).catch((error) => {
            console.error('[google-calendar] events fetch failed', error)
            cache.current.delete(key) // allow retry on the next trigger
            return null
          })
          cache.current.set(key, promise)
        }
        return promise
      }),
    ).then((replies) => {
      if (cancelled) return
      if (replies.some((r) => r?.status === 'reauth_required')) {
        setStatus((s) => (s ? { ...s, status: 'reauth_required' } : s))
        return
      }
      if (replies.every((r) => !r)) return // keep what is on screen on a transient failure
      const byId = new Map<string, GoogleCalendarApiEvent>()
      for (const r of replies) for (const ev of r?.events ?? []) byId.set(ev.id, ev)
      setEvents(mapGoogleEvents([...byId.values()]))
    })
    return () => { cancelled = true }
  }, [active, from, mid, to, refreshTick])

  return useMemo(() => (active ? events : EMPTY), [active, events])
}
