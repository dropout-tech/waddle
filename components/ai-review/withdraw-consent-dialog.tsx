'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useI18n } from '@/lib/i18n/react'

interface WithdrawConsentDialogProps {
  open: boolean
  busy: boolean
  /** Already-translated error text. */
  error: string | null
  onClose: () => void
  onConfirm: (options: { deleteReports: boolean }) => void
}

/**
 * Withdraw the AI review consent. The "also delete all my reports" box starts
 * unchecked: withdrawing alone keeps existing reports readable and deletable.
 * Used from Settings and from the AI review block itself, so withdrawing is
 * never harder to find than agreeing was.
 */
export function WithdrawConsentDialog({ open, busy, error, onClose, onConfirm }: WithdrawConsentDialogProps) {
  const { t } = useI18n()
  const [deleteReports, setDeleteReports] = useState(false)

  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        if (!next && !busy) onClose()
      }}
    >
      <AlertDialogContent data-ai-withdraw>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('撤回 AI 回顧的同意？')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('撤回之後不會再傳送新的內容；已經送出的內容無法收回。既有的報告仍可查看與刪除。下次要用時會重新請你確認。')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label
          htmlFor="ai-withdraw-delete-reports"
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3"
        >
          <Checkbox
            id="ai-withdraw-delete-reports"
            checked={deleteReports}
            onCheckedChange={v => setDeleteReports(v === true)}
            disabled={busy}
            className="mt-0.5 size-5"
          />
          <span className="text-sm leading-relaxed">{t('同時刪除我所有的 AI 回顧報告（無法復原）')}</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="min-h-11">
            {t('取消')}
          </AlertDialogCancel>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm({ deleteReports })}
            data-ai-withdraw-confirm
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 touch-manipulation"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {t('撤回同意')}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
