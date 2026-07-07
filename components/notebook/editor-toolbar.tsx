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
import { useIsMobile } from '@/hooks/use-mobile'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'

interface EditorToolbarProps {
  editor: Editor | null
  /** Promote the current selection (or current line) to a real task. */
  onPromote?: (title: string) => void
}

// Pull a sensible task title from the editor: the selected text if there's a
// selection, otherwise the text of the block the caret sits in. Exported so
// the desktop "升級為任務" entry (now in the notebook page header, since the
// fixed toolbar no longer renders on desktop) can reuse the same logic.
export function selectionOrLineText(editor: Editor): string {
  const { from, to } = editor.state.selection
  if (from !== to) return editor.state.doc.textBetween(from, to, ' ').trim()
  return editor.state.selection.$from.parent.textContent.trim()
}

// Fixed formatting bar above the editor. Each button reflects the active mark/
// node at the caret (so users can see current state) and toggles it.
//
// Mobile-only: desktop dropped the fixed toolbar in favour of the "/" block
// menu + selection bubble menu (Notion's pure-editor layout, no chrome above
// the document). On mobile there's no floating selection menu (it would
// fight the OS's own text-selection UI) and no hover affordance for "/", so
// this bar stays as the primary formatting entry point, docked above the
// keyboard.
export function EditorToolbar({ editor, onPromote }: EditorToolbarProps) {
  // Hooks must run before the early return. On mobile the bar detaches from the
  // top of the editor and docks above the keyboard (iOS input-accessory style)
  // so formatting stays reachable while typing at the bottom of a long note.
  const isMobile = useIsMobile()
  const keyboardInset = useKeyboardInset()

  if (!editor) return null
  if (!isMobile) return null

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
    <div
      className={cn(
        'z-sticky flex items-center gap-0.5 border-border bg-card/85 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/65',
        isMobile
          // Docked above the keyboard: fixed to the visual-viewport bottom,
          // raised by the keyboard's height (0 when closed → rests above the
          // home indicator via safe-area padding). No bottom-transition so it
          // tracks the keyboard exactly and never animates layout props.
          // pr-5 + a right-edge fade mask signal "scrolls horizontally →" so the
          // last icon doesn't read as clipped/broken (mask is visual-only; taps
          // still land). scrollbar hidden — the fade is the affordance.
          ? 'fixed inset-x-0 flex-nowrap gap-1 overflow-x-auto border-t pr-8 pb-[env(safe-area-inset-bottom)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'sticky top-0 flex-wrap border-b',
      )}
      style={
        isMobile
          ? {
              bottom: keyboardInset,
              WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 40px), transparent)',
              maskImage: 'linear-gradient(to right, #000 calc(100% - 40px), transparent)',
            }
          : undefined
      }
    >
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
        'flex h-8 w-8 items-center justify-center rounded-lg transition-colors max-md:h-10 max-md:w-10 max-md:flex-shrink-0',
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
  // `bg-border` alone measured ~1.4:1 against the toolbar background in dark
  // mode (border is deliberately a soft, low-contrast line per DESIGN.md) —
  // fine for a card edge, but this divider's job is to separate button
  // groups, so it needs to actually be perceivable. muted-foreground/25 (the
  // same token the icons use, just heavily thinned) keeps the "soft line"
  // feel while giving it enough presence to read in both themes.
  return <span className="mx-1 h-5 w-px bg-muted-foreground/45" aria-hidden />
}
