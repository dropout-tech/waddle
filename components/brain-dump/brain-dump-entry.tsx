'use client'

import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { hapticSelection } from '@/lib/haptics'
import { InkStickyNote } from '@/components/icons/huddle-icons'
import { openBrainDump } from './brain-dump-events'

/** Desktop calendar header entry: icon + label (label from lg up). */
export function BrainDumpHeaderButton({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      data-tour="brain-dump"
      onClick={openBrainDump}
      title={t('丟給企鵝 (P)')}
      aria-label={t('丟給企鵝')}
      aria-keyshortcuts="P"
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors',
        'hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <InkStickyNote className="h-4 w-4 text-primary" aria-hidden="true" />
      <span className="hidden lg:inline">{t('丟給企鵝')}</span>
    </button>
  )
}

/** Phone entry on the calendar tab: a smaller round button stacked above the
 *  "+" new-task FAB (which sits at 136px + safe area, 56px tall). */
export function BrainDumpFab() {
  const { t } = useI18n()
  return (
    <button
      type="button"
      data-tour="mobile-brain-dump"
      data-hide-on-keyboard
      onClick={() => {
        hapticSelection()
        openBrainDump()
      }}
      aria-label={t('丟給企鵝')}
      className="fixed right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-primary shadow-md transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ bottom: 'calc(204px + env(safe-area-inset-bottom))' }}
    >
      <InkStickyNote className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}
