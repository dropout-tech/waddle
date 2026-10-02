'use client'

import { useCallback, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useI18n } from '@/lib/i18n/react'

/**
 * Stop-gap (2026-10-02): a recurring task has one completion flag for the
 * whole series — ticking it completes every date and drops it from the list.
 * Until per-occurrence completion exists, ask before completing a series.
 * `confirm()` resolves true only when the user picks "complete the series".
 * Render `dialog` once.
 */
export function useRecurringCompleteConfirm() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const settle = useCallback((ok: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setOpen(false)
    resolve?.(ok)
  }, [])

  const confirm = useCallback(() => new Promise<boolean>((resolve) => {
    resolverRef.current?.(false)
    resolverRef.current = resolve
    setOpen(true)
  }), [])

  const dialog = (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) settle(false) }}>
      <AlertDialogContent data-recurring-complete-confirm>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('整個系列標成完成？')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('這是重複任務，勾選會把整個系列標成完成，所有日期都會從清單移除。要繼續嗎？')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{t('取消')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>{t('整個系列標成完成')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, dialog }
}
