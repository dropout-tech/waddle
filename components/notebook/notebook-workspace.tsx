'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, X, ChevronLeft, Check, Loader2, CloudOff, PanelLeft, ListPlus } from 'lucide-react'
import { useNotebook } from '@/hooks/use-notebook'
import { useWaddleData } from '@/hooks/use-waddle-data'
import { TaskDetailModal } from '@/components/modals/task-detail-modal'
import type { Task } from '@/lib/types'
import { NoteList } from './note-list'
import { NoteEditor, type NoteEditorHandle } from './note-editor'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

interface NotebookWorkspaceProps {
  /** Called when the user wants to leave the notebook — either navigate back
   *  (full-page route) or close the overlay (popover modal). The workspace
   *  itself never knows which container it's in. */
  onExit: () => void
  /** 'back' → ArrowLeft + "返回面板" (full-page route). 'close' → X +
   *  "關閉" (modal overlay). */
  exitVariant: 'back' | 'close'
}

/**
 * The notebook's actual content: note list + editor, "升級為任務" bridge,
 * save indicator. Shared by the full-page route (app/notebook/page.tsx via
 * notebook-page.tsx) and the pop-up overlay (notebook-overlay-provider.tsx)
 * so the two surfaces can't drift apart.
 *
 * Sizing is delegated entirely to the caller: this component is `flex h-full
 * flex-col` and expects a definite-height ancestor (either the viewport via
 * `h-[100dvh]` on the full-page shell, or ModalShell's sized panel).
 */
