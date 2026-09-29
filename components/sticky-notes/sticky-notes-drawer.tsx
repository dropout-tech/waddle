'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Check, FolderPlus, Pencil, Pin, Trash2, X } from 'lucide-react'
import type { StickyNote, TiptapDoc } from '@/lib/types'
import type { useStickyNotes } from '@/hooks/use-sticky-notes'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

// Above every sticky note: cards stack at `41 + zIndex` with no upper bound
// (see sticky-note-card.tsx), so the drawer can't use the shared z-popover
// token without eventually sliding under a busy wall of notes.
const DRAWER_Z = 2_000_000

/** Sentinel for the 未分類 tab (folder_id = null). */
const UNFILED = '__unfiled__'

function docText(doc: TiptapDoc | null): string {
  if (!doc) return ''
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as { text?: string; content?: unknown[] }
    if (typeof n.text === 'string') parts.push(n.text)
    if (Array.isArray(n.content)) {
      n.content.forEach(walk)
      parts.push(' ')
    }
  }
  walk(doc)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

interface StickyNotesDrawerProps {
  store: ReturnType<typeof useStickyNotes>
  onClose: () => void
  /** Pin a note back; the provider also switches the glass layer on. */
  onRestore: (id: string) => void
}

/**
 * 便條紙收納抽屜 — non-modal panel opened from the toolbar's 收納 button.
 * Lists every note in the selected folder (put away or still on screen),
 * lets the user pin put-away notes back, put on-screen ones away, move notes
 * between folders, and create / rename / delete folders. Folders are the
 * sticky notes' own (sticky_note_folders), not the notebook's.
 */
