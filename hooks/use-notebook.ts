'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { NotebookNote, TiptapDoc } from '@/lib/types'
import type { Database } from '@/lib/supabase/database.types'

type NotebookNotesRow = Database['public']['Tables']['notebook_notes']['Row']

// Data layer for the notebook (記事本). Mirrors the optimistic-update +
// rollback pattern used by use-waddle-data for the scratchpad, but lives in its
// own hook because the notebook is a self-contained route (/notebook) rather
// than part of the main board's bundled state.

const SAVE_DEBOUNCE_MS = 600

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function rowToNote(r: NotebookNotesRow): NotebookNote {
  return {
    id: r.id,
    title: r.title ?? '',
    icon: r.icon ?? undefined,
    content: (r.content as TiptapDoc | null) ?? null,
    sortOrder: r.sort_order ?? 0,
    isArchived: r.is_archived ?? false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function useNotebook() {
  const supabase = createClient()
  const [notes, setNotes] = useState<NotebookNote[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const userIdRef = useRef<string | null>(null)

  // Per-note debounce timers for content autosave, so typing in one note
  // doesn't reset another note's pending save.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Initial load ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        if (mounted) setLoading(false)
        return
      }
      userIdRef.current = user.id

      const { data, error } = await supabase
        .from('notebook_notes')
        .select('*')
        .eq('is_archived', false)
        .order('sort_order', { ascending: true })

      if (!mounted) return
      if (error) {
        console.error('[notebook] load failed', error)
        setLoading(false)
        return
      }
      setNotes((data ?? []).map(rowToNote))
      setLoading(false)
    })()

    const timers = saveTimers.current
    return () => {
      mounted = false
      Object.values(timers).forEach(clearTimeout)
    }
  }, [supabase])

  // ── Create ───────────────────────────────────────────────
  const createNote = useCallback(async (): Promise<NotebookNote | null> => {
    const userId = userIdRef.current
    if (!userId) return null

    // New notes go to the top; bump everyone else down by one gap step.
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: NotebookNote = {
      id,
      title: '',
      icon: undefined,
      content: null,
      sortOrder: 0,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    }

    setNotes((prev) => [optimistic, ...prev.map((n) => ({ ...n, sortOrder: n.sortOrder + 10 }))])

    const { error } = await supabase.from('notebook_notes').insert({
      id,
      user_id: userId,
      title: '',
      content: null,
      sort_order: 0,
      updated_at: now,
    })

    if (error) {
      console.error('[notebook] create failed', error)
      setNotes((prev) => prev.filter((n) => n.id !== id))
      return null
    }
    return optimistic
  }, [supabase])

  // ── Patch helpers (title / icon) ─────────────────────────
  const patchNote = useCallback(
    async (id: string, patch: Partial<Pick<NotebookNote, 'title' | 'icon'>>) => {
      let snapshot: NotebookNote | undefined
      const now = new Date().toISOString()
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n
          snapshot = n
          return { ...n, ...patch, updatedAt: now }
        }),
      )

      const { error } = await supabase
        .from('notebook_notes')
        .update({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.icon !== undefined ? { icon: patch.icon ?? null } : {}),
          updated_at: now,
        })
        .eq('id', id)

      if (error && snapshot) {
        console.error('[notebook] patch failed', error)
        const prevSnapshot = snapshot
        setNotes((prev) => prev.map((n) => (n.id === id ? prevSnapshot : n)))
      }
    },
    [supabase],
  )

  const renameNote = useCallback((id: string, title: string) => patchNote(id, { title }), [patchNote])
  const setNoteIcon = useCallback((id: string, icon: string | undefined) => patchNote(id, { icon }), [patchNote])

  // ── Content autosave (debounced) ─────────────────────────
  // Updates local state immediately (so switching notes never loses keystrokes)
  // and flushes to Supabase after a short idle window.
  const saveNoteContent = useCallback(
    (id: string, content: TiptapDoc) => {
      const now = new Date().toISOString()
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content, updatedAt: now } : n)))
      setSaveStatus('saving')

      clearTimeout(saveTimers.current[id])
      saveTimers.current[id] = setTimeout(async () => {
        const { error } = await supabase
          .from('notebook_notes')
          .update({ content: content as unknown as never, updated_at: new Date().toISOString() })
          .eq('id', id)
        setSaveStatus(error ? 'error' : 'saved')
        if (error) console.error('[notebook] content save failed', error)
      }, SAVE_DEBOUNCE_MS)
    },
    [supabase],
  )

  // ── Delete ───────────────────────────────────────────────
  const deleteNote = useCallback(
    async (id: string) => {
      let snapshot: NotebookNote[] = []
      setNotes((prev) => {
        snapshot = prev
        return prev.filter((n) => n.id !== id)
      })
      clearTimeout(saveTimers.current[id])

      const { error } = await supabase.from('notebook_notes').delete().eq('id', id)
      if (error) {
        console.error('[notebook] delete failed', error)
        setNotes(snapshot)
      }
    },
    [supabase],
  )

  // ── Reorder ──────────────────────────────────────────────
  const reorderNotes = useCallback(
    async (orderedIds: string[]) => {
      const userId = userIdRef.current
      if (!userId) return
      let snapshot: NotebookNote[] = []
      const byId = new Map<string, NotebookNote>()

      setNotes((prev) => {
        snapshot = prev
        prev.forEach((n) => byId.set(n.id, n))
        return orderedIds
          .map((id, i) => {
            const n = byId.get(id)
            return n ? { ...n, sortOrder: i * 10 } : null
          })
          .filter((n): n is NotebookNote => n !== null)
      })

      const rows = orderedIds
        .map((id, i) => {
          const n = byId.get(id)
          if (!n) return null
          return {
            id,
            user_id: userId,
            title: n.title,
            content: (n.content as unknown as never) ?? null,
            sort_order: i * 10,
            updated_at: n.updatedAt,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      const { error } = await supabase.from('notebook_notes').upsert(rows)
      if (error) {
        console.error('[notebook] reorder failed', error)
        setNotes(snapshot)
      }
    },
    [supabase],
  )

  return {
    notes,
    loading,
    saveStatus,
    createNote,
    renameNote,
    setNoteIcon,
    saveNoteContent,
    deleteNote,
    reorderNotes,
  }
}
