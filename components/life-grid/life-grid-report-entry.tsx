'use client'

import { useI18n } from '@/lib/i18n/react'
import { openLifeGrid } from '@/lib/life-grid/events'
import { LifeGridIcon } from './life-grid-icon'

/** Quiet one-line doorway from the report pane to the 人生年曆 (no extra query). */
export function LifeGridReportEntry() {
  const { t } = useI18n()
  return (
    <section className="flex items-center gap-3 border-y border-border/70 py-3" aria-label={t('人生年曆')}>
      <LifeGridIcon className="h-5 w-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
        {t('每天留一句話，年底會看到一整年有在活的證據。')}
      </p>
      <button
        type="button"
        onClick={() => openLifeGrid()}
        className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted/60"
        data-life-grid-report-entry
      >
        {t('打開人生年曆')}
      </button>
    </section>
  )
}