export function StickyNotesDrawer({ store, onClose, onRestore }: StickyNotesDrawerProps) {
  const { t } = useI18n()
  const { notes, folders, loading, stowNote, moveNoteToFolder, deleteNote, createFolder, renameFolder, deleteFolder } = store
  const [folderKey, setFolderKey] = useState<string>(UNFILED)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  // A deleted folder can't stay selected.
  const activeKey = folderKey === UNFILED || folders.some((f) => f.id === folderKey) ? folderKey : UNFILED
  const activeFolder = folders.find((f) => f.id === activeKey) ?? null

  const visible = useMemo(() => {
    const inFolder = notes.filter((n) => (activeKey === UNFILED ? n.folderId === null : n.folderId === activeKey))
    // Put-away notes first (that's what people come here for), newest first.
    return [...inFolder].sort((a, b) =>
      a.onScreen === b.onScreen ? b.updatedAt.localeCompare(a.updatedAt) : a.onScreen ? 1 : -1,
    )
  }, [notes, activeKey])

  const countFor = (key: string) =>
    notes.filter((n) => !n.onScreen && (key === UNFILED ? n.folderId === null : n.folderId === key)).length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !creating && !renaming) onClose()
    }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target || panelRef.current?.contains(target)) return
      if (target.closest('[data-sticky-drawer-trigger]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose, creating, renaming])

  const submitCreate = async () => {
    const name = draft.trim()
    setCreating(false)
    setDraft('')
    if (!name) return
    const folder = await createFolder(name)
    if (folder) setFolderKey(folder.id)
  }

  const submitRename = () => {
    if (activeFolder && draft.trim()) renameFolder(activeFolder.id, draft)
    setRenaming(false)
    setDraft('')
  }

  const chip = (key: string, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        setFolderKey(key)
        setRenaming(false)
      }}
      aria-pressed={activeKey === key}
      className={cn(
        'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        activeKey === key
          ? 'border-foreground/20 bg-secondary text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
      )}
    >
      <span className="max-w-[9rem] truncate">{label}</span>
      {countFor(key) > 0 && <span className="text-[10px] tabular-nums opacity-60">{countFor(key)}</span>}
    </button>
  )

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t('便條紙收納')}
      data-testid="sticky-notes-drawer"
      style={{ zIndex: DRAWER_Z }}
      className={cn(
        'fixed flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl',
        'inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[70dvh]',
        'sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-16 sm:w-[360px] sm:max-h-[min(560px,75dvh)]',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border py-1 pl-4 pr-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Archive className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('便條紙收納')}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('關閉')}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Folder chips */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2">
        {chip(UNFILED, t('未分類'))}
        {folders.map((f) => chip(f.id, f.name))}
        {creating ? (
          <input
            autoFocus
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitCreate()
              if (e.key === 'Escape') {
                setCreating(false)
                setDraft('')
              }
            }}
            placeholder={t('資料夾名稱')}
            aria-label={t('資料夾名稱')}
            className="h-9 w-32 shrink-0 rounded-full border border-border bg-background px-3 text-base sm:text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              setRenaming(false)
              setDraft('')
            }}
            aria-label={t('新增資料夾')}
            title={t('新增資料夾')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Folder actions (real folders only — 未分類 can't be renamed/deleted) */}
      {activeFolder && (
        <div className="flex items-center justify-between gap-2 px-4 pt-2 text-xs text-muted-foreground">
          {renaming ? (
            <input
              autoFocus
              value={draft}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitRename()
                if (e.key === 'Escape') {
                  setRenaming(false)
                  setDraft('')
                }
              }}
              aria-label={t('資料夾名稱')}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-base text-foreground sm:text-xs"
            />
          ) : (
            <span className="truncate">{activeFolder.name}</span>
          )}
          <div className="flex shrink-0 items-center">
            {renaming ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={submitRename}
                aria-label={t('完成')}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary hover:text-foreground"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRenaming(true)
                  setCreating(false)
                  setDraft(activeFolder.name)
                }}
                aria-label={t('重新命名資料夾')}
                title={t('重新命名資料夾')}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('刪除這個資料夾？裡面的便條紙會移到「未分類」，不會被刪掉。'))) {
                  deleteFolder(activeFolder.id)
                  setFolderKey(UNFILED)
                }
              }}
              aria-label={t('刪除資料夾')}
              title={t('刪除資料夾')}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {loading ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">{t('載入中…')}</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            {t('這裡還沒有便條紙。在便條紙右上角按「收起」，就會收進這裡。')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((note: StickyNote) => {
              const text = docText(note.content)
              return (
                <li
                  key={note.id}
                  data-testid="sticky-drawer-item"
                  className="sticky-note rounded-xl p-3"
                  data-color={note.color}
                >
                  <p className={cn('line-clamp-3 text-sm leading-snug', !text && 'italic text-foreground/50')}>
                    {text || t('（空白便條紙）')}
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    {note.onScreen ? (
                      <button
                        type="button"
                        onClick={() => stowNote(note.id)}
                        className="flex min-h-9 items-center gap-1 rounded-full bg-black/5 px-3 text-xs font-medium hover:bg-black/10"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden />
                        {t('收起')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRestore(note.id)}
                        data-testid="sticky-drawer-restore"
                        className="flex min-h-9 items-center gap-1 rounded-full bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
                      >
                        <Pin className="h-3.5 w-3.5" aria-hidden />
                        {t('貼回畫面')}
                      </button>
                    )}
                    {note.onScreen && <span className="text-[11px] text-foreground/50">{t('貼在畫面上')}</span>}
                    <div className="ml-auto flex items-center">
                      <select
                        value={note.folderId ?? UNFILED}
                        onChange={(e) => moveNoteToFolder(note.id, e.target.value === UNFILED ? null : e.target.value)}
                        aria-label={t('移到資料夾')}
                        title={t('移到資料夾')}
                        className="h-9 max-w-[7.5rem] truncate rounded-full border-0 bg-black/5 px-2 text-base hover:bg-black/10 sm:text-xs"
                      >
                        <option value={UNFILED}>{t('未分類')}</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t('確定刪除這張便條紙？'))) deleteNote(note.id)
                        }}
                        aria-label={t('刪除便條紙')}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/50 hover:bg-black/5 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