export function NotebookWorkspace({ onExit, exitVariant }: NotebookWorkspaceProps) {
  const { t } = useI18n()
  const {
    notes,
    categories,
    loading,
    saveStatus,
    createNote,
    renameNote,
    setNoteIcon,
    setNoteCategory,
    saveNoteContent,
    deleteNote,
    reorderNotes,
    createCategory,
    renameCategory,
    deleteCategory,
    uploadImage,
  } = useNotebook()

  // Reuse the board's task layer so "升級為任務" creates a real task with the
  // same modal + createTask path used everywhere else. Unlike the scratchpad,
  // the source line is a persistent document, so we never delete it on promote.
  const { workspaces, createTask } = useWaddleData()
  const [draftTask, setDraftTask] = useState<Task | null>(null)

  const handlePromote = useCallback(
    (rawTitle: string) => {
      const title = rawTitle.trim()
      if (!title) {
        toast.error(t('沒有可升級的文字 — 先選取一段，或把游標放在某一行'))
        return
      }
      const firstWs = workspaces.find((w) => !w.isArchived) || workspaces[0]
      const firstCat = firstWs?.categories.find((c) => !c.isArchived) || firstWs?.categories[0]
      if (!firstWs || !firstCat) {
        toast.error(t('請先在主面板建立工作區與分類'))
        return
      }
      setDraftTask({
        id: crypto.randomUUID(),
        categoryId: firstCat.id,
        workspaceId: firstWs.id,
        workspaceName: firstWs.name,
        workspaceColor: firstWs.color,
        categoryName: firstCat.name,
        title,
        taskType: 'one_time',
        urgency: 5,
        isCompleted: false,
        sortOrder: 0,
        calendarColor: firstWs.color,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    },
    [workspaces, t],
  )

  const handleSaveTask = useCallback(
    async (updates: Partial<Task>, newCategoryId?: string) => {
      if (!draftTask) return
      const targetCategoryId = newCategoryId || draftTask.categoryId
      const targetWorkspace = workspaces.find((w) => w.categories.some((c) => c.id === targetCategoryId))
      const targetCategory = targetWorkspace?.categories.find((c) => c.id === targetCategoryId)
      if (!targetWorkspace || !targetCategory) return
      const now = new Date().toISOString()
      await createTask({
        ...draftTask,
        ...updates,
        categoryId: targetCategoryId,
        workspaceId: targetWorkspace.id,
        workspaceName: targetWorkspace.name,
        workspaceColor: targetWorkspace.color,
        categoryName: targetCategory.name,
        sortOrder: targetCategory.tasks.length,
        createdAt: now,
        updatedAt: now,
      })
      toast.success(t('已建立任務'))
    },
    [draftTask, workspaces, createTask, t],
  )

  const [activeId, setActiveId] = useState<string | null>(null)
  // Mobile is single-pane: 'list' shows the sidebar, 'editor' shows the note.
  const [mobilePane, setMobilePane] = useState<'list' | 'editor'>('list')
  // Desktop's "升級為任務" header button lives outside NoteEditor (no direct
  // editor access), so it reaches in through this imperative handle.
  const noteEditorRef = useRef<NoteEditorHandle>(null)

  // Auto-select the first note once loaded (desktop convenience).
  useEffect(() => {
    if (!activeId && notes.length > 0) setActiveId(notes[0].id)
  }, [notes, activeId])

  // Keep a valid selection if the active note is deleted.
  useEffect(() => {
    if (activeId && !notes.some((n) => n.id === activeId)) {
      setActiveId(notes[0]?.id ?? null)
    }
  }, [notes, activeId])

  const activeNote = notes.find((n) => n.id === activeId) ?? null

  const handleCreate = (categoryId: string | null = null) => {
    const note = createNote(categoryId)
    if (note) {
      setActiveId(note.id)
      setMobilePane('editor')
    }
  }

  const handleSelect = (id: string) => {
    setActiveId(id)
    setMobilePane('editor')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <button
          type="button"
          onClick={onExit}
          title={exitVariant === 'back' ? t('返回面板') : t('關閉')}
          aria-label={exitVariant === 'back' ? t('返回面板') : t('關閉')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {exitVariant === 'back' ? <ArrowLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
        {/* Mobile: toggle back to the list from the editor */}
        {mobilePane === 'editor' && (
          <button
            type="button"
            onClick={() => setMobilePane('list')}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('記事')}
          </button>
        )}
        <span className="ml-1 hidden text-sm font-semibold text-foreground md:inline">{t('記事本')}</span>
        <div className="ml-auto flex items-center gap-1">
          {activeNote && (
            <button
              type="button"
              onClick={() => noteEditorRef.current?.promote()}
              title={t('升級為任務')}
              aria-label={t('升級為任務')}
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:flex"
            >
              <ListPlus className="h-3.5 w-3.5" />
              {t('升級為任務')}
            </button>
          )}
          <SaveIndicator status={saveStatus} hasNote={!!activeNote} />
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            'w-full shrink-0 border-r border-border bg-card md:w-72',
            mobilePane === 'editor' && 'hidden md:block',
          )}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <NoteList
              notes={notes}
              categories={categories}
              activeId={activeId}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onDelete={deleteNote}
              onReorder={reorderNotes}
              onSetNoteCategory={setNoteCategory}
              onCreateCategory={(name) => createCategory(name)}
              onRenameCategory={renameCategory}
              onDeleteCategory={deleteCategory}
            />
          )}
        </aside>

        {/* Editor */}
        <main
          className={cn(
            'min-w-0 flex-1 bg-background',
            mobilePane === 'list' && 'hidden md:block',
          )}
        >
          {activeNote ? (
            <NoteEditor
              key={activeNote.id}
              ref={noteEditorRef}
              note={activeNote}
              onTitleChange={(title) => renameNote(activeNote.id, title)}
              onContentChange={(content) => saveNoteContent(activeNote.id, content)}
              onIconChange={(icon) => setNoteIcon(activeNote.id, icon)}
              onPromote={handlePromote}
              uploadImage={uploadImage}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <PanelLeft className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {loading ? t('載入中…') : t('選一篇記事，或建立新的一篇')}
              </p>
              {!loading && (
                <button
                  type="button"
                  onClick={() => handleCreate()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t('新增記事')}
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {draftTask && (
        <TaskDetailModal
          task={draftTask}
          mode="create"
          workspaces={workspaces}
          isOpen={!!draftTask}
          onClose={() => setDraftTask(null)}
          onSave={handleSaveTask}
        />
      )}
    </div>
  )
}

function SaveIndicator({ status, hasNote }: { status: string; hasNote: boolean }) {
  const { t } = useI18n()
  if (!hasNote) return null
  if (status === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('儲存中')}
      </span>
    )
  if (status === 'error')
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <CloudOff className="h-3 w-3" />
        {t('儲存失敗')}
      </span>
    )
  if (status === 'saved')
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3 w-3" />
        {t('已儲存')}
      </span>
    )
  return null
}
