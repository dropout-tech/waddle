'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ChevronLeft, Check, Loader2, CloudOff, PanelLeft, ListPlus } from 'lucide-react'
import { useNotebook } from '@/hooks/use-notebook'
import { useWaddleData } from '@/hooks/use-waddle-data'
import { TaskDetailModal } from '@/components/modals/task-detail-modal'
import type { Task } from '@/lib/types'
import { NoteList } from './note-list'
import { NoteEditor, type NoteEditorHandle } from './note-editor'
import { cn } from '@/lib/utils'

export function NotebookPage() {
  const router = useRouter()
  const {
    notes,
    loading,
    saveStatus,
    createNote,
    renameNote,
    setNoteIcon,
    saveNoteContent,
    deleteNote,
    reorderNotes,
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
        toast.error('沒有可升級的文字 — 先選取一段，或把游標放在某一行')
        return
      }
      const firstWs = workspaces.find((w) => !w.isArchived) || workspaces[0]
      const firstCat = firstWs?.categories.find((c) => !c.isArchived) || firstWs?.categories[0]
      if (!firstWs || !firstCat) {
        toast.error('請先在主面板建立工作區與分類')
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
    [workspaces],
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
      toast.success('已建立任務')
    },
    [draftTask, workspaces, createTask],
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

  const handleCreate = async () => {
    const note = await createNote()
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
    <div className="flex h-[100dvh] flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <button
          type="button"
          onClick={() => router.push('/')}
          title="返回面板"
          aria-label="返回面板"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {/* Mobile: toggle back to the list from the editor */}
        {mobilePane === 'editor' && (
          <button
            type="button"
            onClick={() => setMobilePane('list')}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            記事
          </button>
        )}
        <span className="ml-1 hidden text-sm font-semibold text-foreground md:inline">記事本</span>
        <div className="ml-auto flex items-center gap-1">
          {activeNote && (
            <button
              type="button"
              onClick={() => noteEditorRef.current?.promote()}
              title="升級為任務"
              aria-label="升級為任務"
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:flex"
            >
              <ListPlus className="h-3.5 w-3.5" />
              升級為任務
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
              activeId={activeId}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onDelete={deleteNote}
              onReorder={reorderNotes}
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
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <PanelLeft className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {loading ? '載入中…' : '選一篇記事，或建立新的一篇'}
              </p>
              {!loading && (
                <button
                  type="button"
                  onClick={handleCreate}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  新增記事
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
  if (!hasNote) return null
  if (status === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        儲存中
      </span>
    )
  if (status === 'error')
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <CloudOff className="h-3 w-3" />
        儲存失敗
      </span>
    )
  if (status === 'saved')
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3 w-3" />
        已儲存
      </span>
    )
  return null
}
