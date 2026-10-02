'use client'

import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { X } from 'lucide-react'
import {
  InkBold,
  InkItalic,
  InkUnderline,
  InkStrikethrough,
  InkInlineCode,
  InkHeading1,
  InkHeading2,
  InkHeading3,
  InkBulletList,
  InkNumberedList,
  InkTodo,
  InkQuote,
  InkToggle,
  InkDivider,
  InkLink,
  InkUndo,
  InkRedo,
  InkAddTask,
  InkImage,
} from '@/components/icons/huddle-icons'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { useI18n } from '@/lib/i18n/react'
import { pickAndInsertImage, type UploadImageFn } from './upload-image'
import { InkSwatches, InkTriggerIcon, type InkPalette } from './ink-swatches'

interface EditorToolbarProps {
  editor: Editor | null
  /** Promote the current selection (or current line) to a real task. */
  onPromote?: (title: string) => void
  uploadImage: UploadImageFn
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
// Icons: the whole strip uses the Huddle hand-inked set (20px) — block icons
// match the "/" menu, and B/I/U/link/undo… were drawn in the same sheet so the
// bar isn't a mix of brush strokes and geometric lucide lines.
//
// Mobile-only: desktop dropped the fixed toolbar in favour of the "/" block
// menu + selection bubble menu (Notion's pure-editor layout, no chrome above
// the document). On mobile there's no floating selection menu (it would
// fight the OS's own text-selection UI) and no hover affordance for "/", so
// this bar stays as the primary formatting entry point, docked above the
// keyboard.
export function EditorToolbar({ editor, onPromote, uploadImage }: EditorToolbarProps) {
  // Hooks must run before the early return. On mobile the bar detaches from the
  // top of the editor and docks above the keyboard (iOS input-accessory style)
  // so formatting stays reachable while typing at the bottom of a long note.
  const isMobile = useIsMobile()
  const keyboardInset = useKeyboardInset()
  const { t } = useI18n()
  const [palette, setPalette] = useState<InkPalette | null>(null)

  if (!editor) return null
  if (!isMobile) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt(t('連結網址'), prev ?? 'https://')
    if (url === null) return // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div
      data-nb-keyboard-bar=""
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
      {palette ? (
        // The colour row replaces the bar while open: a popover would be
        // clipped by this horizontally scrolling, keyboard-docked strip.
        <>
          <Btn label={t('關閉')} active={false} onClick={() => setPalette(null)}>
            <X className="h-5 w-5" />
          </Btn>
          <Divider />
          <InkSwatches editor={editor} palette={palette} onDone={() => setPalette(null)} />
        </>
      ) : (<>
      <Btn label={t('標題 1')} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <InkHeading1 className="h-5 w-5" />
      </Btn>
      <Btn label={t('標題 2')} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <InkHeading2 className="h-5 w-5" />
      </Btn>
      <Btn label={t('標題 3')} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <InkHeading3 className="h-5 w-5" />
      </Btn>

      <Divider />

      <Btn label={t('粗體')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <InkBold className="h-5 w-5" />
      </Btn>
      <Btn label={t('斜體')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <InkItalic className="h-5 w-5" />
      </Btn>
      <Btn label={t('底線')} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <InkUnderline className="h-5 w-5" />
      </Btn>
      <Btn label={t('刪除線')} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <InkStrikethrough className="h-5 w-5" />
      </Btn>
      <Btn label={t('行內程式碼')} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
        <InkInlineCode className="h-5 w-5" />
      </Btn>
      <Btn label={t('連結')} active={editor.isActive('link')} onClick={setLink}>
        <InkLink className="h-5 w-5" />
      </Btn>
      <Btn label={t('文字顏色')} active={false} onClick={() => setPalette('color')}>
        <InkTriggerIcon editor={editor} palette="color" />
      </Btn>
      <Btn label={t('螢光筆')} active={false} onClick={() => setPalette('highlight')}>
        <InkTriggerIcon editor={editor} palette="highlight" />
      </Btn>

      <Divider />

      <Btn label={t('項目符號')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <InkBulletList className="h-5 w-5" />
      </Btn>
      <Btn label={t('編號清單')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <InkNumberedList className="h-5 w-5" />
      </Btn>
      <Btn label={t('待辦清單')} active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <InkTodo className="h-5 w-5" />
      </Btn>
      <Btn label={t('收合區塊（toggle）')} active={editor.isActive('details')} onClick={() => editor.chain().focus().setDetails().run()}>
        <InkToggle className="h-5 w-5" />
      </Btn>
      <Btn label={t('引言')} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <InkQuote className="h-5 w-5" />
      </Btn>
      <Btn label={t('分隔線')} active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <InkDivider className="h-5 w-5" />
      </Btn>
      <Btn label={t('插入圖片')} active={false} onClick={() => pickAndInsertImage(editor.view, uploadImage)}>
        <InkImage className="h-5 w-5" />
      </Btn>

      <Divider />

      <Btn label={t('復原')} active={false} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <InkUndo className="h-5 w-5" />
      </Btn>
      <Btn label={t('重做')} active={false} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <InkRedo className="h-5 w-5" />
      </Btn>

      {onPromote && (
        <>
          <Divider />
          <Btn label={t('升級為任務')} active={false} onClick={() => onPromote(selectionOrLineText(editor))}>
            <InkAddTask className="h-5 w-5" />
          </Btn>
        </>
      )}
      </>)}
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
