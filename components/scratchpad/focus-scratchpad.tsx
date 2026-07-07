'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  ChevronDown, ChevronUp, Image, Link2, Type,
  Trash2, Calendar, Sparkles, ChevronLeft, ChevronRight,
  Pencil, Check, GripVertical, Square, CheckSquare, ArrowUpRight
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import type { ScratchpadItem } from '@/lib/types'

interface FocusScratchpadProps {
  className?: string
  /**
   * When provided, the component is controlled — internal isExpanded
   * state is ignored. Used by the mobile layout so the bottom tab
   * bar's 白板 button can drive the open state.
   */
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Hide the built-in pull-down trigger (mobile uses an external button). */
  hideTrigger?: boolean
  // Cloud-synced scratchpad — see useWaddleData. Keyed by YYYY-MM-DD.
  // Items within each date are ordered oldest-first (by sort_order); new
  // items append to the end, drag reorders persist the new sort_order.
  scratchpadByDate: Record<string, ScratchpadItem[]>
  onAddItem: (date: string, item: ScratchpadItem) => void
  onUpdateItem: (id: string, patch: Partial<ScratchpadItem>) => void
  onDeleteItem: (id: string) => void
  onReorderItems: (date: string, items: ScratchpadItem[]) => void
  onClearDate: (date: string) => void
  /**
   * Promote a scratchpad item to a real Huddle task. The source item is NOT
   * deleted here — the page deletes it only after the task is actually saved,
   * so cancelling the task modal leaves the note intact (see app/page.tsx).
   */
  onPromoteToTask?: (title: string, description: string | undefined, sourceId: string) => void
}

// Phase 1 block types. Heading/divider/callout/toggle/rich_text are deferred —
// they belong to a vertical-document layout, not this card grid.
type BlockType = 'text' | 'image' | 'link' | 'todo'

