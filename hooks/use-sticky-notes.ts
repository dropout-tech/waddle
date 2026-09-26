'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StickyNote, StickyNoteColor, TiptapDoc } from '@/lib/types'
import type { Database } from '@/lib/supabase/database.types'

type StickyNotesRow = Database['public']['Tables']['sticky_notes']['Row']

// Data layer for the sticky-notes glass overlay (便條紙). Same optimistic
// update + rollback shape as use-notebook.ts, but simpler: no title/icon/
// category, just position + size + color + content. Notes are shared across
// every page (mounted once at the root layout), so this hook only loads once
// per session regardless of which route is active.

const SAVE_DEBOUNCE_MS = 600

function rowToNote(r: StickyNotesRow): StickyNote {
  return {
    id: r.id,
    content: (r.content as TiptapDoc | null) ?? null,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    color: (r.color as StickyNoteColor) ?? 'yellow',
    zIndex: r.z_index ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// `userId` comes from the caller's already-resolved auth session (see
// sticky-notes-provider.tsx's `useAuth()`) rather than this hook calling
// `supabase.auth.getUser()` itself — that extra round trip left a window
// right after enabling the overlay where the user id wasn't known yet and
// `createNote()` silently no-op'd if "新增便條紙" was clicked too quickly
// (caught by scripts/e2e/tmp-sticky-notes-verify.mjs).
export function useStickyNotes(enabled: boolean, userId: string | null) {
  const supabase = createClient()
  const [notes, setNotes] = useState<StickyNote[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // In-flight INSERTs keyed by note id — any UPDATE/DELETE for a just-created
  // note must await this first (same race guard as use-notebook.ts).
  const pendingCreates = useRef<Record<string, Promise<void>>>({})

  // Load once, the first time the overlay is switched on (and we have a
  // user id) — not on every mount, so flipping the toggle off/on mid-session
  // doesn't refetch.
  useEffect(() => {
    if (!enabled || loaded || !userId) return
    let mounted = true
    ;(async () => {
      const { data, error } = await supabase
        .from('sticky_notes')
        .select('*')
        .order('z_index', { ascending: true })

      if (!mounted) return
      if (error) {
        console.error('[sticky-notes] load failed', error)
        setLoading(false)
        setLoaded(true)
        return
      }
      setNotes((data ?? []).map(rowToNote))
      setLoading(false)
      setLoaded(true)
    })()
    return () => { mounted = false }
  }, [enabled, loaded, userId, supabase])

  useEffect(() => {
    const timers = saveTimers.current
    return () => { Object.values(timers).forEach(clearTimeout) }
  }, [])

  const nextZIndex = useCallback(
    () => notes.reduce((max, n) => Math.max(max, n.zIndex), 0) + 1,
    [notes],
  )

  // ── Create ───────────────────────────────────────────────
  const createNote = useCallback(
    (partial: Partial<Pick<StickyNote, 'x' | 'y' | 'width' | 'height' | 'color'>> = {}): StickyNote | null => {
      if (!userId) return null
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const z = nextZIndex()
      const optimistic: StickyNote = {
        id,
        content: null,
        x: partial.x ?? 40,
        y: partial.y ?? 20,
        width: partial.width ?? 260,
        height: partial.height ?? 220,
        color: partial.color ?? 'yellow',
        zIndex: z,
        createdAt: now,
        updatedAt: now,
      }
      setNotes((prev) => [...prev, optimistic])

      pendingCreates.current[id] = (async () => {
        const { error } = await supabase.from('sticky_notes').insert({
          id,
          user_id: userId,
          content: null,
          x: optimistic.x,
          y: optimistic.y,
          width: optimistic.width,
          height: optimistic.height,
          color: optimistic.color,
          z_index: z,
          updated_at: now,
        })
        if (error) {
          console.error('[sticky-notes] create failed', error)
          setNotes((prev) => prev.filter((n) => n.id !== id))
        }
        delete pendingCreates.current[id]
      })()
      return optimistic
    },
    [supabase, nextZIndex, userId],
  )

  // ── Position / size / color (committed once per gesture — drag end,
  //    resize end, color pick — never mid-drag) ─────────────────────
  const patchNote = useCallback(
    async (
      id: string,
      patch: Partial<Pick<StickyNote, 'x' | 'y' | 'width' | 'height' | 'color' | 'zIndex'>>,
    ) => {
      let snapshot: StickyNote | undefined
      const now = new Date().toISOString()
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n
          snapshot = n
          return { ...n, ...patch, updatedAt: now }
        }),
      )

      await pendingCreates.current[id]
      const { error } = await supabase
        .from('sticky_notes')
        .update({
          ...(patch.x !== undefined ? { x: patch.x } : {}),
          ...(patch.y !== undefined ? { y: patch.y } : {}),
          ...(patch.width !== undefined ? { width: patch.width } : {}),
          ...(patch.height !== undefined ? { height: patch.height } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.zIndex !== undefined ? { z_index: patch.zIndex } : {}),
          updated_at: now,
        })
        .eq('id', id)

      if (error && snapshot) {
        console.error('[sticky-notes] patch failed', error)
        const prevSnapshot = snapshot
        setNotes((prev) => prev.map((n) => (n.id === id ? prevSnapshot : n)))
      }
    },
    [supabase],
  )

  const setPosition = useCallback((id: string, x: number, y: number) => patchNote(id, { x, y }), [patchNote])
  const setSize = useCallback(
    (id: string, width: number, height: number) => patchNote(id, { width, height }),
    [patchNote],
  )
  const setColor = useCallback((id: string, color: StickyNoteColor) => patchNote(id, { color }), [patchNote])

  const bringToFront = useCallback(
    (id: string) => {
      const z = nextZIndex()
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, zIndex: z } : n)))
      patchNote(id, { zIndex: z })
    },
    [nextZIndex, patchNote],
  )

  // ── Content autosave (debounced), mirrors use-notebook.ts ────────
  const saveNoteContent = useCallback(
    (id: string, content: TiptapDoc) => {
      const now = new Date().toISOString()
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content, updatedAt: now } : n)))

      clearTimeout(saveTimers.current[id])
      saveTimers.current[id] = setTimeout(async () => {
        await pendingCreates.current[id]
        const { error } = await supabase
          .from('sticky_notes')
          .update({ content: content as unknown as never, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) console.error('[sticky-notes] content save failed', error)
      }, SAVE_DEBOUNCE_MS)
    },
    [supabase],
  )

  // ── Delete ───────────────────────────────────────────────
  const deleteNote = useCallback(
    async (id: string) => {
      let snapshot: StickyNote[] = []
      setNotes((prev) => {
        snapshot = prev
        return prev.filter((n) => n.id !== id)
      })
      clearTimeout(saveTimers.current[id])

      await pendingCreates.current[id]
      const { error } = await supabase.from('sticky_notes').delete().eq('id', id)
      if (error) {
        console.error('[sticky-notes] delete failed', error)
        setNotes(snapshot)
      }
    },
    [supabase],
  )

  return {
    notes,
    loading,
    createNote,
    setPosition,
    setSize,
    setColor,
    bringToFront,
    saveNoteContent,
    deleteNote,
  }
}
