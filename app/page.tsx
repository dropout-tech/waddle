'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { Toaster } from 'sonner'
import { MainLayout } from '@/components/layout/main-layout'
import { TaskDetailModal } from '@/components/modals/task-detail-modal'
import { TimeBlockModal } from '@/components/modals/time-block-modal'
import { ErrorBoundary } from '@/components/error-boundary'
import { KeyboardShortcutsHint } from '@/components/keyboard-shortcuts'
import { UserMenu } from '@/components/user-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { OnboardingTour } from '@/components/onboarding-tour'
import { SettingsModal } from '@/components/modals/settings-modal'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { DailyClearCelebration } from '@/components/celebration/daily-clear-celebration'
import { OverdueTaskReview } from '@/components/task-panel/overdue-task-review'
import { useWaddleData } from '@/hooks/use-waddle-data'
import { useMeetingReminders } from '@/hooks/use-meeting-reminders'
import { useWaterReminder } from '@/hooks/use-water-reminder'
import { useUndoShortcuts } from '@/hooks/use-undo-shortcuts'
import { WaterReminderModal } from '@/components/modals/water-reminder-modal'
import { toDateString } from '@/lib/calendar-utils'
import { findTaskById } from '@/lib/task-utils'
import { AuthGuard } from '@/components/auth/auth-guard'
import { CategoryPrefixProvider } from '@/components/category-prefix-context'
import { NotebookOverlayProvider } from '@/components/notebook/notebook-overlay-provider'
import { useI18n } from '@/lib/i18n/react'
import type { Task, SlotType, TimeBlock } from '@/lib/types'