export function FocusScratchpad({
  className,
  isOpen,
  onOpenChange,
  hideTrigger,
  scratchpadByDate,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  onClearDate,
  onPromoteToTask,
}: FocusScratchpadProps) {
  const todayKey = toDateString(new Date())
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isControlled = isOpen !== undefined
  const isExpanded = isControlled ? !!isOpen : internalExpanded
  const setIsExpanded = (next: boolean) => {
    if (isControlled) {
      onOpenChange?.(next)
    } else {
      setInternalExpanded(next)
    }
  }
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [inputMode, setInputMode] = useState<'link' | null>(null)
  const [textInput, setTextInput] = useState('')
  const [linkInput, setLinkInput] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const isToday = selectedDate === todayKey

  // Esc collapses the panel when expanded. If an item is mid-edit, its own
  // textarea/input already handles Esc locally (cancelEdit) — we skip so
  // that keypress cancels the edit first instead of yanking the whole panel
  // shut in one step. A second Esc (once editingId clears) then collapses.
  useEffect(() => {
    if (!isExpanded) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editingId !== null) return
      setIsExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setIsExpanded closes over isControlled/onOpenChange, re-created each render; isExpanded/editingId are the only values that should re-trigger this
  }, [isExpanded, editingId])

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const date = new Date(year, month - 1, day)
    const weekday = weekdays[date.getDay()]
    return `${year}年${month}月${day}日 星期${weekday}`
  }

  const items = useMemo(
    () => scratchpadByDate[selectedDate] ?? [],
    [scratchpadByDate, selectedDate],
  )
  const savedDates = useMemo(
    () =>
      Object.keys(scratchpadByDate)
        .filter((d) => (scratchpadByDate[d]?.length ?? 0) > 0)
        .sort()
        .reverse(),
    [scratchpadByDate],
  )

  const goToPreviousDate = () => {
    const currentIndex = savedDates.indexOf(selectedDate)
    if (currentIndex < savedDates.length - 1) {
      setSelectedDate(savedDates[currentIndex + 1])
    }
  }

  const goToNextDate = () => {
    const currentIndex = savedDates.indexOf(selectedDate)
    if (currentIndex > 0) {
      setSelectedDate(savedDates[currentIndex - 1])
    } else if (selectedDate !== todayKey) {
      setSelectedDate(todayKey)
    }
  }

  const canGoPrevious = savedDates.indexOf(selectedDate) < savedDates.length - 1
  const canGoNext = selectedDate !== todayKey

  // Focus + move caret to end when an item enters edit mode.
  useEffect(() => {
    const el = editTextareaRef.current
    if (editingId && el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editingId])

  // Press-and-hold to drag so taps and scroll pass through on touch (the
  // mobile surface is a scrollable bottom sheet); distance fallback for mouse.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      const reordered = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
        ...item,
        sortOrder: index * 10,
      }))
      onReorderItems(selectedDate, reordered)
    }
  }

  // New items always go to today (the quick-add bar only renders on today).
  // sort_order is assigned authoritatively in useWaddleData from current state,
  // so concurrent adds can't collide — the value here is a placeholder.
  const addBlock = (block: Pick<ScratchpadItem, 'type' | 'content'> & Partial<ScratchpadItem>) => {
    const newItem: ScratchpadItem = {
      id: crypto.randomUUID(),
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      ...block,
    }
    onAddItem(todayKey, newItem)
    return newItem
  }

  const handleTextInputChange = (val: string) => {
    setTextInput(val)
    // Markdown shortcut: "[] " starts a checkable todo block, then drops
    // straight into editing it. (Heading/list shortcuts are deferred with the
    // document layout — see BlockType.)
    if (val === '[] ') {
      const created = addBlock({ type: 'todo', content: '', isChecked: false })
      setTextInput('')
      setEditingId(created.id)
      setEditText('')
    }
  }

  const addTextItem = () => {
    if (!textInput.trim()) return
    addBlock({ type: 'text', content: textInput.trim() })
    setTextInput('')
  }

  const addLinkItem = () => {
    if (!linkInput.trim()) return
    let url = linkInput.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    addBlock({ type: 'link', content: url, title: linkTitle.trim() || url })
    setLinkInput('')
    setLinkTitle('')
    setInputMode(null)
  }

  const addImageFromFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('圖片大小不能超過 5MB')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      addBlock({ type: 'image', content: reader.result as string })
    }
    reader.readAsDataURL(file)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) addImageFromFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (!isToday) return
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) addImageFromFile(file)
        return
      }
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (!isToday) return
    const files = e.dataTransfer.files
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      addImageFromFile(files[0])
    }
  }

  const startEditText = (item: ScratchpadItem) => {
    setEditingId(item.id)
    setEditText(item.content)
  }

  const startEditLink = (item: ScratchpadItem) => {
    setEditingId(item.id)
    setEditUrl(item.content)
    setEditTitle(item.title && item.title !== item.content ? item.title : '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
    setEditUrl('')
    setEditTitle('')
  }

  const saveEdit = () => {
    if (!editingId) return
    const item = items.find(i => i.id === editingId)
    if (!item) return

    if (item.type === 'link') {
      let url = editUrl.trim()
      if (!url) { cancelEdit(); return } // empty url: bail without sticking the editor open
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }
      onUpdateItem(editingId, { content: url, title: editTitle.trim() || url })
    } else {
      // Don't persist a blank text note (a blank todo stays — its checkbox is
      // the point); use delete to remove instead.
      if (item.type === 'text' && !editText.trim()) { cancelEdit(); return }
      onUpdateItem(editingId, { content: editText })
    }
    cancelEdit()
  }

  const toggleTodo = (item: ScratchpadItem) => {
    onUpdateItem(item.id, { isChecked: !item.isChecked })
  }

  const promoteToTask = (item: ScratchpadItem) => {
    // Hand the note to the task-create modal; the page deletes the source item
    // only after the task is saved, so cancelling loses nothing (fixes CR-01).
    onPromoteToTask?.(item.content, undefined, item.id)
  }

  const clearAll = () => {
    if (confirm('確定要清除所有暫存內容嗎？')) {
      onClearDate(todayKey)
    }
  }

  return (
    <>
      {/* Backdrop */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-popover"
          onClick={() => setIsExpanded(false)}
        />
      )}

      <div className={cn('relative z-toast', className)}>
        {/* Pull Tab */}
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 top-0',
            'transition-all duration-300',
            isExpanded || hideTrigger ? 'opacity-0 pointer-events-none' : 'opacity-100'
          )}
        >
          <button
            data-tour="scratchpad"
            onClick={() => { setIsExpanded(true); setSelectedDate(todayKey) }}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-b-xl',
              'bg-card/95 backdrop-blur-sm border border-t-0 border-border shadow-lg',
              'hover:bg-secondary/80 transition-all group',
              'text-xs font-medium text-muted-foreground hover:text-foreground'
            )}
          >
            <Sparkles className="w-3 h-3" />
            <span>專注白板</span>
            {items.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                {items.length}
              </span>
            )}
            <ChevronDown className="w-3 h-3 group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>

        {/* Expanded Panel */}
        <div
          ref={panelRef}
          className={cn(
            hideTrigger
              ? cn(
                  'fixed left-0 right-0 top-0 bottom-[58px]',
                  'bg-card border-t border-border shadow-2xl',
                  'transition-transform duration-300 ease-out',
                  isExpanded ? '' : 'pointer-events-none',
                )
              : cn(
                  'absolute left-0 right-0 top-0',
                  'bg-card border-b border-border shadow-xl',
                  'transition-all duration-300 ease-out overflow-hidden',
                  isExpanded ? 'max-h-[85vh] opacity-100' : 'max-h-0 opacity-0 pointer-events-none',
                )
          )}
          style={hideTrigger ? {
            paddingTop: 'env(safe-area-inset-top)',
            transform: isExpanded
              ? 'translateY(0)'
              : 'translateY(calc(100% + 58px))',
          } : undefined}
          onPaste={handlePaste}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
        <div className={hideTrigger ? 'h-full overflow-y-auto' : ''}>
        {isDragging && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary/50 z-modal flex items-center justify-center">
            <div className="text-primary font-medium">放開以新增圖片</div>
          </div>
        )}

        <div className="max-w-4xl mx-auto p-4 md:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">專注白板</h2>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <button
                    onClick={goToPreviousDate}
                    disabled={!canGoPrevious}
                    className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-1.5 px-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(selectedDate)}</span>
                    {isToday && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                        今天
                      </span>
                    )}
                  </div>
                  <button
                    onClick={goToNextDate}
                    disabled={!canGoNext}
                    className="p-1 rounded hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {items.length > 0 && isToday && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清除
                </button>
              )}
              <button
                onClick={() => setIsExpanded(false)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary/80 hover:bg-secondary text-xs font-medium transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                收起
              </button>
            </div>
          </div>

          {/* Quick Add Bar */}
          {isToday ? (
            <div className="flex items-center gap-2 mb-6 p-2 rounded-2xl bg-secondary/30 border border-border/50">
              <div className="flex-1 flex items-center gap-2 px-3">
                <Type className="w-4 h-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={textInput}
                  onChange={(e) => handleTextInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addTextItem()
                  }}
                  placeholder="記下想法，或輸入 [] 建立待辦…"
                  className="flex-1 bg-transparent border-0 text-sm focus:outline-none placeholder:text-muted-foreground/60"
                />
              </div>
              <div className="flex items-center gap-1 pr-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-background/80 transition-all"
                  title="新增圖片"
                >
                  <Image className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setInputMode(inputMode === 'link' ? null : 'link')}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    inputMode === 'link' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-background/80"
                  )}
                  title="新增連結"
                >
                  <Link2 className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-6 p-4 rounded-xl bg-secondary/30 border border-border">
              <span className="text-sm text-muted-foreground">這是過去日期的記錄，僅供查看</span>
              <button
                onClick={() => setSelectedDate(todayKey)}
                className="text-sm font-medium text-primary hover:underline"
              >
                返回今天
              </button>
            </div>
          )}

          {/* Link Input Overlay */}
          {inputMode === 'link' && (
            <div className="mb-6 p-4 rounded-2xl bg-card border border-primary/20 shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">連結網址</label>
                <input
                  type="url"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-secondary/50 border-0 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">顯示標題（可選）</label>
                <input
                  type="text"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="輸入自訂標題..."
                  className="w-full bg-secondary/50 border-0 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && addLinkItem()}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setLinkInput(''); setLinkTitle(''); setInputMode(null) }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={addLinkItem}
                  disabled={!linkInput.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  新增連結
                </button>
              </div>
            </div>
          )}

          {/* Items Grid */}
          {items.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-3xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-sm font-medium text-foreground mb-1">準備好開始記錄了嗎？</h3>
              <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                專注白板是你的「快取空間」，隨手記下想法、待辦或連結，讓大腦保持清爽。
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[55vh] overflow-y-auto pb-2">
                  {items.map((item) => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      isEditing={editingId === item.id}
                      editText={editText}
                      editUrl={editUrl}
                      editTitle={editTitle}
                      isToday={isToday}
                      onEdit={() => item.type === 'link' ? startEditLink(item) : startEditText(item)}
                      onDelete={() => onDeleteItem(item.id)}
                      onToggleTodo={() => toggleTodo(item)}
                      onPromote={() => promoteToTask(item)}
                      onCancelEdit={cancelEdit}
                      onSaveEdit={saveEdit}
                      onUpdateEditText={setEditText}
                      onUpdateEditUrl={setEditUrl}
                      onUpdateEditTitle={setEditTitle}
                      editTextareaRef={editTextareaRef}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Close Handle */}
        <div className="flex justify-center pb-4">
          <button
            onClick={() => setIsExpanded(false)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all active:scale-95"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span>收起白板</span>
          </button>
        </div>
        </div>
      </div>
    </div>
    </>
  )
}

function SortableItem({
  item,
  isEditing,
  editText,
  editUrl,
  editTitle,
  isToday,
  onEdit,
  onDelete,
  onToggleTodo,
  onPromote,
  onCancelEdit,
  onSaveEdit,
  onUpdateEditText,
  onUpdateEditUrl,
  onUpdateEditTitle,
  editTextareaRef,
}: {
  item: ScratchpadItem
  isEditing: boolean
  editText: string
  editUrl: string
  editTitle: string
  isToday: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleTodo: () => void
  onPromote: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onUpdateEditText: (v: string) => void
  onUpdateEditUrl: (v: string) => void
  onUpdateEditTitle: (v: string) => void
  editTextareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  }

  const time = new Date(item.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  // Actions stay visible on touch (no hover); fade-on-hover only from md up.
  const actionVis = 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
  const canPromote = item.type === 'text' || item.type === 'todo'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-xl border border-border bg-background/50 transition-all overflow-hidden',
        isDragging ? 'bg-primary/5 shadow-md' : 'hover:bg-background hover:shadow-md'
      )}
    >
      {/* Drag handle (top-left) */}
      {isToday && !isEditing && (
        <div
          {...attributes}
          {...listeners}
          className={cn(
            'absolute top-2 left-2 z-panel p-1 rounded-lg bg-background/80 backdrop-blur-sm cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-primary transition-all',
            actionVis
          )}
        >
          <GripVertical className="w-3 h-3" />
        </div>
      )}

      {/* Action cluster (top-right) */}
      {isToday && !isEditing && (
        <div className={cn('absolute top-2 right-2 z-panel flex items-center gap-1 transition-opacity', actionVis)}>
          {item.type !== 'image' && (
            <button
              onClick={onEdit}
              aria-label="編輯"
              className="p-1 rounded-lg bg-background/80 backdrop-blur-sm hover:bg-primary/10 hover:text-primary transition-all"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {canPromote && (
            <button
              onClick={onPromote}
              aria-label="轉換為正式任務"
              title="轉換為正式任務"
              className="p-1 rounded-lg bg-background/80 backdrop-blur-sm hover:bg-primary/10 hover:text-primary transition-all"
            >
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={onDelete}
            aria-label="刪除"
            className="p-1 rounded-lg bg-background/80 backdrop-blur-sm hover:bg-destructive/10 hover:text-destructive transition-all"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {isEditing ? (
        <div className="p-3 space-y-2">
          {item.type === 'link' ? (
            <>
              <input
                value={editUrl}
                onChange={(e) => onUpdateEditUrl(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary/30 outline-none"
                placeholder="網址"
                onKeyDown={(e) => { if (e.key === 'Escape') onCancelEdit() }}
                autoFocus
              />
              <input
                value={editTitle}
                onChange={(e) => onUpdateEditTitle(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary/30 outline-none"
                placeholder="標題（可選）"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEdit()
                  if (e.key === 'Escape') onCancelEdit()
                }}
              />
            </>
          ) : (
            <textarea
              ref={editTextareaRef}
              value={editText}
              onChange={(e) => onUpdateEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSaveEdit()
                if (e.key === 'Escape') onCancelEdit()
              }}
              placeholder="編輯內容...（Ctrl+Enter 儲存，Esc 取消）"
              className="w-full bg-transparent border-0 resize-none text-sm focus:outline-none min-h-[60px]"
            />
          )}
          <div className="flex justify-end gap-1.5">
            <button onClick={onCancelEdit} className="px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:bg-secondary transition-colors">取消</button>
            <button onClick={onSaveEdit} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Check className="w-3 h-3" /> 儲存
            </button>
          </div>
        </div>
      ) : (
        <>
          {item.type === 'todo' && (
            <div className="p-3">
              <div className="flex items-start gap-2">
                <button
                  onClick={onToggleTodo}
                  className={cn(
                    'mt-0.5 flex-shrink-0 transition-colors',
                    item.isChecked ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                  )}
                  aria-label={item.isChecked ? '標記為未完成' : '標記為完成'}
                >
                  {item.isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>
                <p className={cn(
                  'text-sm break-words line-clamp-4',
                  item.isChecked ? 'text-muted-foreground line-through' : 'text-foreground'
                )}>
                  {item.content || <span className="text-muted-foreground/50 italic">空白待辦…</span>}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">{time}</p>
            </div>
          )}

          {item.type === 'text' && (
            <div className="p-3">
              <p className="text-sm text-foreground line-clamp-4 whitespace-pre-wrap">{item.content}</p>
              <p className="text-[10px] text-muted-foreground mt-2">{time}</p>
            </div>
          )}

          {item.type === 'image' && (
            <div>
              <img src={item.content} alt="scratchpad image" className="w-full h-32 object-cover" />
              <p className="text-[10px] text-muted-foreground p-2">{time}</p>
            </div>
          )}

          {item.type === 'link' && (
            <a
              href={item.content}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Link2 className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-2">{item.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.content}</p>
                </div>
                <ArrowUpRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              </div>
            </a>
          )}
        </>
      )}
    </div>
  )
}
