'use client'

/**
 * 便條紙視窗裡的記事本。
 *
 * 跟主視窗的 NotebookWorkspace 是兩個不同的東西，故意的：
 *  • 這裡不載入 `useWaddleData()`（整個 app 的任務/日曆資料，2900 行 hook）。
 *    一張便條紙只需要 `useNotebook()`，開起來快、記憶體省。代價是沒有
 *    「升級為任務」——那件事本來就該回主視窗做。
 *  • 版面是單欄：選一則 → 直接編輯。視窗只有 ~380px 寬，容不下側欄。
 *
 * 存檔沿用 `useNotebook()` 內建的 debounce + saveStatus，所以主視窗開著同一則
 * 筆記時，重新整理就會看到這裡打的字（兩邊都寫同一張 Supabase 表）。
 */
import { useEffect, useState } from 'react'
import { ArrowLeft, Check, CloudOff, Loader2, Plus, SquareArrowOutUpRight } from 'lucide-react'
import { useNotebook } from '@/hooks/use-notebook'
import { NoteEditor } from '@/components/notebook/note-editor'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

export function FloatingNote({ initialNoteId }: { initialNoteId?: string }) {
  const { t } = useI18n()
  const {
    notes, loading, saveStatus,
    createNote, renameNote, setNoteIcon, saveNoteContent, uploadImage,
  } = useNotebook()

  const [activeId, setActiveId] = useState<string | null>(initialNoteId ?? null)

  // 網址帶的 id 若不存在（筆記已被刪），退回列表而不是空畫面。
  useEffect(() => {
    if (activeId && !loading && !notes.some((n) => n.id === activeId)) setActiveId(null)
  }, [activeId, loading, notes])

  const activeNote = notes.find((n) => n.id === activeId) ?? null

  // 視窗標題就是筆記標題——使用者在工作列/Dock 上一眼認得出哪張是哪張。
  useEffect(() => {
    document.title = activeNote
      ? `${activeNote.icon ?? '📄'} ${activeNote.title.trim() || t('無標題')}`
      : t('記事本')
  }, [activeNote, t])

  const handleCreate = () => {
    const note = createNote(null)
    if (note) setActiveId(note.id)
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      {/* 標題列：便條紙的「窗框」。拖曳位置由作業系統的視窗管理處理，這裡只放動作。 */}
      <header className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        {activeNote ? (
          <button
            type="button"
            onClick={() => setActiveId(null)}
            aria-label={t('回到記事列表')}
            title={t('回到記事列表')}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="px-2 text-sm font-semibold">{t('記事本')}</span>
        )}

        <span className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground">
          {activeNote ? activeNote.title.trim() || t('無標題') : null}
        </span>

        {/* 存檔狀態——便條紙沒有「儲存」按鈕，使用者需要知道字進去了沒有。 */}
        <span className="shrink-0 px-1 text-muted-foreground" aria-live="polite">
          {saveStatus === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label={t('儲存中')} />}
          {saveStatus === 'saved' && <Check className="h-3.5 w-3.5 text-primary" aria-label={t('已儲存')} />}
          {saveStatus === 'error' && <CloudOff className="h-3.5 w-3.5 text-destructive" aria-label={t('儲存失敗')} />}
        </span>

        <button
          type="button"
          onClick={handleCreate}
          aria-label={t('新增記事')}
          title={t('新增記事')}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => window.open('/notebook', '_blank')}
          aria-label={t('在主視窗開啟')}
          title={t('在主視窗開啟')}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <SquareArrowOutUpRight className="h-4 w-4" />
        </button>
      </header>

      {loading ? (
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground">{t('載入中…')}</div>
      ) : activeNote ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NoteEditor
            key={activeNote.id}
            note={activeNote}
            onTitleChange={(title) => renameNote(activeNote.id, title)}
            onContentChange={(content) => saveNoteContent(activeNote.id, content)}
            onIconChange={(icon) => setNoteIcon(activeNote.id, icon)}
            uploadImage={uploadImage}
          />
        </div>
      ) : notes.length === 0 ? (
        <div className="grid flex-1 place-items-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">{t('還沒有記事')}</p>
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            {t('建立第一篇')}
          </button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => setActiveId(note.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                  'hover:bg-secondary',
                )}
              >
                <span className="shrink-0 text-base leading-none">{note.icon ?? '📄'}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{note.title.trim() || t('無標題')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
