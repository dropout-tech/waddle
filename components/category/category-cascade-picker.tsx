'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, FolderTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/lib/types'
import { sortWorkspacesForDisplay } from '@/lib/default-category'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/lib/i18n/react'

/**
 * Two-level (大分類 → 小分類) category picker, shared by the task-detail
 * drawer and the settings page's "預設分類" control.
 *
 * A flat list of every category across every workspace turns into a scroll
 * marathon once a user has more than a handful of workspaces, hence the
 * cascade. Desktop is a context-menu-style two-column panel (hover/focus on
 * the left column swaps the right one); mobile has no hover, so the same
 * data becomes a single-open accordion.
 *
 * The two call sites differ only in chrome:
 * - `variant` — how the trigger looks ('chip' inside the drawer header,
 *   'control' for a form row that must match the neighbouring inputs).
 * - `placement` — 'anchored' floats the panel (absolute popover on desktop,
 *   fixed sheet on mobile), 'inline' expands it in normal flow, which is
 *   what a scrollable settings form wants (nothing to clip or overflow).
 */
export interface CategoryCascadePickerProps {
  /** Raw workspace list. Archived workspaces/categories are dropped from the
   *  panel (they aren't valid destinations) but are still searched when
   *  resolving the trigger label, so a task living in an archived category
   *  still shows its real name. */
  workspaces: Workspace[]
  /** Currently selected category id. */
  value?: string | null
  onChange: (categoryId: string) => void
  /** Trigger chrome. */
  variant?: 'chip' | 'control'
  /** Panel positioning. */
  placement?: 'anchored' | 'inline'
  /**
   * What the desktop anchored panel is positioned against.
   * - `'trigger'` (default) — this component's own wrapper is the containing
   *   block, so the panel hangs off the trigger.
   * - `'container'` — the wrapper stays static and the panel resolves against
   *   the nearest positioned ancestor the CALLER provides (e.g. the drawer
   *   header), which is how it can span the drawer's content gutters instead
   *   of slicing whatever sits underneath in half. Pair it with
   *   `desktopPanelClassName`.
   */
  panelAnchor?: 'trigger' | 'container'
  /** Position/width overrides for the desktop anchored panel. Defaults to a
   *  21rem popover hanging off the trigger's left edge. */
  desktopPanelClassName?: string
  /** Which workspace column to open on when `value` doesn't resolve. */
  preferredWorkspaceId?: string
  /** Trigger label when `value` resolves to nothing. */
  fallbackLabel?: string
  /** Trigger dot colour when `value` resolves to nothing. Omit to hide the dot. */
  fallbackColor?: string
  /** When provided, the panel gets a row that clears the selection. */
  onClear?: () => void
  /** Label for that clear row. */
  clearLabel?: string
  className?: string
  triggerAriaLabel?: string
}

