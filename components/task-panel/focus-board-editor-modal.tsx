'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, GripVertical, Pin, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/lib/types'
import { defaultCards, type FocusCard, type FocusSettings } from '@/lib/focus'
import { useDisplayColor } from '@/hooks/use-display-color'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/lib/i18n/react'
import { isImeComposing } from '@/lib/ime'
import { ModalShell } from '@/components/modals/modal-shell'

/**
 * "編輯版面" — who gets a card on the 重點 board, in what order, with what
 * hand-typed status line.
 *
 * Ordering only ever matters *within* a workspace (the board groups by
 * workspace and follows the user's own workspace order), so reordering is
 * scoped to a group: each group lists its chosen categories first — draggable,
 * in board order — then the rest, alphabetically stable by the category's own
 * sortOrder. Ticking a box moves that row up into the chosen block, which is
 * the cheapest possible explanation of "上板了".
 *
 * Drag uses native HTML5 events, same as the category reorder in
 * workspace-section.tsx. Native drag does nothing on touch, so phones get
 * 上移/下移 buttons instead (44pt targets) — decided by `useIsMobile()`, the
 * existing convention for this exact fork.
 */

const CARD_DRAG_MIME = 'application/x-huddle-focus-card'
const MAX_NOTE_LENGTH = 40

interface FocusBoardEditorModalProps {
  isOpen: boolean
  settings: FocusSettings
  workspaces: Workspace[]
  todayStr: string
  onClose: () => void
  onSave?: (next: FocusSettings) => Promise<void> | void
}

