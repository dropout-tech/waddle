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
  readNotebookDraft,
  readNotebookDrafts,
  rebaseNotebookDraft,
  DRAFT_WRITER,
} from '@/lib/notebook-draft'
import { conflictCopyId, contentHash, decideAfterMiss } from '@/lib/note-sync'
import { registerPendingWrites } from '@/lib/pending-writes'
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
  /** copyBlocked: a conflict copy was needed but the plan's note limit
   *  refused it — the text stays queued + backed up on this device. */
  | { kind: 'error'; error: unknown; copyBlocked?: boolean }

/** What the server had at the version an edit is based on, when known. */
type NoteBase = { content: TiptapDoc | null } | { hash: string }

async function syncNoteWithLock(
  supabase: SupabaseClient,
  a: {
    userId: string
    noteId: string
    title?: string
    content?: TiptapDoc | null
    /** Server version the edit is based on; undefined = unknown. */
    token: string | undefined
    /** Server content at `token`, when known (lets a change made elsewhere
     *  that didn't touch the text be rebased over instead of reported as a
     *  conflict). */
    base?: NoteBase
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
  return { kind: 'error', error: ins.error, copyBlocked: planLimitCode(ins.error) === 'NOTE_LIMIT' }
}

function notifyNoteConflict(copyTitle: string) {
  toast.warning(
    t('這篇筆記在其他裝置上也改過了。那邊的版本留在原筆記，這台的內容另存為「{title}」。', { title: copyTitle }),
    { duration: 15000, id: `notebook-conflict-${copyTitle}` },
  )
}

function notifyCopyBlocked() {
  toast.error(
    t('這篇筆記在其他裝置上也改過了，但筆記數量已達方案上限，沒辦法另存一份。這台的內容還保留在這台裝置上：刪掉一些筆記或升級後，下次存檔會再試一次；在那之前請不要登出。'),
    { duration: 20000, id: 'notebook-copy-blocked' },
  )
}

// ── Coordination between useNotebook instances on one page ──
// The hook is mounted by several components at once (workspace, widget sync)
// and the notebook overlay remounts it every time it opens, so what one
// instance leaves behind (an unsent retry, a backed-up draft) must be visible
// to the next.

// One write at a time per note, across instances: a restore never runs
// while another instance's save of the same note is still in flight.
const noteChains = new Map<string, Promise<void>>()
function enqueueNote<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const p = (noteChains.get(id) ?? Promise.resolve()).then(fn, fn)
  const tail = p.then(() => undefined, () => undefined)
  noteChains.set(id, tail)
  void tail.then(() => {
    if (noteChains.get(id) === tail) noteChains.delete(id)
  })
  return p
}
/** Resolves once every write queued so far (and any queued meanwhile) is done. */
async function allNoteWork() {
  while (noteChains.size > 0) await Promise.all([...noteChains.values()])
}
/** A request that never answers (captive Wi-Fi, stalled tunnel) must not
 *  hold the notebook or sign-out forever: after `ms`, go on with `fallback`. */
const NOTE_WAIT_MS = 5000
function withTimeout<T>(p: Promise<T>, fallback: T, ms = NOTE_WAIT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}
// Sign-out also waits for saves an already-unmounted instance (overlay just
// closed) queued on its way out.
registerPendingWrites(allNoteWork)

// Note id → the mounted instance still holding unsent text for it (its
// draft is that instance's live backup, not something to restore).
const draftOwners = new Map<string, symbol>()

// Other windows of this browser (a second tab, the floating note window)
// share localStorage but not this module. Before re-sending a draft another
// window wrote, ask whether that window is still open and holding the note;
// a reloaded or closed page can't answer, so its drafts are restored.
const draftChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel('huddle-notebook-drafts') : null
draftChannel?.addEventListener('message', (e: MessageEvent) => {
  const m = e.data as { type?: string; noteId?: string; ask?: string }
  if (m?.type === 'holding?' && m.noteId && draftOwners.has(m.noteId)) {
    draftChannel.postMessage({ type: 'holding', ask: m.ask })
  }
})
function ownedInAnotherWindow(noteId: string): Promise<boolean> {
  const channel = draftChannel
  if (!channel) return Promise.resolve(false)
  const ask = Math.random().toString(36).slice(2)
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string; ask?: string })?.type === 'holding' && e.data.ask === ask) done(true)
    }
    const done = (held: boolean) => {
      clearTimeout(timer)
      channel.removeEventListener('message', onMessage)
      resolve(held)
    }
    const timer = setTimeout(() => done(false), 250)
    channel.addEventListener('message', onMessage)
    channel.postMessage({ type: 'holding?', noteId, ask })
  })
}

