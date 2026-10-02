'use client'

import { useEffect, type CSSProperties } from 'react'
import { EditorContent, Extension, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import type { TiptapDoc } from '@/lib/types'
import { InlineMath } from '@/components/notebook/inline-math'
import { textStyleMarks } from '@/components/notebook/text-style-marks'

// ⌘/Ctrl+Enter saves the card (the form's handler); without this HardBreak
// would also insert a line break first.
const SaveShortcut = Extension.create({ name: 'cardSaveShortcut', addKeyboardShortcuts: () => ({ 'Mod-Enter': () => true }) })

/**
 * In-place editor for a whiteboard text / todo card: plain lines (one
 * paragraph each, like the old textarea) plus character formatting — bold,
 * italic, underline and the colour / marker / size marks. No headings, lists
 * or links: those cards open the full detail editor instead.
 */
export function InlineCardEditor({ initial, ariaLabel, placeholder, style, onChange, onEditor, onCompositionStart, onCompositionEnd }: {
  initial: TiptapDoc
  ariaLabel: string
  placeholder: string
  style?: CSSProperties
  onChange: (doc: TiptapDoc) => void
  onEditor: (editor: Editor | null) => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false, blockquote: false,
        codeBlock: false, code: false, horizontalRule: false, link: false, dropcursor: false, gapcursor: false, trailingNode: false,
      }),
      ...textStyleMarks,
      InlineMath,
      Placeholder.configure({ placeholder }),
      SaveShortcut,
    ],
    content: initial,
    immediatelyRender: false,
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'wb-inline-editor min-h-11 flex-1 whitespace-pre-wrap break-words leading-relaxed outline-none [overflow-wrap:anywhere]',
        'aria-label': ariaLabel,
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getJSON() as TiptapDoc),
  })
  useEffect(() => {
    onEditor(editor)
    return () => onEditor(null)
    // onEditor is a state setter from the canvas; only the instance matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])
  return <EditorContent editor={editor} className="flex min-h-11 w-full min-w-0 flex-1 flex-col overflow-auto text-base" style={style}
    onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd}/>
}
