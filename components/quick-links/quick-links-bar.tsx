'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronUp, Link2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuickLink } from '@/lib/types'
import { QuickLinkCard } from './quick-link-card'
import { QuickLinkEditModal } from './quick-link-edit-modal'
import { useI18n } from '@/lib/i18n/react'

interface QuickLinksBarProps {
  links: QuickLink[]
  onSave: (next: QuickLink[]) => void
  /** Controlled mode — when provided, internal trigger is hidden and
   *  parent owns open/closed state (mobile pattern, mirrors scratchpad). */
  isOpen?: boolean
  onOpenChange?: (next: boolean) => void
  /** Hide the floating pull-tab. Use on mobile where a bottom-bar tab
   *  toggles the panel instead. */
  hideTrigger?: boolean
  className?: string
}

const OPEN_STATE_KEY = 'waddle.quickLinksOpen'

/**
 * Bottom-anchored pull-up drawer for the user's pinned shortcuts.
 *
 * Mirrors `<FocusScratchpad>`'s pattern but inverted vertically:
 * - **Desktop:** small floating pull-tab at bottom-center of the
 *   viewport. Click to slide the panel up from below (max-h 70vh).
 * - **Mobile:** controlled via `isOpen` / `onOpenChange` from the
 *   parent; the bottom tab-bar "連結" tab toggles it. The panel acts
 *   as a bottom sheet sitting above the tab bar.
 *
 * Same data + modal as the inline scratchpad pattern; only the
 * geometry differs.
 */
export function QuickLinksBar({ links, onSave, isOpen, onOpenChange, hideTrigger, className }: QuickLinksBarProps) {
  const { t } = useI18n()
  const isControlled = isOpen !== undefined
  const [internalOpen, setInternalOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(OPEN_STATE_KEY) === '1'
    } catch {
      return false
    }
  })
  const isExpanded = isControlled ? !!isOpen : internalOpen
  const setExpanded = (next: boolean) => {
    if (isControlled) onOpenChange?.(next)
    else setInternalOpen(next)
  }
  // Persist uncontrolled open state across reloads (per-device, matches
  // task-sound + timer pref localStorage pattern).
  useEffect(() => {
    if (isControlled) return
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(OPEN_STATE_KEY, internalOpen ? '1' : '0')
    } catch {}
  }, [internalOpen, isControlled])

  // Esc to close — convenient for keyboard users without forcing them
  // to find the small pull-tab.
  useEffect(() => {
    if (!isExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded])

  const [editTarget, setEditTarget] = useState<QuickLink | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const ordered = [...links].sort((a, b) => a.sortOrder - b.sortOrder)

  const handleSaveLink = (next: QuickLink) => {
    const existing = links.findIndex((l) => l.id === next.id)
    if (existing >= 0) {
      const copy = [...links]
      copy[existing] = next
      onSave(copy)
    } else {
      onSave([...links, next])
    }
  }

  const handleDeleteLink = (id: string) => {
    onSave(links.filter((l) => l.id !== id))
  }

  return (
    <>
      {/* Backdrop — same z-stacking as scratchpad so the two never fight
          over the screen. Subtle blur + dark wash so the panel reads as
          a foreground surface. */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-popover"
          onClick={() => setExpanded(false)}
          aria-hidden
        />
      )}

      <div className={cn('relative z-toast', className)}>
        {/* Pull tab — mirrors scratchpad's top tab, anchored to the
            bottom of the viewport. Hidden in controlled / hideTrigger
            mode (mobile). */}
        <div
          className={cn(
            'fixed left-1/2 -translate-x-1/2 bottom-0',
            'transition-all duration-300',
            isExpanded || hideTrigger ? 'opacity-0 pointer-events-none' : 'opacity-100',
          )}
        >
          <button
            data-tour="quick-links-bar"
            onClick={() => setExpanded(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-1.5 rounded-t-xl',
              'bg-card/95 backdrop-blur-sm border border-b-0 border-border shadow-lg',
              'hover:bg-secondary/80 transition-all group',
              'text-xs font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            <Link2 className="w-3 h-3" />
            <span>{t('常用連結')}</span>
            {links.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                {links.length}
              </span>
            )}
            <ChevronUp className="w-3 h-3 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </div>

        {/* Expanded panel.
            Desktop (hideTrigger=false): the panel is fixed to the
              bottom of the viewport and slides upward by collapsing
              its own max-height — same shape as scratchpad uses at the
              top, just mirrored.
            Mobile (hideTrigger=true): full-screen sheet sitting above
              the bottom tab bar (58 px). translate-y handles the slide. */}
        <div
          ref={panelRef}
          className={cn(
            hideTrigger
              ? cn(
                  'fixed left-0 right-0 top-0 bottom-[58px]',
                  'bg-card border-b border-border shadow-2xl',
                  'transition-transform duration-300 ease-out',
                  isExpanded ? '' : 'pointer-events-none',
                )
              : cn(
                  'fixed left-0 right-0 bottom-0',
                  'bg-card border-t border-border shadow-2xl',
                  'transition-all duration-300 ease-out overflow-hidden',
                  isExpanded ? 'max-h-[70vh] opacity-100' : 'max-h-0 opacity-0 pointer-events-none',
                ),
          )}
          style={
            hideTrigger
              ? {
                  // Mirror of scratchpad's offset: translate-y-full only
                  // shifts by the element's own height. With top:0
                  // bottom:58 the height is (100dvh − 58), so a plain
                  // translate-y-full leaves a 58 px sliver peeking under
                  // the tab bar — pad the slide to fully hide.
                  transform: isExpanded
                    ? 'translateY(0)'
                    : 'translateY(calc(100% + 58px))',
                }
              : undefined
          }
        >
          {/* Scroll container — needed on mobile (full-height sheet)
              and harmless on desktop (max-h handles overflow). */}
          <div className="h-full overflow-y-auto">
            <div className="max-w-5xl mx-auto p-5 md:p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Link2 className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{t('常用連結')}</h2>
                    <p className="text-[11px] text-muted-foreground">
                      {t('釘住網址，點一下開新分頁')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('新增')}
                </button>
              </div>

              {/* Grid */}
              {links.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                    <Link2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('還沒有連結')}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {t('點右上「+ 新增」加第一個')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {ordered.map((link) => (
                    <QuickLinkCard key={link.id} link={link} onEdit={setEditTarget} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <QuickLinkEditModal
        isOpen={isAdding || editTarget !== null}
        initial={editTarget}
        onClose={() => {
          setIsAdding(false)
          setEditTarget(null)
        }}
        onSave={handleSaveLink}
        onDelete={handleDeleteLink}
      />
    </>
  )
}