export function FocusBoardEditorModal({
  isOpen,
  settings,
  workspaces,
  todayStr,
  onClose,
  onSave,
}: FocusBoardEditorModalProps) {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const displayColor = useDisplayColor()

  // Seed from what the board is actually showing right now: an uncurated
  // board renders `defaultCards`, so that's what the checkboxes must agree
  // with — otherwise the first open would look like "nothing is selected".
  const initialCards = useMemo<FocusCard[]>(
    () => settings.cards ?? defaultCards(workspaces, todayStr),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per mount
    []
  )
  const [selected, setSelected] = useState<string[]>(() =>
    [...initialCards].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.categoryId)
  )
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialCards.filter((c) => c.note).map((c) => [c.categoryId, c.note!]))
  )
  // Pinning is also reachable from the board itself; here it earns its place
  // because curating and pinning are the same thought ("this one matters").
  const [pinnedIds, setPinnedIds] = useState<string[]>(() =>
    initialCards.filter((c) => c.pinned).map((c) => c.categoryId)
  )
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const groups = useMemo(() => {
    return workspaces
      .filter((w) => !w.isArchived)
      .map((ws) => {
        const categories = ws.categories.filter((c) => !c.isArchived)
        const meta = new Map(
          categories.map((c) => [
            c.id,
            {
              name: c.name,
              pending: c.tasks.filter((task) => !task.isCompleted && !task.isArchived).length,
              sortOrder: c.sortOrder,
            },
          ])
        )
        const chosen = selected.filter((id) => meta.has(id))
        const rest = categories
          .filter((c) => !selected.includes(c.id))
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => c.id)
        return { workspace: ws, meta, chosen, rest }
      })
      .filter((g) => g.meta.size > 0)
  }, [workspaces, selected])

  const toggle = (categoryId: string) => {
    setSelected((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    )
  }

  const togglePin = (categoryId: string) => {
    setPinnedIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    )
  }

  /**
   * Rewrite only the slots this workspace owns, keeping other groups put.
   *
   * The queue is rebuilt *inside* the updater on purpose: React invokes state
   * updaters twice under StrictMode, and a queue captured outside would be
   * drained by the first pass, handing the second pass `undefined` ids (which
   * is exactly how an early build silently emptied the board on save).
   */
  const applyGroupOrder = (groupIds: string[], nextOrder: string[]) => {
    setSelected((prev) => {
      const queue = [...nextOrder]
      return prev.map((id) => (groupIds.includes(id) ? queue.shift() ?? id : id))
    })
  }

  const moveWithinGroup = (groupIds: string[], categoryId: string, delta: -1 | 1) => {
    const from = groupIds.indexOf(categoryId)
    const to = from + delta
    if (from < 0 || to < 0 || to >= groupIds.length) return
    const next = [...groupIds]
    ;[next[from], next[to]] = [next[to], next[from]]
    applyGroupOrder(groupIds, next)
  }

  const handleDragStart = (e: React.DragEvent, categoryId: string) => {
    e.dataTransfer.setData(CARD_DRAG_MIME, categoryId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(categoryId)
  }

  const handleDragOver = (e: React.DragEvent, categoryId: string) => {
    if (!draggingId || draggingId === categoryId) return
    if (!e.dataTransfer.types.includes(CARD_DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    setDropTarget((prev) =>
      prev && prev.id === categoryId && prev.before === before ? prev : { id: categoryId, before }
    )
  }

  const handleDrop = (e: React.DragEvent, groupIds: string[], categoryId: string) => {
    const dragged = draggingId
    const target = dropTarget && dropTarget.id === categoryId ? dropTarget : null
    setDraggingId(null)
    setDropTarget(null)
    if (!dragged || dragged === categoryId) return
    e.preventDefault()
    if (!groupIds.includes(dragged) || !target) return

    const next = [...groupIds]
    const fromIdx = next.indexOf(dragged)
    if (fromIdx < 0) return
    next.splice(fromIdx, 1)
    let toIdx = next.indexOf(categoryId)
    if (toIdx < 0) return
    if (!target.before) toIdx += 1
    next.splice(toIdx, 0, dragged)
    applyGroupOrder(groupIds, next)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  const handleSave = async () => {
    if (!onSave || saving) return
    const cards: FocusCard[] = selected.map((categoryId, index) => ({
      categoryId,
      note: notes[categoryId]?.trim() || undefined,
      sortOrder: index,
      pinned: pinnedIds.includes(categoryId) || undefined,
    }))
    setSaving(true)
    try {
      await onSave({ ...settings, cards })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const title = t('編輯重點版面')

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} size="lg" ariaLabel={title}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t('分類看板')}</p>
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('關閉')}
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ease-quart hover:bg-secondary md:size-9"
        >
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isMobile
            ? t('勾選要出現在看板上的分類，用上下箭頭調整順序。')
            : t('勾選要出現在看板上的分類，拖曳可以調整同一個工作區內的順序。')}
        </p>

        <div className="mt-4 space-y-5">
          {groups.map((group) => {
            const rows = [...group.chosen, ...group.rest]
            return (
              <div key={group.workspace.id}>
                <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: displayColor(group.workspace.color) }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{group.workspace.name}</span>
                  <span className="tabular-nums opacity-70">{group.chosen.length}</span>
                </p>

                <div className="rounded-xl border border-border">
                  {rows.map((categoryId, index) => {
                    const info = group.meta.get(categoryId)!
                    const isChosen = group.chosen.includes(categoryId)
                    const chosenIndex = group.chosen.indexOf(categoryId)
                    const canDrag = isChosen && !isMobile && group.chosen.length > 1
                    const indicator =
                      dropTarget && dropTarget.id === categoryId
                        ? dropTarget.before
                          ? 'before'
                          : 'after'
                        : null

                    return (
                      <div
                        key={categoryId}
                        data-focus-row={categoryId}
                        draggable={canDrag}
                        onDragStart={canDrag ? (e) => handleDragStart(e, categoryId) : undefined}
                        onDragOver={isChosen ? (e) => handleDragOver(e, categoryId) : undefined}
                        onDrop={isChosen ? (e) => handleDrop(e, group.chosen, categoryId) : undefined}
                        onDragEnd={canDrag ? handleDragEnd : undefined}
                        className={cn(
                          'relative px-2 transition-colors duration-150 ease-quart',
                          index > 0 && 'border-t border-border',
                          isChosen && 'bg-primary/[0.04]',
                          draggingId === categoryId && 'opacity-50',
                          indicator === 'before' &&
                            'before:absolute before:left-1 before:right-1 before:-top-0.5 before:h-0.5 before:rounded-full before:bg-primary',
                          indicator === 'after' &&
                            'after:absolute after:left-1 after:right-1 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary'
                        )}
                      >
                        <div className="flex items-center gap-1">
                          {canDrag && (
                            <span
                              className="flex size-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground/60"
                              aria-hidden="true"
                            >
                              <GripVertical className="size-3.5" />
                            </span>
                          )}

                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isChosen}
                            aria-label={info.name}
                            data-focus-pick={categoryId}
                            onClick={() => toggle(categoryId)}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors duration-150 ease-quart hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span
                              className={cn(
                                'flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 ease-quart',
                                isChosen
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-background'
                              )}
                            >
                              {isChosen && <Check className="size-3" aria-hidden="true" />}
                            </span>
                            <span
                              className={cn(
                                'min-w-0 flex-1 truncate text-sm',
                                isChosen ? 'font-medium text-foreground' : 'text-muted-foreground'
                              )}
                            >
                              {info.name}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {t('{count} 個未完成', { count: info.pending })}
                            </span>
                          </button>

                          {isChosen && (
                            <button
                              type="button"
                              onClick={() => togglePin(categoryId)}
                              aria-pressed={pinnedIds.includes(categoryId)}
                              aria-label={
                                pinnedIds.includes(categoryId)
                                  ? t('取消釘選「{name}」', { name: info.name })
                                  : t('釘選「{name}」', { name: info.name })
                              }
                              data-focus-pin={categoryId}
                              className={cn(
                                'flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ease-quart hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-9',
                                pinnedIds.includes(categoryId)
                                  ? 'text-primary'
                                  : 'text-muted-foreground/70 hover:text-foreground'
                              )}
                            >
                              <Pin
                                className={cn(
                                  'size-3.5',
                                  pinnedIds.includes(categoryId) && 'fill-current'
                                )}
                                aria-hidden="true"
                              />
                            </button>
                          )}

                          {isChosen && isMobile && (
                            <span className="flex shrink-0 items-center">
                              <button
                                type="button"
                                onClick={() => moveWithinGroup(group.chosen, categoryId, -1)}
                                disabled={chosenIndex <= 0}
                                aria-label={t('把「{name}」往上移', { name: info.name })}
                                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-quart hover:bg-muted/60 hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ArrowUp className="size-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveWithinGroup(group.chosen, categoryId, 1)}
                                disabled={chosenIndex >= group.chosen.length - 1}
                                aria-label={t('把「{name}」往下移', { name: info.name })}
                                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-quart hover:bg-muted/60 hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ArrowDown className="size-4" aria-hidden="true" />
                              </button>
                            </span>
                          )}
                        </div>

                        {isChosen && (
                          <div className={cn('pb-2', canDrag && 'pl-7')}>
                            <input
                              type="text"
                              value={notes[categoryId] ?? ''}
                              maxLength={MAX_NOTE_LENGTH}
                              onChange={(e) =>
                                setNotes((prev) => ({ ...prev, [categoryId]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isImeComposing(e)) e.currentTarget.blur()
                              }}
                              aria-label={t('「{name}」的進度', { name: info.name })}
                              placeholder={t('這個分類現在推到哪了？（選填）')}
                              className="h-9 w-full rounded-lg bg-muted/50 px-2.5 text-xs text-foreground transition-shadow placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {groups.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t('還沒有分類可以選')}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-shrink-0 items-center gap-2 border-t border-border bg-card px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 md:pb-4">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {t('已選 {count} 張卡', { count: selected.length })}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-quart hover:bg-muted/50 md:min-h-10"
        >
          {t('取消')}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!onSave || saving}
          className={cn(
            'min-h-11 rounded-xl px-5 text-sm font-semibold transition-colors duration-150 ease-quart md:min-h-10',
            !onSave || saving
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:brightness-110'
          )}
        >
          {t('儲存')}
        </button>
      </div>
    </ModalShell>
  )
}
