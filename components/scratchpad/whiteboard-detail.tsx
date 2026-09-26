'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { NoteEditor } from '@/components/notebook/note-editor'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Dialog, DialogPortal, DialogOverlay, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/react'
import type { NotebookNote, ScratchpadItem, TiptapDoc } from '@/lib/types'
import { getWhiteboardDocument, whiteboardDocumentText } from '@/lib/whiteboard-document'

interface WhiteboardDetailProps {
  item: ScratchpadItem
  readOnly: boolean
  onUpdateItem: (id: string, patch: Partial<ScratchpadItem>) => void
  onClose: () => void
  /** Render inside this element (the full-screen whiteboard) instead of <body>. */
  container?: HTMLElement | null
}

/** A document view of the same whiteboard record; never creates a notebook note. */
export function WhiteboardDetail({ item, readOnly, onUpdateItem, onClose, container }: WhiteboardDetailProps) {
  const { t } = useI18n()
  const latest = useRef({ item, readOnly, onUpdateItem })
  useLayoutEffect(() => { latest.current = { item, readOnly, onUpdateItem } }, [item, readOnly, onUpdateItem])
  const pending = useRef<{ title?: string; document?: TiptapDoc; icon?: string | null }>({})
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const { item: current, readOnly: locked, onUpdateItem: update } = latest.current
    const draft = pending.current
    pending.current = {}
    if (locked || Object.keys(draft).length === 0) return
    const patch: Partial<ScratchpadItem> = {}
    if (draft.title !== undefined) patch.title = draft.title
    if (draft.document || draft.icon !== undefined) {
      patch.metadata = { ...current.metadata, ...(draft.document ? { document: draft.document } : {}), ...(draft.icon !== undefined ? { icon: draft.icon } : {}) }
    }
    if (draft.document && (current.type === 'text' || current.type === 'todo')) patch.content = whiteboardDocumentText(draft.document)
    latest.current = { ...latest.current, item: { ...current, ...patch } }
    update(current.id, patch)
  }, [])
  useEffect(() => () => flush(), [flush])
  const change = (patch: typeof pending.current) => {
    if (readOnly) return
    pending.current = { ...pending.current, ...patch }
    if (pending.current.title === (latest.current.item.title ?? '')) delete pending.current.title
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 500)
  }
  const close = () => { flush(); onClose() }
  const uploadImage = useCallback(async (file: File) => {
    if (latest.current.readOnly) throw new Error(t('唯讀'))
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error(t('尚未登入'))
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('notebook-images').upload(path, file, { cacheControl: '3600', contentType: file.type || undefined })
    if (error) throw error
    return supabase.storage.from('notebook-images').getPublicUrl(path).data.publicUrl
  }, [t])
  const note: NotebookNote = {
    id: item.id, title: item.title ?? '', content: getWhiteboardDocument(item),
    icon: item.metadata?.icon ?? undefined, categoryId: null, sortOrder: item.sortOrder,
    isArchived: false, createdAt: item.createdAt, updatedAt: item.createdAt,
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) close() }}>
      <DialogPortal container={container ?? undefined}>
        <DialogOverlay style={{ zIndex: 'calc(var(--z-index-toast) + 1)' }} />
      <DialogPrimitive.Content
        data-whiteboard-detail
        style={{ zIndex: 'calc(var(--z-index-toast) + 2)' }}
        className="fixed inset-0 m-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none bg-background p-0 shadow-lg sm:h-[90dvh] sm:max-w-4xl sm:rounded-xl"
        onEscapeKeyDown={event => {
          // Escape belongs to this focused writing surface, not the board behind it.
          event.stopPropagation()
        }}
        onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation() }}
      >
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-5">
          <button type="button" onClick={close} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowLeft className="size-4" aria-hidden="true" />{t('返回白板')}
          </button>
          <DialogTitle className="text-sm font-medium">{t('白板內容')}</DialogTitle>
          <span className="text-xs text-muted-foreground">{readOnly ? t('唯讀') : ''}</span>
        </header>
        <DialogDescription className="sr-only">{t('可使用記事本的文字格式、清單與圖片。')}</DialogDescription>
        <div className="min-h-0 flex-1" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) flush() }}>
          <NoteEditor key={item.id} note={note} readOnly={readOnly} immediateTitleChanges elevatedMenus
            onTitleChange={title => change({ title })}
            onContentChange={document => change({ document })}
            onIconChange={icon => change({ icon: icon ?? null })}
            uploadImage={uploadImage}
          />
        </div>
      </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
