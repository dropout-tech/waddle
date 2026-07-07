'use client'

import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectionToolbarProps {
  editor: Editor | null
}

// Desktop-only floating format bar (Notion's "select text → toolbar appears"
// pattern). Mobile never mounts this — the OS's own text-selection menu owns
// that surface there, and stacking ours on top of it fights the system UI.
export function SelectionToolbar({ editor }: SelectionToolbarProps) {
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
    <BubbleMenu
      editor={editor}
      // flip against the editor's own content box (not the viewport): a
      // selection on the first line has the note title right above it, so
      // "top" placement would cover the title — flipping below instead.
      options={{
        placement: 'top',
        offset: 8,
        flip: { boundary: editor.view.dom, padding: 4 },
        shift: true,
      }}
      shouldShow={({ editor: e, from, to }) => from !== to && !e.isActive('codeBlock')}
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md">
        <Btn label="粗體" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </Btn>
        <Btn label="斜體" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </Btn>
        <Btn
          label="底線"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Btn>
        <Btn
          label="刪除線"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </Btn>
        <Btn label="行內程式碼" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-4 w-4" />
        </Btn>
        <span className="mx-0.5 h-5 w-px bg-muted-foreground/45" aria-hidden />
        <Btn label="連結" active={editor.isActive('link')} onClick={setLink}>
          <Link2 className="h-4 w-4" />
        </Btn>
      </div>
    </BubbleMenu>
  )
}

function Btn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
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
      // onMouseDown + preventDefault so clicking doesn't blur the editor and
      // collapse the selection before the command runs.
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        'text-muted-foreground hover:bg-secondary hover:text-foreground',
        active && 'bg-primary/10 text-primary hover:bg-primary/15',
      )}
    >
      {children}
    </button>
  )
}
