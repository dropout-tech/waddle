'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { NotebookNote, TiptapDoc } from '@/lib/types'
import { notebookExtensions } from './tiptap-extensions'
import { EditorToolbar } from './editor-toolbar'

const EMPTY_DOC: TiptapDoc = { type: 'doc', content: [{ type: 'paragraph' }] }
const TITLE_DEBOUNCE_MS = 500

interface NoteEditorProps {
  note: NotebookNote
  onTitleChange: (title: string) => void
  onContentChange: (content: TiptapDoc) => void
  /** Promote the current selection/line to a real task (optional). */
  onPromote?: (title: string) => void
}

export function NoteEditor({ note, onTitleChange, onContentChange, onPromote }: NoteEditorProps) {
  // Guard so programmatic setContent (on note switch) doesn't echo back as a
  // user edit and trigger a redundant save.
  const applyingRef = useRef(false)
  const loadedIdRef = useRef<string | null>(null)

  const editor = useEditor({
    extensions: notebookExtensions('輸入內容，或用上方工具列／Markdown（# 標題、- 清單、[] 待辦）排版…'),
    content: note.content ?? EMPTY_DOC,
    // Tiptap SSR guard: render only on the client to avoid hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'nb-prose focus:outline-none' },
    },
    onUpdate: ({ editor }) => {
      if (applyingRef.current) return
      onContentChange(editor.getJSON() as TiptapDoc)
    },
  })

  // Swap document when the selected note changes (without emitting an update).
  useEffect(() => {
    if (!editor) return
    if (loadedIdRef.current === note.id) return
    loadedIdRef.current = note.id
    applyingRef.current = true
    editor.commands.setContent(note.content ?? EMPTY_DOC, { emitUpdate: false })
    applyingRef.current = false
  }, [editor, note.id, note.content])

  // ── Title (local state + debounced commit) ───────────────
  const [title, setTitle] = useState(note.title)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Resync the field when switching notes.
    setTitle(note.title)
  }, [note.id, note.title])

  const commitTitle = (value: string) => {
    clearTimeout(titleTimer.current)
    onTitleChange(value)
  }

  const handleTitleChange = (value: string) => {
    setTitle(value)
    clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => onTitleChange(value), TITLE_DEBOUNCE_MS)
  }

  useEffect(() => () => clearTimeout(titleTimer.current), [])

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar editor={editor} onPromote={onPromote} />
      <div className="flex-1 overflow-y-auto">
        {/* Extra bottom padding on mobile so the last lines clear the
            keyboard-docked toolbar (fixed, ~52px + home-indicator safe area). */}
        <div className="mx-auto w-full max-w-2xl px-6 py-8 max-md:pb-[calc(env(safe-area-inset-bottom)+72px)]">
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitTitle((e.target as HTMLInputElement).value)
                editor?.commands.focus('start')
              }
            }}
            placeholder="無標題"
            className="w-full bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <div className="mt-4" onClick={() => editor?.commands.focus()}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  )
}
