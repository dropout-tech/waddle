'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n/react'
import { AiReviewError, recordAiConsent } from '@/lib/ai-review/api'
import { aiErrorMessage } from '@/lib/ai-review/messages'

/** State + action for the "withdraw consent" dialog, shared by Settings and the review block. */
export function useWithdrawConsent(onDone: () => void) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setError(null)
  }, [])

  const confirm = useCallback(
    async ({ deleteReports }: { deleteReports: boolean }) => {
      setBusy(true)
      setError(null)
      try {
        const result = await recordAiConsent({ feature: 'ai_review', decision: 'withdraw', deleteReports })
        setOpen(false)
        toast.success(
          deleteReports
            ? t('已撤回同意，並刪除 {n} 份報告', { n: result.deletedReports })
            : t('已撤回同意'),
        )
        onDone()
      } catch (e) {
        const code = e instanceof AiReviewError ? e.code : 'NETWORK'
        setError(aiErrorMessage(code, null, t, lang))
      } finally {
        setBusy(false)
      }
    },
    [lang, onDone, t],
  )

  return { open, setOpen, busy, error, close, confirm }
}
