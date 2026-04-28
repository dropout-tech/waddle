'use client'

import { useState, useCallback } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { TaskDetailModal } from '@/components/modals/task-detail-modal'
import { JournalModal } from '@/components/modals/journal-modal'
import { ReportModal } from '@/components/modals/report-modal'
import { SettingsModal } from '@/components/modals/settings-modal'
import { mockWorkspaces, mockTimeBlocks } from '@/lib/mock-data'
import type { Workspace, Task, JournalEntry, ExportDataPayload, UserSettings, TimeBlock } from '@/lib/types'

const defaultSettings: UserSettings = {
  calendarStartHour: 6,
  calendarEndHour: 22,
  defaultView: 'day',
  weekStartDay: 0,
  weatherCity: 'Taipei',
  weatherUnit: 'celsius',
  lunchBreak: {
    enabled: true,
    startTime: '12:00',
    endTime: '13:00',
    color: '#F5F5F5',
  },
  bufferTime: {
    enabled: true,
    defaultDuration: 30,
    color: '#FFF8E1',
  },
  defaultTaskColors: {},
}

export default function FlowDeskPage() {
  // State for workspaces and tasks
  const [workspaces, setWorkspaces] = useState<Workspace[]>(mockWorkspaces)
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(mockTimeBlocks)
  const [settings, setSettings] = useState<UserSettings>(defaultSettings)

  // Modal states
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isJournalOpen, setIsJournalOpen] = useState(false)
  const [journalDate, setJournalDate] = useState(new Date())
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Toggle category collapse
  const handleToggleCategoryCollapse = useCallback((categoryId: string) => {
    setWorkspaces((prev) =>
      prev.map((workspace) => ({
        ...workspace,
        categories: workspace.categories.map((category) =>
          category.id === categoryId
            ? { ...category, isCollapsed: !category.isCollapsed }
            : category
        ),
      }))
    )
  }, [])

  // Toggle task completion
  const handleToggleComplete = useCallback((taskId: string) => {
    setWorkspaces((prev) =>
      prev.map((workspace) => ({
        ...workspace,
        categories: workspace.categories.map((category) => ({
          ...category,
          tasks: category.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  isCompleted: !task.isCompleted,
                  completedAt: !task.isCompleted
                    ? new Date().toISOString()
                    : undefined,
                }
              : task
          ),
        })),
      }))
    )
  }, [])

  // Select task to open detail modal
  const handleSelectTask = useCallback((task: Task) => {
    setSelectedTask(task)
  }, [])

  // Add new task
  const handleAddTask = useCallback((categoryId: string, title: string) => {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      categoryId,
      workspaceId: '',
      workspaceName: '',
      workspaceColor: '',
      categoryName: '',
      title,
      taskType: 'one_time',
      urgency: 5,
      calendarColor: '',
      isCompleted: false,
      sortOrder: 999,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setWorkspaces((prev) =>
      prev.map((workspace) => ({
        ...workspace,
        categories: workspace.categories.map((category) => {
          if (category.id === categoryId) {
            const enrichedTask = {
              ...newTask,
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              workspaceColor: workspace.color,
              categoryName: category.name,
              calendarColor: workspace.color,
            }
            return {
              ...category,
              tasks: [...category.tasks, enrichedTask],
            }
          }
          return category
        }),
      }))
    )
  }, [])

  // Add new category
  const handleAddCategory = useCallback((workspaceId: string, name: string) => {
    const newCategory = {
      id: `category-${Date.now()}`,
      workspaceId,
      name,
      sortOrder: 999,
      isCollapsed: false,
      isArchived: false,
      tasks: [],
    }

    setWorkspaces((prev) =>
      prev.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace
        return {
          ...workspace,
          categories: [...workspace.categories, newCategory],
        }
      })
    )
  }, [])

  // Update workspace color — also updates workspaceColor on all tasks that haven't
  // had their calendarColor manually overridden (i.e. calendarColor === old workspace color)
  const handleUpdateWorkspaceColor = useCallback((workspaceId: string, newColor: string) => {
    setWorkspaces((prev) =>
      prev.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace
        const oldColor = workspace.color
        return {
          ...workspace,
          color: newColor,
          categories: workspace.categories.map((category) => ({
            ...category,
            tasks: category.tasks.map((task) => ({
              ...task,
              workspaceColor: newColor,
              // Only update calendarColor if it was still the default workspace color
              calendarColor:
                task.calendarColor === oldColor ? newColor : task.calendarColor,
            })),
          })),
        }
      })
    )
  }, [])

  // Add new workspace
  const handleAddWorkspace = useCallback((name: string, color: string, icon: string) => {
    const newWorkspace: Workspace = {
      id: `workspace-${Date.now()}`,
      name,
      color,
      icon,
      sortOrder: workspaces.length,
      isArchived: false,
      categories: [
        {
          id: `category-${Date.now()}-default`,
          workspaceId: `workspace-${Date.now()}`,
          name: '一般',
          sortOrder: 0,
          isCollapsed: false,
          isArchived: false,
          tasks: [],
        },
      ],
    }

    setWorkspaces((prev) => [...prev, newWorkspace])
  }, [workspaces.length])

  // Delete task
  const handleDeleteTask = useCallback((taskId: string) => {
    setWorkspaces((prev) =>
      prev.map((workspace) => ({
        ...workspace,
        categories: workspace.categories.map((category) => ({
          ...category,
          tasks: category.tasks.filter((task) => task.id !== taskId),
        })),
      }))
    )
  }, [])

  // Update task from modal
  const handleSaveTask = useCallback((updates: Partial<Task>, newCategoryId?: string) => {
    if (!selectedTask) return

    if (newCategoryId && newCategoryId !== selectedTask.categoryId) {
      // Move task to new category
      setWorkspaces((prev) => {
        // First, remove task from old category
        const updatedWorkspaces = prev.map((workspace) => ({
          ...workspace,
          categories: workspace.categories.map((category) => ({
            ...category,
            tasks: category.tasks.filter((task) => task.id !== selectedTask.id),
          })),
        }))

        // Then, add task to new category
        return updatedWorkspaces.map((workspace) => ({
          ...workspace,
          categories: workspace.categories.map((category) => {
            if (category.id === newCategoryId) {
              return {
                ...category,
                tasks: [
                  ...category.tasks,
                  { ...selectedTask, ...updates, updatedAt: new Date().toISOString() },
                ],
              }
            }
            return category
          }),
        }))
      })
    } else {
      // Update task in place
      setWorkspaces((prev) =>
        prev.map((workspace) => ({
          ...workspace,
          categories: workspace.categories.map((category) => ({
            ...category,
            tasks: category.tasks.map((task) =>
              task.id === selectedTask.id
                ? { ...task, ...updates, updatedAt: new Date().toISOString() }
                : task
            ),
          })),
        }))
      )
    }
  }, [selectedTask])

  // Save settings
  const handleSaveSettings = useCallback((newSettings: UserSettings, newTimeBlocks: TimeBlock[]) => {
    setSettings(newSettings)
    setTimeBlocks(newTimeBlocks)
  }, [])

  // Create a new time block from calendar drag
  const handleCreateTimeBlock = useCallback((
    date: string,
    startTime: string,
    endTime: string,
    type: TimeBlock['type'],
    label: string,
    color: string,
  ) => {
    const newBlock: TimeBlock = {
      id: `block-${Date.now()}`,
      date,
      startTime,
      endTime,
      type,
      label,
      color,
      isRecurring: false,
    }
    setTimeBlocks((prev) => [...prev, newBlock])
  }, [])

  // Update time block (drag/resize)
  const handleUpdateTimeBlock = useCallback((id: string, updates: Partial<TimeBlock>) => {
    setTimeBlocks((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, ...updates } : block
      )
    )
  }, [])

  // Delete time block
  const handleDeleteTimeBlock = useCallback((id: string) => {
    setTimeBlocks((prev) => prev.filter((block) => block.id !== id))
  }, [])

  // Create task from calendar click or drag
  const handleCreateCalendarTask = useCallback((date: string, startTime: string, endTime: string) => {
    // Find the first available workspace and category
    const firstWorkspace = workspaces[0]
    const firstCategory = firstWorkspace?.categories[0]

    if (!firstWorkspace || !firstCategory) return

    const newTask: Task = {
      id: `task-${Date.now()}`,
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
      sortOrder: 999,
      scheduledDate: date,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setWorkspaces((prev) =>
      prev.map((workspace) => {
        if (workspace.id !== firstWorkspace.id) return workspace
        return {
          ...workspace,
          categories: workspace.categories.map((category) => {
            if (category.id !== firstCategory.id) return category
            return {
              ...category,
              tasks: [...category.tasks, newTask],
            }
          }),
        }
      })
    )

    // Open the task detail modal so user can edit
    setSelectedTask(newTask)
  }, [workspaces])

  // Open journal modal
  const handleOpenJournal = useCallback(() => {
    setJournalDate(new Date())
    setIsJournalOpen(true)
  }, [])

  // Save journal entry
  const handleSaveJournal = useCallback((entry: Partial<JournalEntry>) => {
    // In a real app, this would save to the database
    console.log('Saving journal entry:', entry)
  }, [])

  // Open report modal
  const handleOpenReport = useCallback(() => {
    setIsReportOpen(true)
  }, [])

  // Handle export
  const handleExport = useCallback((data: ExportDataPayload) => {
    console.log('Export data:', data)
    // Download as JSON
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flowdesk-report-${data.dateRange.start}-${data.dateRange.end}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // Get all tasks for journal task review
  const allTasks = workspaces.flatMap((w) =>
    w.categories.flatMap((c) => c.tasks)
  )
  const journalDateString = journalDate.toISOString().split('T')[0]
  const tasksForJournalDate = allTasks.filter(
    (t) => t.scheduledDate === journalDateString
  )

  // Report date range (current week)
  const getWeekRange = () => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start, end }
  }

  return (
    <>
      <MainLayout
        workspaces={workspaces}
        timeBlocks={timeBlocks}
        onToggleCategoryCollapse={handleToggleCategoryCollapse}
        onToggleComplete={handleToggleComplete}
        onSelectTask={handleSelectTask}
        onAddTask={handleAddTask}
        onAddCategory={handleAddCategory}
        onAddWorkspace={handleAddWorkspace}
        onUpdateWorkspaceColor={handleUpdateWorkspaceColor}
        onOpenJournal={handleOpenJournal}
        onOpenReport={handleOpenReport}
        onCreateCalendarTask={handleCreateCalendarTask}
        onCreateCalendarTimeBlock={handleCreateTimeBlock}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onUpdateTimeBlock={handleUpdateTimeBlock}
        onDeleteTimeBlock={handleDeleteTimeBlock}
      />

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          workspaces={workspaces}
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={handleSaveTask}
          onToggleComplete={handleToggleComplete}
          onDelete={handleDeleteTask}
        />
      )}

      {/* Journal Modal */}
      <JournalModal
        isOpen={isJournalOpen}
        date={journalDate}
        tasksForDate={tasksForJournalDate}
        onClose={() => setIsJournalOpen(false)}
        onSave={handleSaveJournal}
        onDateChange={setJournalDate}
      />

      {/* Report Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        workspaces={workspaces}
        dateRange={getWeekRange()}
        onExport={handleExport}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        timeBlocks={timeBlocks}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </>
  )
}