// In-flight draft restores, by note: concurrent mounts share one.
const restoring = new Map<string, Promise<boolean>>()

/** Write back (or turn into a conflict copy) one backed-up draft. Resolves
 *  false when it couldn't be settled (offline, copy refused) — the draft
 *  stays on the device. Runs on every mount: drafts made earlier in this
 *  page's life (overlay closed while offline) must come back too. */
function restoreDraft(supabase: SupabaseClient, userId: string, noteId: string, owner: symbol): Promise<boolean> {
  const key = `${userId}:${noteId}`
  let p = restoring.get(key)
  if (!p) {
    p = enqueueNote(noteId, async () => {
      const holder = draftOwners.get(noteId)
      if (holder && holder !== owner) return true // still being edited here
      const d = readNotebookDraft(userId, noteId)
      if (!d) return true
      if (d.draft.writer && d.draft.writer !== DRAFT_WRITER && (await ownedInAnotherWindow(noteId))) {
        return true // another open window is still editing it
      }
      const r = await syncNoteWithLock(supabase, {
        userId,
        noteId,
        title: d.draft.title,
        content: d.draft.content,
        token: d.draft.base,
        base: d.draft.base && d.draft.baseHash ? { hash: d.draft.baseHash } : undefined,
      })
      if (r.kind === 'error') {
        console.error('[notebook] draft restore failed', r.error)
        if (r.copyBlocked) notifyCopyBlocked()
        return false
      }
      clearNotebookDraftIfUnchanged(userId, noteId, d.raw)
      if (r.kind === 'copied') notifyNoteConflict(r.copy.title)
      return true
    }).finally(() => restoring.delete(key))
    restoring.set(key, p)
  }
  return p
}

// Drafts no mounted instance holds — the notebook was closed while offline,
// or only a non-editing instance (widget sync) is mounted — used to wait
// until the notebook was opened again. They are re-sent when the connection
// comes back and before sign-out (which then counts whatever is left).
// A note an open editor holds is skipped by restoreDraft and sent by it.
const UNHELD = Symbol('unheld-drafts')
export async function restoreUnheldNotebookDrafts(): Promise<void> {
  if (typeof window === 'undefined') return
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user.id
  if (!userId) return
  await Promise.all(
    readNotebookDrafts(userId)
      .filter((d) => !draftOwners.has(d.noteId))
      .map((d) => withTimeout(restoreDraft(supabase, userId, d.noteId, UNHELD), false)),
  )
}
registerPendingWrites(restoreUnheldNotebookDrafts)
if (typeof window !== 'undefined') window.addEventListener('online', () => void restoreUnheldNotebookDrafts())

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

/**
 * `editor`: this instance shows notes for editing (notebook workspace,
 * floating note). A draft its first load couldn't send is then taken over
 * — queued like unsent typing, sent on reconnect / leaving / sign-out — so
 * nothing else re-sends it behind the editor's back (the editor would keep
 * an outdated version token and its next save would look like a conflict).
 * Non-editing instances (widget sync) leave such drafts to
 * restoreUnheldNotebookDrafts.
 */
