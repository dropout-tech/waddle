'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { StickyNote, TiptapDoc } from '@/lib/types'
import { notebookExtensions } from '@/components/notebook/tiptap-extensions'
import type { UploadImageFn } from '@/components/notebook/upload-image'
import { useI18n } from '@/lib/i18n/react'

const EMPTY_DOC: TiptapDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

// Sticky notes are quick jotting, not the full 記事本 document — no title, no
// icon, no fixed toolbar. They reuse the *exact* notebook extension bundle
// (bold/italic/lists/task-list/toggle/slash-menu) per product decision, so
// formatting muscle memory carries over 1:1. Images aren't supported here
// (no dedicated bucket/UI for this surface yet); the stub upload fn below
// makes the slash/paste/drop paths fail through upload-image.ts's existing
// toast.error rather than crashing.
const notSupported: UploadImageFn = () => Promise.reject(new Error('sticky notes: image upload not supported'))

interface StickyNoteEditorProps {
  note: StickyNote
  onContentChange: (content: TiptapDoc) => void
}

export function StickyNoteEditor({ note, onContentChange }: StickyNoteEditorProps) {
  const { t } = useI18n()
  const applyingRef = useRef(false)
  const loadedIdRef = useRef<string | null>(null)

  const editor = useEditor({
    extensions: notebookExtensions(notSupported),
    content: note.content ?? EMPTY_DOC,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'nb-prose focus:outline-none', 'aria-label': t('便條紙') },
    },
    onUpdate: ({ editor }) => {
      if (applyingRef.current) return
      onContentChange(editor.getJSON() as TiptapDoc)
    },
  })

  // Swap document when the note's stored content changes from elsewhere
  // (e.g. initial load resolving after the card already mounted) without
  // echoing it back as a fresh user edit.
  useEffect(() => {
    if (!editor) return
    if (loadedIdRef.current === note.id) return
    loadedIdRef.current = note.id
    applyingRef.current = true
    editor.commands.setContent(note.content ?? EMPTY_DOC, { emitUpdate: false })
    applyingRef.current = false
  }, [editor, note.id, note.content])

  return (
    <div
      className="h-full min-h-0 flex-1 overflow-y-auto px-3 pb-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
