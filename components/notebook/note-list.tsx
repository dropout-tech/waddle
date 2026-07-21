'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  FileText,
  Trash2,
  GripVertical,
  FolderPlus,
  ChevronDown,
  Pencil,
  FolderInput,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhTW, enUS } from 'date-fns/locale'
import type { NotebookNote, NotebookCategory } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'

// Sentinel id for the always-present "未分類" bucket's local collapse state —
// never sent to the server, just a key inside the collapsed-set below.
const UNCATEGORIZED_KEY = '__uncategorized__'

interface NoteListProps {
  notes: NotebookNote[]
  categories: NotebookCategory[]
  activeId: string | null
  onSelect: (id: string) => void
  /** Omit categoryId (or pass null) to create at the top level (未分類). */
  onCreate: (categoryId?: string | null) => void
  onDelete: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onSetNoteCategory: (noteId: string, categoryId: string | null) => void
  onCreateCategory: (name: string) => void
  onRenameCategory: (id: string, name: string) => void
  onDeleteCategory: (id: string) => void
}

// Folder-style two-level sidebar: 分類 (collapsible) → 筆記, plus a permanent
// 未分類 bucket at the bottom. Visual language borrows from
// task-panel/workspace-section.tsx + category-section.tsx (collapsible
// header, indent, hover actions) but flattened to one level — the notebook
// has no workspace tier.
export function NoteList({
  notes,
  categories,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onReorder,
  onSetNoteCategory,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
}: NoteListProps) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const sortedCategories = [...categories]
    .filter((c) => !c.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const categoryIds = new Set(sortedCategories.map((c) => c.id))
  const uncategorized = notes
    .filter((n) => !n.categoryId || !categoryIds.has(n.categoryId))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // A drag only ever reorders within one group's SortableContext, so we only
  // get (oldIndex, newIndex) scoped to that group. reorderNotes() in the hook
  // replaces the *entire* notes array with whatever ids you pass it, so we
  // must always hand it every note id — we splice the group's new order back
  // into its original slots and leave every other note's position untouched.
  const commitGroupReorder = (groupNotes: NotebookNote[], oldIndex: number, newIndex: number) => {
    const newGroupOrder = arrayMove(groupNotes, oldIndex, newIndex).map((n) => n.id)
    const groupIdSet = new Set(groupNotes.map((n) => n.id))
    let gi = 0
    const fullOrder = notes.map((n) => (groupIdSet.has(n.id) ? newGroupOrder[gi++] : n.id))
    onReorder(fullOrder)
  }

  const handleAddCategorySubmit = () => {
    const name = newCategoryName.trim()
    if (name) onCreateCategory(name)
    setNewCategoryName('')
    setAddingCategory(false)
  }

  const isFullyEmpty = notes.length === 0 && sortedCategories.length === 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-3">
        <h2 className="text-sm font-semibold text-foreground">{t('記事本')}</h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            title={t('新增分類')}
            aria-label={t('新增分類')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onCreate()}
            title={t('新增記事')}
            aria-label={t('新增記事')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isFullyEmpty && !addingCategory ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">{t('還沒有記事')}</p>
          <button
            type="button"
            onClick={() => onCreate()}
            className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('建立第一篇')}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {addingCategory && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1.5">
              <FolderPlus className="h-3.5 w-3.5 shrink-0 text-primary" />
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategorySubmit()
                  else if (e.key === 'Escape') {
                    setNewCategoryName('')
                    setAddingCategory(false)
                  }
                }}
                onBlur={() => {
                  if (!newCategoryName.trim()) setAddingCategory(false)
                }}
                placeholder={t('分類名稱…')}
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                autoFocus
              />
            </div>
          )}

          {sortedCategories.map((category) => {
            const groupNotes = notes
              .filter((n) => n.categoryId === category.id)
              .sort((a, b) => a.sortOrder - b.sortOrder)
            return (
              <CategoryGroup
                key={category.id}
                category={category}
                notes={groupNotes}
                allCategories={sortedCategories}
                collapsed={collapsed.has(category.id)}
                onToggleCollapse={() => toggleCollapse(category.id)}
                activeId={activeId}
                onSelect={onSelect}
                onDelete={onDelete}
                onCreateNote={() => onCreate(category.id)}
                onRenameCategory={(name) => onRenameCategory(category.id, name)}
                onDeleteCategory={() => onDeleteCategory(category.id)}
                onSetNoteCategory={onSetNoteCategory}
                onReorderWithin={(oldIdx, newIdx) => commitGroupReorder(groupNotes, oldIdx, newIdx)}
              />
            )
          })}

          <UncategorizedGroup
            notes={uncategorized}
            allCategories={sortedCategories}
            collapsed={collapsed.has(UNCATEGORIZED_KEY)}
            onToggleCollapse={() => toggleCollapse(UNCATEGORIZED_KEY)}
            activeId={activeId}
            onSelect={onSelect}
            onDelete={onDelete}
            onSetNoteCategory={onSetNoteCategory}
            onReorderWithin={(oldIdx, newIdx) => commitGroupReorder(uncategorized, oldIdx, newIdx)}
          />
        </div>
      )}
    </div>
  )
}

