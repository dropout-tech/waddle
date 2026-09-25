import type { ScratchpadItem, TiptapDoc, TiptapNode } from '@/lib/types'

export function hasWhiteboardDocument(item: ScratchpadItem): boolean {
  return item.metadata?.document?.type === 'doc' && Array.isArray(item.metadata.document.content)
}

export function createChecklistDocument(text = '', checked = false): TiptapDoc {
  return { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked }, content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }] }] }] }
}

export function getWhiteboardDocument(item: ScratchpadItem): TiptapDoc {
  if (hasWhiteboardDocument(item)) return item.metadata!.document as TiptapDoc
  if (item.type === 'todo') return createChecklistDocument(item.content, item.isChecked)
  if (item.type === 'image') return { type: 'doc', content: [{ type: 'image', attrs: { src: item.content, alt: item.title ?? '' } }, { type: 'paragraph' }] }
  return { type: 'doc', content: item.content.split('\n').map(text => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text, ...(item.type === 'link' ? { marks: [{ type: 'link', attrs: { href: item.content } }] } : {}) }] } : {}) })) }
}

export function whiteboardDocumentText(doc: TiptapDoc): string {
  const text = (node: TiptapNode): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return '\n'
    const children = (node.content ?? []).map(text).join('')
    return ['paragraph', 'heading', 'detailsSummary', 'codeBlock'].includes(node.type) ? `${children}\n` : children
  }
  return (doc.content ?? []).map(text).join('').trimEnd()
}

export function whiteboardChecklistSummary(doc: TiptapDoc): { checked: number; total: number } {
  let checked = 0
  let total = 0
  const visit = (node: TiptapNode) => {
    if (node.type === 'taskItem') { total += 1; if (node.attrs?.checked === true) checked += 1 }
    node.content?.forEach(visit)
  }
  doc.content?.forEach(visit)
  return { checked, total }
}

/** Keep the original source link in a rich note aligned with its URL editor. */
export function replaceWhiteboardSourceLink(doc: TiptapDoc, previousUrl: string, nextUrl: string): TiptapDoc {
  const visit = (node: TiptapNode): TiptapNode => {
    const matchesSource = node.marks?.some(mark => mark.type === 'link' && mark.attrs?.href === previousUrl)
    return {
      ...node,
      ...(node.content ? { content: node.content.map(visit) } : {}),
      ...(node.marks ? { marks: node.marks.map(mark => mark.type === 'link' && mark.attrs?.href === previousUrl ? { ...mark, attrs: { ...mark.attrs, href: nextUrl } } : mark) } : {}),
      ...(matchesSource && node.text === previousUrl ? { text: nextUrl } : {}),
    }
  }
  return { ...doc, ...(doc.content ? { content: doc.content.map(visit) } : {}) }
}
