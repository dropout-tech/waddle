import type { TiptapDoc, TiptapNode } from './types'

// Character-level colour / marker / size marks (components/notebook/text-style-marks.ts).
// Older app builds don't know these mark types, and Tiptap replaces a document
// containing an unknown mark with an EMPTY one (createNodeFromContent's
// fallback) — a stale tab would then show a blank note and overwrite it on the
// next keystroke. So documents are stored "packed": the visible content is the
// same document with these marks removed (every old build renders and edits it
// safely, and every plain-text reader sees identical text), and the full copy
// rides along in doc.attrs, which ProseMirror silently drops on parse. An old
// build that saves therefore writes the doc back without the copy: formatting
// is lost, text never is. (Bold / italic / underline are StarterKit marks every
// build knows; they stay in the visible content.)
export const STYLE_MARKS = ['textColor', 'textHighlight', 'textSize'] as const
export type StyleMark = (typeof STYLE_MARKS)[number]
const STYLE_MARK_SET = new Set<string>(STYLE_MARKS)

export function stripMarks(nodes: TiptapNode[] | undefined, types: ReadonlySet<string> = STYLE_MARK_SET): TiptapNode[] | undefined {
  if (!nodes) return nodes
  return nodes.map(node => {
    const next: TiptapNode = { ...node }
    if (node.marks) {
      const marks = node.marks.filter(mark => !types.has(mark.type))
      if (marks.length) next.marks = marks
      else delete next.marks
    }
    if (node.content) next.content = stripMarks(node.content, types)
    return next
  })
}

function hasMarks(nodes: TiptapNode[] | undefined, types: ReadonlySet<string>): boolean {
  return !!nodes?.some(node => node.marks?.some(mark => types.has(mark.type)) || hasMarks(node.content, types))
}

export function hasStyleMarks(doc: TiptapDoc | null | undefined): boolean {
  return hasMarks(doc?.content, STYLE_MARK_SET)
}

/** Editor JSON → what gets stored. Unstyled documents are stored unchanged. */
export function packStyledDoc(doc: TiptapDoc): TiptapDoc {
  const content = doc.content ?? []
  if (!hasMarks(content, STYLE_MARK_SET)) return { type: 'doc', content }
  return { type: 'doc', attrs: { styled: content }, content: stripMarks(content) }
}

/**
 * Stored document → what the editor / renderer uses. The styled copy is only
 * trusted while it still matches the visible content; anything that rewrote
 * the visible content without it (an old build, a link-URL rewrite) wins.
 */
export function unpackStyledDoc<T extends TiptapDoc | null | undefined>(doc: T): T {
  const styled = doc?.attrs?.styled
  if (!doc || !Array.isArray(styled)) return doc
  const visible = doc.content ?? []
  if (!sameJson(stripMarks(styled as TiptapNode[]), visible)) return { type: 'doc', content: visible } as T
  return { type: 'doc', content: styled as TiptapNode[] } as T
}

// Key-order-insensitive: Postgres jsonb reorders object keys on the way back.
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((value, index) => sameJson(value, (b as unknown[])[index]))
  const keys = Object.keys(a).filter(key => (a as Record<string, unknown>)[key] !== undefined)
  const other = Object.keys(b).filter(key => (b as Record<string, unknown>)[key] !== undefined)
  return keys.length === other.length && keys.every(key => sameJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/** Remove one kind of formatting everywhere (a whole-card colour replaces word colours). */
export function removeMarks(doc: TiptapDoc, types: string[]): TiptapDoc {
  const set = new Set(types)
  return { ...doc, content: stripMarks(doc.content, set) }
}

// ── Card text (whiteboard plain text / todo cards) ────────────────────────────
// A plain card keeps its text in `content` as before; formatting, when any, is a
// paragraph-per-line document in metadata.inline. Builds that predate it edit
// `content` only, so the document is used only while its text still matches.

export function textToParagraphs(text: string): TiptapDoc {
  return { type: 'doc', content: text.split('\n').map(line => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) }
}

/** Paragraph document → card text (one line per paragraph, hard breaks as newlines). */
export function paragraphsToText(doc: TiptapDoc): string {
  const line = (node: TiptapNode): string => node.type === 'text' ? node.text ?? '' : node.type === 'hardBreak' ? '\n' : (node.content ?? []).map(line).join('')
  return (doc.content ?? []).map(line).join('\n')
}

export function hasInlineFormatting(doc: TiptapDoc): boolean {
  return hasMarks(doc.content, new Set(['bold', 'italic', 'underline', 'strike', ...STYLE_MARKS]))
}

export function cardInlineDoc(item: { content: string; metadata?: Record<string, unknown> }): TiptapDoc | null {
  const doc = item.metadata?.inline as TiptapDoc | undefined
  if (doc?.type !== 'doc' || !Array.isArray(doc.content)) return null
  return paragraphsToText(doc) === item.content ? doc : null
}

// ── Read-only rendering ───────────────────────────────────────────────────────

export type Mark = { type: string; attrs?: Record<string, unknown> }
export type Run = { text: string; marks: Mark[] }

/**
 * Text runs for a read-only card face. Lines are split exactly like
 * whiteboardDocumentText (block ends and hard breaks become "\n", trailing
 * whitespace trimmed), so the rendered text equals the plain-text mirror.
 */
export function documentRuns(doc: TiptapDoc): Run[] {
  const runs: Run[] = []
  const walk = (node: TiptapNode) => {
    if (node.type === 'text') { if (node.text) runs.push({ text: node.text, marks: node.marks ?? [] }); return }
    if (node.type === 'hardBreak') { runs.push({ text: '\n', marks: [] }); return }
    for (const child of node.content ?? []) walk(child)
    if (['paragraph', 'heading', 'detailsSummary', 'codeBlock'].includes(node.type)) runs.push({ text: '\n', marks: [] })
  }
  for (const node of doc.content ?? []) walk(node)
  // trimEnd across runs
  while (runs.length) {
    const last = runs[runs.length - 1]
    const trimmed = last.text.trimEnd()
    if (trimmed) { last.text = trimmed; break }
    runs.pop()
  }
  return runs
}
