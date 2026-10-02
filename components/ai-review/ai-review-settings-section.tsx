'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/lib/i18n/react'
import { useAiReviewStatus } from '@/hooks/use-ai-review-status'
import { AiReviewError, recordAiConsent } from '@/lib/ai-review/api'
import { aiErrorMessage } from '@/lib/ai-review/messages'
import { WithdrawConsentDialog } from './withdraw-consent-dialog'
import { useWithdrawConsent } from './use-withdraw'

/**
 * Settings entry for AI review: see whether consent is on, switch "include
 * meeting highlights", and withdraw (optionally deleting every report).
 * Same launch gate as the review block: renders nothing unless the server has
 * the feature enabled and the operator info is filled in.
 */
export function AiReviewSettingsSection() {
  const { t, lang } = useI18n()
  const { status, refresh } = useAiReviewStatus()
  const withdraw = useWithdrawConsent(() => {
    void refresh()
  })
  const [switching, setSwitching] = useState(false)

  if (!status) return null

  const granted = status.consent.granted
  const highlights = status.consent.scope_options.meeting_highlights === true

  const setHighlights = async (next: boolean) => {
    setSwitching(true)
    try {
      await recordAiConsent({ feature: 'ai_review', decision: 'grant', meetingHighlights: next })
      await refresh()
    } catch (e) {
      const code = e instanceof AiReviewError ? e.code : 'NETWORK'
      toast.error(aiErrorMessage(code, null, t, lang))
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="space-y-3" data-ai-review-settings>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {t('AI 回顧')}
      </h3>
      {granted ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t('你已同意 AI 回顧：只有在你按下「產生報告」時，才會把所選期間的內容送給 OpenAI（美國）。')}
          </p>
          <label
            htmlFor="ai-settings-meeting-highlights"
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3"
          >
            <span className="min-w-0">
              <span className="block text-sm text-foreground">{t('也納入 AI 會議整理的重點')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('會議重點可能包含與會者的姓名與發言。')}
              </span>
            </span>
            <Switch
              id="ai-settings-meeting-highlights"
              checked={highlights}
              disabled={switching}
              onCheckedChange={v => void setHighlights(v)}
            />
          </label>
          <button
            type="button"
            onClick={() => withdraw.setOpen(true)}
            data-ai-settings-withdraw
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary touch-manipulation"
          >
            {t('撤回同意')}
          </button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('你還沒有同意 AI 回顧。第一次按「產生報告」時，會先請你確認內容。')}
        </p>
      )}

      {withdraw.open && (
        <WithdrawConsentDialog
          open
          busy={withdraw.busy}
          error={withdraw.error}
          onClose={withdraw.close}
          onConfirm={withdraw.confirm}
        />
      )}
    </div>
  )
}
