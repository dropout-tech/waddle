'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { NotebookNote, TiptapDoc } from '@/lib/types'
import { notebookExtensions } from './tiptap-extensions'
import { EditorToolbar, selectionOrLineText } from './editor-toolbar'
import { SelectionToolbar } from './selection-toolbar'
import { useIsMobile } from '@/hooks/use-mobile'
import { NoteIconPicker } from './note-icon-picker'

const EMPTY_DOC: TiptapDoc = { type: 'doc', content: [{ type: 'paragraph' }] }
const TITLE_DEBOUNCE_MS = 500

interface NoteEditorProps {
  note: NotebookNote
  onTitleChange: (title: string) => void
  onContentChange: (content: TiptapDoc) => void
  onIconChange?: (icon: string | undefined) => void
  /** Promote the current selection/line to a real task (optional). */
  onPromote?: (title: string) => void
}

export interface NoteEditorHandle {
  /** Imperative escape hatch for the desktop header's "升級為任務" button,
   *  which lives outside this component and has no direct editor access. */
  promote: () => void
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { note, onTitleChange, onContentChange, onIconChange, onPromote },
  ref,
) {
  const isMobile = useIsMobile()

  // Guard so programmatic setContent (on note switch) doesn't echo back as a
  // user edit and trigger a redundant save.
  const applyingRef = useRef(false)
  const loadedIdRef = useRef<string | null>(null)

  const editor = useEditor({
    extensions: notebookExtensions('輸入文字，或輸入「/」加入區塊…'),
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

  useImperativeHandle(
    ref,
    () => ({
      promote: () => {
        if (!editor || !onPromote) return
        onPromote(selectionOrLineText(editor))
      },
    }),
    [editor, onPromote],
  )

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
    // Resync the field only when switching notes — reacting to note.title
    // too would let a late fetch / echoed optimistic patch overwrite what
    // the user is typing right now.
    setTitle(note.title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

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
      {!isMobile && <SelectionToolbar editor={editor} />}
      <div
        className="flex-1 overflow-y-auto"
        // Click the blank space below/around the document (not the title
        // input or the editor content itself — those stop propagation by
        // virtue of being a different `e.target`) to focus the end of the
        // note, Notion-style. Guarded to the exact container so it never
        // steals focus from an in-progress interaction.
        onClick={(e) => {
          if (e.target === e.currentTarget) editor?.commands.focus('end')
        }}
      >
        {/* Extra bottom padding on mobile so the last lines clear the
            keyboard-docked toolbar (fixed, ~52px + home-indicator safe area). */}
        <div className="mx-auto w-full max-w-[46rem] px-6 py-8 md:px-10 max-md:pb-[calc(env(safe-area-inset-bottom)+72px)]">
          <NoteIconPicker icon={note.icon} onChange={onIconChange} />
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
            className="mt-1 w-full bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 focus:outline-none md:text-4xl"
          />
          <div className="mt-4">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  )
})