function CategoryGroup({
  category,
  notes,
  allCategories,
  collapsed,
  onToggleCollapse,
  activeId,
  onSelect,
  onDelete,
  onCreateNote,
  onRenameCategory,
  onDeleteCategory,
  onSetNoteCategory,
  onReorderWithin,
}: {
  category: NotebookCategory
  notes: NotebookNote[]
  allCategories: NotebookCategory[]
  collapsed: boolean
  onToggleCollapse: () => void
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onCreateNote: () => void
  onRenameCategory: (name: string) => void
  onDeleteCategory: () => void
  onSetNoteCategory: (noteId: string, categoryId: string | null) => void
  onReorderWithin: (oldIndex: number, newIndex: number) => void
}) {
  const { t } = useI18n()
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(category.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Seed the draft from the latest name only when entering edit mode — avoids
  // a set-state-in-effect that would fire on every unrelated re-render.
  const startRename = () => {
    setNameDraft(category.name)
    setRenaming(true)
  }

  const commitRename = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== category.name) onRenameCategory(trimmed)
    else setNameDraft(category.name)
    setRenaming(false)
  }

  return (
    <div className="mb-1">
      <div className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-secondary">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground"
          aria-label={collapsed ? t('展開分類') : t('收合分類')}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-150', collapsed && '-rotate-90')} />
        </button>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
          aria-hidden
        />
        <span className="shrink-0 text-sm leading-none">{category.icon ?? '📁'}</span>

        {renaming ? (
          <input
            type="text"
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') {
                setNameDraft(category.name)
                setRenaming(false)
              }
            }}
            className="min-w-0 flex-1 border-b border-primary/40 bg-transparent text-xs font-semibold text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={startRename}
            onClick={onToggleCollapse}
            className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-foreground/80"
            title={t('雙擊改名')}
          >
            {category.name.trim() || t('未命名分類')}
          </button>
        )}

        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{notes.length}</span>

        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100',
            '[@media(hover:none)]:opacity-60',
          )}
        >
          <button
            type="button"
            onClick={onCreateNote}
            title={t('在此新增記事')}
            aria-label={t('在此新增記事')}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={startRename}
            title={t('改名')}
            aria-label={t('改名')}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {confirmingDelete ? (
            <span className="flex items-center gap-1 pl-0.5">
              <button
                type="button"
                onClick={onDeleteCategory}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/10"
              >
                {t('刪除')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary"
              >
                {t('取消')}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              title={t('刪除分類')}
              aria-label={t('刪除分類')}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!collapsed &&
        (notes.length === 0 ? (
          <p className="px-3 py-1 text-[11px] text-muted-foreground/50">{t('尚無記事')}</p>
        ) : (
          <div className="pl-2">
            <NoteRowsSortable
              notes={notes}
              activeId={activeId}
              allCategories={allCategories}
              onSelect={onSelect}
              onDelete={onDelete}
              onSetNoteCategory={onSetNoteCategory}
              onReorderWithin={onReorderWithin}
            />
          </div>
        ))}
    </div>
  )
}

function UncategorizedGroup({
  notes,
  allCategories,
  collapsed,
  onToggleCollapse,
  activeId,
  onSelect,
  onDelete,
  onSetNoteCategory,
  onReorderWithin,
}: {
  notes: NotebookNote[]
  allCategories: NotebookCategory[]
  collapsed: boolean
  onToggleCollapse: () => void
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onSetNoteCategory: (noteId: string, categoryId: string | null) => void
  onReorderWithin: (oldIndex: number, newIndex: number) => void
}) {
  const { t } = useI18n()
  return (
    <div className={cn('mb-1', allCategories.length > 0 && 'mt-2 border-t border-border/60 pt-2')}>
      <button
        type="button"
        onClick={onToggleCollapse}
        className="group flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-secondary"
        aria-expanded={!collapsed}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-150', collapsed && '-rotate-90')} />
        <span className="text-xs font-semibold text-muted-foreground">{t('未分類')}</span>
        <span className="ml-auto text-[10px] font-medium text-muted-foreground">{notes.length}</span>
      </button>

      {!collapsed &&
        (notes.length === 0 ? (
          <p className="px-3 py-1 text-[11px] text-muted-foreground/50">{t('沒有未分類的記事')}</p>
        ) : (
          <div className="pl-2">
            <NoteRowsSortable
              notes={notes}
              activeId={activeId}
              allCategories={allCategories}
              onSelect={onSelect}
              onDelete={onDelete}
              onSetNoteCategory={onSetNoteCategory}
              onReorderWithin={onReorderWithin}
            />
          </div>
        ))}
    </div>
  )
}

