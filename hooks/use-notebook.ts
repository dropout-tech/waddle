'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { scheduleImageCleanupAfterDelete } from '@/lib/image-cleanup'
import type { NotebookNote, NotebookCategory, TiptapDoc } from '@/lib/types'
import type { Database } from '@/lib/supabase/database.types'
import { t } from '@/lib/i18n'
import { planLimitCode } from '@/lib/billing/plan-errors'
import { showPlanLimitToast } from '@/lib/billing/plan-limit-toast'
import { assertImageQuota, explainUploadError } from '@/lib/billing/plan-usage'
import {
  saveNotebookDraft,
  clearNotebookDraftField,
  clearNotebookDraft,
  takeNewerNotebookDrafts,
} from '@/lib/notebook-draft'

type NotebookNotesRow = Database['public']['Tables']['notebook_notes']['Row']
type NotebookCategoriesRow = Database['public']['Tables']['notebook_categories']['Row']

// Data layer for the notebook (記事本). Mirrors the optimistic-update +
// rollback pattern used by use-waddle-data for the scratchpad, but lives in its
// own hook because the notebook is a self-contained surface rather than part of
// the main board's bundled state.

const SAVE_DEBOUNCE_MS = 600
const IMAGE_BUCKET = 'notebook-images'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function rowToNote(r: NotebookNotesRow): NotebookNote {
  return {
    id: r.id,
    title: r.title ?? '',
    icon: r.icon ?? undefined,
    content: (r.content as TiptapDoc | null) ?? null,
    categoryId: r.category_id ?? null,
    sortOrder: r.sort_order ?? 0,
    isArchived: r.is_archived ?? false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToCategory(r: NotebookCategoriesRow): NotebookCategory {
  return {
    id: r.id,
    name: r.name ?? '',
    color: r.color ?? 'oklch(0.62 0.08 250)',
    icon: r.icon ?? undefined,
    sortOrder: r.sort_order ?? 0,
    isArchived: r.is_archived ?? false,
  }
}

export function useNotebook() {
  const supabase = createClient()
  const [notes, setNotes] = useState<NotebookNote[]>([])
  const [categories, setCategories] = useState<NotebookCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const userIdRef = useRef<string | null>(null)

  // Per-note debounce timers for content autosave, so typing in one note
  // doesn't reset another note's pending save.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Latest not-yet-sent content per note. Kept beside the timer so leaving
  // (unmount, pagehide, tab hidden) can send it right away instead of
  // dropping it together with the cancelled timer.
  const pendingContent = useRef<Record<string, TiptapDoc>>({})

  // In-flight INSERTs keyed by note id. Any UPDATE/DELETE for a just-created
  // note must await this first — otherwise it can reach the server before the
  // INSERT commits, match 0 rows, and silently drop the user's first edits.
  const pendingCreates = useRef<Record<string, Promise<void>>>({})

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

      const [notesRes, catsRes] = await Promise.all([
        supabase
          .from('notebook_notes')
          .select('*')
          .eq('is_archived', false)
          .order('sort_order', { ascending: true }),
        supabase
          .from('notebook_categories')
          .select('*')
          .eq('is_archived', false)
          .order('sort_order', { ascending: true }),
      ])
      const { data, error } = notesRes

      if (!mounted) return
      if (error) {
        console.error('[notebook] load failed', error)
        setLoading(false)
        return
      }
      // Edits that were only backed up locally (the page unloaded before the
      // save landed) and are newer than the server copy: show them and re-send.
      const recovered = takeNewerNotebookDrafts(user.id, (data ?? []).map(rowToNote))
      const recoveredById = new Map(recovered.map((r) => [r.noteId, r]))
      if (catsRes.error) console.error('[notebook] category load failed', catsRes.error)
      else
        setCategories((prev) => {
          // Same merge-not-clobber guard as notes: keep any category created
          // locally while this fetch was in flight.
          const server = (catsRes.data ?? []).map(rowToCategory)
          if (prev.length === 0) return server
          const serverIds = new Set(server.map((c) => c.id))
          const localOnly = prev.filter((c) => !serverIds.has(c.id))
          const local = new Map(prev.map((c) => [c.id, c]))
          return [...localOnly, ...server.map((c) => local.get(c.id) ?? c)]
        })
      setNotes((prev) => {
        // Merge instead of clobber: a note created or edited while this
        // initial fetch was in flight only exists (or is newer) in `prev`.
        // Replacing wholesale unmounts the editor mid-typing (create → type
        // → late response wipes the note → focus drops to <body>).
        const server = (data ?? []).map(rowToNote).map((n) => {
          const r = recoveredById.get(n.id)
          if (!r) return n
          return {
            ...n,
            ...(r.title !== undefined ? { title: r.title } : {}),
            ...(r.content !== undefined ? { content: r.content } : {}),
          }
        })
        if (prev.length === 0) return server
        const local = new Map(prev.map((n) => [n.id, n]))
        const serverIds = new Set(server.map((n) => n.id))
        const localOnly = prev.filter((n) => !serverIds.has(n.id))
        return [...localOnly, ...server.map((n) => local.get(n.id) ?? n)]
      })
      setLoading(false)

      for (const r of recovered) {
        void (async () => {
          const { error: saveError } = await supabase
            .from('notebook_notes')
            .update({
              ...(r.title !== undefined ? { title: r.title } : {}),
              ...(r.content !== undefined ? { content: r.content as unknown as never } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', r.noteId)
          if (saveError) {
            // Keep the draft; the next load tries again.
            console.error('[notebook] draft restore failed', saveError)
            return
          }
          if (r.title !== undefined) clearNotebookDraftField(user.id, r.noteId, 'title', r.title)
          if (r.content !== undefined && !(r.noteId in pendingContent.current)) {
            clearNotebookDraftField(user.id, r.noteId, 'content')
          }
        })()
      }
    })()

    return () => {
      mounted = false
    }
  }, [supabase])

  // ── Create ───────────────────────────────────────────────
  // `categoryId` seeds the note into a folder (the sidebar passes the folder
  // the user is currently viewing); null/omitted means 未分類.
  const createNote = useCallback((categoryId: string | null = null): NotebookNote | null => {
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
      categoryId,
      sortOrder: 0,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    }

    setNotes((prev) => [optimistic, ...prev.map((n) => ({ ...n, sortOrder: n.sortOrder + 10 }))])

    // Return synchronously so the caller can focus the new note NOW —
    // awaiting the INSERT here left the previous note active for a whole
    // round-trip, and the user's first keystrokes landed in the wrong note.
    pendingCreates.current[id] = (async () => {
      const { error } = await supabase.from('notebook_notes').insert({
        id,
        user_id: userId,
        title: '',
        content: null,
        category_id: categoryId,
        sort_order: 0,
        updated_at: now,
      })
      if (error) {
        console.error('[notebook] create failed', error)
        setNotes((prev) => prev.filter((n) => n.id !== id))
        // Hitting the free note cap is explained; other failures stay as before.
        const limitCode = planLimitCode(error)
        if (limitCode === 'NOTE_LIMIT') showPlanLimitToast(limitCode)
      }
      delete pendingCreates.current[id]
    })()
    return optimistic
  }, [supabase])

  // ── Patch helpers (title / icon / category) ──────────────
  const patchNote = useCallback(
    async (id: string, patch: Partial<Pick<NotebookNote, 'title' | 'icon' | 'categoryId'>>) => {
      let snapshot: NotebookNote | undefined
      const now = new Date().toISOString()
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n
          snapshot = n
          return { ...n, ...patch, updatedAt: now }
        }),
      )

      const userId = userIdRef.current
      if (patch.title !== undefined && userId) saveNotebookDraft(userId, id, 'title', patch.title)

      await pendingCreates.current[id]
      const { error } = await supabase
        .from('notebook_notes')
        .update({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.icon !== undefined ? { icon: patch.icon ?? null } : {}),
          ...(patch.categoryId !== undefined ? { category_id: patch.categoryId } : {}),
          updated_at: now,
        })
        .eq('id', id)

      if (!error && patch.title !== undefined && userId) clearNotebookDraftField(userId, id, 'title', patch.title)
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
  // Move a note into a folder (or to 未分類 with null).
  const setNoteCategory = useCallback(
    (id: string, categoryId: string | null) => patchNote(id, { categoryId }),
    [patchNote],
  )

  // ── Content autosave (debounced) ─────────────────────────
  // Updates local state immediately (so switching notes never loses keystrokes)
  // and flushes to Supabase after a short idle window.
  const flushContent = useCallback(
    async (id: string) => {
      clearTimeout(saveTimers.current[id])
      delete saveTimers.current[id]
      if (!(id in pendingContent.current)) return
      const content = pendingContent.current[id]
      delete pendingContent.current[id]
      await pendingCreates.current[id]
      const { error } = await supabase
        .from('notebook_notes')
        .update({ content: content as unknown as never, updated_at: new Date().toISOString() })
        .eq('id', id)
      setSaveStatus(error ? 'error' : 'saved')
      // Server has it — drop the local backup unless newer text is queued.
      if (!error && userIdRef.current && !(id in pendingContent.current)) {
        clearNotebookDraftField(userIdRef.current, id, 'content')
      }
      if (error) {
        console.error('[notebook] content save failed', error)
        // Keep it queued (unless newer text arrived) so the next flush —
        // leaving the page, hiding the tab — tries again.
        if (!(id in pendingContent.current)) pendingContent.current[id] = content
      }
    },
    [supabase],
  )

  const saveNoteContent = useCallback(
    (id: string, content: TiptapDoc) => {
      const now = new Date().toISOString()
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content, updatedAt: now } : n)))
      setSaveStatus('saving')

      pendingContent.current[id] = content
      if (userIdRef.current) saveNotebookDraft(userIdRef.current, id, 'content', content)
      clearTimeout(saveTimers.current[id])
      saveTimers.current[id] = setTimeout(() => void flushContent(id), SAVE_DEBOUNCE_MS)
    },
    [flushContent],
  )

  // Send everything still waiting for its debounce. Runs when the editor goes
  // away (overlay closed, route change), on pagehide and when the tab/app is
  // hidden — the last keystrokes used to be lost with the cancelled timer.
  const flushAllContent = useCallback(() => {
    for (const id of Object.keys(pendingContent.current)) void flushContent(id)
  }, [flushContent])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAllContent()
    }
    window.addEventListener('pagehide', flushAllContent)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flushAllContent)
      document.removeEventListener('visibilitychange', onVisibility)
      flushAllContent()
    }
  }, [flushAllContent])

  // ── Delete ───────────────────────────────────────────────
  const deleteNote = useCallback(
    async (id: string) => {
      let snapshot: NotebookNote[] = []
      setNotes((prev) => {
        snapshot = prev
        return prev.filter((n) => n.id !== id)
      })
      clearTimeout(saveTimers.current[id])
      delete pendingContent.current[id]
      if (userIdRef.current) clearNotebookDraft(userIdRef.current, id)

      await pendingCreates.current[id]
      const { error } = await supabase.from('notebook_notes').delete().eq('id', id)
      if (error) {
        console.error('[notebook] delete failed', error)
        setNotes(snapshot)
      } else if (userIdRef.current) {
        // Notes have no undo, so their now-orphaned images can go.
        scheduleImageCleanupAfterDelete(userIdRef.current)
      }
    },
    [supabase],
  )

  // ── Reorder ──────────────────────────────────────────────
  const reorderNotes = useCallback(
    async (
      orderedIds: string[],
      move?: { id: string; categoryId: string | null },
    ) => {
      const userId = userIdRef.current
      if (!userId) return
      let snapshot: NotebookNote[] = []
      const byId = new Map<string, NotebookNote>()
      const now = new Date().toISOString()

      setNotes((prev) => {
        snapshot = prev
        prev.forEach((n) => byId.set(n.id, n))
        return orderedIds
          .map((id, i) => {
            const n = byId.get(id)
            if (!n) return null
            const isMovedNote = move?.id === id
            return {
              ...n,
              ...(isMovedNote ? { categoryId: move.categoryId, updatedAt: now } : {}),
              sortOrder: i * 10,
            }
          })
          .filter((n): n is NotebookNote => n !== null)
      })

      // Write only what the gesture changed: sort_order, plus category_id for
      // the note dragged into another folder. Upserting whole rows wrote this
      // tab's possibly hours-old title/content over edits made elsewhere and
      // re-inserted notes another device had deleted.
      const patches = orderedIds
        .map((id, i) => {
          const n = byId.get(id)
          if (!n) return null
          const isMovedNote = move?.id === id
          // Every row is written (not just "changed" ones): local sortOrder
          // can drift from the DB (createNote bumps others locally only).
          return {
            id,
            patch: isMovedNote
              ? { sort_order: i * 10, category_id: move.categoryId, updated_at: now }
              : { sort_order: i * 10 },
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      await Promise.all(orderedIds.map((id) => pendingCreates.current[id]))
      const results = await Promise.all(
        patches.map(({ id, patch }) =>
          supabase.from('notebook_notes').update(patch).eq('id', id).eq('user_id', userId),
        ),
      )
      const error = results.find((r) => r.error)?.error
      if (error) {
        console.error('[notebook] reorder failed', error)
        setNotes(snapshot)
      }
    },
    [supabase],
  )

  const moveNote = useCallback(
    (id: string, categoryId: string | null, orderedIds: string[]) =>
      reorderNotes(orderedIds, { id, categoryId }),
    [reorderNotes],
  )

  // ── Category CRUD (notebook-only folders) ────────────────
  const createCategory = useCallback(
    (name = ''): NotebookCategory | null => {
      const userId = userIdRef.current
      if (!userId) return null
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const optimistic: NotebookCategory = {
        id,
        name,
        color: 'oklch(0.62 0.08 250)',
        icon: undefined,
        sortOrder: (categories.at(-1)?.sortOrder ?? -10) + 10,
        isArchived: false,
      }
      setCategories((prev) => [...prev, optimistic])

      pendingCreates.current[id] = (async () => {
        const { error } = await supabase.from('notebook_categories').insert({
          id,
          user_id: userId,
          name,
          color: optimistic.color,
          sort_order: optimistic.sortOrder,
          updated_at: now,
        })
        if (error) {
          console.error('[notebook] category create failed', error)
          setCategories((prev) => prev.filter((c) => c.id !== id))
        }
        delete pendingCreates.current[id]
      })()
      return optimistic
    },
    [supabase, categories],
  )

  const patchCategory = useCallback(
    async (id: string, patch: Partial<Pick<NotebookCategory, 'name' | 'icon' | 'color'>>) => {
      let snapshot: NotebookCategory | undefined
      const now = new Date().toISOString()
      setCategories((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c
          snapshot = c
          return { ...c, ...patch }
        }),
      )
      await pendingCreates.current[id]
      const { error } = await supabase
        .from('notebook_categories')
        .update({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.icon !== undefined ? { icon: patch.icon ?? null } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          updated_at: now,
        })
        .eq('id', id)
      if (error && snapshot) {
        console.error('[notebook] category patch failed', error)
        const prevSnapshot = snapshot
        setCategories((prev) => prev.map((c) => (c.id === id ? prevSnapshot : c)))
      }
    },
    [supabase],
  )

  const renameCategory = useCallback((id: string, name: string) => patchCategory(id, { name }), [patchCategory])
  const setCategoryIcon = useCallback(
    (id: string, icon: string | undefined) => patchCategory(id, { icon }),
    [patchCategory],
  )
  const setCategoryColor = useCallback((id: string, color: string) => patchCategory(id, { color }), [patchCategory])

  // Deleting a folder keeps its notes: the ON DELETE SET NULL FK drops them to
  // 未分類 on the server, and we mirror that optimistically here.
  const deleteCategory = useCallback(
    async (id: string) => {
      let catSnapshot: NotebookCategory[] = []
      let noteSnapshot: NotebookNote[] = []
      setCategories((prev) => {
        catSnapshot = prev
        return prev.filter((c) => c.id !== id)
      })
      setNotes((prev) => {
        noteSnapshot = prev
        return prev.map((n) => (n.categoryId === id ? { ...n, categoryId: null } : n))
      })
      await pendingCreates.current[id]
      const { error } = await supabase.from('notebook_categories').delete().eq('id', id)
      if (error) {
        console.error('[notebook] category delete failed', error)
        setCategories(catSnapshot)
        setNotes(noteSnapshot)
      }
    },
    [supabase],
  )

  const reorderCategories = useCallback(
    async (orderedIds: string[]) => {
      const userId = userIdRef.current
      if (!userId) return
      let snapshot: NotebookCategory[] = []
      const byId = new Map<string, NotebookCategory>()
      setCategories((prev) => {
        snapshot = prev
        prev.forEach((c) => byId.set(c.id, c))
        return orderedIds
          .map((id, i) => {
            const c = byId.get(id)
            return c ? { ...c, sortOrder: i * 10 } : null
          })
          .filter((c): c is NotebookCategory => c !== null)
      })
      // sort_order only — same reason as reorderNotes (no stale name/color
      // overwrites, no resurrecting folders deleted on another device).
      const orders = orderedIds
        .map((id, i) => {
          const c = byId.get(id)
          return c ? { id, sort_order: i * 10 } : null
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      await Promise.all(orders.map(({ id }) => pendingCreates.current[id]))
      const results = await Promise.all(
        orders.map(({ id, sort_order }) =>
          supabase.from('notebook_categories').update({ sort_order }).eq('id', id).eq('user_id', userId),
        ),
      )
      const error = results.find((r) => r.error)?.error
      if (error) {
        console.error('[notebook] category reorder failed', error)
        setCategories(snapshot)
      }
    },
    [supabase],
  )

  // ── Image upload (Supabase Storage) ──────────────────────
  // Uploads under {user_id}/{uuid}.{ext} and returns a public URL. The bucket
  // is public but paths are unguessable, so URLs are stable (never expire) and
  // the RLS insert policy still confines a user to their own prefix.
  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      const userId = userIdRef.current
      if (!userId) throw new Error(t('尚未登入'))
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${userId}/${crypto.randomUUID()}.${ext}`
      // Friendly pre-check; a no-op unless the server says limits are on.
      await assertImageQuota()
      const { error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, { cacheControl: '3600', contentType: file.type || undefined })
      if (error) {
        console.error('[notebook] image upload failed', error)
        throw await explainUploadError(error)
      }
      const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path)
      return data.publicUrl
    },
    [supabase],
  )

  return {
    notes,
    categories,
    loading,
    saveStatus,
    createNote,
    renameNote,
    setNoteIcon,
    setNoteCategory,
    saveNoteContent,
    deleteNote,
    reorderNotes,
    moveNote,
    createCategory,
    renameCategory,
    setCategoryIcon,
    setCategoryColor,
    deleteCategory,
    reorderCategories,
    uploadImage,
  }
}
