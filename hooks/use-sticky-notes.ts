'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StickyNote, StickyNoteColor, StickyNoteFolder, TiptapDoc } from '@/lib/types'
import type { Database } from '@/lib/supabase/database.types'
import { clampNotePosition } from '@/components/sticky-notes/sticky-note-card'
import { STICKY_CHANGED_EVENT } from '@/lib/widgets/launch'
import { toast } from 'sonner'
import { t } from '@/lib/i18n'
import { conflictCopyId, decideAfterMiss } from '@/lib/note-sync'
import { registerPendingWrites } from '@/lib/pending-writes'

type StickyNotesRow = Database['public']['Tables']['sticky_notes']['Row']
type StickyNoteFoldersRow = Database['public']['Tables']['sticky_note_folders']['Row']
type SupabaseClient = ReturnType<typeof createClient>

// Content saves are version-locked exactly like the notebook's (see
// lib/note-sync.ts and syncNoteWithLock in use-notebook.ts): a retry of
// text that failed to save can't overwrite a newer save from another
// device. On a real conflict the other device's text stays in the note and
// this device's text becomes a new sticky note next to it.
type StickySyncResult =
  | { kind: 'saved'; updatedAt: string }
  | { kind: 'same'; row: StickyNotesRow }
  | { kind: 'copied'; row: StickyNotesRow | null; copy: StickyNotesRow }
  | { kind: 'error'; error: unknown }

