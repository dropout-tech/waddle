'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { t } from '@/lib/i18n'
import { toast } from 'sonner'
import { toDateString } from '@/lib/calendar-utils'
import type { Task } from '@/lib/types'

// Data layer for calendar sharing.
// P1: invite → accept → peers → dissolve.
// P2: per-share grants (which workspace / slot-type to expose, full vs busy)
//     and the peer-calendar overlay feed (get_shared_calendar RPC).
// This hook stays independent from use-waddle-data — sharing state has its
// own lifecycle and shouldn't couple to the board's data flow.

/** sessionStorage key used to hand a pending invite token across the
 *  login/OAuth round-trip (the invite page stores it before redirecting to
 *  /login; the login and /auth/callback pages read + redirect back after
 *  auth succeeds; the invite page reads + clears it on return). */
export const PENDING_SHARE_INVITE_KEY = 'huddle-pending-share-invite'

export interface PendingShareInvite {
  id: string
  createdAt: string
  expiresAt: string
}

export interface SharePeer {
  shareId: string
  peerId: string
  displayName: string | null
  avatarUrl: string | null
  createdAt: string
}

export interface InvitePreview {
  displayName: string | null
  avatarUrl: string | null
}

export type GrantKind = 'workspace' | 'slot_type'
export type GrantDetail = 'full' | 'busy'

/** One calendar_share_grants row — either direction (mine or the peer's). */
export interface ShareGrant {
  shareId: string
  ownerId: string
  kind: GrantKind
  /** workspaces.id (as text) for kind='workspace'; slot_types.key for 'slot_type'. */
  ref: string
  detail: GrantDetail
}

/**
 * A peer's shared event, shaped as a Task so it can flow through the
 * existing calendar machinery unchanged (taskOccursOnDate expansion,
 * calculateUnifiedColumns packing). For `detail === 'busy'` the RPC returns
 * a null title, so `title` here is only ever a generic label (type name or
 * 「忙碌」) — the real title never reaches the client.
 */
export interface PeerEvent extends Task {
  isPeerEvent: true
  peerId: string
  peerName: string
  detail: GrantDetail
  source: 'task' | 'time_block'
}

/** localStorage key for the per-peer overlay visibility toggles. */
const VISIBLE_PEERS_KEY = 'huddle-visible-share-peers-v1'