function HuddlePage() {
  const isMobile = useIsMobile()
  const { t } = useI18n()
  const {
    workspaces,
    timeBlocks,
    settings,
    isLoading,
    onboardingCompleted,
    completeOnboarding,
    applyOnboardingChoice,
    addWorkspace,
    updateWorkspace,
    updateWorkspaceColor,
    archiveWorkspace,
    deleteWorkspace,
    addCategory,
    deleteCategory,
    toggleCategoryCollapse,
    reorderCategories,
    addTask,
    createTask,
    updateTask,
    toggleTaskComplete,
    completeTasks,
    deleteTask,
    rescheduleTask,
    unscheduleTask,
    addTimeBlock,
    updateTimeBlock,
    deleteTimeBlock,
    saveSettings,
    setQuickLinks,
    scratchpadByDate,
    addScratchpadItem,
    updateScratchpadItem,
    deleteScratchpadItem,
    reorderScratchpadItems,
    clearScratchpadDate,
  } = useWaddleData()

  // Watch all meetings and fire browser notifications N minutes before
  // each one starts. Pref + permission live in localStorage / Notification
  // API respectively; the hook is a no-op when either is missing.
  useMeetingReminders(workspaces)

  // Global ⌘Z / ⌘⇧Z — see hooks/use-undo-shortcuts.ts for the input-field guard.
  useUndoShortcuts()

  // Hourly (default) water-break nudge — friendly popup, off via settings.
  const water = useWaterReminder()

  // Slot types — generated dynamically from current workspaces, plus static
  // built-in time-block types (break/buffer/focus) and any user customs.
  const activeSlotTypes = useMemo<SlotType[]>(() => {
    const workspaceTypes: SlotType[] = workspaces
      .filter((ws) => !ws.isArchived)
      .map((ws, index) => ({
        id: `ws-${ws.id}`,
        key: `ws-${ws.id}`,
        label: ws.name,
        description: t('新增任務到「{name}」', { name: ws.name }),
        icon: ws.icon,
        iconType: 'emoji' as const,
        color: ws.color,
        sortOrder: index,
        isBuiltIn: true,
        workspaceId: ws.id,
      }))

    const baseTypes: SlotType[] = [
      { id: 'timeblock', key: 'timeblock', label: t('時間區塊'), description: t('各類時間安排'), icon: 'Layers', iconType: 'lucide', color: '#9CA3AF', sortOrder: workspaceTypes.length, isBuiltIn: true },
      { id: 'break', key: 'break', label: t('午休'), description: t('休息時間'), icon: 'Coffee', iconType: 'lucide', color: '#F6A854', parentId: 'timeblock', sortOrder: 0, isBuiltIn: true },
      { id: 'buffer', key: 'buffer', label: t('緩衝'), description: t('彈性緩衝時間'), icon: 'Clock', iconType: 'lucide', color: '#9BBFAC', parentId: 'timeblock', sortOrder: 1, isBuiltIn: true },
      { id: 'focus', key: 'focus', label: t('專注'), description: t('專注工作時段'), icon: 'Crosshair', iconType: 'lucide', color: '#D46B8A', parentId: 'timeblock', sortOrder: 2, isBuiltIn: true },
    ]

    const customTypes = settings.slotTypes?.filter((s) => !s.isBuiltIn) || []
    return [...workspaceTypes, ...baseTypes, ...customTypes]
    // `t` changes identity with the language, so these labels re-translate
    // when the user switches language.
  }, [workspaces, settings.slotTypes, t])

  // Modal state. taskMode distinguishes editing an existing task vs.
  // creating a new one through the same TaskDetailModal UI. In create mode,
  // selectedTask holds an in-memory draft until the user hits Save.
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState<string | undefined>()
  const [taskMode, setTaskMode] = useState<'edit' | 'create'>('edit')

  // Modal task is derived live from workspaces so toggles (complete /
  // uncomplete, edits) made through the modal reflect immediately. Before
  // this, the modal used the snapshot in selectedTask and quickly drifted
  // out of sync — clicking the checkbox once flipped the underlying state
  // but the modal still showed the old value, so the next click read as
  // "uncomplete" instead of a fresh "complete" (no chime). In create mode
  // selectedTask is a draft not yet in workspaces, so we keep it as-is.
  const liveSelectedTask = useMemo<Task | null>(() => {
    if (!selectedTask) return null
    if (taskMode === 'create') return selectedTask
    return findTaskById(workspaces, selectedTask.id) ?? selectedTask
  }, [selectedTask, workspaces, taskMode])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isOverdueReviewOpen, setIsOverdueReviewOpen] = useState(false)
  const [selectedTimeBlock, setSelectedTimeBlock] = useState<TimeBlock | null>(null)

  const handleSelectTask = useCallback((task: Task, occurrenceDate?: string) => {
    setTaskMode('edit')
    setSelectedTask(task)
    setSelectedOccurrenceDate(occurrenceDate)
  }, [])

  const handleSelectTimeBlock = useCallback((block: TimeBlock) => {
    setSelectedTimeBlock(block)
  }, [])

  const handleReturnToBacklog = useCallback((taskId: string) => {
    return updateTask(taskId, {
      dueDate: '',
      scheduledDate: '',
      scheduledStartTime: '',
      scheduledEndTime: '',
      showInTaskList: true,
    })
  }, [updateTask])

  const handleArchiveTask = useCallback((taskId: string) => {
    return updateTask(taskId, {
      isArchived: true,
      archivedAt: new Date().toISOString(),
    })
  }, [updateTask])

  // When a scratchpad note is promoted, we stage a draft task in the modal but
  // DON'T delete the source note yet — only after the task is actually saved
  // (see handleSaveTask). Cancelling the modal leaves the note intact.
  const promotedScratchpadIdRef = useRef<string | null>(null)

  const handlePromoteToTask = useCallback((title: string, description: string | undefined, sourceId: string) => {
    const firstWs = workspaces.find(w => !w.isArchived) || workspaces[0]
    const firstCat = firstWs?.categories.find(c => !c.isArchived) || firstWs?.categories[0]
    if (!firstCat) return

    promotedScratchpadIdRef.current = sourceId
    setTaskMode('create')
    setSelectedTask({
      id: crypto.randomUUID(),
      categoryId: firstCat.id,
      workspaceId: firstWs.id,
      workspaceName: firstWs.name,
      workspaceColor: firstWs.color,
      categoryName: firstCat.name,
      title,
      description,
      taskType: 'one_time',
      urgency: 5,
      isCompleted: false,
      sortOrder: 0,
      calendarColor: firstWs.color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }, [workspaces])

  // Save handler shared by edit + create modes.
  const handleSaveTask = useCallback(async (updates: Partial<Task>, newCategoryId?: string, recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice, targetDate?: string) => {
    if (!selectedTask) return

    if (taskMode === 'create') {
      // Snapshot the promote source NOW, before any await. The modal fires
      // onSave un-awaited then calls onClose synchronously, and onClose nulls
      // the ref — so reading the ref after `await createTask` would always see
      // null. Capturing here makes the delete robust to that ordering.
      const promotedId = promotedScratchpadIdRef.current
      promotedScratchpadIdRef.current = null
      const targetCategoryId = newCategoryId || selectedTask.categoryId
      const targetWorkspace = workspaces.find((w) =>
        w.categories.some((c) => c.id === targetCategoryId)
      )
      const targetCategory = targetWorkspace?.categories.find((c) => c.id === targetCategoryId)
      if (!targetWorkspace || !targetCategory) return
      const now = new Date().toISOString()
      const newTask: Task = {
        ...selectedTask,
        ...updates,
        categoryId: targetCategoryId,
        workspaceId: targetWorkspace.id,
        workspaceName: targetWorkspace.name,
        workspaceColor: targetWorkspace.color,
        categoryName: targetCategory.name,
        sortOrder: targetCategory.tasks.length,
        createdAt: now,
        updatedAt: now,
      }
      await createTask(newTask)
      // Task persisted — now it's safe to remove the source scratchpad note
      // (if this create came from a "promote to task"). On a thrown createTask
      // we skip the delete, so the note survives.
      if (promotedId) deleteScratchpadItem(promotedId)
      return
    }

    // edit mode
    await updateTask(selectedTask.id, updates, newCategoryId, recurrenceChoice, targetDate)
  }, [selectedTask, taskMode, workspaces, createTask, updateTask, deleteScratchpadItem])

  // Open the TaskDetailModal in create mode with a draft task pre-filled
  // from the calendar slot the user clicked.
  const handleOpenCreateTask = useCallback(
    (slotType: SlotType, date: string, startTime: string, endTime: string) => {
      const targetWorkspace = slotType.workspaceId
        ? workspaces.find((w) => w.id === slotType.workspaceId)
        : workspaces[0]
      if (!targetWorkspace || targetWorkspace.categories.length === 0) return
      const targetCategory = targetWorkspace.categories[0]
      const now = new Date().toISOString()
      const draft: Task = {
        id: crypto.randomUUID(),
        categoryId: targetCategory.id,
        workspaceId: targetWorkspace.id,
        workspaceName: targetWorkspace.name,
        workspaceColor: targetWorkspace.color,
        categoryName: targetCategory.name,
        title: '',
        taskType: 'one_time',
        urgency: 5,
        scheduledDate: date,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        calendarColor: slotType.color || targetWorkspace.color,
        isCompleted: false,
        showInTaskList: true,
        sortOrder: targetCategory.tasks.length,
        createdAt: now,
        updatedAt: now,
      }
      setTaskMode('create')
      setSelectedTask(draft)
    },
    [workspaces]
  )

  // Calendar drag → either creates a task in workspace or a time block,
  // depending on whether the slot type maps to a workspace.
  const handleCreateTimeBlock = useCallback(async (
    date: string,
    startTime: string,
    endTime: string,
    type: string,
    label: string,
    color: string,
    notes?: string,
    description?: string,
  ) => {
    const slotType = activeSlotTypes.find((s) => s.key === type)

    if (slotType?.workspaceId) {
      const workspace = workspaces.find((w) => w.id === slotType.workspaceId)
      if (workspace && workspace.categories.length > 0) {
        const defaultCategory = workspace.categories[0]
        const now = new Date().toISOString()
        const newTask: Task = {
          id: crypto.randomUUID(),
          categoryId: defaultCategory.id,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          workspaceColor: workspace.color,
          categoryName: defaultCategory.name,
          title: label || slotType.label,
          taskType: 'one_time',
          urgency: 5,
          scheduledDate: date,
          scheduledStartTime: startTime,
          scheduledEndTime: endTime,
          calendarColor: color || workspace.color,
          isCompleted: false,
          notes: notes || undefined,
          description: description || undefined,
          sortOrder: defaultCategory.tasks.length,
          createdAt: now,
          updatedAt: now,
        }
        await createTask(newTask)
        return
      }
    }

    await addTimeBlock({
      date, startTime, endTime, type, label, color, isRecurring: false,
    })
  }, [activeSlotTypes, workspaces, createTask, addTimeBlock])

  const handleRescheduleTask = useCallback((
    taskId: string,
    newStartOrDate: string,
    newEndOrStart: string,
    newEndOpt?: string,
    recurrenceChoice?: import('@/components/modals/recurrence-choice-modal').RecurrenceChoice,
    targetDate?: string
  ) => {
    const date = newEndOpt ? newStartOrDate : undefined
    const newStart = newEndOpt ? newEndOrStart : newStartOrDate
    const newEnd = newEndOpt ?? newEndOrStart
    return rescheduleTask(taskId, date, newStart, newEnd, recurrenceChoice, targetDate)
  }, [rescheduleTask])

  // Drag-from-task-row handler: drop on grid → schedule, drop on pending
  // zone → just set the date (still pending). Routes to existing mutations.
  const handleSendToCalendar = useCallback(
    (taskId: string, date: string, startTime?: string, endTime?: string) => {
      if (startTime && endTime) {
        rescheduleTask(taskId, date, startTime, endTime)
      } else {
        unscheduleTask(taskId, date)
      }
    },
    [rescheduleTask, unscheduleTask]
  )

  const handleMoveTask = useCallback(
    (taskId: string, categoryId: string) => {
      const task = findTaskById(workspaces, taskId)
      if (!task || task.categoryId === categoryId) return
      return updateTask(taskId, {}, categoryId)
    },
    [updateTask, workspaces]
  )

  const handleCreatePendingTask = useCallback(async (title: string) => {
    const firstWorkspace = workspaces[0]
    const firstCategory = firstWorkspace?.categories[0]
    if (!firstWorkspace || !firstCategory) return

    const today = toDateString(new Date())
    const now = new Date().toISOString()
    const newTask: Task = {
      id: crypto.randomUUID(),
      categoryId: firstCategory.id,
      workspaceId: firstWorkspace.id,
      workspaceName: firstWorkspace.name,
      workspaceColor: firstWorkspace.color,
      categoryName: firstCategory.name,
      title,
      taskType: 'one_time',
      urgency: 5,
      calendarColor: firstWorkspace.color,
      isCompleted: false,
      sortOrder: firstCategory.tasks.length,
      scheduledDate: today,
      createdAt: now,
      updatedAt: now,
    }
    await createTask(newTask)
  }, [workspaces, createTask])

  const handleCreateCalendarTask = useCallback(async (date: string, startTime?: string, endTime?: string) => {
    const firstWorkspace = workspaces[0]
    const firstCategory = firstWorkspace?.categories[0]
    if (!firstWorkspace || !firstCategory) return

    const now = new Date().toISOString()
    // No times → create as a pending (unscheduled) task on that date so it
    // shows up in the calendar's pending zone instead of the timeline.
    const newTask: Task = {
      id: crypto.randomUUID(),
      categoryId: firstCategory.id,
      workspaceId: firstWorkspace.id,
      workspaceName: firstWorkspace.name,
      workspaceColor: firstWorkspace.color,
      categoryName: firstCategory.name,
      title: t('新任務'),
      taskType: 'one_time',
      urgency: 5,
      calendarColor: firstWorkspace.color,
      isCompleted: false,
      sortOrder: firstCategory.tasks.length,
      scheduledDate: date,
      ...(startTime ? { scheduledStartTime: startTime } : {}),
      ...(endTime ? { scheduledEndTime: endTime } : {}),
      createdAt: now,
      updatedAt: now,
    }
    await createTask(newTask)
    // The task is already persisted — open the modal in EDIT mode so the
    // follow-up Save goes through updateTask, not a second createTask with
    // the same id (which would hit a tasks_pkey 23505 duplicate). taskMode is
    // sticky, so without this it could still be 'create' from a prior action.
    setTaskMode('edit')
    setSelectedTask(newTask)
  }, [workspaces, createTask, t])

  if (isLoading) {
    return (
      <main className="h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <HuddleMascot className="w-20 h-20 animate-waddle-bob" />
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{t('載入中...')}</span>
          </div>
        </div>
      </main>
    )
  }

  return (
    <ErrorBoundary>
      <CategoryPrefixProvider value={settings.showCategoryPrefix ?? true}>
      <NotebookOverlayProvider>
      <MainLayout
        workspaces={workspaces}
        timeBlocks={timeBlocks}
        slotTypes={activeSlotTypes}
        settings={settings}
        onToggleCategoryCollapse={toggleCategoryCollapse}
        onReorderCategories={reorderCategories}
        onToggleComplete={toggleTaskComplete}
        onSelectTask={handleSelectTask}
        onAddTask={addTask}
        onAddCategory={addCategory}
        onDeleteCategory={deleteCategory}
        onDeleteTask={deleteTask}
        onSendTaskToCalendar={handleSendToCalendar}
        onMoveTask={handleMoveTask}
        onAddWorkspace={addWorkspace}
        onUpdateWorkspaceColor={updateWorkspaceColor}
        onUpdateWorkspace={updateWorkspace}
        onDeleteWorkspace={deleteWorkspace}
        onArchiveWorkspace={archiveWorkspace}
        onCreateCalendarTask={handleCreateCalendarTask}
        onCreatePendingTask={handleCreatePendingTask}
        onCreateCalendarTimeBlock={handleCreateTimeBlock}
        onOpenCreateTask={handleOpenCreateTask}
        onRescheduleTask={handleRescheduleTask}
        onUnscheduleTask={unscheduleTask}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenOverdueReview={() => setIsOverdueReviewOpen(true)}
        onUpdateTimeBlock={updateTimeBlock}
        onDeleteTimeBlock={deleteTimeBlock}
        onTimeBlockSelect={handleSelectTimeBlock}
        onSetQuickLinks={setQuickLinks}
        scratchpadByDate={scratchpadByDate}
        onAddScratchpadItem={addScratchpadItem}
        onUpdateScratchpadItem={updateScratchpadItem}
        onDeleteScratchpadItem={deleteScratchpadItem}
        onReorderScratchpadItems={reorderScratchpadItems}
        onClearScratchpadDate={clearScratchpadDate}
        onPromoteToTask={handlePromoteToTask}
      />
      </NotebookOverlayProvider>
      </CategoryPrefixProvider>

      <OverdueTaskReview
        isOpen={isOverdueReviewOpen}
        workspaces={workspaces}
        onClose={() => setIsOverdueReviewOpen(false)}
        onComplete={toggleTaskComplete}
        onCompleteAll={completeTasks}
        onReturnToBacklog={handleReturnToBacklog}
        onArchive={handleArchiveTask}
        onSelectTask={handleSelectTask}
      />

      {liveSelectedTask && (
        <TaskDetailModal
          task={liveSelectedTask}
          occurrenceDate={selectedOccurrenceDate}
          mode={taskMode}
          workspaces={workspaces}
          isOpen={!!liveSelectedTask}
          onClose={() => {
            // Cancelling a promote: drop the pending link, keep the note.
            promotedScratchpadIdRef.current = null
            setSelectedTask(null)
            setSelectedOccurrenceDate(undefined)
          }}
          onSave={handleSaveTask}
          onToggleComplete={taskMode === 'edit' ? toggleTaskComplete : undefined}
          onDelete={taskMode === 'edit' ? deleteTask : undefined}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        timeBlocks={timeBlocks}
        workspaces={workspaces}
        onClose={() => setIsSettingsOpen(false)}
        onSave={saveSettings}
      />

      <TimeBlockModal
        block={selectedTimeBlock}
        isOpen={!!selectedTimeBlock}
        slotTypes={activeSlotTypes}
        onClose={() => setSelectedTimeBlock(null)}
        onSave={(id, updates) => updateTimeBlock(id, updates)}
        onDelete={(id) => deleteTimeBlock(id)}
      />

      {/* Desktop: floating top-right. Mobile renders an inline UserMenu
          inside each panel header so it doesn't cover content. */}
      {!isMobile && <UserMenu />}
      <OnboardingTour
        open={!onboardingCompleted}
        onComplete={completeOnboarding}
        onChoose={applyOnboardingChoice}
      />
      <KeyboardShortcutsHint />
      <DailyClearCelebration />
      <Toaster position="bottom-right" richColors closeButton />
      <WaterReminderModal
        isOpen={water.isOpen}
        onDrink={water.dismiss}
        onSnooze={water.snooze}
        onDisable={water.disable}
      />
    </ErrorBoundary>
  )
}

// AuthGuard ensures HuddlePage (and its legacy data hook) only mounts for an
// authenticated user; otherwise it redirects to /login. This replaces the
// server middleware that previously gated this route.
export default function Page() {
  return (
    <AuthGuard>
      <HuddlePage />
    </AuthGuard>
  )
}
