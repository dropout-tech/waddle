'use client'

import { useState } from 'react'
import { Plus, Link2 } from 'lucide-react'
import type { QuickLink } from '@/lib/types'
import { QuickLinkCard } from './quick-link-card'
import { QuickLinkEditModal } from './quick-link-edit-modal'

interface QuickLinksTabContentProps {
  links: QuickLink[]
  onSave: (next: QuickLink[]) => void
}

/**
 * Full-page mobile rendering of the quick-links list, used when the
 * "連結" tab is active. Same data + same edit/delete flow as the
 * desktop drawer, but with a roomier grid layout that takes advantage
 * of the full main-content area.
 */
export function QuickLinksTabContent({ links, onSave }: QuickLinksTabContentProps) {
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
    <div className="h-full flex flex-col bg-card">
      <header className="flex-shrink-0 px-5 py-4 border-b border-border">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Link2 className="w-4 h-4 text-primary" />
          常用連結
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          釘住的網址，點一下開新分頁
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {links.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Link2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">還沒有連結</p>
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新增第一個連結
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {ordered.map((link) => (
              <QuickLinkCard key={link.id} link={link} onEdit={setEditTarget} />
            ))}
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              aria-label="新增連結"
              className="flex flex-col items-center justify-center gap-1.5 w-20 h-20 rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[11px] font-medium">新增</span>
            </button>
          </div>
        )}
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
    </div>
  )
}