async function syncStickyWithLock(
  supabase: SupabaseClient,
  a: {
    userId: string
    noteId: string
    content: TiptapDoc
    token: string | undefined
    base?: { content: TiptapDoc | null }
    local?: StickyNote
    zIndex: number
  },
): Promise<StickySyncResult> {
  let token = a.token
  let row: StickyNotesRow | null = null
  for (let attempt = 0; ; attempt++) {
    if (token) {
      const { data, error } = await supabase
        .from('sticky_notes')
        .update({ content: a.content as unknown as never, updated_at: new Date().toISOString() })
        .eq('id', a.noteId)
        .eq('updated_at', token)
        .select('updated_at')
      if (error) return { kind: 'error', error }
      if (data && data.length > 0) return { kind: 'saved', updatedAt: data[0].updated_at }
    }
    const res = await supabase.from('sticky_notes').select('*').eq('id', a.noteId).maybeSingle()
    if (res.error) return { kind: 'error', error: res.error }
    row = res.data
    const decision = decideAfterMiss(row, { content: a.content }, a.base)
    if (decision === 'same' && row) return { kind: 'same', row }
    if (decision === 'rebase' && row) {
      if (attempt >= 2) return { kind: 'error', error: new Error('sticky note keeps changing; will retry') }
      token = row.updated_at
      continue
    }
    break
  }
  const src = row
    ? { x: row.x, y: row.y, width: row.width, height: row.height, color: row.color, folder_id: row.folder_id }
    : a.local
      ? { x: a.local.x, y: a.local.y, width: a.local.width, height: a.local.height, color: a.local.color, folder_id: a.local.folderId }
      : { x: 40, y: 20, width: 260, height: 220, color: 'yellow', folder_id: null }
  const copyId = conflictCopyId(a.noteId, { content: a.content })
  const ins = await supabase
    .from('sticky_notes')
    .insert({
      id: copyId,
      user_id: a.userId,
      content: a.content as unknown as never,
      // Offset so the copy doesn't hide exactly behind the original.
      x: Math.min(src.x + 3, 90),
      y: Math.min(src.y + 3, 90),
      width: src.width,
      height: src.height,
      color: src.color,
      folder_id: src.folder_id,
      on_screen: true,
      z_index: a.zIndex,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (!ins.error && ins.data) return { kind: 'copied', row, copy: ins.data }
  if (ins.error?.code === '23505') {
    const again = await supabase.from('sticky_notes').select('*').eq('id', copyId).maybeSingle()
    if (!again.error && again.data) return { kind: 'copied', row, copy: again.data }
  }
  return { kind: 'error', error: ins.error }
}

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
  // Latest not-yet-sent content per note (see use-notebook.ts): leaving the
  // page sends it instead of dropping it with the cancelled timer.
  const pendingContent = useRef<Record<string, TiptapDoc>>({})
  // In-flight INSERTs keyed by note id — any UPDATE/DELETE for a just-created
  // note must await this first (same race guard as use-notebook.ts).
  const pendingCreates = useRef<Record<string, Promise<void>>>({})
  // Server version token + the content at that version, per note (see
  // syncStickyWithLock), and a per-note queue so content saves go out one at
  // a time with the right token.
  const versionRef = useRef<Record<string, string>>({})
  const baseRef = useRef<Record<string, TiptapDoc | null>>({})
  const noteChains = useRef<Record<string, Promise<unknown>>>({})
  const notesRef = useRef<StickyNote[]>([])
  // Original → conflict copy until the editor shows the server text (same
  // as use-notebook.ts): a keystroke in that gap belongs to the copy.
  const redirectRef = useRef<Record<string, string>>({})
  useEffect(() => {
    notesRef.current = notes
    redirectRef.current = {}
  }, [notes])

  // The provider lives in the root layout and never unmounts, and signing
  // out / into another account doesn't reload the page. When the user
  // changes, drop the previous account's notes and load the new one's —
  // otherwise B kept seeing (and failing to edit) A's notes.
  const [stateUserId, setStateUserId] = useState(userId)
  if (stateUserId !== userId) {
    setStateUserId(userId)
    setNotes([])
    setFolders([])
    setLoading(true)
    setLoaded(false)
  }
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
      for (const r of data ?? []) {
        versionRef.current[r.id] = r.updated_at
        baseRef.current[r.id] = (r.content as TiptapDoc | null) ?? null
      }
      setNotes((data ?? []).map(rowToNote))
      setLoading(false)
      setLoaded(true)
    })()
    return () => { mounted = false }
  }, [enabled, loaded, userId, supabase])

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
        const { data: created, error } = await supabase
          .from('sticky_notes')
          .insert({
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
          .select('updated_at')
          .single()
        if (!error && created) {
          versionRef.current[id] = created.updated_at
          baseRef.current[id] = null
        }
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
      } else if (!error) {
        // Drag end / bring-to-front / resize / color are committed once per gesture, so this
        // fires on release (never mid-drag) and lets the 便條紙 widget re-sort right away.
        window.dispatchEvent(new Event(STICKY_CHANGED_EVENT))
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
  const flushContentRef = useRef<(id: string) => Promise<void>>(async () => {})

  // Conflict: the note shows the other device's text again, this device's
  // text is the new sticky note `copy`, and the user is told.
  const applyConflict = useCallback((id: string, row: StickyNotesRow | null, copy: StickyNotesRow) => {
    versionRef.current[copy.id] = copy.updated_at
    baseRef.current[copy.id] = (copy.content as TiptapDoc | null) ?? null
    if (row) {
      versionRef.current[id] = row.updated_at
      baseRef.current[id] = (row.content as TiptapDoc | null) ?? null
    }
    redirectRef.current[id] = copy.id
    // Text typed while this was resolving continues this device's version.
    const newer = pendingContent.current[id]
    if (newer !== undefined) {
      delete pendingContent.current[id]
      clearTimeout(saveTimers.current[id])
      delete saveTimers.current[id]
    }
    setNotes((prev) => {
      const out: StickyNote[] = []
      for (const n of prev) {
        if (n.id === copy.id) continue
        if (n.id === id) {
          if (row) out.push({ ...rowToNote(row), syncRev: (n.syncRev ?? 0) + 1 })
          continue
        }
        out.push(n)
      }
      out.push({ ...rowToNote(copy), ...(newer !== undefined ? { content: newer } : {}) })
      return out
    })
    if (newer !== undefined) {
      pendingContent.current[copy.id] = newer
      void flushContentRef.current(copy.id)
    }
    toast.warning(
      t('這張便條紙在其他裝置上也改過了。那邊的版本留在原處，這台的內容另存成一張新便條紙。'),
      { duration: 15000, id: `sticky-conflict-${copy.id}` },
    )
    window.dispatchEvent(new Event(STICKY_CHANGED_EVENT))
  }, [])

  const flushContent = useCallback(
    (id: string): Promise<void> => {
      clearTimeout(saveTimers.current[id])
      delete saveTimers.current[id]
      if (!(id in pendingContent.current)) return Promise.resolve()
      const content = pendingContent.current[id]
      delete pendingContent.current[id]
      const run = async () => {
        await pendingCreates.current[id]
        const r = userId
          ? await syncStickyWithLock(supabase, {
              userId,
              noteId: id,
              content,
              token: versionRef.current[id],
              base: id in baseRef.current ? { content: baseRef.current[id] } : undefined,
              local: notesRef.current.find((n) => n.id === id),
              zIndex: notesRef.current.reduce((max, n) => Math.max(max, n.zIndex), 0) + 1,
            })
          : ({ kind: 'error', error: new Error('not signed in') } as const)
        if (r.kind === 'error') {
          console.error('[sticky-notes] content save failed', r.error)
          // Keep it queued (unless newer text arrived) so the next flush
          // retries — version-checked, so it can't clobber another device.
          if (!(id in pendingContent.current)) pendingContent.current[id] = content
          toast.error(t('便條紙內容沒有存到，請檢查網路後再試'), { id: 'sticky-save-failed' })
          return
        }
        if (r.kind === 'copied') {
          applyConflict(id, r.row, r.copy)
          return
        }
        versionRef.current[id] = r.kind === 'saved' ? r.updatedAt : r.row.updated_at
        baseRef.current[id] = content
        window.dispatchEvent(new Event(STICKY_CHANGED_EVENT)) // refresh the 便條紙 widget
      }
      const p = (noteChains.current[id] ?? Promise.resolve()).then(run, run)
      noteChains.current[id] = p.catch(() => undefined)
      return p
    },
    [supabase, userId, applyConflict],
  )
  useEffect(() => {
    flushContentRef.current = flushContent
  }, [flushContent])

  const saveNoteContent = useCallback(
    (editedId: string, content: TiptapDoc) => {
      const id = redirectRef.current[editedId] ?? editedId
      const now = new Date().toISOString()
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content, updatedAt: now } : n)))

      pendingContent.current[id] = content
      clearTimeout(saveTimers.current[id])
      saveTimers.current[id] = setTimeout(() => void flushContent(id), SAVE_DEBOUNCE_MS)
    },
    [flushContent],
  )

  // Send pending text on unmount, pagehide and when the tab/app is hidden
  // (iOS can suspend the WebView right after the user swipes home).
  const flushAllContent = useCallback(() => {
    for (const id of Object.keys(pendingContent.current)) void flushContent(id)
  }, [flushContent])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAllContent()
    }
    window.addEventListener('pagehide', flushAllContent)
    // Text whose save failed offline goes out as soon as the connection is back.
    window.addEventListener('online', flushAllContent)
    document.addEventListener('visibilitychange', onVisibility)
    // Signing out sends pending text first and waits for it. Sticky text
    // has no local backup, so whatever still didn't go through is reported
    // and the user is asked before it's lost.
    const unregister = registerPendingWrites(async () => {
      flushAllContent()
      await Promise.all(Object.values(noteChains.current))
      return Object.keys(pendingContent.current).length
    })
    return () => {
      window.removeEventListener('pagehide', flushAllContent)
      window.removeEventListener('online', flushAllContent)
      document.removeEventListener('visibilitychange', onVisibility)
      unregister()
      flushAllContent()
    }
  }, [flushAllContent])

  // Declared after the flush effect on purpose: on unmount that one runs
  // first and sends pending text; this only discards on an account switch.
  useEffect(() => {
    const timers = saveTimers.current
    const pending = pendingContent.current
    return () => {
      // Unsent text of the previous account can't be saved under the new
      // session (RLS would refuse it); drop it with its timers.
      Object.values(timers).forEach(clearTimeout)
      for (const id of Object.keys(pending)) delete pending[id]
    }
  }, [userId])

  // ── Delete ───────────────────────────────────────────────
  const deleteNote = useCallback(
    async (id: string) => {
      let snapshot: StickyNote[] = []
      setNotes((prev) => {
        snapshot = prev
        return prev.filter((n) => n.id !== id)
      })
      clearTimeout(saveTimers.current[id])
      delete pendingContent.current[id]

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
