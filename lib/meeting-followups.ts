import { createClient } from '@/lib/supabase/client'

/**
 * Meeting <-> task links (meeting polish, 2026-10).
 *
 * The two RPCs below are written by the database side separately. Until they
 * exist in a project (or when a call fails for any reason) every helper here
 * degrades silently — an empty result, never a thrown error — so the UI simply
 * hides the block instead of showing a failure.
 */

export interface MeetingSource {
  import_id: string
  title: string
  meeting_date: string
}

export interface MeetingFollowup {
  task_id: string
  title: string
  due_date: string | null
  is_completed: boolean
  counterpart: string | null
  import_id: string
  meeting_title: string
  meeting_date: string
}

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => RpcResult }

const rpcClient = () => createClient() as unknown as RpcClient

/** Which meeting a task came from; null when it was not created from one (or the RPC is unavailable). */
export async function getTaskMeetingSource(taskId: string): Promise<MeetingSource | null> {
  try {
    const { data, error } = await rpcClient().rpc('get_task_meeting_source', { p_task_id: taskId })
    if (error || !Array.isArray(data) || data.length === 0) return null
    const row = data[0] as Partial<MeetingSource>
    if (!row.import_id || !row.title) return null
    return { import_id: row.import_id, title: row.title, meeting_date: row.meeting_date ?? '' }
  } catch {
    return null
  }
}

/** Open follow-ups: things the other side promised in meetings. Due date near to far. */
export async function listMeetingFollowups(includeDone = false): Promise<MeetingFollowup[]> {
  try {
    const { data, error } = await rpcClient().rpc('list_meeting_followups', { p_include_done: includeDone })
    if (error || !Array.isArray(data)) return []
    return (data as MeetingFollowup[]).filter((f) => f && f.task_id && f.title)
  } catch {
    return []
  }
}

/** Is this YYYY-MM-DD before today (device-local)? */
export function isPastDue(dueDate: string | null | undefined, today: string): boolean {
  return !!dueDate && dueDate < today
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: string | null | undefined): s is string => !!s && UUID.test(s)

/** "Alice、Bob, Carol" -> ['Alice','Bob','Carol'] (free-text attendees field of a meeting task). */
export function parseAttendees(text: string | undefined | null): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of text.split(/[,，、;；\n]+/)) {
    const name = raw.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      names.push(name)
    }
  }
  return names.slice(0, 20)
}

/** /meetings URL that prefills the new-meeting form (read once by MeetingWorkspace, then cleared). */
export function meetingPrefillHref(opts: { title: string; date?: string; attendees?: string[] }): string {
  const q = new URLSearchParams()
  const title = opts.title.trim().slice(0, 160)
  if (title) q.set('title', title)
  if (opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)) q.set('date', opts.date)
  for (const name of opts.attendees ?? []) q.append('p', name)
  const s = q.toString()
  return s ? `/meetings?${s}` : '/meetings'
}

/** /meetings URL that opens a saved record directly. */
export const meetingRecordHref = (importId: string) => `/meetings?import=${encodeURIComponent(importId)}`

/** Home-screen URL that opens one task's detail (same route widget taps use). */
export const taskHref = (taskId: string) => `/?widget=tasks&task=${encodeURIComponent(taskId)}`
