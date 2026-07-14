'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import type { Workspace, Task } from '@/lib/types'
import { CategorySection } from './category-section'
import type { Density, MetaField } from './task-panel'
import { useDisplayColor } from '@/hooks/use-display-color'

interface WorkspaceSectionProps {
  workspace: Workspace
  density?: Density
  metaOrder?: MetaField[]
  onToggleCategoryCollapse: (categoryId: string) => void
  onReorderCategories?: (workspaceId: string, orderedCategoryIds: string[]) => void
  onToggleComplete: (taskId: string) => void
  onSelectTask: (task: Task) => void
  onAddTask: (categoryId: string, title: string) => void
  onAddCategory?: (workspaceId: string, name: string) => void
  onDeleteCategory?: (categoryId: string) => void
  onSendTaskToCalendar?: (taskId: string, date: string, startTime?: string, endTime?: string) => void
  onTaskDragActivate?: () => void
}

// Identifies a drag originating from a category header so we can ignore other
// drag sources (e.g. tasks being dragged onto the calendar) in the dragover
// handlers below.
const CATEGORY_DRAG_MIME = 'application/x-waddle-category'

export function WorkspaceSection({
  workspace,
  density = 'comfortable',
  metaOrder,
  onToggleCategoryCollapse,
  onReorderCategories,
  onToggleComplete,
  onSelectTask,
  onAddTask,
  onAddCategory,
  onDeleteCategory,
  onSendTaskToCalendar,
  onTaskDragActivate,
}: WorkspaceSectionProps) {
  const isMobile = useIsMobile()
  const displayColor = useDisplayColor()
  const wsColor = displayColor(workspace.color)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  // Drag-reorder state for category headers (desktop only). `draggingId` is the
  // category being dragged; `dropTarget` describes where the user is currently
  // hovering so we can render an insertion indicator. Nulled on dragend/drop.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)

  const sortedCategories = workspace.categories
    .filter((c) => !c.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const handleCategoryDragStart = (e: React.DragEvent, categoryId: string) => {
    if (!onReorderCategories) return
    e.dataTransfer.setData(CATEGORY_DRAG_MIME, categoryId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(categoryId)
  }

  const handleCategoryDragOver = (e: React.DragEvent, categoryId: string) => {
    if (!draggingId || draggingId === categoryId) return
    // Only react to drags we started ourselves — task drags use a different
    // payload and should fall through to the calendar drop target.
    if (!e.dataTransfer.types.includes(CATEGORY_DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    setDropTarget((prev) =>
      prev && prev.id === categoryId && prev.before === before ? prev : { id: categoryId, before }
    )
  }

  const handleCategoryDrop = (e: React.DragEvent, categoryId: string) => {
    if (!draggingId || !onReorderCategories) {
      setDraggingId(null)
      setDropTarget(null)
      return
    }
    e.preventDefault()
    const target = dropTarget && dropTarget.id === categoryId ? dropTarget : null
    setDraggingId(null)
    setDropTarget(null)
    if (!target || draggingId === categoryId) return

    const ids = sortedCategories.map((c) => c.id)
    const fromIdx = ids.indexOf(draggingId)
    if (fromIdx < 0) return
    ids.splice(fromIdx, 1)
    let toIdx = ids.indexOf(categoryId)
    if (toIdx < 0) return
    if (!target.before) toIdx += 1
    ids.splice(toIdx, 0, draggingId)
    onReorderCategories(workspace.id, ids)
  }

  const handleCategoryDragEnd = () => {
    setDraggingId(null)
    setDropTarget(null)
  }
  // Count total pending tasks
  const pendingCount = workspace.categories.reduce(
    (sum, cat) => sum + cat.tasks.filter((t) => !t.isCompleted).length,
    0
  )

  const handleAddCategory = () => {
    if (newCategoryName.trim() && onAddCategory) {
      onAddCategory(workspace.id, newCategoryName.trim())
      setNewCategoryName('')
      setIsAddingCategory(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddCategory()
    } else if (e.key === 'Escape') {
      setNewCategoryName('')
      setIsAddingCategory(false)
    }
  }

  return (
    <div className="mb-6">
      {/* Workspace Header */}
      <div className="flex items-center gap-3 px-1 mb-3">
        <div
          className="w-1 h-6 rounded-sm"
          style={{ backgroundColor: wsColor }}
        />
        <div className="flex-1 flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">
            {workspace.icon && <span className="mr-1">{workspace.icon}</span>}
            {workspace.name}
          </h3>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: `${wsColor}15`,
              color: wsColor
            }}
          >
            {pendingCount}
          </span>
        </div>
        {/* Always visible (not hover-revealed) — the whole point of moving it
            up from the list bottom is that users couldn't find it there. */}
        {onAddCategory && (
          <button
            type="button"
            onClick={() => setIsAddingCategory(true)}
            title="新增分類"
            aria-label={`在「${workspace.name}」新增分類`}
            className="h-6 w-6 grid place-items-center rounded-md text-muted-foreground/50 hover:text-primary hover:bg-muted/50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Categories. Desktop uses a left border + indent for visual hierarchy.
          Mobile drops both — narrow viewports look better with full-width
          sections, and the indent shifted content noticeably right. */}
      <div className={cn('space-y-1', isMobile ? '' : 'pl-3 border-l border-border ml-1')}>
        {/* Inline new-category input — right under the header whose ＋ opened
            it, so the eye doesn't have to jump to the bottom of the list. */}
        {isAddingCategory && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-primary/40 bg-primary/5">
            <Plus className="w-3.5 h-3.5 text-primary" />
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!newCategoryName.trim()) {
                  setIsAddingCategory(false)
                }
              }}
              placeholder="分類名稱..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
          </div>
        )}
        {sortedCategories.map((category) => {
          const isDragging = draggingId === category.id
          const dropIndicator =
            dropTarget && dropTarget.id === category.id
              ? (dropTarget.before ? 'before' : 'after')
              : null
          return (
            <CategorySection
              key={category.id}
              category={category}
              density={density}
              metaOrder={metaOrder}
              onToggleCollapse={onToggleCategoryCollapse}
              onToggleComplete={onToggleComplete}
              onSelectTask={onSelectTask}
              onAddTask={onAddTask}
              onDelete={onDeleteCategory}
              onSendTaskToCalendar={onSendTaskToCalendar}
              onTaskDragActivate={onTaskDragActivate}
              isReorderable={!!onReorderCategories && !isMobile}
              isDragging={isDragging}
              dropIndicator={dropIndicator}
              onHeaderDragStart={(e) => handleCategoryDragStart(e, category.id)}
              onHeaderDragOver={(e) => handleCategoryDragOver(e, category.id)}
              onHeaderDrop={(e) => handleCategoryDrop(e, category.id)}
              onHeaderDragEnd={handleCategoryDragEnd}
            />
          )
        })}
      </div>
    </div>
  )
}
