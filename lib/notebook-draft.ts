import type { TiptapDoc } from '@/lib/types'

// Local backup of notebook edits that haven't reached the server yet.
//
// The notebook autosaves on a short debounce and flushes on pagehide, but a
// browser (or iOS WebView) may cancel requests started while the page is
// unloading — so the last keystrokes before a reload/close could be lost.
// Every pending edit is mirrored here first; the next load re-sends it.
// Keys include the user id so a shared device never replays one account's
// text into another's.
//
// Each draft remembers `base`: the note's server version token (its
// updated_at exactly as the server returned it, see lib/note-sync.ts) that
// the edit was made on top of. On reload the draft is only written back if
// the server is still at that version; otherwise another device changed the
// note in between and the draft becomes a conflict copy instead of
// overwriting it. Device clocks are never compared.
//
// localStorage can throw (private mode, quota, disabled storage): every
// access is wrapped and failure simply means "no backup".

export interface NotebookDraft {
  title?: string
  content?: TiptapDoc
  /** Server version token the edit is based on; missing = unknown. */
  base?: string
  /** contentHash of the server content at `base`, when known — lets a
   *  reload rebase over a change elsewhere that didn't touch the text
   *  (title, folder move) instead of reporting a conflict. */
  baseHash?: string
  /** Which page (tab / window) wrote it: another window that is still
   *  typing into the note must not have its backup re-sent or deleted
   *  under it (see use-notebook.ts ownedInAnotherWindow). */
  writer?: string
}

/** Id of this page (JS realm); see NotebookDraft.writer. */
export const DRAFT_WRITER =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())


const PREFIX = 'huddle:notebook-draft:'
const keyOf = (userId: string, noteId: string) => `${PREFIX}${userId}:${noteId}`

function readRaw(userId: string, noteId: string): string | null {
  try {
    return window.localStorage.getItem(keyOf(userId, noteId))
  } catch {
    return null
  }
}

function read(userId: string, noteId: string): NotebookDraft | null {
  try {
    const raw = readRaw(userId, noteId)
    return raw ? (JSON.parse(raw) as NotebookDraft) : null
  } catch {
    return null
  }
}

function write(userId: string, noteId: string, draft: NotebookDraft) {
  try {
    if (!('title' in draft) && !('content' in draft)) window.localStorage.removeItem(keyOf(userId, noteId))
    else window.localStorage.setItem(keyOf(userId, noteId), JSON.stringify(draft))
  } catch {
    /* storage unavailable or full — the server save path still runs */
  }
}

export function saveNotebookDraft(
  userId: string,
  noteId: string,
  field: 'title' | 'content',
  value: string | TiptapDoc,
  base: string | undefined,
  baseHash?: string,
) {
  const draft = read(userId, noteId) ?? {}
  const next: NotebookDraft = field === 'title'
    ? { ...draft, title: value as string }
    : { ...draft, content: value as TiptapDoc }
  if (base) next.base = base
  else delete next.base
  if (base && baseHash) next.baseHash = baseHash
  else delete next.baseHash
  next.writer = DRAFT_WRITER
  write(userId, noteId, next)
}

const ownDraft = (draft: NotebookDraft) => !draft.writer || draft.writer === DRAFT_WRITER

/** The server accepted a write made on top of the draft's lineage: whatever
 *  is still in the draft is now based on `token`. */
export function rebaseNotebookDraft(userId: string, noteId: string, token: string, baseHash?: string) {
  const draft = read(userId, noteId)
  if (!draft || !ownDraft(draft) || (draft.base === token && draft.baseHash === baseHash)) return
  const next = { ...draft, base: token }
  if (baseHash) next.baseHash = baseHash
  else delete next.baseHash
  write(userId, noteId, next)
}

/** Drop one field after the server confirmed it. For titles, only when the
 *  saved value is still the backed-up one (a newer keystroke keeps its draft).
 *  Never touches a backup another window wrote. */
export function clearNotebookDraftField(userId: string, noteId: string, field: 'title' | 'content', savedTitle?: string) {
  const draft = read(userId, noteId)
  if (!draft || !ownDraft(draft)) return
  if (field === 'title') {
    if (draft.title !== savedTitle) return
    delete draft.title
  } else {
    delete draft.content
  }
  write(userId, noteId, draft)
}

export function clearNotebookDraft(userId: string, noteId: string) {
  try {
    window.localStorage.removeItem(keyOf(userId, noteId))
  } catch {
    /* ignore */
  }
}

/** Remove the draft only if it is still exactly `raw` (a newer keystroke
 *  rewrote it otherwise, and that one must survive). */
export function clearNotebookDraftIfUnchanged(userId: string, noteId: string, raw: string) {
  if (isNotebookDraftUnchanged(userId, noteId, raw)) clearNotebookDraft(userId, noteId)
}

export function isNotebookDraftUnchanged(userId: string, noteId: string, raw: string): boolean {
  return readRaw(userId, noteId) === raw
}

export interface StoredNotebookDraft {
  noteId: string
  draft: NotebookDraft
  /** The stored JSON, to tell whether the draft changed since it was read. */
  raw: string
}

/** One note's draft, if any. */
export function readNotebookDraft(userId: string, noteId: string): StoredNotebookDraft | null {
  const raw = readRaw(userId, noteId)
  const draft = read(userId, noteId)
  if (!raw || !draft || (!('title' in draft) && !('content' in draft))) return null
  return { noteId, draft, raw }
}

/** Every draft of this user still on the device. */
export function readNotebookDrafts(userId: string): StoredNotebookDraft[] {
  const prefix = `${PREFIX}${userId}:`
  const ids: string[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) ids.push(k.slice(prefix.length))
    }
  } catch {
    return []
  }
  const out: StoredNotebookDraft[] = []
  for (const noteId of ids) {
    const raw = readRaw(userId, noteId)
    const draft = read(userId, noteId)
    if (!raw || !draft || (!('title' in draft) && !('content' in draft))) {
      clearNotebookDraft(userId, noteId)
      continue
    }
    out.push({ noteId, draft, raw })
  }
  return out
}

/** Sign-out (after the user confirmed) / account deletion: remove this
 *  user's drafts so their text doesn't stay readable in this browser's
 *  storage. Without a user id nothing is removed — other accounts' unsent
 *  text on a shared device must survive. */
export function clearAllNotebookDrafts(userId: string | null | undefined) {
  if (!userId) return
  const prefix = `${PREFIX}${userId}:`
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k)
    }
    keys.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}
