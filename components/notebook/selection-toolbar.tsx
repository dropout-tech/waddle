'use client'

import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { InkBold, InkItalic, InkUnderline, InkStrikethrough, InkInlineCode, InkLink } from '@/components/icons/huddle-icons'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { InkSwatches, InkTriggerIcon, type InkPalette } from './ink-swatches'

interface SelectionToolbarProps {
  editor: Editor | null
}

// Desktop-only floating format bar (Notion's "select text → toolbar appears"
// pattern). Mobile never mounts this — the OS's own text-selection menu owns
// that surface there, and stacking ours on top of it fights the system UI.
export function SelectionToolbar({ editor }: SelectionToolbarProps) {
  const { t } = useI18n()
  const [palette, setPalette] = useState<InkPalette | null>(null)
  if (!editor) return null

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
      <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md">
      <div className="flex items-center gap-0.5">
        <Btn label={t('粗體')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <InkBold className="h-5 w-5" />
        </Btn>
        <Btn label={t('斜體')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <InkItalic className="h-5 w-5" />
        </Btn>
        <Btn
          label={t('底線')}
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <InkUnderline className="h-5 w-5" />
        </Btn>
        <Btn
          label={t('刪除線')}
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <InkStrikethrough className="h-5 w-5" />
        </Btn>
        <Btn label={t('行內程式碼')} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <InkInlineCode className="h-5 w-5" />
        </Btn>
        <span className="mx-0.5 h-5 w-px bg-muted-foreground/45" aria-hidden />
        <Btn label={t('連結')} active={editor.isActive('link')} onClick={setLink}>
          <InkLink className="h-5 w-5" />
        </Btn>
        <span className="mx-0.5 h-5 w-px bg-muted-foreground/45" aria-hidden />
        <Btn label={t('文字顏色')} active={palette === 'color'} onClick={() => setPalette(palette === 'color' ? null : 'color')}>
          <InkTriggerIcon editor={editor} palette="color" />
        </Btn>
        <Btn label={t('螢光筆')} active={palette === 'highlight'} onClick={() => setPalette(palette === 'highlight' ? null : 'highlight')}>
          <InkTriggerIcon editor={editor} palette="highlight" />
        </Btn>
      </div>
      {palette && <InkSwatches editor={editor} palette={palette} onDone={() => setPalette(null)} className="border-t border-border/60 pt-0.5" />}
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