export function CategoryCascadePicker({
  workspaces,
  value,
  onChange,
  variant = 'chip',
  placement = 'anchored',
  panelAnchor = 'trigger',
  desktopPanelClassName,
  preferredWorkspaceId,
  fallbackLabel,
  fallbackColor,
  onClear,
  clearLabel,
  className,
  triggerAriaLabel,
}: CategoryCascadePickerProps) {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const categoryColumnRef = useRef<HTMLDivElement>(null)

  // Label source: searches the raw list (archived included) on purpose.
  const selected = useMemo(
    () =>
      workspaces
        .flatMap((w) => w.categories.map((c) => ({ ...c, workspace: w })))
        .find((c) => c.id === value),
    [workspaces, value]
  )

  // Panel source: archived dropped, 未分類 pinned first, categories by sortOrder.
  const pickerWorkspaces = useMemo(() => {
    return sortWorkspacesForDisplay(workspaces.filter((w) => !w.isArchived)).map((w) => ({
      ...w,
      categories: [...w.categories]
        .filter((c) => !c.isArchived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
  }, [workspaces])

  const activeCategories =
    pickerWorkspaces.find((w) => w.id === activeWorkspaceId)?.categories ?? []

  const open = () => {
    // Start on the selection's own workspace (create-from-calendar lands on
    // 未分類), falling back to the first row when that workspace is
    // gone/archived.
    const preferred = selected?.workspace.id ?? preferredWorkspaceId
    const hasPreferred = pickerWorkspaces.some((w) => w.id === preferred)
    setActiveWorkspaceId(hasPreferred ? preferred! : pickerWorkspaces[0]?.id ?? null)
    setIsOpen(true)
  }

  // Dismiss on outside click (mousedown, so it also fires on touch), same
  // pattern as user-menu.tsx / calendar-header.tsx.
  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  // Escape closes the panel — and only the panel. Both pickers live inside a
  // ModalShell that also closes on Escape, so we opt into its nested-layer
  // protocol (preventDefault ⇒ the shell leaves itself open) and listen in
  // the capture phase: the shell's document listener is registered first
  // (it mounts before the panel opens), and only capture reliably runs
  // ahead of it. Focus goes back to the trigger so keyboard users aren't
  // dropped at the top of the document.
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen])

  // An inline panel opens inside whatever scroll container the caller lives
  // in (the settings modal's body), so it can end up clipped by that
  // container's bottom edge — measured: 14px of the last row eaten with 4
  // workspaces, 146px with 14. Scroll it fully into view; `scroll-mb-4` on
  // the panel makes `block: 'nearest'` leave 16px of air below it, which is
  // also the gap to the modal's footer (the scroller's bottom edge and the
  // footer's top edge are the same line).
  useEffect(() => {
    if (!isOpen || placement !== 'inline') return
    const id = requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(id)
  }, [isOpen, placement])

  const label = selected ? `${selected.workspace.name} / ${selected.name}` : fallbackLabel ?? ''
  const dotColor = selected?.workspace.color ?? fallbackColor

  const pick = (categoryId: string) => {
    onChange(categoryId)
    setIsOpen(false)
  }

  const clearRow = onClear ? (
    <button
      data-picker-clear
      onClick={() => {
        onClear()
        setIsOpen(false)
      }}
      className={cn(
        'w-full text-left px-3 py-2 text-xs text-muted-foreground border-t border-border hover:bg-secondary transition-colors',
        isMobile && 'min-h-[44px]'
      )}
    >
      {clearLabel ?? t('（未設定）')}
    </button>
  ) : null

  // ── Mobile body: single-open accordion ────────────────────────────────
  // The floating sheet may use most of the screen; an inline one sits in a
  // form and must stay a form-sized control (same cap as the desktop
  // columns), or a long workspace list pushes the rest of the settings page
  // out of reach.
  const accordion = (
    <div className={cn('overflow-y-auto py-2', placement === 'inline' ? 'max-h-72' : 'max-h-[60vh]')}>
      {pickerWorkspaces.map((workspace) => {
        const isExpanded = activeWorkspaceId === workspace.id
        return (
          <div key={workspace.id}>
            <button
              data-picker-workspace={workspace.id}
              aria-expanded={isExpanded}
              onClick={() => setActiveWorkspaceId(isExpanded ? null : workspace.id)}
              className="w-full min-h-[44px] flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary transition-colors"
            >
              <div
                className="w-2.5 h-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: workspace.color }}
              />
              <span className="flex-1 min-w-0 truncate font-medium">{workspace.name}</span>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
              )}
            </button>
            {isExpanded &&
              (workspace.categories.length === 0 ? (
                <p className="px-3 pl-9 py-2 text-xs text-muted-foreground">
                  {t('這個大分類還沒有小分類')}
                </p>
              ) : (
                workspace.categories.map((category) => (
                  <button
                    key={category.id}
                    data-picker-category={category.id}
                    onClick={() => pick(category.id)}
                    className={cn(
                      'w-full min-h-[44px] text-left pl-9 pr-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2',
                      value === category.id && 'bg-primary/10 text-primary'
                    )}
                  >
                    <FolderTree className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="flex-1 min-w-0 truncate">{category.name}</span>
                    {value === category.id && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                  </button>
                ))
              ))}
          </div>
        )
      })}
    </div>
  )

  // ── Desktop body: two columns, hover swaps the right one ──────────────
  const columns = (
    <div className="flex max-h-72">
      {/* Level 1 — workspaces */}
      <div className="w-[9.5rem] flex-shrink-0 border-r border-border py-1.5 overflow-y-auto">
        {pickerWorkspaces.map((workspace) => (
          <button
            key={workspace.id}
            data-picker-workspace={workspace.id}
            // Hover switches the right column (the user asked for
            // right-click-menu behaviour); focus does the same so Tab-only
            // navigation sees the matching categories.
            onMouseEnter={() => setActiveWorkspaceId(workspace.id)}
            onFocus={() => setActiveWorkspaceId(workspace.id)}
            onClick={() => setActiveWorkspaceId(workspace.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight') return
              e.preventDefault()
              categoryColumnRef.current?.querySelector('button')?.focus()
            }}
            className={cn(
              'w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2',
              activeWorkspaceId === workspace.id && 'bg-secondary'
            )}
          >
            <div
              className="w-2.5 h-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: workspace.color }}
            />
            <span className="flex-1 min-w-0 truncate">{workspace.name}</span>
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
      {/* Level 2 — categories of the highlighted workspace */}
      <div ref={categoryColumnRef} className="flex-1 min-w-0 py-1.5 overflow-y-auto">
        {activeCategories.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {t('這個大分類還沒有小分類')}
          </p>
        ) : (
          activeCategories.map((category) => (
            <button
              key={category.id}
              data-picker-category={category.id}
              onClick={() => pick(category.id)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2',
                value === category.id && 'bg-primary/10 text-primary'
              )}
            >
              <FolderTree className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="flex-1 min-w-0 truncate">{category.name}</span>
              {value === category.id && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  )

  const panelSurface = 'flex flex-col bg-card rounded-xl border border-border shadow-xl overflow-hidden'

  const panel =
    isOpen && pickerWorkspaces.length > 0 ? (
      placement === 'inline' ? (
        <div
          ref={panelRef}
          data-category-picker={isMobile ? 'mobile' : 'desktop'}
          className={cn(panelSurface, 'mt-2 w-full scroll-mb-4')}
        >
          {isMobile ? accordion : columns}
          {clearRow}
        </div>
      ) : isMobile ? (
        <div
          data-category-picker="mobile"
          className={cn(
            panelSurface,
            'fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+72px)] z-popover'
          )}
        >
          {accordion}
          {clearRow}
        </div>
      ) : (
        <div
          data-category-picker="desktop"
          className={cn(
            panelSurface,
            'absolute z-popover',
            desktopPanelClassName ?? 'left-0 top-full mt-1 w-[21rem]'
          )}
        >
          {columns}
          {clearRow}
        </div>
      )
    ) : null

  return (
    <div
      ref={rootRef}
      className={cn(
        placement === 'inline' && 'w-full',
        // Only become the containing block when the panel is meant to hang
        // off the trigger — `panelAnchor="container"` deliberately leaves
        // positioning to the caller's own `relative` ancestor.
        placement === 'anchored' && panelAnchor === 'trigger' && 'relative',
        className
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={triggerAriaLabel}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        className={cn(
          variant === 'chip'
            ? 'flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary transition-colors'
            : 'w-full h-11 md:h-9 flex items-center gap-2 px-2 text-xs rounded-md bg-background border border-border hover:bg-secondary transition-colors'
        )}
      >
        {dotColor && (
          <div
            className="w-2.5 h-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
        )}
        <span
          className={cn(
            'min-w-0 truncate',
            variant === 'chip'
              ? 'text-xs font-medium text-muted-foreground'
              : 'flex-1 text-left text-foreground'
          )}
        >
          {label}
        </span>
        <ChevronDown
          className={cn(
            'flex-shrink-0 text-muted-foreground',
            variant === 'chip' ? 'w-3 h-3' : 'w-3.5 h-3.5'
          )}
        />
      </button>
      {panel}
    </div>
  )
}
