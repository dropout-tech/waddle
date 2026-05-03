'use client'

import { useState, useCallback, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { Toaster } from 'sonner'
import { MainLayout } from '@/components/layout/main-layout'
import { TaskDetailModal } from '@/components/modals/task-detail-modal'
import { ErrorBoundary } from '@/components/error-boundary'
import { KeyboardShortcutsHint } from '@/components/keyboard-shortcuts'
import { UserMenu } from '@/components/user-menu'
import { OnboardingTour } from '@/components/onboarding-tour'
import { SettingsModal } from '@/components/modals/settings-modal'
import { WaddleMascot } from '@/components/branding/waddle-mascot'
import { useWaddleData } from '@/hooks/use-waddle-data'
import { toDateString } from '@/lib/calendar-utils'
import type { Task, SlotType } from '@/lib/types'

export default function WaddlePage() {
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
    toggleCategoryCollapse,
    addTask,
    createTask,
    updateTask,
    toggleTaskComplete,
    deleteTask,
    rescheduleTask,
    unscheduleTask,
    addTimeBlock,
    updateTimeBlock,
    deleteTimeBlock,
    saveSettings,
  } = useWaddleData()

  // Slot types — generated dynamically from current workspaces, plus static
  // built-in time-block types (break/buffer/focus) and any user customs.
  const activeSlotTypes = useMemo<SlotType[]>(() => {
    const workspaceTypes: SlotType[] = workspaces
      .filter((ws) => !ws.isArchived)
      .map((ws, index) => ({
        id: `ws-${ws.id}`,
        key: `ws-${ws.id}`,
        label: ws.name,
        description: `新增任務到「${ws.name}」`,
        icon: ws.icon,
        iconType: 'emoji' as const,
        color: ws.color,
        sortOrder: index,
        isBuiltIn: true,
        workspaceId: ws.id,
      }))

    const baseTypes: SlotType[] = [
      { id: 'timeblock', key: 'timeblock', label: '時間區塊', description: '各類時間安排', icon: 'Layers', iconType: 'lucide', color: '#9CA3AF', sortOrder: workspaceTypes.length, isBuiltIn: true },
      { id: 'break', key: 'break', label: '午休', description: '休息時間', icon: 'Coffee', iconType: 'lucide', color: '#F6A854', parentId: 'timeblock', sortOrder: 0, isBuiltIn: true },
      { id: 'buffer', key: 'buffer', label: '緩衝', description: '彈性緩衝時間', icon: 'Clock', iconType: 'lucide', color: '#9BBFAC', parentId: 'timeblock', sortOrder: 1, isBuiltIn: true },
      { id: 'focus', key: 'focus', label: '專注', description: '專注工作時段', icon: 'Crosshair', iconType: 'lucide', color: '#D46B8A', parentId: 'timeblock', sortOrder: 2, isBuiltIn: true },
    ]

    const customTypes = settings.slotTypes?.filter((s) => !s.isBuiltIn) || []
    return [...workspaceTypes, ...baseTypes, ...customTypes]
  }, [workspaces, settings.slotTypes])

  // Modal state. taskMode distinguishes editing an existing task vs.
  // creating a new one through the same TaskDetailModal UI. In create mode,
  // selectedTask holds an in-memory draft until the user hits Save.
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskMode, setTaskMode] = useState<'edit' | 'create'>('edit')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const handleSelectTask = useCallback((task: Task) => {
    setTaskMode('edit')
    setSelectedTask(task)
  }, [])

  // Save handler shared by edit + create modes.
  const handleSaveTask = useCallback(async (updates: Partial<Task>, newCategoryId?: string) => {
    if (!selectedTask) return

    if (taskMode === 'create') {
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
      return
    }

    // edit mode
    await updateTask(selectedTask.id, updates, newCategoryId)
  }, [selectedTask, taskMode, workspaces, createTask, updateTask])

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
  ) => {
    const date = newEndOpt ? newStartOrDate : undefined
    const newStart = newEndOpt ? newEndOrStart : newStartOrDate
    const newEnd = newEndOpt ?? newEndOrStart
    return rescheduleTask(taskId, date, newStart, newEnd)
  }, [rescheduleTask])

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

  const handleCreateCalendarTask = useCallback(async (date: string, startTime: string, endTime: string) => {
    const firstWorkspace = workspaces[0]
    const firstCategory = firstWorkspace?.categories[0]
    if (!firstWorkspace || !firstCategory) return

    const now = new Date().toISOString()
    const newTask: Task = {
      id: crypto.randomUUID(),
      categoryId: firstCategory.id,
      workspaceId: firstWorkspace.id,
      workspaceName: firstWorkspace.name,
      workspaceColor: firstWorkspace.color,
      categoryName: firstCategory.name,
      title: '新任務',
      taskType: 'one_time',
      urgency: 5,
      calendarColor: firstWorkspace.color,
      isCompleted: false,
      sortOrder: firstCategory.tasks.length,
      scheduledDate: date,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      createdAt: now,
      updatedAt: now,
    }
    await createTask(newTask)
    setSelectedTask(newTask)
  }, [workspaces, createTask])

  if (isLoading) {
    return (
      <main className="h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <WaddleMascot className="w-20 h-20 animate-waddle-bob" />
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">載入中...</span>
          </div>
        </div>
      </main>
    )
  }

  return (
    <ErrorBoundary>
      <MainLayout
        workspaces={workspaces}
        timeBlocks={timeBlocks}
        slotTypes={activeSlotTypes}
        settings={settings}
        onToggleCategoryCollapse={toggleCategoryCollapse}
        onToggleComplete={toggleTaskComplete}
        onSelectTask={handleSelectTask}
        onAddTask={addTask}
        onAddCategory={addCategory}
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
        onUpdateTimeBlock={updateTimeBlock}
        onDeleteTimeBlock={deleteTimeBlock}
      />

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          mode={taskMode}
          workspaces={workspaces}
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
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

      <UserMenu />
      <OnboardingTour
        open={!onboardingCompleted}
        onComplete={completeOnboarding}
        onChoose={applyOnboardingChoice}
      />
      <KeyboardShortcutsHint />
      <Toaster position="bottom-right" richColors closeButton />
    </ErrorBoundary>
  )
}
