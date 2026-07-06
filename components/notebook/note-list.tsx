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
import { Plus, FileText, Trash2, GripVertical } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import type { NotebookNote } from '@/lib/types'
import { cn } from '@/lib/utils'

interface NoteListProps {
  notes: NotebookNote[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onReorder: (orderedIds: string[]) => void
}

export function NoteList({ notes, activeId, onSelect, onCreate, onDelete, onReorder }: NoteListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = notes.findIndex((n) => n.id === active.id)
    const newIndex = notes.findIndex((n) => n.id === over.id)
    onReorder(arrayMove(notes, oldIndex, newIndex).map((n) => n.id))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-3">
        <h2 className="text-sm font-semibold text-foreground">記事本</h2>
        <button
          type="button"
          onClick={onCreate}
          title="新增記事"
          aria-label="新增記事"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">還沒有記事</p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            建立第一篇
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
              {notes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  active={note.id === activeId}
                  onSelect={() => onSelect(note.id)}
                  onDelete={() => onDelete(note.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  )
}

function NoteRow({
  note,
  active,
  onSelect,
  onDelete,
}: {
  note: NotebookNote
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id })
  const [confirming, setConfirming] = useState(false)

  const style = { transform: CSS.Transform.toString(transform), transition }
  const title = note.title.trim() || '無標題'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative mb-0.5 flex items-center gap-2 rounded-lg pl-1 pr-1.5 transition-colors',
        active ? 'bg-primary/10' : 'hover:bg-secondary',
        isDragging && 'opacity-50',
      )}
    >
      <button
        type="button"
        className={cn(
          'flex w-11 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-md text-muted-foreground/30 transition-opacity',
          // Hover devices: hidden until the row is hovered. Touch devices
          // have no hover — keep it always visible there. w-11 self-stretch
          // gives a >=44x44 hit box (row height already clears 44px) since
          // a mouse-only 16px icon would otherwise be nearly untappable.
          'opacity-0 group-hover:opacity-100',
          '[@media(hover:none)]:opacity-60',
        )}
        aria-label="拖曳排序"
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
            {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true, locale: zhTW })}
          </span>
        </span>
      </button>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="flex min-h-11 items-center rounded px-2.5 text-[10px] font-medium text-destructive hover:bg-destructive/10"
          >
            刪除
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex min-h-11 items-center rounded px-2.5 text-[10px] text-muted-foreground hover:bg-secondary"
          >
            取消
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title="刪除記事"
          aria-label="刪除記事"
          className={cn(
            'flex w-11 shrink-0 items-center justify-center self-stretch rounded text-muted-foreground/50 transition-opacity',
            // Same touch-visibility treatment as the drag handle above.
            'opacity-0 hover:text-destructive group-hover:opacity-100',
            '[@media(hover:none)]:opacity-60',
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