// Shared drag-to-reorder list used by both a category group and the
// 未分類 bucket. Each instance owns its own DndContext, so dragging never
// crosses group boundaries — moving a note to a different category goes
// through the "移到分類" menu on each row instead.
function NoteRowsSortable({
  notes,
  activeId,
  allCategories,
  onSelect,
  onDelete,
  onSetNoteCategory,
  onReorderWithin,
}: {
  notes: NotebookNote[]
  activeId: string | null
  allCategories: NotebookCategory[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onSetNoteCategory: (noteId: string, categoryId: string | null) => void
  onReorderWithin: (oldIndex: number, newIndex: number) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = notes.findIndex((n) => n.id === active.id)
    const newIndex = notes.findIndex((n) => n.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorderWithin(oldIndex, newIndex)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        {notes.map((note) => (
          <NoteRow
            key={note.id}
            note={note}
            active={note.id === activeId}
            allCategories={allCategories}
            onSelect={() => onSelect(note.id)}
            onDelete={() => onDelete(note.id)}
            onMoveToCategory={(categoryId) => onSetNoteCategory(note.id, categoryId)}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}

function NoteRow({
  note,
  active,
  allCategories,
  onSelect,
  onDelete,
  onMoveToCategory,
}: {
  note: NotebookNote
  active: boolean
  allCategories: NotebookCategory[]
  onSelect: () => void
  onDelete: () => void
  onMoveToCategory: (categoryId: string | null) => void
}) {
  const { t, lang } = useI18n()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id })
  const [confirming, setConfirming] = useState(false)

  const style = { transform: CSS.Transform.toString(transform), transition }
  const title = note.title.trim() || t('無標題')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative mb-0.5 flex items-center gap-1 rounded-lg pl-1 pr-1 transition-colors',
        active ? 'bg-primary/10' : 'hover:bg-secondary',
        isDragging && 'opacity-50',
      )}
    >
      <button
        type="button"
        className={cn(
          'flex w-9 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-md text-muted-foreground/30 transition-opacity',
          // Hover devices: hidden until the row is hovered. Touch devices
          // have no hover — keep it always visible there.
          'opacity-0 group-hover:opacity-100',
          '[@media(hover:none)]:opacity-60',
        )}
        aria-label={t('拖曳排序')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left">
        <span className="shrink-0 text-base leading-none">{note.icon ?? '📄'}</span>
        <span className="flex min-w-0 flex-col">
          <span className={cn('truncate text-sm', active ? 'font-medium text-foreground' : 'text-foreground/90')}>
            {title}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(note.updatedAt), {
              addSuffix: true,
              locale: lang === 'en' ? enUS : zhTW,
            })}
          </span>
        </span>
      </button>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onDelete}
            className="flex min-h-9 items-center rounded px-2 text-[10px] font-medium text-destructive hover:bg-destructive/10"
          >
            {t('刪除')}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex min-h-9 items-center rounded px-2 text-[10px] text-muted-foreground hover:bg-secondary"
          >
            {t('取消')}
          </button>
        </span>
      ) : (
        <span
          className={cn(
            'flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100',
            '[@media(hover:none)]:opacity-60',
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={t('移到分類')}
                aria-label={t('移到分類')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground"
              >
                <FolderInput className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground">{t('移到分類')}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={note.categoryId === null}
                onSelect={() => onMoveToCategory(null)}
                className="text-xs"
              >
                {t('未分類')}
              </DropdownMenuItem>
              {allCategories.length > 0 && <DropdownMenuSeparator />}
              {allCategories.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  disabled={note.categoryId === c.id}
                  onSelect={() => onMoveToCategory(c.id)}
                  className="text-xs"
                >
                  <span className="mr-1">{c.icon ?? '📁'}</span>
                  {c.name.trim() || t('未命名分類')}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            title={t('刪除記事')}
            aria-label={t('刪除記事')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-opacity hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  )
}
