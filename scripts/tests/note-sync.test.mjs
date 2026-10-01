// Version-locked notebook / sticky-note saves (lib/note-sync.ts) and the
// notebook draft backup (lib/notebook-draft.ts): after a save misses the
// version it was based on, nothing may be overwritten or dropped.
import test from 'node:test'
import assert from 'node:assert/strict'
import { decideAfterMiss, sameContent, stableStringify, conflictCopyId } from '../../lib/note-sync.ts'

const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

test('jsonb key order does not make equal documents differ', () => {
  const a = { type: 'doc', content: [{ type: 'paragraph', attrs: { a: 1, b: 2 } }] }
  const b = { content: [{ attrs: { b: 2, a: 1 }, type: 'paragraph' }], type: 'doc' }
  assert.equal(stableStringify(a), stableStringify(b))
  assert.ok(sameContent(a, b))
  assert.ok(!sameContent(doc('A'), doc('B')))
  assert.ok(sameContent(null, undefined))
})

test('row gone → keep ours as a copy', () => {
  assert.equal(decideAfterMiss(null, { content: doc('mine') }, { content: doc('base') }), 'gone')
})

test('server already has our text (earlier save landed, answer lost) → same, no copy', () => {
  assert.equal(decideAfterMiss({ content: doc('mine') }, { content: doc('mine') }, { content: doc('base') }), 'same')
  assert.equal(decideAfterMiss({ content: doc('mine') }, { content: doc('mine') }), 'same')
})

test('only another field moved (server content == our base) → rebase and retry', () => {
  assert.equal(decideAfterMiss({ title: 'renamed', content: doc('base') }, { content: doc('mine') }, { content: doc('base') }), 'rebase')
})

test('content changed elsewhere → conflict (never rebase over it)', () => {
  assert.equal(decideAfterMiss({ content: doc('theirs') }, { content: doc('mine') }, { content: doc('base') }), 'conflict')
})

test('draft with unknown base can only be saved, matched or copied', () => {
  // Restored drafts pass no base: even an unchanged-looking server is a conflict.
  assert.equal(decideAfterMiss({ content: doc('theirs') }, { content: doc('mine') }), 'conflict')
  assert.equal(decideAfterMiss({ title: 'T', content: doc('x') }, { title: 'T2' }), 'conflict')
  assert.equal(decideAfterMiss({ title: 'T2', content: doc('x') }, { title: 'T2' }), 'same')
})

test('conflict copy id is deterministic per (note, text) and a valid uuid', () => {
  const a = conflictCopyId('n1', { content: doc('mine') })
  assert.equal(a, conflictCopyId('n1', { content: doc('mine') }))
  assert.notEqual(a, conflictCopyId('n1', { content: doc('other') }))
  assert.notEqual(a, conflictCopyId('n2', { content: doc('mine') }))
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

// ── notebook-draft: base token instead of clocks ──
const store = new Map()
globalThis.window = {
  localStorage: {
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
}
const drafts = await import('../../lib/notebook-draft.ts')

test('drafts remember the version they were written on, and follow saves', () => {
  store.clear()
  drafts.saveNotebookDraft('u1', 'n1', 'content', doc('a'), 'v1')
  let [d] = drafts.readNotebookDrafts('u1')
  assert.equal(d.draft.base, 'v1')
  assert.equal('contentAt' in d.draft, false) // no device clock stored
  drafts.rebaseNotebookDraft('u1', 'n1', 'v2')
  ;[d] = drafts.readNotebookDrafts('u1')
  assert.equal(d.draft.base, 'v2')
  drafts.saveNotebookDraft('u1', 'n1', 'title', 'T', undefined)
  ;[d] = drafts.readNotebookDrafts('u1')
  assert.equal(d.draft.base, undefined)
})

test('clearIfUnchanged keeps a draft rewritten by a newer keystroke', () => {
  store.clear()
  drafts.saveNotebookDraft('u1', 'n1', 'content', doc('a'), 'v1')
  const [d] = drafts.readNotebookDrafts('u1')
  drafts.saveNotebookDraft('u1', 'n1', 'content', doc('ab'), 'v1')
  drafts.clearNotebookDraftIfUnchanged('u1', 'n1', d.raw)
  assert.equal(drafts.readNotebookDrafts('u1').length, 1)
  const [d2] = drafts.readNotebookDrafts('u1')
  drafts.clearNotebookDraftIfUnchanged('u1', 'n1', d2.raw)
  assert.equal(drafts.readNotebookDrafts('u1').length, 0)
})

test('sign-out clears only that user\'s drafts; unknown user clears nothing', () => {
  store.clear()
  drafts.saveNotebookDraft('u1', 'n1', 'content', doc('a'), 'v1')
  drafts.saveNotebookDraft('u2', 'n2', 'content', doc('b'), 'v1')
  store.set('waddle-font-size-v1', 'lg')
  drafts.clearAllNotebookDrafts('u1')
  assert.equal(drafts.readNotebookDrafts('u1').length, 0)
  assert.equal(drafts.readNotebookDrafts('u2').length, 1)
  drafts.clearAllNotebookDrafts(null)
  assert.equal(drafts.readNotebookDrafts('u2').length, 1) // another account's unsent text survives
  assert.equal(store.get('waddle-font-size-v1'), 'lg')
})

test('a draft keeps the hash of its base content → a reload can rebase over a title/folder change', async () => {
  const { contentHash } = await import('../../lib/note-sync.ts')
  store.clear()
  drafts.saveNotebookDraft('u1', 'n1', 'content', doc('mine'), 'v1', contentHash(doc('base')))
  const [d] = drafts.readNotebookDrafts('u1')
  // Server moved to v2 by a rename only: content still == base → rebase.
  assert.equal(decideAfterMiss({ title: 'renamed', content: doc('base') }, { content: d.draft.content }, { hash: d.draft.baseHash }), 'rebase')
  // Text changed elsewhere → conflict.
  assert.equal(decideAfterMiss({ content: doc('theirs') }, { content: d.draft.content }, { hash: d.draft.baseHash }), 'conflict')
  // A draft that also renamed the note only rebases if the server title matches.
  assert.equal(decideAfterMiss({ title: 'T', content: doc('base') }, { title: 'T2', content: doc('mine') }, { hash: d.draft.baseHash }), 'conflict')
})

test('a backup written by another window is never cleared or rebased from this one', () => {
  store.clear()
  drafts.saveNotebookDraft('u1', 'n1', 'content', doc('other window'), 'v1')
  const key = [...store.keys()][0]
  store.set(key, JSON.stringify({ ...JSON.parse(store.get(key)), writer: 'another-window' }))
  drafts.clearNotebookDraftField('u1', 'n1', 'content')
  drafts.rebaseNotebookDraft('u1', 'n1', 'v9')
  const [d] = drafts.readNotebookDrafts('u1')
  assert.ok(d.draft.content)
  assert.equal(d.draft.base, 'v1')
  assert.equal(typeof drafts.DRAFT_WRITER, 'string')
})
