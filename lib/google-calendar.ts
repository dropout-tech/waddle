import { createClient } from '@/lib/supabase/client'
import { parseDateString, toDateString } from '@/lib/calendar-utils'
import type { PeerEvent } from '@/hooks/use-calendar-sharing'

// Read-only Google Calendar integration — browser side.
// The Edge Function `google-calendar` owns OAuth + the Google API; the browser
// only asks it for status / an event window. Google events are never written
// to Supabase and never enter a sharing / export / free-slot path: they only
// join the calendar views' read-only overlay (main-layout → peerEvents prop).

export type GoogleResponseStatus = 'accepted' | 'tentative' | 'needsAction' | null

/** One event as returned by the `events` action (minimal projection). */
export interface GoogleCalendarApiEvent {
  id: string
  title: string
  /** ISO dateTime with offset, or YYYY-MM-DD when all_day. */
  start: string
  /** Exclusive end — ISO dateTime, or YYYY-MM-DD (day after the last day) when all_day. */
  end: string
  all_day: boolean
  location: string | null
  response_status: GoogleResponseStatus
  html_link: string | null
}

export interface GoogleCalendarStatus {
  configured: boolean
  connected: boolean
  status: 'connected' | 'reauth_required' | 'disconnected'
  /** Partners' 約交集 searches treat my Google meetings as busy (null when not connected). */
  shareBusy?: boolean | null
}

/** Presentation-only details carried on a Google overlay event. */
export interface GoogleEventInfo {
  eventId: string
  allDay: boolean
  responseStatus: GoogleResponseStatus
  htmlLink: string | null
  location: string | null
  /** Full event span in the viewer's local time, for the details popover. */
  startAt: string
  endAt: string
}

export const GOOGLE_EVENT_COLOR = '#1A73E8'
export const GOOGLE_ID_PREFIX = 'gcal:'
/** Longest span expanded into per-day pieces (keeps a bad event from flooding the view). */
const MAX_DAYS_PER_EVENT = 62

export async function invokeGoogleCalendar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().functions.invoke('google-calendar', { body })
  if (error) throw error
  return data as T
}

/** The function answers any failure (not deployed, 503 not_configured…) as "not configured". */
export async function fetchGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  try {
    const data = await invokeGoogleCalendar<{ configured?: boolean; connected?: boolean; status?: string; share_busy?: boolean | null }>({ action: 'status' })
    return {
      configured: data?.configured === true,
      connected: data?.connected === true,
      status: data?.status === 'connected' || data?.status === 'reauth_required' ? data.status : 'disconnected',
      shareBusy: typeof data?.share_busy === 'boolean' ? data.share_busy : null,
    }
  } catch {
    return { configured: false, connected: false, status: 'disconnected' }
  }
}

export async function setGoogleShareBusy(value: boolean): Promise<boolean> {
  const data = await invokeGoogleCalendar<{ share_busy?: boolean }>({ action: 'set_share_busy', value })
  return data?.share_busy === value
}

/**
 * Google busy intervals for the 約交集 free-slot search (action `busy`): the
 * caller's own meetings plus those of authorised share partners who left
 * share_busy on — start/end only. `incomplete` = some Google calendar could
 * not be read (call failed, or a partner's access expired): the caller must
 * tell the user instead of silently treating unknown time as free.
 * Integration off / not deployed → no Google in play, not incomplete.
 */
export async function fetchGoogleBusy(peerIds: string[], timeMin: string, timeMax: string): Promise<{ busy: { starts_at: string; ends_at: string }[]; incomplete: boolean }> {
  const { data, error } = await createClient().functions.invoke('google-calendar', {
    body: { action: 'busy', peer_ids: peerIds, time_min: timeMin, time_max: timeMax },
  })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response?.status === 404) return { busy: [], incomplete: false }
    if (response?.status === 503) {
      const code = await response.clone().json().then((b: { error?: string }) => b?.error).catch(() => null)
      if (code === 'not_configured') return { busy: [], incomplete: false }
    }
    return { busy: [], incomplete: true }
  }
  const reply = (data ?? {}) as { busy?: { start?: string; end?: string }[]; unavailable?: unknown[] }
  const busy: { starts_at: string; ends_at: string }[] = []
  let incomplete = Array.isArray(reply.unavailable) && reply.unavailable.length > 0
  for (const b of reply.busy ?? []) {
    const allDay = typeof b.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.start)
    // All-day busy days are local wall-clock days, like the calendar.
    const a = allDay ? parseDateString(b.start!) : new Date(b.start ?? '')
    const z = allDay && typeof b.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.end) ? parseDateString(b.end) : new Date(b.end ?? '')
    if (!Number.isFinite(+a) || !Number.isFinite(+z) || +z <= +a) { incomplete = true; continue }
    busy.push({ starts_at: a.toISOString(), ends_at: z.toISOString() })
  }
  return { busy, incomplete }
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const nextLocalMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)

