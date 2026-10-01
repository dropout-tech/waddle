import type { TiptapDoc } from '@/lib/types'

// Local backup of notebook edits that haven't reached the server yet.
//
// The notebook autosaves on a short debounce and flushes on pagehide, but a
// browser (or iOS WebView) may cancel requests started while the page is
// unloading — so the last keystrokes before a reload/close could be lost.
// Every pending edit is mirrored here first; the next load re-sends anything
// newer than the server copy. Keys include the user id so a shared device
// never replays one account's text into another's.
//
// localStorage can throw (private mode, quota, disabled storage): every
// access is wrapped and failure simply means "no backup".

export interface NotebookDraft {
  title?: string
  titleAt?: string
  content?: TiptapDoc
  contentAt?: string
}

const PREFIX = 'huddle:notebook-draft:'
const keyOf = (userId: string, noteId: string) => `${PREFIX}${userId}:${noteId}`

function read(userId: string, noteId: string): NotebookDraft | null {
  try {
    const raw = window.localStorage.getItem(keyOf(userId, noteId))
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
) {
  const draft = read(userId, noteId) ?? {}
  const at = new Date().toISOString()
  if (field === 'title') write(userId, noteId, { ...draft, title: value as string, titleAt: at })
  else write(userId, noteId, { ...draft, content: value as TiptapDoc, contentAt: at })
}

/** Drop one field after the server confirmed it. For titles, only when the
 *  saved value is still the backed-up one (a newer keystroke keeps its draft). */
export function clearNotebookDraftField(userId: string, noteId: string, field: 'title' | 'content', savedTitle?: string) {
  const draft = read(userId, noteId)
  if (!draft) return
  if (field === 'title') {
    if (draft.title !== savedTitle) return
    delete draft.title
    delete draft.titleAt
  } else {
    delete draft.content
    delete draft.contentAt
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

/** Drafts that are newer than the server copy, ready to be re-sent. Stale
 *  drafts (server is newer, or the note no longer exists) are removed. */
export function takeNewerNotebookDrafts(
  userId: string,
  serverNotes: { id: string; updatedAt?: string | null }[],
): { noteId: string; title?: string; content?: TiptapDoc }[] {
  let keys: string[] = []
  try {
    const prefix = `${PREFIX}${userId}:`
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k.slice(prefix.length))
    }
  } catch {
    keys = []
  }
  const byId = new Map(serverNotes.map((n) => [n.id, n]))
  const out: { noteId: string; title?: string; content?: TiptapDoc }[] = []
  for (const noteId of keys) {
    const draft = read(userId, noteId)
    const note = byId.get(noteId)
    if (!draft || !note) {
      clearNotebookDraft(userId, noteId)
      continue
    }
    const serverAt = note.updatedAt ? Date.parse(note.updatedAt) : 0
    const newer = (at?: string) => !!at && Date.parse(at) > serverAt
    const rec: { noteId: string; title?: string; content?: TiptapDoc } = { noteId }
    if ('title' in draft && newer(draft.titleAt)) rec.title = draft.title
    if ('content' in draft && newer(draft.contentAt)) rec.content = draft.content
    if ('title' in rec || 'content' in rec) out.push(rec)
    else clearNotebookDraft(userId, noteId)
  }
  return out
}
