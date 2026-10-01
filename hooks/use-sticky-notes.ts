'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StickyNote, StickyNoteColor, StickyNoteFolder, TiptapDoc } from '@/lib/types'
import type { Database } from '@/lib/supabase/database.types'
import { clampNotePosition } from '@/components/sticky-notes/sticky-note-card'
import { STICKY_CHANGED_EVENT } from '@/lib/widgets/launch'

type StickyNotesRow = Database['public']['Tables']['sticky_notes']['Row']
type StickyNoteFoldersRow = Database['public']['Tables']['sticky_note_folders']['Row']

// Data layer for the sticky-notes glass overlay (便條紙). Same optimistic
// update + rollback shape as use-notebook.ts, but simpler: no title/icon,
// just position + size + color + content, plus an on-screen flag and an
// optional folder for notes that have been put away (便條紙收納抽屜). Notes are shared across
// every page (mounted once at the root layout), so this hook only loads once
// per session regardless of which route is active.

const SAVE_DEBOUNCE_MS = 600

function rowToFolder(r: StickyNoteFoldersRow): StickyNoteFolder {
  return { id: r.id, name: r.name, sortOrder: r.sort_order }
}

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
    folderId: r.folder_id ?? null,
    onScreen: r.on_screen ?? true,
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
  const [folders, setFolders] = useState<StickyNoteFolder[]>([])
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
      const [{ data, error }, foldersRes] = await Promise.all([
        supabase.from('sticky_notes').select('*').order('z_index', { ascending: true }),
        supabase.from('sticky_note_folders').select('*').order('sort_order', { ascending: true }),
      ])

      if (!mounted) return
      if (foldersRes.error) console.error('[sticky-notes] folders load failed', foldersRes.error)
      else setFolders((foldersRes.data ?? []).map(rowToFolder))
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
        folderId: null,
        onScreen: true,
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
      patch: Partial<Pick<StickyNote, 'x' | 'y' | 'width' | 'height' | 'color' | 'zIndex' | 'folderId' | 'onScreen'>>,
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
          ...(patch.width !== undefined ? { width: Math.round(patch.width) } : {}),
          ...(patch.height !== undefined ? { height: Math.round(patch.height) } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.zIndex !== undefined ? { z_index: patch.zIndex } : {}),
          ...(patch.folderId !== undefined ? { folder_id: patch.folderId } : {}),
          ...(patch.onScreen !== undefined ? { on_screen: patch.onScreen } : {}),
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

  // ── Put away / pin back / file (收納抽屜) ─────────────────────
  // Putting a note away keeps its folder, position and size, so pinning it
  // back drops it exactly where it was (re-clamped in case the window shrank).
  const stowNote = useCallback((id: string) => patchNote(id, { onScreen: false }), [patchNote])
  const restoreNote = useCallback(
    (id: string) => {
      const n = notes.find((note) => note.id === id)
      if (!n) return
      const clamped = clampNotePosition(n.x, n.y, n.width, n.height)
      patchNote(id, { onScreen: true, zIndex: nextZIndex(), x: clamped.x, y: clamped.y })
    },
    [notes, nextZIndex, patchNote],
  )
  const moveNoteToFolder = useCallback(
    (id: string, folderId: string | null) => patchNote(id, { folderId }),
    [patchNote],
  )

  // ── Folders ──────────────────────────────────────────────
  const createFolder = useCallback(
    async (name: string): Promise<StickyNoteFolder | null> => {
      const trimmed = name.trim().slice(0, 60)
      if (!userId || !trimmed) return null
      const folder: StickyNoteFolder = {
        id: crypto.randomUUID(),
        name: trimmed,
        sortOrder: folders.reduce((max, f) => Math.max(max, f.sortOrder), 0) + 1,
      }
      setFolders((prev) => [...prev, folder])
      const { error } = await supabase
        .from('sticky_note_folders')
        .insert({ id: folder.id, user_id: userId, name: folder.name, sort_order: folder.sortOrder })
      if (error) {
        console.error('[sticky-notes] folder create failed', error)
        setFolders((prev) => prev.filter((f) => f.id !== folder.id))
        return null
      }
      return folder
    },
    [supabase, userId, folders],
  )

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim().slice(0, 60)
      if (!trimmed) return
      let snapshot: StickyNoteFolder[] = []
      setFolders((prev) => {
        snapshot = prev
        return prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f))
      })
      const { error } = await supabase.from('sticky_note_folders').update({ name: trimmed }).eq('id', id)
      if (error) {
        console.error('[sticky-notes] folder rename failed', error)
        setFolders(snapshot)
      }
    },
    [supabase],
  )

  // Deleting a folder never deletes its notes — the FK is ON DELETE SET NULL,
  // so they move to 未分類; mirror that locally.
  const deleteFolder = useCallback(
    async (id: string) => {
      let folderSnap: StickyNoteFolder[] = []
      let noteSnap: StickyNote[] = []
      setFolders((prev) => {
        folderSnap = prev
        return prev.filter((f) => f.id !== id)
      })
      setNotes((prev) => {
        noteSnap = prev
        return prev.map((n) => (n.folderId === id ? { ...n, folderId: null } : n))
      })
      const { error } = await supabase.from('sticky_note_folders').delete().eq('id', id)
      if (error) {
        console.error('[sticky-notes] folder delete failed', error)
        setFolders(folderSnap)
        setNotes(noteSnap)
      }
    },
    [supabase],
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
        else window.dispatchEvent(new Event(STICKY_CHANGED_EVENT)) // refresh the 便條紙 widget
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
      } else window.dispatchEvent(new Event(STICKY_CHANGED_EVENT))
    },
    [supabase],
  )

  return {
    notes,
    folders,
    loading,
    createNote,
    setPosition,
    setSize,
    setColor,
    bringToFront,
    saveNoteContent,
    deleteNote,
    stowNote,
    restoreNote,
    moveNoteToFolder,
    createFolder,
    renameFolder,
    deleteFolder,
  }
}
