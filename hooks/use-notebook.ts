'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { NotebookNote, NotebookCategory, TiptapDoc } from '@/lib/types'
import type { Database } from '@/lib/supabase/database.types'
import { t } from '@/lib/i18n'

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
        const server = (data ?? []).map(rowToNote)
        if (prev.length === 0) return server
        const local = new Map(prev.map((n) => [n.id, n]))
        const serverIds = new Set(server.map((n) => n.id))
        const localOnly = prev.filter((n) => !serverIds.has(n.id))
        return [...localOnly, ...server.map((n) => local.get(n.id) ?? n)]
      })
      setLoading(false)
    })()

    const timers = saveTimers.current
    return () => {
      mounted = false
      Object.values(timers).forEach(clearTimeout)
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
  const saveNoteContent = useCallback(
    (id: string, content: TiptapDoc) => {
      const now = new Date().toISOString()
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content, updatedAt: now } : n)))
      setSaveStatus('saving')

      clearTimeout(saveTimers.current[id])
      saveTimers.current[id] = setTimeout(async () => {
        await pendingCreates.current[id]
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

      await pendingCreates.current[id]
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
            // upsert writes the whole row — omitting category_id would reset
            // every reordered note back to 未分類. Carry it through.
            category_id: n.categoryId,
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
      const rows = orderedIds
        .map((id, i) => {
          const c = byId.get(id)
          if (!c) return null
          return { id, user_id: userId, name: c.name, color: c.color, sort_order: i * 10 }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      const { error } = await supabase.from('notebook_categories').upsert(rows)
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
      const { error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, { cacheControl: '3600', contentType: file.type || undefined })
      if (error) {
        console.error('[notebook] image upload failed', error)
        throw error
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
    createCategory,
    renameCategory,
    setCategoryIcon,
    setCategoryColor,
    deleteCategory,
    reorderCategories,
    uploadImage,
  }
}
