'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/react'

/**
 * Soft "this is a Pro feature" box. Shared by the organisation page and the
 * Google Calendar page (docs/billing/2026-10-01-pro-limits-design.md §3.7).
 * Extracted verbatim from the box that used to live in org-center.tsx, so the
 * organisation page renders exactly as before.
 */
export function UpgradePrompt({
  message,
  hint,
  cta,
  testId,
}: {
  message: ReactNode
  hint?: ReactNode
  /** Button label; defaults to 查看 Pro 會員. */
  cta?: string
  testId?: string
}) {
  const { t } = useI18n()
  return (
    <div data-testid={testId} className="rounded-xl bg-muted/60 p-4">
      <p className="text-sm">{message}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <Link href="/membership" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground">
        {cta ?? t('查看 Pro 會員')}
      </Link>
    </div>
  )
}
