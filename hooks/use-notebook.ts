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
  clearNotebookDraftIfUnchanged,
  isNotebookDraftUnchanged,
  readNotebookDrafts,
  rebaseNotebookDraft,
  type StoredNotebookDraft,
} from '@/lib/notebook-draft'
import { conflictCopyId, decideAfterMiss } from '@/lib/note-sync'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { toast } from 'sonner'

type NotebookNotesRow = Database['public']['Tables']['notebook_notes']['Row']
type NotebookCategoriesRow = Database['public']['Tables']['notebook_categories']['Row']
type SupabaseClient = ReturnType<typeof createClient>

// ── Version-locked saves (see lib/note-sync.ts) ─────────────
// Content (and restored drafts) are written with
// `.eq('updated_at', token)`: a save based on a version the server no
// longer has can't overwrite another device's newer text. On a real
// conflict the server version stays in the note and this device's text is
// saved as a new "（衝突副本）" note — nothing is dropped either way.

type NoteSyncResult =
  | { kind: 'saved'; updatedAt: string }
  | { kind: 'same'; row: NotebookNotesRow }
  | { kind: 'copied'; row: NotebookNotesRow | null; copy: NotebookNotesRow }
  | { kind: 'error'; error: unknown }

async function syncNoteWithLock(
  supabase: SupabaseClient,
  a: {
    userId: string
    noteId: string
    title?: string
    content?: TiptapDoc | null
    /** Server version the edit is based on; undefined = unknown. */
    token: string | undefined
    /** Server content at `token`, when known (lets a title-only change made
     *  elsewhere be rebased over instead of reported as a conflict). */
    base?: { content: TiptapDoc | null }
    /** How the note looks on this device, to name/place the copy. */
    local?: { title: string; icon?: string; categoryId: string | null }
  },
): Promise<NoteSyncResult> {
  const payload = {
    ...(a.title !== undefined ? { title: a.title } : {}),
    ...(a.content !== undefined ? { content: a.content as unknown as never } : {}),
  }
  let token = a.token
  let row: NotebookNotesRow | null = null
  for (let attempt = 0; ; attempt++) {
    if (token) {
      const { data, error } = await supabase
        .from('notebook_notes')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', a.noteId)
        .eq('updated_at', token)
        .select('updated_at')
      if (error) return { kind: 'error', error }
      if (data && data.length > 0) return { kind: 'saved', updatedAt: data[0].updated_at }
    }
    // Zero rows: the server is at a version we haven't seen. Look at it.
    const res = await supabase.from('notebook_notes').select('*').eq('id', a.noteId).maybeSingle()
    if (res.error) return { kind: 'error', error: res.error }
    row = res.data
    const decision = decideAfterMiss(row, { title: a.title, content: a.content }, a.base)
    if (decision === 'same' && row) return { kind: 'same', row }
    if (decision === 'rebase' && row) {
      if (attempt >= 2) return { kind: 'error', error: new Error('note keeps changing; will retry') }
      token = row.updated_at
      continue
    }
    break // 'conflict' or 'gone'
  }

  const copyId = conflictCopyId(a.noteId, { title: a.title, content: a.content })
  const baseTitle = (a.title ?? a.local?.title ?? row?.title ?? '').trim() || t('無標題')
  const ins = await supabase
    .from('notebook_notes')
    .insert({
      id: copyId,
      user_id: a.userId,
      title: t('{title}（衝突副本）', { title: baseTitle }),
      content: (a.content !== undefined ? a.content : (row?.content ?? null)) as unknown as never,
      icon: row ? row.icon : (a.local?.icon ?? null),
      category_id: row ? row.category_id : (a.local?.categoryId ?? null),
      sort_order: row?.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (!ins.error && ins.data) return { kind: 'copied', row, copy: ins.data }
  // Same copy already made (another tab / instance / a retry whose answer
  // was lost): the deterministic id makes the second INSERT a duplicate.
  if (ins.error?.code === '23505') {
    const again = await supabase.from('notebook_notes').select('*').eq('id', copyId).maybeSingle()
    if (!again.error && again.data) return { kind: 'copied', row, copy: again.data }
  }
  return { kind: 'error', error: ins.error }
}

function notifyNoteConflict(copyTitle: string) {
  toast.warning(
    t('這篇筆記在其他裝置上也改過了。那邊的版本留在原筆記，這台的內容另存為「{title}」。', { title: copyTitle }),
    { duration: 15000, id: `notebook-conflict-${copyTitle}` },
  )
}

// Drafts left by an earlier page load are written back once per page per
// user, BEFORE any notebook instance lists notes (useNotebook is mounted by
// several components at once) — so every instance sees the outcome and no
// two instances race each other over the same draft. Resolves to the drafts
// that could not be settled (offline…); they stay on the device.
const draftRestores = new Map<string, Promise<StoredNotebookDraft[]>>()

function restoreNotebookDrafts(supabase: SupabaseClient, userId: string): Promise<StoredNotebookDraft[]> {
  let p = draftRestores.get(userId)
  if (!p) {
    p = (async () => {
      const failed: StoredNotebookDraft[] = []
      await Promise.all(
        readNotebookDrafts(userId).map(async (d) => {
          const r = await syncNoteWithLock(supabase, {
            userId,
            noteId: d.noteId,
            title: d.draft.title,
            content: d.draft.content,
            token: d.draft.base,
          })
          if (r.kind === 'error') {
            console.error('[notebook] draft restore failed', r.error)
            failed.push(d)
            return
          }
          clearNotebookDraftIfUnchanged(userId, d.noteId, d.raw)
          if (r.kind === 'copied') notifyNoteConflict(r.copy.title)
        }),
      )
      return failed
    })()
    draftRestores.set(userId, p)
  }
  return p
}

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

  // Per note: the server version token this device last read or wrote
  // (updated_at exactly as returned), and the content the server had at that
  // version (absent = unknown). See syncNoteWithLock.
  const versionRef = useRef<Record<string, string>>({})
  const baseRef = useRef<Record<string, TiptapDoc | null>>({})
  // Writes that use a note's version token run one at a time per note, so a
  // second save never goes out with the token the first one is replacing.
  const noteChains = useRef<Record<string, Promise<unknown>>>({})
  const enqueue = useCallback(<T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    const p = (noteChains.current[id] ?? Promise.resolve()).then(fn, fn)
    noteChains.current[id] = p.catch(() => undefined)
    return p
  }, [])
  const notesRef = useRef<NotebookNote[]>([])
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

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

      // Write back (or turn into conflict copies) edits a previous page load
      // only managed to back up locally — before listing, so the list below
      // already shows the outcome.
      const unsettledDrafts = await restoreNotebookDrafts(supabase, user.id)
      if (!mounted) return

      const [notesRes, catsRes] = await Promise.all([
        // Paged: PostgREST returns at most 1000 rows per request.
        fetchAllRows((from, to) =>
          supabase
            .from('notebook_notes')
            .select('*', { count: 'exact' })
            .eq('is_archived', false)
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        ),
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
      for (const r of data ?? []) {
        if (r.id in versionRef.current) continue // a save from this tab already moved it on
        versionRef.current[r.id] = r.updated_at
        baseRef.current[r.id] = (r.content as TiptapDoc | null) ?? null
      }
      // Drafts the restore above couldn't settle (offline…) stay on the
      // device. Show them, and make the next save of that note carry the
      // draft's own base version: if the server moved on meanwhile, that
      // save becomes a conflict copy instead of overwriting the other side.
      const recoveredById = new Map<string, { title?: string; content?: TiptapDoc }>()
      for (const d of unsettledDrafts) {
        if (!isNotebookDraftUnchanged(user.id, d.noteId, d.raw)) continue
        recoveredById.set(d.noteId, d.draft)
        if (d.draft.base) versionRef.current[d.noteId] = d.draft.base
        else delete versionRef.current[d.noteId]
        delete baseRef.current[d.noteId]
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
      const { data: created, error } = await supabase
        .from('notebook_notes')
        .insert({
          id,
          user_id: userId,
          title: '',
          content: null,
          category_id: categoryId,
          sort_order: 0,
          updated_at: now,
        })
        .select('updated_at')
        .single()
      if (!error && created) {
        versionRef.current[id] = created.updated_at
        baseRef.current[id] = null
        // Typing that started before this answer was backed up without a base.
        rebaseNotebookDraft(userId, id, created.updated_at)
      }
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
      if (patch.title !== undefined && userId) {
        saveNotebookDraft(userId, id, 'title', patch.title, versionRef.current[id])
      }

      const fields = {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon ?? null } : {}),
        ...(patch.categoryId !== undefined ? { category_id: patch.categoryId } : {}),
        updated_at: now,
      }
      // Title / icon / folder are single fields (last write wins, as before),
      // but they bump updated_at. Try against our version first so the token
      // can follow; if the server already moved on, write the field anyway
      // and leave the token stale — the next content save then re-checks.
      const error = await enqueue(id, async () => {
        await pendingCreates.current[id]
        const token = versionRef.current[id]
        if (token) {
          const locked = await supabase
            .from('notebook_notes')
            .update(fields)
            .eq('id', id)
            .eq('updated_at', token)
            .select('updated_at')
          if (locked.error) return locked.error
          if (locked.data && locked.data.length > 0) {
            versionRef.current[id] = locked.data[0].updated_at
            if (userId) rebaseNotebookDraft(userId, id, locked.data[0].updated_at)
            return null
          }
        }
        const { error: plainError } = await supabase.from('notebook_notes').update(fields).eq('id', id)
        return plainError
      })

      if (!error && patch.title !== undefined && userId) clearNotebookDraftField(userId, id, 'title', patch.title)
      if (error && snapshot) {
        console.error('[notebook] patch failed', error)
        const prevSnapshot = snapshot
        setNotes((prev) => prev.map((n) => (n.id === id ? prevSnapshot : n)))
      }
    },
    [supabase, enqueue],
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
  // The ref breaks the flushContent ↔ applyConflict cycle (text typed while a
  // conflict was being resolved is re-queued on the copy).
  const flushContentRef = useRef<(id: string) => Promise<void>>(async () => {})

  // A save hit a version this device hadn't seen and the content really
  // differs: the original note now shows the server's version, this
  // device's text lives on in the copy, and the user is told.
  const applyConflict = useCallback(
    (id: string, userId: string, row: NotebookNotesRow | null, copy: NotebookNotesRow) => {
      versionRef.current[copy.id] = copy.updated_at
      baseRef.current[copy.id] = (copy.content as TiptapDoc | null) ?? null
      if (row) {
        versionRef.current[id] = row.updated_at
        baseRef.current[id] = (row.content as TiptapDoc | null) ?? null
      }
      // Anything typed while this was resolving continues this device's
      // version, so it goes to the copy too.
      const newer = pendingContent.current[id]
      if (newer !== undefined) {
        delete pendingContent.current[id]
        clearTimeout(saveTimers.current[id])
        delete saveTimers.current[id]
      }
      clearNotebookDraft(userId, id)
      setNotes((prev) => {
        const orig = prev.find((n) => n.id === id)
        const copyNote: NotebookNote = { ...rowToNote(copy), ...(newer !== undefined ? { content: newer } : {}) }
        const rest = prev.filter((n) => n.id !== copy.id)
        const out: NotebookNote[] = []
        for (const n of rest) {
          if (n.id !== id) {
            out.push(n)
            continue
          }
          out.push(copyNote)
          // syncRev makes an open editor load the server text (it otherwise
          // only reloads when the note id changes).
          if (row) out.push({ ...rowToNote(row), syncRev: (orig?.syncRev ?? 0) + 1 })
        }
        if (!orig) out.unshift(copyNote)
        return out
      })
      if (newer !== undefined) {
        pendingContent.current[copy.id] = newer
        saveNotebookDraft(userId, copy.id, 'content', newer, copy.updated_at)
        void flushContentRef.current(copy.id)
      }
      notifyNoteConflict(copy.title)
    },
    [],
  )

  const flushContent = useCallback(
    (id: string): Promise<void> => {
      clearTimeout(saveTimers.current[id])
      delete saveTimers.current[id]
      if (!(id in pendingContent.current)) return Promise.resolve()
      // Taken synchronously, so pagehide + visibilitychange + unmount firing
      // together still send it once.
      const content = pendingContent.current[id]
      delete pendingContent.current[id]
      return enqueue(id, async () => {
        await pendingCreates.current[id]
        const userId = userIdRef.current
        const local = notesRef.current.find((n) => n.id === id)
        const r = userId
          ? await syncNoteWithLock(supabase, {
              userId,
              noteId: id,
              content,
              token: versionRef.current[id],
              base: id in baseRef.current ? { content: baseRef.current[id] } : undefined,
              local: local ? { title: local.title, icon: local.icon, categoryId: local.categoryId } : undefined,
            })
          : ({ kind: 'error', error: new Error('not signed in') } as const)
        if (r.kind === 'error') {
          console.error('[notebook] content save failed', r.error)
          setSaveStatus('error')
          // Keep it queued (unless newer text arrived) so the next flush —
          // leaving the page, hiding the tab — tries again. The retry is
          // version-checked too, so it can't overwrite a newer save made on
          // another device in the meantime.
          if (!(id in pendingContent.current)) pendingContent.current[id] = content
          return
        }
        setSaveStatus('saved')
        if (r.kind === 'copied') {
          applyConflict(id, userId!, r.row, r.copy)
          return
        }
        const token = r.kind === 'saved' ? r.updatedAt : r.row.updated_at
        versionRef.current[id] = token
        baseRef.current[id] = content
        // Server has it — drop the local backup unless newer text is queued
        // (that one now builds on the version just written).
        if (!(id in pendingContent.current)) clearNotebookDraftField(userId!, id, 'content')
        rebaseNotebookDraft(userId!, id, token)
      })
    },
    [supabase, enqueue, applyConflict],
  )
  useEffect(() => {
    flushContentRef.current = flushContent
  }, [flushContent])

  const saveNoteContent = useCallback(
    (id: string, content: TiptapDoc) => {
      const now = new Date().toISOString()
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content, updatedAt: now } : n)))
      setSaveStatus('saving')

      pendingContent.current[id] = content
      if (userIdRef.current) saveNotebookDraft(userIdRef.current, id, 'content', content, versionRef.current[id])
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
