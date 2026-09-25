'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth/auth-provider'
import {
  mapSharedRows,
  type SharedCalendarRow,
} from '@/hooks/use-calendar-sharing'
import { findCommonSlots } from '@/lib/meeting-availability'
import type { Task, TimeBlock } from '@/lib/types'
import { rowToTask, rowToTimeBlock } from '@/lib/supabase/mappers'
import { toDateString } from '@/lib/calendar-utils'
import type { MeetingInvitation, MeetingResponse } from '@/lib/meeting-types'
export type { MeetingInvitation, MeetingResponse } from '@/lib/meeting-types'
export type MeetingSearch = {
  peerIds: string[]
  from: string
  to: string
  startHour: number
  endHour: number
  durationMinutes: number
}
// RPCs added by the meeting migration; this local boundary avoids weakening the app's generated DB types.
type MeetingRPC = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>
type CountedPage<T> = {
  data: T[] | null
  count: number | null
  error: unknown
}
async function collectPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<CountedPage<T>>,
  key: (row: T) => string,
): Promise<T[]> {
  const collected: T[] = []
  const seen = new Set<string>()
  let expected: number | undefined
  for (let page = 0; page < 200; page++) {
    const result = await fetchPage(collected.length, collected.length + 499)
    if (
      result.error ||
      result.count === null ||
      !Number.isInteger(result.count) ||
      result.count < 0
    )
      throw new Error('availability')
    if (expected !== undefined && result.count !== expected)
      throw new Error('availability')
    expected = result.count
    const rows = result.data ?? []
    for (const row of rows) {
      const id = key(row)
      if (seen.has(id)) throw new Error('availability')
      seen.add(id)
      collected.push(row)
    }
    if (collected.length === expected) return collected
    if (!rows.length || collected.length > expected)
      throw new Error('availability')
  }
  throw new Error('availability')
}
export function useMeetingInvitations(
  selectedDate = new Date(),
  inviteId?: string,
) {
  const dateKey = toDateString(selectedDate)
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const rpc = supabase.rpc.bind(supabase) as unknown as MeetingRPC
  const currentUser = useRef(user?.id)
  useEffect(() => {
    currentUser.current = user?.id
    return () => {
      currentUser.current = undefined
    }
  }, [user?.id])
  const refreshGeneration = useRef(0)
  const [storedUserId, setStoredUserId] = useState<string>()
  const [storedMeetings, setMeetings] = useState<MeetingInvitation[]>([]),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(false)
  const meetings = storedUserId === user?.id ? storedMeetings : []
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current
    await Promise.resolve()
    if (!user) {
      setMeetings([])
      setStoredUserId(undefined)
      setLoading(false)
      setError(false)
      return
    }
    const valid = () =>
      currentUser.current === user.id &&
      generation === refreshGeneration.current
    setLoading(true)
    try {
      const result = await (
        supabase.rpc.bind(supabase) as unknown as MeetingRPC
      )('get_meeting_invitations', {
        p_from: new Date(
          new Date(`${dateKey}T00:00:00`).getTime() - 30 * 86400000,
        ).toISOString(),
        p_to: new Date(
          new Date(`${dateKey}T00:00:00`).getTime() + 330 * 86400000,
        ).toISOString(),
      })
      if (result.error) throw result.error
      const listed = (result.data ?? []) as MeetingInvitation[]
      if (inviteId) {
        const one = await (
          supabase.rpc.bind(supabase) as unknown as MeetingRPC
        )('get_meeting_invitation', { p_meeting_id: inviteId })
        if (one.error) throw one.error
        if (one.data && !listed.some((m) => m.id === inviteId))
          listed.unshift(one.data as MeetingInvitation)
      }
      if (valid()) {
        setMeetings(listed)
        setStoredUserId(user.id)
        setError(false)
      }
    } catch {
      if (valid()) setError(true)
    } finally {
      if (valid()) setLoading(false)
    }
  }, [user, supabase, dateKey, inviteId])
  useEffect(() => {
    let active = true
    const run = () => {
      if (active && document.visibilityState === 'visible') void refresh()
    }
    queueMicrotask(run)
    const timer = setInterval(run, 30000)
    document.addEventListener('visibilitychange', run)
    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', run)
    }
  }, [refresh])
  const respond = async (id: string, response: MeetingResponse) => {
    const r = await rpc('respond_meeting_invitation', {
      p_meeting_id: id,
      p_response: response,
    })
    if (r.error) throw r.error
    await refresh()
  }
  const cancel = async (id: string) => {
    const r = await rpc('cancel_meeting_invitation', { p_meeting_id: id })
    if (r.error) throw r.error
    await refresh()
  }
  const findSlots = async (
    search: MeetingSearch,
    _tasks: Task[],
    _timeBlocks: TimeBlock[],
  ) => {
    if (!user || !search.peerIds.length) throw new Error('availability')
    const from = new Date(`${search.from}T00:00:00`),
      to = new Date(`${search.to}T23:59:59.999`)
    if (
      !Number.isFinite(+from) ||
      !Number.isFinite(+to) ||
      +to < +from ||
      Date.parse(search.to) - Date.parse(search.from) >= 14 * 86400000
    )
      throw new Error('range')
    const [peers, grants, busyResult, ownTasks, ownBlocks, ownSettings] =
      await Promise.all([
        collectPages(
          (a, b) =>
            supabase
              .rpc('get_share_peers', undefined, { count: 'exact' })
              .order('peer_id')
              .range(a, b),
          (p) => p.peer_id,
        ),
        collectPages(
          (a, b) =>
            supabase
              .from('calendar_share_grants')
              .select('share_id,owner_id,kind,ref', { count: 'exact' })
              .in('owner_id', search.peerIds)
              .order('share_id')
              .order('owner_id')
              .order('kind')
              .order('ref')
              .range(a, b),
          (g) => `${g.share_id}:${g.owner_id}:${g.kind}:${g.ref}`,
        ),
        rpc('get_shared_meeting_busy', {
          p_peers: [user.id, ...search.peerIds],
          p_from: from.toISOString(),
          p_to: to.toISOString(),
        }),
        collectPages(
          (a, b) =>
            supabase
              .from('tasks')
              .select('*', { count: 'exact' })
              .eq('user_id', user.id)
              .order('id')
              .range(a, b),
          (r) => r.id,
        ),
        collectPages(
          (a, b) =>
            supabase
              .from('time_blocks')
              .select('*', { count: 'exact' })
              .eq('user_id', user.id)
              .order('id')
              .range(a, b),
          (r) => r.id,
        ),
        supabase
          .from('user_settings')
          .select('lunch_break')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])
    if (busyResult.error || ownSettings.error) throw new Error('availability')
    const rows = await Promise.all(
      search.peerIds.map(async (id) => {
        const peer = peers.find((p) => p.peer_id === id)
        if (
          !peer ||
          !grants.some((g) => g.share_id === peer.share_id && g.owner_id === id)
        )
          throw new Error('sharing_required')
        const shared = await collectPages(
          (a, b) =>
            supabase
              .rpc(
                'get_shared_calendar',
                {
                  p_peer: id,
                  p_from: toDateString(
                    new Date(
                      from.getFullYear(),
                      from.getMonth(),
                      from.getDate() - 1,
                    ),
                  ),
                  p_to: search.to,
                },
                { count: 'exact' },
              )
              .order('source')
              .order('id')
              .range(a, b),
          (r) => `${r.source}:${r.id}`,
        )
        return mapSharedRows(
          shared as SharedCalendarRow[],
          { peerId: id, peerName: peer.display_name ?? '' },
          {},
        ).map((event, index) => ({
          ...event,
          scheduledStartTime: shared[index].start_time ?? undefined,
          scheduledEndTime: shared[index].end_time ?? undefined,
        }))
      }),
    )
    const tasks = ownTasks.map((r) => ({
      ...rowToTask(r, '', '', ''),
      scheduledStartTime: r.scheduled_start_time ?? undefined,
      scheduledEndTime: r.scheduled_end_time ?? undefined,
    }))
    const timeBlocks = ownBlocks.map((r) => ({
      ...rowToTimeBlock(r),
      startTime: r.start_time,
      endTime: r.end_time,
    }))
    const lunch = ownSettings.data?.lunch_break as {
      enabled?: boolean
      startTime?: string
      endTime?: string
      color?: string
    } | null
    if (lunch?.enabled) {
      if (!lunch.startTime || !lunch.endTime) throw new Error('availability')
      for (
        const day = new Date(from);
        day <= to;
        day.setDate(day.getDate() + 1)
      ) {
        timeBlocks.push({
          id: `lunch:${toDateString(day)}`,
          date: toDateString(day),
          startTime: lunch.startTime,
          endTime: lunch.endTime,
          type: 'lunch',
          label: '',
          color: lunch.color ?? '#ccc',
          isRecurring: false,
        })
      }
    }
    return findCommonSlots({
      ...search,
      tasks,
      timeBlocks,
      peerEvents: rows.flat(),
      busy: (busyResult.data ?? []) as { starts_at: string; ends_at: string }[],
    })
  }
  const create = async (
    search: MeetingSearch,
    slot: { start: string; end: string },
    fields: { title: string; description: string; location: string },
    tasks: Task[],
    blocks: TimeBlock[],
    requestId: string,
  ) => {
    const previous = await rpc('get_meeting_invitation_by_request', {
      p_request_id: requestId,
    })
    if (previous.error) throw previous.error
    let id = (previous.data as MeetingInvitation | null)?.id
    if (!id) {
      const fresh = await findSlots(search, tasks, blocks)
      if (!fresh.some((s) => s.start === slot.start && s.end === slot.end))
        throw new Error('changed')
    }
    const result = await rpc('create_meeting_invitation', {
      p_title: fields.title,
      p_description: fields.description,
      p_location: fields.location,
      p_start: slot.start,
      p_end: slot.end,
      p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      p_invitees: search.peerIds,
      p_request_id: requestId,
    })
    if (result.error) throw result.error
    id = String(result.data)
    await refresh()
    window.dispatchEvent(new Event('meeting-notifications-changed'))
    return { id }
  }
  const pendingCount = meetings.filter(
    (m) =>
      m.status !== 'cancelled' &&
      new Date(m.ends_at) > new Date() &&
      m.participants.some(
        (p) => p.user_id === user?.id && p.response === 'pending',
      ),
  ).length
  const calendarTasks: Task[] = meetings
    .filter(
      (m) =>
        m.status !== 'cancelled' &&
        (m.organizer_id === user?.id ||
          m.participants.some(
            (p) => p.user_id === user?.id && p.response === 'accepted',
          )),
    )
    .flatMap((m) => {
      const start = new Date(m.starts_at),
        end = new Date(m.ends_at),
        hh = (d: Date) =>
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      const parts: Task[] = []
      for (let cursor = new Date(start); cursor < end; ) {
        const midnight = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate() + 1,
        )
        const finish = end < midnight ? end : midnight
        parts.push({
          id: `meeting:${m.id}:${toDateString(cursor)}`,
          categoryId: '',
          workspaceId: '',
          workspaceName: '',
          workspaceColor: '#789185',
          categoryName: '',
          title: m.title,
          description: m.description ?? undefined,
          location: m.location ?? undefined,
          attendees: m.participants
            .map((p) => p.display_name ?? '')
            .filter(Boolean)
            .join(', '),
          taskType: 'one_time',
          urgency: 1,
          scheduledDate: toDateString(cursor),
          scheduledStartTime: hh(cursor),
          scheduledEndTime:
            finish.getTime() === midnight.getTime() ? '24:00' : hh(finish),
          calendarColor: '#789185',
          isCompleted: false,
          isMeeting: true,
          showInTaskList: false,
          sortOrder: 0,
          createdAt: m.created_at,
          updatedAt: m.created_at,
        })
        cursor = finish
      }
      return parts
    })
  return {
    user,
    meetings,
    loading,
    error,
    refresh,
    respond,
    cancel,
    findSlots,
    create,
    pendingCount,
    calendarTasks,
  }
}
export type MeetingController = ReturnType<typeof useMeetingInvitations>
