'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { createClient } from '@/lib/supabase/client'

export interface MeetingNotification {
  id: string
  meeting_id: string
  kind: 'invitation' | 'response' | 'cancellation'
  response: 'accepted' | 'tentative' | 'declined' | null
  title: string
  actor_name: string
  created_at: string
}
type Inbox = { items: MeetingNotification[]; unread_count: number }
type RPC = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>

export function useMeetingNotifications() {
  const { user } = useAuth()
  const client = useMemo(() => createClient(), [])
  const [state, setState] = useState<{
    owner?: string
    inbox: Inbox
    error: boolean
  }>({ inbox: { items: [], unread_count: 0 }, error: false })
  const owner = useRef(user?.id)
  const generation = useRef(0)
  useEffect(() => {
    owner.current = user?.id
    generation.current++
    return () => {
      owner.current = undefined
    }
  }, [user?.id])
  const refresh = useCallback(async () => {
    if (!user) return
    const version = ++generation.current
    try {
      const result = await (client.rpc.bind(client) as unknown as RPC)(
        'get_meeting_notifications',
      )
      if (result.error) throw result.error
      if (owner.current === user.id && version === generation.current)
        setState({ owner: user.id, inbox: result.data as Inbox, error: false })
    } catch {
      if (owner.current === user.id && version === generation.current)
        setState((previous) => ({
          owner: user.id,
          inbox:
            previous.owner === user.id
              ? previous.inbox
              : { items: [], unread_count: 0 },
          error: true,
        }))
    }
  }, [client, user])
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    queueMicrotask(run)
    const timer = setInterval(run, 30000)
    window.addEventListener('focus', run)
    window.addEventListener('meeting-notifications-changed', run)
    document.addEventListener('visibilitychange', run)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', run)
      window.removeEventListener('meeting-notifications-changed', run)
      document.removeEventListener('visibilitychange', run)
    }
  }, [refresh])
  const markRead = async (id: string) => {
    const source = user?.id
    if (!source || owner.current !== source) return false
    try {
      const result = await (client.rpc.bind(client) as unknown as RPC)(
        'read_meeting_notification',
        { p_id: id },
      )
      if (owner.current !== source) return false
      if (result.error) throw result.error
      generation.current++
      setState((previous) =>
        previous.owner !== source
          ? previous
          : {
              ...previous,
              inbox: {
                items: previous.inbox.items.filter((item) => item.id !== id),
                unread_count: Math.max(
                  0,
                  previous.inbox.unread_count -
                    (previous.inbox.items.some((item) => item.id === id)
                      ? 1
                      : 0),
                ),
              },
            },
      )
      await refresh()
      return owner.current === source
    } catch {
      if (owner.current === source)
        setState((previous) => ({ ...previous, error: true }))
      return false
    }
  }
  return {
    items: state.owner === user?.id ? state.inbox.items : [],
    unreadCount: state.owner === user?.id ? state.inbox.unread_count : 0,
    error: state.owner === user?.id && state.error,
    refresh,
    markRead,
  }
}
