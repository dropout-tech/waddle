'use client'

import { forwardRef, useEffect, useImperativeHandle, useState, type ComponentType } from 'react'
import type { Editor, Range } from '@tiptap/react'
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  ListChecks,
  List,
  ListOrdered,
  ChevronRight,
  Quote,
  Code2,
  Minus,
  Image as ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { pickAndInsertImage, type UploadImageFn } from './upload-image'

// Notion-style "/" block menu — item catalogue + the popup list itself.
// The Tiptap Suggestion plugin (slash-command.ts) owns positioning/lifecycle;
// this file only owns "what the 11 items are" and "how the list looks/behaves".

export interface SlashItem {
  id: string
  label: string
  /** Lowercase English filter aliases, matched against the typed query. */
  aliases: string[]
  description: string
  icon: ComponentType<{ className?: string }>
  run: (editor: Editor, range: Range) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'text',
    label: '文字',
    aliases: ['text', 'p', 'paragraph'],
    description: '純文字段落',
    icon: Type,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    id: 'h1',
    label: '標題 1',
    aliases: ['h1', 'heading', 'heading1'],
    description: '大標題',
    icon: Heading1,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: '標題 2',
    aliases: ['h2', 'heading2'],
    description: '中標題',
    icon: Heading2,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: '標題 3',
    aliases: ['h3', 'heading3'],
    description: '小標題',
    icon: Heading3,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    id: 'todo',
    label: '待辦清單',
    aliases: ['todo', 'task'],
    description: '可勾選的待辦事項',
    icon: ListChecks,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: 'bullet',
    label: '項目符號清單',
    aliases: ['bullet', 'ul', 'list'],
    description: '無序清單',
    icon: List,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'number',
    label: '編號清單',
    aliases: ['number', 'ol', 'ordered'],
    description: '有序清單',
    icon: ListOrdered,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'toggle',
    label: '收合區塊',
    aliases: ['toggle', 'details'],
    description: '可展開收合的內容',
    icon: ChevronRight,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setDetails().run(),
  },
  {
    id: 'quote',
    label: '引言',
    aliases: ['quote', 'blockquote'],
    description: '引用文字',
    icon: Quote,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    id: 'code',
    label: '程式碼區塊',
    aliases: ['code', 'codeblock'],
    description: '等寬字型程式碼',
    icon: Code2,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setCodeBlock().run(),
  },
  {
    id: 'divider',
    label: '分隔線',
    aliases: ['divider', 'hr', 'line'],
    description: '水平分隔線',
    icon: Minus,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
]

/** The "圖片" item is built per-call since it closes over `uploadImage` (the
 *  Supabase Storage upload fn from useNotebook), which isn't available at
 *  module load time. */
function createImageItem(uploadImage: UploadImageFn): SlashItem {
  return {
    id: 'image',
    label: '圖片',
    aliases: ['image', 'img', 'photo'],
    description: '插入一張圖片',
    icon: ImageIcon,
    run: (editor, range) => pickAndInsertImage(editor.view, uploadImage, { from: range.from, to: range.to }),
  }
}

/** Empty query → show everything; otherwise match the 中文 label or an alias.
 *  `uploadImage` is optional only for callers that genuinely can't offer
 *  image upload (e.g. isolated unit tests) — the notebook always passes it. */
export function filterSlashItems(query: string, uploadImage?: UploadImageFn): SlashItem[] {
  const items = uploadImage ? [...SLASH_ITEMS, createImageItem(uploadImage)] : SLASH_ITEMS
  const trimmed = query.trim()
  if (!trimmed) return items
  const q = trimmed.toLowerCase()
  return items.filter(
    (item) => item.label.includes(trimmed) || item.aliases.some((alias) => alias.includes(q)),
  )
}

export interface SlashMenuHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface SlashMenuProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(
  { items, command },
  ref,
) {
  const { t } = useI18n()
  const [selected, setSelected] = useState(0)

  // Keep the highlighted row in range whenever the filtered list changes.
  useEffect(() => setSelected(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false
      if (event.key === 'ArrowDown') {
        setSelected((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelected((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[selected]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  if (items.length === 0) return null

  return (
    <div
      role="listbox"
      aria-label={t('插入區塊')}
      className="max-h-80 w-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={i === selected}
            // onMouseDown + preventDefault: clicking mustn't blur the editor
            // before the block command has a chance to run against the caret.
            onMouseDown={(e) => {
              e.preventDefault()
              command(item)
            }}
            onMouseEnter={() => setSelected(i)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
              i === selected ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-secondary',
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium leading-tight">{t(item.label)}</span>
              <span className="block truncate text-xs text-muted-foreground leading-tight">
                {t(item.description)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
})
