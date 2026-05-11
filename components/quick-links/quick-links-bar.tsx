'use client'

import { useEffect, useState } from 'react'
import { ChevronUp, Link2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuickLink } from '@/lib/types'
import { QuickLinkCard } from './quick-link-card'
import { QuickLinkEditModal } from './quick-link-edit-modal'

interface QuickLinksBarProps {
  links: QuickLink[]
  onSave: (next: QuickLink[]) => void
}

const OPEN_STATE_KEY = 'waddle.quickLinksOpen'

/**
 * Bottom-anchored drawer for the user's pinned shortcuts. Collapsed
 * state is a thin handle bar (~28px) with a chevron-up + count badge;
 * expanded state slides up to reveal a grid of cards.
 *
 * Used on desktop only — mobile renders the cards inside the dedicated
 * "連結" tab via QuickLinksTabContent (see main-layout.tsx). The two
 * surfaces share the card + modal components but have different
 * navigation models.
 */
export function QuickLinksBar({ links, onSave }: QuickLinksBarProps) {
  // Open state persists across reloads but per-device (matches how the
  // timer pref + task-sound pref are stored).
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(OPEN_STATE_KEY) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(OPEN_STATE_KEY, isOpen ? '1' : '0')
    } catch {}
  }, [isOpen])

  const [editTarget, setEditTarget] = useState<QuickLink | null>(null)
  const [isAdding, setIsAdding] = useState(false)

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
      <div
        data-tour="quick-links-bar"
        className={cn(
          'flex-shrink-0 border-t border-border bg-card/95 backdrop-blur transition-[height] duration-200 ease-out overflow-hidden',
          isOpen ? 'h-44' : 'h-7',
        )}
      >
        {/* Handle / header — clickable across the whole row to expand. */}
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
          aria-label={isOpen ? '收起常用連結' : '展開常用連結'}
          className="w-full h-7 flex items-center justify-between px-4 hover:bg-muted/30 transition-colors group"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Link2 className="w-3 h-3" />
            常用連結
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-muted text-[9px] text-foreground/70 font-semibold">
              {links.length}
            </span>
          </span>
          <ChevronUp
            className={cn(
              'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </button>

        {/* Content row — kept always-mounted (instead of conditional
            render) so closing transitions smoothly. The collapsed state
            clips it via the wrapper's overflow-hidden + height. */}
        <div className="px-4 pt-1 pb-3 overflow-x-auto">
          <div className="flex items-center gap-3">
            {ordered.map((link) => (
              <QuickLinkCard key={link.id} link={link} onEdit={setEditTarget} />
            ))}
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              aria-label="新增連結"
              className="flex flex-col items-center justify-center gap-1.5 w-20 h-20 rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-foreground/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[11px] font-medium">新增</span>
            </button>
            {links.length === 0 && (
              <div className="text-[11px] text-muted-foreground italic ml-2">
                還沒有連結 — 點「+ 新增」加第一個
              </div>
            )}
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