function loadVisiblePeers(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(VISIBLE_PEERS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Absent key = visible (opt-out toggle, so a fresh share shows up at once). */
export function isPeerVisible(visiblePeers: Record<string, boolean>, peerId: string): boolean {
  return visiblePeers[peerId] ?? true
}

type SharedCalendarRow = {
  source: 'task' | 'time_block'
  id: string
  event_date: string
  start_time: string
  end_time: string
  type_key: string | null
  color: string
  detail: 'full' | 'busy'
  title: string | null
  is_recurring: boolean
  recurrence_type: string | null
  recurrence_interval: number | null
  recurrence_days_of_week: number[] | null
  recurrence_end_date: string | null
  exdates: unknown
  parent_id: string | null
}

/** Postgres `time` serializes as HH:MM:SS — the app works in HH:mm. */
function toHHmm(time: string | null): string | undefined {
  if (!time) return undefined
  return time.slice(0, 5)
}

function mapSharedRows(
  rows: SharedCalendarRow[],
  peer: { peerId: string; peerName: string },
  typeLabels: Record<string, string>,
): PeerEvent[] {
  return rows.map((row) => {
    // Busy events carry no title (RPC nulls it). Display label falls back to
    // the viewer's own label for that slot-type key (built-ins share keys) or
    // a generic 「忙碌」. This is presentation only — the DB never sent one.
    const title =
      row.title ??
      (row.type_key ? typeLabels[row.type_key] : undefined) ??
      t('忙碌')
    const recurrenceType = row.recurrence_type as 'daily' | 'weekly' | 'monthly' | 'custom' | null
    return {
      // Prefixed so it can never collide with the viewer's own task ids in
      // shared column packing / React keys.
      id: `peer:${peer.peerId}:${row.source}:${row.id}`,
      categoryId: '',
      workspaceId: '',
      workspaceName: peer.peerName,
      workspaceColor: row.color,
      categoryName: '',
      title,
      taskType: 'one_time' as const,
      urgency: 1,
      scheduledDate: row.event_date,
      scheduledStartTime: toHHmm(row.start_time),
      scheduledEndTime: toHHmm(row.end_time),
      calendarColor: row.color,
      isCompleted: false,
      showInTaskList: false,
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
      isRecurring: row.is_recurring,
      recurrence:
        row.is_recurring && recurrenceType
          ? {
              type: recurrenceType,
              interval: row.recurrence_interval ?? 1,
              daysOfWeek: row.recurrence_days_of_week ?? undefined,
              endDate: row.recurrence_end_date ?? undefined,
            }
          : undefined,
      parentId: row.parent_id ?? undefined,
      exdates: Array.isArray(row.exdates) ? (row.exdates as string[]) : undefined,
      isPeerEvent: true as const,
      peerId: peer.peerId,
      peerName: peer.peerName,
      detail: row.detail,
      source: row.source,
    }
  })
}

/**
 * @param active Gate for the initial fetch + refetch-on-visible listener.
 *   The settings modal that hosts the "共享" tab stays mounted even when
 *   closed (ModalShell keeps it around for the exit animation), so passing
 *   `isOpen && activeTab === 'sharing'` avoids firing these queries on every
 *   page load. Callers that only need the imperative functions (create/
 *   preview/accept) — e.g. the invite landing page — can pass `false`.
 */
export function useCalendarSharing(active: boolean = true) {
  const supabase = createClient()
  const [pendingInvites, setPendingInvites] = useState<PendingShareInvite[]>([])
  const [peers, setPeers] = useState<SharePeer[]>([])
  const [grants, setGrants] = useState<ShareGrant[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(active)

  // Per-peer overlay visibility — persisted per device (like language /
  // quick-links prefs), not per account: it's a "what do I want on MY
  // screen" toggle, not shared state.
  const [visiblePeers, setVisiblePeers] = useState<Record<string, boolean>>(() =>
    typeof window === 'undefined' ? {} : loadVisiblePeers(),
  )

  const togglePeerVisible = useCallback((peerId: string) => {
    setVisiblePeers((prev) => {
      const next = { ...prev, [peerId]: !(prev[peerId] ?? true) }
      try {
        window.localStorage.setItem(VISIBLE_PEERS_KEY, JSON.stringify(next))
      } catch {
        /* quota / private mode — toggle still works for this session */
      }
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setMyUserId(user.id)

    const [invitesRes, peersRes, grantsRes] = await Promise.all([
      supabase
        .from('calendar_share_invites')
        .select('id, created_at, expires_at')
        .is('accepted_by', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
      supabase.rpc('get_share_peers'),
      // RLS returns both directions for my shares (mine + the peer's grants).
      supabase
        .from('calendar_share_grants')
        .select('share_id, owner_id, kind, ref, detail'),
    ])

    if (grantsRes.error) {
      console.error('[calendar-sharing] load grants failed', grantsRes.error)
    } else {
      setGrants(
        (grantsRes.data ?? []).map((r) => ({
          shareId: r.share_id,
          ownerId: r.owner_id,
          kind: r.kind,
          ref: r.ref,
          detail: r.detail,
        })),
      )
    }

    if (invitesRes.error) {
      console.error('[calendar-sharing] load invites failed', invitesRes.error)
    } else {
      setPendingInvites(
        (invitesRes.data ?? []).map((r) => ({
          id: r.id,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
        })),
      )
    }

    if (peersRes.error) {
      console.error('[calendar-sharing] load peers failed', peersRes.error)
    } else {
      setPeers(
        (peersRes.data ?? []).map((r) => ({
          shareId: r.share_id,
          peerId: r.peer_id,
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
          createdAt: r.created_at,
        })),
      )
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    if (!active) return
    void refresh()
    // Viewer-side data (peers can revoke/dissolve from their own side) —
    // refetch on refocus, same convention as use-waddle-data's poll-on-visible.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [active, refresh])

  // ── Invite lifecycle ─────────────────────────────────────
  const createInvite = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.rpc('create_share_invite')
    if (error || !data) {
      console.error('[calendar-sharing] create invite failed', error)
      toast.error(t('產生邀請連結失敗，請稍後再試'))
      return null
    }
    await refresh()
    return `${window.location.origin}/share/invite#t=${data}`
  }, [supabase, refresh])

  const revokeInvite = useCallback(
    async (id: string) => {
      let snapshot: PendingShareInvite[] = []
      setPendingInvites((prev) => {
        snapshot = prev
        return prev.filter((i) => i.id !== id)
      })
      const { error } = await supabase
        .from('calendar_share_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        console.error('[calendar-sharing] revoke invite failed', error)
        toast.error(t('撤銷邀請失敗，請稍後再試'))
        setPendingInvites(snapshot)
      }
    },
    [supabase],
  )

  // ── Established shares ────────────────────────────────────
  const dissolveShare = useCallback(
    async (shareId: string) => {
      let snapshot: SharePeer[] = []
      setPeers((prev) => {
        snapshot = prev
        return prev.filter((p) => p.shareId !== shareId)
      })
      const { error } = await supabase.from('calendar_shares').delete().eq('id', shareId)
      if (error) {
        console.error('[calendar-sharing] dissolve share failed', error)
        toast.error(t('解除共享失敗，請稍後再試'))
        setPeers(snapshot)
      } else {
        toast.success(t('已解除共享'))
      }
    },
    [supabase],
  )

  // ── Grants (which of MY categories the peer may see) ─────
  // detail === null deletes the grant (三態的「不開放」); otherwise upsert.
  // Optimistic update + rollback-by-refresh on error, same pattern as the
  // other mutations here. The RLS WITH CHECK re-verifies ownership of both
  // the share and the ref server-side — this call is not the security layer.
  //
  // `seed`: built-in slot types (午休/緩衝/專注) are synthesized at runtime
  // and normally have NO slot_types row — but migration 0016 requires the
  // grant ref to be a real DB row (WITH CHECK + the RPC's exists probe).
  // So granting a built-in first ensures its row exists (insert with
  // is_built_in=true; use-waddle-data's prune only clears is_built_in=false
  // so the seeded row survives settings saves). Turning the grant back off
  // deletes only the grant, never the seeded row.
  const setGrant = useCallback(
    async (
      shareId: string,
      kind: GrantKind,
      ref: string,
      detail: GrantDetail | null,
      seed?: {
        label: string
        description: string
        icon: string
        iconType: 'lucide' | 'custom' | 'emoji'
        color: string
      },
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return false

      if (kind === 'slot_type' && detail && seed) {
        const existing = await supabase
          .from('slot_types')
          .select('id')
          .eq('user_id', user.id)
          .eq('key', ref)
          .limit(1)
        if (existing.error) {
          console.error('[calendar-sharing] slot type lookup failed', existing.error)
          toast.error(t('更新開放範圍失敗，請稍後再試'))
          return false
        }
        if ((existing.data ?? []).length === 0) {
          const { error: seedError } = await supabase.from('slot_types').insert({
            user_id: user.id,
            key: ref,
            label: seed.label,
            description: seed.description,
            icon: seed.icon,
            icon_type: seed.iconType,
            color: seed.color,
            is_built_in: true,
            sort_order: 0,
          })
          if (seedError) {
            console.error('[calendar-sharing] slot type seed failed', seedError)
            toast.error(t('更新開放範圍失敗，請稍後再試'))
            return false
          }
        }
      }

      setGrants((prev) => {
        const rest = prev.filter(
          (g) => !(g.shareId === shareId && g.ownerId === user.id && g.kind === kind && g.ref === ref),
        )
        return detail ? [...rest, { shareId, ownerId: user.id, kind, ref, detail }] : rest
      })

      const { error } = detail
        ? await supabase.from('calendar_share_grants').upsert(
            { share_id: shareId, owner_id: user.id, kind, ref, detail },
            { onConflict: 'share_id,owner_id,kind,ref' },
          )
        : await supabase
            .from('calendar_share_grants')
            .delete()
            .eq('share_id', shareId)
            .eq('owner_id', user.id)
            .eq('kind', kind)
            .eq('ref', ref)

      if (error) {
        console.error('[calendar-sharing] set grant failed', error)
        toast.error(t('更新開放範圍失敗，請稍後再試'))
        await refresh() // restore server truth
        return false
      }
      return true
    },
    [supabase, refresh],
  )

  // ── Shared calendar feed (viewer side) ───────────────────
  // Raw fetch for one peer over a date window. Mapping to PeerEvent happens
  // in usePeerCalendarEvents where the viewer's slot-type labels are known.
  const fetchSharedCalendar = useCallback(
    async (peerId: string, fromISO: string, toISO: string): Promise<SharedCalendarRow[] | null> => {
      const { data, error } = await supabase.rpc('get_shared_calendar', {
        p_peer: peerId,
        p_from: fromISO,
        p_to: toISO,
      })
      if (error) {
        console.error('[calendar-sharing] get_shared_calendar failed', error)
        return null
      }
      return (data ?? []) as SharedCalendarRow[]
    },
    [supabase],
  )

  // ── Accept flow (invite landing page) ────────────────────
  // Preview/accept failures are intentionally opaque (matches the RPC's
  // uniform-error design: unknown/expired/used/revoked/own-token all raise
  // the same error, so this can't be used as an oracle) — callers just show
  // "邀請連結無效或已過期" for any null/error result.
  const previewInvite = useCallback(
    async (token: string): Promise<InvitePreview | null> => {
      const { data, error } = await supabase.rpc('preview_share_invite', { p_token: token })
      if (error || !data || data.length === 0) return null
      const row = data[0]
      return { displayName: row.display_name, avatarUrl: row.avatar_url }
    },
    [supabase],
  )

  const acceptInvite = useCallback(
    async (token: string): Promise<boolean> => {
      const { error } = await supabase.rpc('accept_share_invite', { p_token: token })
      if (error) {
        console.error('[calendar-sharing] accept invite failed', error)
        return false
      }
      await refresh()
      return true
    },
    [supabase, refresh],
  )

  return {
    pendingInvites,
    peers,
    grants,
    myUserId,
    visiblePeers,
    togglePeerVisible,
    loading,
    refresh,
    createInvite,
    revokeInvite,
    dissolveShare,
    previewInvite,
    acceptInvite,
    setGrant,
    fetchSharedCalendar,
  }
}

// ─────────────────────────────────────────────────────────
// usePeerCalendarEvents — the overlay feed for the calendar views.
//
// Fetches get_shared_calendar for every VISIBLE peer over a window of
// [selectedMonth - 1, selectedMonth + 2] months (~120 days, well under the
// RPC's 400-day cap; generous enough that week-view's infinite scroll
// rarely leaves it). Results are cached per (peer, window); the cache is
// dropped on refocus (visibilitychange) — matching the plan's semantics of
// "viewer sees grant changes after 切視圖 / refocus", no realtime.
// ─────────────────────────────────────────────────────────
export function usePeerCalendarEvents(opts: {
  peers: SharePeer[]
  visiblePeers: Record<string, boolean>
  selectedDate: Date
  /** Viewer's slot-type key → label map, used to label busy blocks. */
  typeLabels: Record<string, string>
}): PeerEvent[] {
  const { peers, visiblePeers, selectedDate, typeLabels } = opts
  const supabase = createClient()
  const [eventsByPeer, setEventsByPeer] = useState<Record<string, PeerEvent[]>>({})
  // In-flight/settled fetch promises, keyed by (peer, window). Shared across
  // effect re-runs: StrictMode's mount→cleanup→mount pair and initial-load
  // dependency churn cancel the first effect run mid-await — the survivor
  // must be able to await the SAME request instead of skip-and-starve (a
  // "fetched" Set deadlocked here: the first run marked the key, got
  // cancelled, and the re-run skipped it forever).
  const fetchPromises = useRef<Map<string, Promise<SharedCalendarRow[] | null>>>(new Map())

  const y = selectedDate.getFullYear()
  const m = selectedDate.getMonth()
  const fromISO = toDateString(new Date(y, m - 1, 1))
  const toISO = toDateString(new Date(y, m + 3, 0))
  const windowKey = `${fromISO}|${toISO}`

  useEffect(() => {
    let cancelled = false

    const run = async (force: boolean) => {
      for (const peer of peers) {
        if (!isPeerVisible(visiblePeers, peer.peerId)) continue
        const key = `${peer.peerId}|${windowKey}`
        let promise = fetchPromises.current.get(key)
        if (force || !promise) {
          promise = Promise.resolve(
            supabase.rpc('get_shared_calendar', { p_peer: peer.peerId, p_from: fromISO, p_to: toISO }),
          ).then(({ data, error }) => {
            if (error) {
              console.error('[calendar-sharing] peer calendar fetch failed', error)
              fetchPromises.current.delete(key) // allow retry on next trigger
              return null
            }
            return (data ?? []) as SharedCalendarRow[]
          })
          fetchPromises.current.set(key, promise)
        }
        const rows = await promise
        if (cancelled) return
        if (!rows) continue
        const mapped = mapSharedRows(
          rows,
          { peerId: peer.peerId, peerName: peer.displayName || t('對方') },
          typeLabels,
        )
        setEventsByPeer((prev) => ({ ...prev, [peer.peerId]: mapped }))
      }
    }

    void run(false)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchPromises.current.clear()
        void run(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [peers, visiblePeers, windowKey, fromISO, toISO, typeLabels, supabase])

  return useMemo(
    () =>
      peers
        .filter((p) => isPeerVisible(visiblePeers, p.peerId))
        .flatMap((p) => eventsByPeer[p.peerId] ?? []),
    [peers, visiblePeers, eventsByPeer],
  )
}