function shell(ev: GoogleCalendarApiEvent, key: string, date: string, info: GoogleEventInfo, times?: { start: string; end: string }): PeerEvent {
  return {
    id: `${GOOGLE_ID_PREFIX}${ev.id}:${key}`,
    categoryId: '',
    workspaceId: '',
    workspaceName: 'Google',
    workspaceColor: GOOGLE_EVENT_COLOR,
    categoryName: '',
    title: ev.title,
    taskType: 'one_time',
    urgency: 1,
    scheduledDate: date,
    scheduledStartTime: times?.start,
    scheduledEndTime: times?.end,
    calendarColor: GOOGLE_EVENT_COLOR,
    isCompleted: false,
    showInTaskList: false,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    isPeerEvent: true,
    peerId: 'google',
    peerName: 'Google',
    detail: 'full',
    source: 'task',
    google: info,
  }
}

/**
 * Google events → Task-shaped overlay events in the viewer's LOCAL time.
 * - all-day: one chip per covered day (Google's end date is exclusive).
 * - timed: split at local midnight; a partial day becomes a timed block
 *   ('24:00' end when it runs past midnight), a fully covered middle day
 *   becomes an all-day chip. Nothing here can throw on odd input — bad
 *   events are skipped.
 */
export function mapGoogleEvents(events: GoogleCalendarApiEvent[]): PeerEvent[] {
  const out: PeerEvent[] = []
  for (const ev of events) {
    if (!ev || typeof ev.id !== 'string') continue
    if (ev.all_day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.start) || !/^\d{4}-\d{2}-\d{2}$/.test(ev.end)) continue
      const first = parseDateString(ev.start), stop = parseDateString(ev.end)
      const info: GoogleEventInfo = { eventId: ev.id, allDay: true, responseStatus: ev.response_status, htmlLink: ev.html_link, location: ev.location, startAt: first.toISOString(), endAt: stop.toISOString() }
      let day = first
      for (let i = 0; i < MAX_DAYS_PER_EVENT && (i === 0 || day < stop); i++) {
        const date = toDateString(day)
        out.push(shell(ev, date, date, info))
        day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
      }
      continue
    }
    const start = new Date(ev.start)
    let end = new Date(ev.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
    // Zero/negative length (bad data) still renders as a short block.
    if (end <= start) end = new Date(start.getTime() + 15 * 60_000)
    const info: GoogleEventInfo = { eventId: ev.id, allDay: false, responseStatus: ev.response_status, htmlLink: ev.html_link, location: ev.location, startAt: start.toISOString(), endAt: end.toISOString() }
    let cursor = start
    for (let i = 0; i < MAX_DAYS_PER_EVENT && cursor < end; i++) {
      const midnight = nextLocalMidnight(cursor)
      const pieceEnd = end < midnight ? end : midnight
      const date = toDateString(cursor)
      const wholeDay = hhmm(cursor) === '00:00' && pieceEnd.getTime() === midnight.getTime()
      if (wholeDay) out.push(shell(ev, date, date, { ...info, allDay: true }))
      else out.push(shell(ev, date, date, info, { start: hhmm(cursor), end: pieceEnd.getTime() === midnight.getTime() ? '24:00' : hhmm(pieceEnd) }))
      cursor = midnight
    }
  }
  return out
}

/** Clamp a timed overlay piece to the visible grid [startHour, endHour]; null if nothing is visible. */
export function clampToGrid(start: string, end: string, startHour: number, endHour: number): { start: string; end: string } | null {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const lo = startHour * 60, hi = endHour * 60
  const s = Math.max(toMin(start), lo), e = Math.min(toMin(end), hi)
  if (e <= s) return null
  const fmt = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
  return { start: fmt(s), end: fmt(e) }
}

export const isGoogleOverlay = (ev: { google?: GoogleEventInfo }): boolean => !!ev.google
