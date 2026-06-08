'use client'

import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  ChevronRight,
  Minus,
  Link2,
  Undo2,
  Redo2,
  ListPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditorToolbarProps {
  editor: Editor | null
  /** Promote the current selection (or current line) to a real task. */
  onPromote?: (title: string) => void
}

// Pull a sensible task title from the editor: the selected text if there's a
// selection, otherwise the text of the block the caret sits in.
function selectionOrLineText(editor: Editor): string {
  const { from, to } = editor.state.selection
  if (from !== to) return editor.state.doc.textBetween(from, to, ' ').trim()
  return editor.state.selection.$from.parent.textContent.trim()
}

// Fixed formatting bar above the editor. Each button reflects the active mark/
// node at the caret (so users can see current state) and toggles it. Mirrors a
// Notion-style toolbar but constrained to the formats StarterKit + our extra
// extensions provide.
export function EditorToolbar({ editor, onPromote }: EditorToolbarProps) {
  if (!editor) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('連結網址', prev ?? 'https://')
    if (url === null) return // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-card/80 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <Btn label="標題 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-4 w-4" />
      </Btn>
      <Btn label="標題 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </Btn>
      <Btn label="標題 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="h-4 w-4" />
      </Btn>

      <Divider />

      <Btn label="粗體" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </Btn>
      <Btn label="斜體" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </Btn>
      <Btn label="底線" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-4 w-4" />
      </Btn>
      <Btn label="刪除線" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </Btn>
      <Btn label="行內程式碼" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className="h-4 w-4" />
      </Btn>
      <Btn label="連結" active={editor.isActive('link')} onClick={setLink}>
        <Link2 className="h-4 w-4" />
      </Btn>

      <Divider />

      <Btn label="項目符號" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </Btn>
      <Btn label="編號清單" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </Btn>
      <Btn label="待辦清單" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="h-4 w-4" />
      </Btn>
      <Btn label="收合區塊（toggle）" active={editor.isActive('details')} onClick={() => editor.chain().focus().setDetails().run()}>
        <ChevronRight className="h-4 w-4" />
      </Btn>
      <Btn label="引言" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </Btn>
      <Btn label="分隔線" active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </Btn>

      <Divider />

      <Btn label="復原" active={false} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </Btn>
      <Btn label="重做" active={false} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </Btn>

      {onPromote && (
        <>
          <Divider />
          <Btn label="升級為任務" active={false} onClick={() => onPromote(selectionOrLineText(editor))}>
            <ListPlus className="h-4 w-4" />
          </Btn>
        </>
      )}
    </div>
  )
}

function Btn({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Use onMouseDown + preventDefault so clicking the button doesn't blur the
      // editor and collapse the current selection before the command runs.
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onClick()
      }}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        'text-muted-foreground hover:bg-secondary hover:text-foreground',
        active && 'bg-primary/10 text-primary hover:bg-primary/15',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />
}