export function useNotebook({ editor = false }: { editor?: boolean } = {}) {
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

  // Per note: the server version token this instance last read or wrote
  // (updated_at exactly as returned), and what the server had at that
  // version (absent = unknown). See syncNoteWithLock.
  const versionRef = useRef<Record<string, string>>({})
  const baseRef = useRef<Record<string, NoteBase>>({})
  // contentHash of baseRef, computed on demand (drafts store it).
  const baseHashCache = useRef<Record<string, string>>({})
  const setBase = useCallback((id: string, base: NoteBase | undefined) => {
    delete baseHashCache.current[id]
    if (base) baseRef.current[id] = base
    else delete baseRef.current[id]
  }, [])
  const baseHashOf = useCallback((id: string): string | undefined => {
    const b = baseRef.current[id]
    if (!b) return undefined
    if ('hash' in b) return b.hash
    return (baseHashCache.current[id] ??= contentHash(b.content))
  }, [])
  // Identifies this instance in draftOwners.
  const ownerRef = useRef<symbol>(Symbol('useNotebook'))
  // patchNote is declared below the initial load, which needs it to send a
  // recovered draft's title.
  const sendTitleRef = useRef<(id: string, title: string) => Promise<void>>(async () => {})
  const notesRef = useRef<NotebookNote[]>([])
  // Original note id → its conflict copy, between applyConflict and the
  // render that swaps the editor to the server text: a keystroke in that
  // gap still carries this device's text and belongs to the copy.
  const redirectRef = useRef<Record<string, string>>({})
  useEffect(() => {
    notesRef.current = notes
    // Runs after the editors' own effects of this commit (children first),
    // i.e. after they loaded the new syncRev.
    redirectRef.current = {}
  }, [notes])

  // ── Initial load ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    const owner = ownerRef.current
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        if (mounted) setLoading(false)
        return
      }
      userIdRef.current = user.id

      // Write back (or turn into conflict copies) edits that only made it
      // into the local backup — from an earlier page load, or from an
      // earlier mount on this page (the overlay closed while offline).
      // Then wait for every queued write so the list below shows the result.
      // Each wait is capped: a stalled request counts as "not settled" and
      // its draft is shown below instead of keeping the notebook loading.
      const restored = await Promise.all(
        readNotebookDrafts(user.id).map(async (d) =>
          (await withTimeout(restoreDraft(supabase, user.id, d.noteId, owner), false)) ? null : d.noteId,
        ),
      )
      await withTimeout(allNoteWork(), undefined)
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
        if (r.id in versionRef.current) continue // a save from this instance already moved it on
        versionRef.current[r.id] = r.updated_at
        setBase(r.id, { content: (r.content as TiptapDoc | null) ?? null })
      }
      // Drafts that couldn't be settled (offline, copy refused) stay on the
      // device. Show them, and make the next save of that note carry the
      // draft's own base version: if the server moved on meanwhile, that
      // save becomes a conflict copy instead of overwriting the other side.
      const recoveredById = new Map<string, { title?: string; content?: TiptapDoc }>()
      for (const noteId of restored) {
        if (!noteId) continue
        const d = readNotebookDraft(user.id, noteId)
        if (!d) continue
        recoveredById.set(noteId, d.draft)
        if (d.draft.base) versionRef.current[noteId] = d.draft.base
        else delete versionRef.current[noteId]
        setBase(noteId, d.draft.base && d.draft.baseHash ? { hash: d.draft.baseHash } : undefined)
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
      // An editor takes over the drafts it shows (see `editor`): the text is
      // queued as if typed here and the backup re-stamped as this page's.
      if (editor) {
        for (const [noteId, d] of recoveredById) {
          if (draftOwners.has(noteId)) continue
          if (d.content !== undefined && !(noteId in pendingContent.current)) {
            const fresh = readNotebookDraft(user.id, noteId)
            if (fresh?.draft.content === undefined) continue // settled meanwhile
            pendingContent.current[noteId] = fresh.draft.content
            saveNotebookDraft(user.id, noteId, 'content', fresh.draft.content, fresh.draft.base, fresh.draft.baseHash)
            draftOwners.set(noteId, owner)
          }
          if (d.title !== undefined) void sendTitleRef.current(noteId, d.title)
        }
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [supabase, setBase, editor])

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
        setBase(id, { content: null })
        // Typing that started before this answer was backed up without a base.
        rebaseNotebookDraft(userId, id, created.updated_at, baseHashOf(id))
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
  }, [supabase, setBase, baseHashOf])

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
        saveNotebookDraft(userId, id, 'title', patch.title, versionRef.current[id], baseHashOf(id))
        draftOwners.set(id, ownerRef.current)
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
      const error = await enqueueNote(id, async () => {
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
            if (userId) rebaseNotebookDraft(userId, id, locked.data[0].updated_at, baseHashOf(id))
            return null
          }
        }
        const { error: plainError } = await supabase.from('notebook_notes').update(fields).eq('id', id)
        return plainError
      })

      if (!error && patch.title !== undefined && userId) clearNotebookDraftField(userId, id, 'title', patch.title)
      // The title write is over (saved, or rolled back below): stop telling
      // other windows this one is editing the note, unless unsent text is
      // still queued here.
      if (draftOwners.get(id) === ownerRef.current && !(id in pendingContent.current)) draftOwners.delete(id)
      if (error && snapshot) {
        console.error('[notebook] patch failed', error)
        const prevSnapshot = snapshot
        setNotes((prev) => prev.map((n) => (n.id === id ? prevSnapshot : n)))
      }
    },
    [supabase, baseHashOf],
  )

  const renameNote = useCallback((id: string, title: string) => patchNote(id, { title }), [patchNote])
  useEffect(() => {
    sendTitleRef.current = (id, title) => patchNote(id, { title })
  }, [patchNote])
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
      setBase(copy.id, { content: (copy.content as TiptapDoc | null) ?? null })
      if (row) {
        versionRef.current[id] = row.updated_at
        setBase(id, { content: (row.content as TiptapDoc | null) ?? null })
      }
      // Until the editor shows the server text, keystrokes go to the copy.
      redirectRef.current[id] = copy.id
      // Anything typed while this was resolving continues this device's
      // version, so it goes to the copy too.
      const newer = pendingContent.current[id]
      if (newer !== undefined) {
        delete pendingContent.current[id]
        clearTimeout(saveTimers.current[id])
        delete saveTimers.current[id]
      }
      clearNotebookDraft(userId, id)
      if (draftOwners.get(id) === ownerRef.current) draftOwners.delete(id)
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
        saveNotebookDraft(userId, copy.id, 'content', newer, copy.updated_at, baseHashOf(copy.id))
        draftOwners.set(copy.id, ownerRef.current)
        void flushContentRef.current(copy.id)
      }
      notifyNoteConflict(copy.title)
    },
    [setBase, baseHashOf],
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
      return enqueueNote(id, async () => {
        await pendingCreates.current[id]
        const userId = userIdRef.current
        const local = notesRef.current.find((n) => n.id === id)
        const r = userId
          ? await syncNoteWithLock(supabase, {
              userId,
              noteId: id,
              content,
              token: versionRef.current[id],
              base: baseRef.current[id],
              local: local ? { title: local.title, icon: local.icon, categoryId: local.categoryId } : undefined,
            })
          : ({ kind: 'error', error: new Error('not signed in') } as NoteSyncResult)
        if (r.kind === 'error') {
          console.error('[notebook] content save failed', r.error)
          setSaveStatus('error')
          if (r.copyBlocked) notifyCopyBlocked()
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
        setBase(id, { content })
        // Server has it — drop the local backup unless newer text is queued
        // (that one now builds on the version just written).
        if (!(id in pendingContent.current)) clearNotebookDraftField(userId!, id, 'content')
        rebaseNotebookDraft(userId!, id, token, baseHashOf(id))
        if (!readNotebookDraft(userId!, id) && draftOwners.get(id) === ownerRef.current) draftOwners.delete(id)
      })
    },
    [supabase, applyConflict, setBase, baseHashOf],
  )
  useEffect(() => {
    flushContentRef.current = flushContent
  }, [flushContent])

  const saveNoteContent = useCallback(
    (editedId: string, content: TiptapDoc) => {
      // The editor may still show this device's text for a note whose
      // conflict was just resolved (see redirectRef): that edit continues
      // the copy, not the original that now holds the other device's text.
      const id = redirectRef.current[editedId] ?? editedId
      const now = new Date().toISOString()
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content, updatedAt: now } : n)))
      setSaveStatus('saving')

      pendingContent.current[id] = content
      if (userIdRef.current) {
        saveNotebookDraft(userIdRef.current, id, 'content', content, versionRef.current[id], baseHashOf(id))
        draftOwners.set(id, ownerRef.current)
      }
      clearTimeout(saveTimers.current[id])
      saveTimers.current[id] = setTimeout(() => void flushContent(id), SAVE_DEBOUNCE_MS)
    },
    [flushContent, baseHashOf],
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
    // Text whose save failed offline goes out as soon as the connection is back.
    window.addEventListener('online', flushAllContent)
    document.addEventListener('visibilitychange', onVisibility)
    // Signing out sends everything first and waits for it (lib/auth/sign-out).
    const unregister = registerPendingWrites(async () => {
      flushAllContent()
      await allNoteWork()
    })
    return () => {
      window.removeEventListener('pagehide', flushAllContent)
      window.removeEventListener('online', flushAllContent)
      document.removeEventListener('visibilitychange', onVisibility)
      unregister()
      flushAllContent()
    }
  }, [flushAllContent])

  // Declared after the flush effect: on unmount that one queues the last
  // sends first; only after them does this instance let go of its drafts, so
  // the next mount (overlay reopened) restores whatever still didn't land.
  useEffect(() => {
    const owner = ownerRef.current
    return () => {
      for (const [id, holder] of draftOwners) {
        if (holder !== owner) continue
        void enqueueNote(id, async () => {
          if (draftOwners.get(id) === owner) draftOwners.delete(id)
        })
      }
    }
  }, [])

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
