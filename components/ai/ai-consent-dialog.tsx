'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/lib/i18n/react'
import { SITE_ORIGIN } from '@/lib/site'
import { handleExternalAnchorClick } from '@/lib/external-link'
import type { AiConsentFeature } from '@/lib/ai-consent'
import type { OperatorInfo } from '@/lib/ai-review/operator'
import { buildConsentCopy } from './ai-consent-copy'
import { AI_SHEET_CLASS } from './sheet-styles'

interface AiConsentDialogProps {
  /** Which AI feature is asking. AI review and AI meeting import consent separately. */
  feature: AiConsentFeature
  open: boolean
  operator: OperatorInfo
  /** True while the server is recording the consent. */
  busy: boolean
  /** Already-translated error text to show above the buttons. */
  error: string | null
  /** Server expects a different consent version than this build: agreeing is blocked. */
  versionMismatch?: boolean
  /** "Decline", Esc, or tapping outside. Must NOT call the server. */
  onDecline: () => void
  /** "Agree and continue". The parent asks the server to record it. */
  onAgree: (options: { meetingHighlights: boolean }) => void
}

/**
 * The AI consent screen, shared by AI review and (later) AI meeting import.
 *
 * Hard rules from spec 6.2: nothing is pre-selected (the meeting-highlights
 * switch starts off); "Decline" and "Agree" are identical in size, weight and
 * colour; an 18+ statement sits directly above the buttons; the privacy link is
 * a real link; "continuing counts as consent" wording is never used. The screen
 * only asks — the consent record is written by the server.
 */
export function AiConsentDialog({
  feature,
  open,
  operator,
  busy,
  error,
  versionMismatch,
  onDecline,
  onAgree,
}: AiConsentDialogProps) {
  const { t, lang } = useI18n()
  const [meetingHighlights, setMeetingHighlights] = useState(false)
  const copy = buildConsentCopy(feature, t, operator)
  const privacyPath = lang === 'en' ? '/en/privacy' : '/privacy'

  // Both buttons share this exact style on purpose (equal prominence).
  const choiceButton =
    'min-h-12 flex-1 rounded-xl border-2 border-foreground/70 bg-card px-4 text-base font-semibold text-foreground transition-colors hover:bg-secondary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation'

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next && !busy) onDecline()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={AI_SHEET_CLASS}
        data-ai-consent={feature}
        // Radix would focus the first focusable thing; keep focus off the buttons
        // so nothing looks pre-selected.
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div className="shrink-0 border-b border-border/70 px-5 pb-4 pt-[max(env(safe-area-inset-top),1.25rem)] sm:pt-5">
          <DialogTitle className="text-lg font-semibold">{copy.title}</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {copy.intro}
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5" data-ai-consent-body>
          {copy.blocks.map((block, i) => {
            if (block.kind === 'meeting-highlights') {
              return (
                <label
                  key={i}
                  htmlFor="ai-consent-meeting-highlights"
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-3.5 py-3"
                >
                  <Switch
                    id="ai-consent-meeting-highlights"
                    checked={meetingHighlights}
                    onCheckedChange={setMeetingHighlights}
                    disabled={busy}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t('也納入 AI 會議整理的重點')}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {t('會議重點可能包含與會者的姓名與發言。打開前，請確認你可以這樣使用這些內容。')}
                    </span>
                  </span>
                </label>
              )
            }
            return (
              <section key={i} aria-label={block.heading}>
                <h3 className="text-sm font-semibold">{block.heading}</h3>
                {block.paragraphs?.map((p, j) => (
                  <p key={j} className="mt-1.5 text-sm leading-relaxed text-foreground/85">
                    {p}
                  </p>
                ))}
                {block.bullets && (
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground/85">
                    {block.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>

        <div className="shrink-0 space-y-3 border-t border-border/70 bg-background px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4">
          {error && (
            <p role="alert" className="text-sm text-destructive" data-ai-consent-error>
              {error}
            </p>
          )}
          {versionMismatch && !error && (
            <p role="alert" className="text-sm text-destructive">
              {t('同意畫面的版本已更新，請重新整理頁面後再試。')}
            </p>
          )}
          <p className="text-sm font-medium" data-ai-age-line>
            {copy.ageLine}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className={choiceButton}
              onClick={onDecline}
              disabled={busy}
              data-ai-consent-decline
            >
              {t('不同意')}
            </button>
            <button
              type="button"
              className={choiceButton}
              onClick={() => onAgree({ meetingHighlights })}
              disabled={busy || versionMismatch}
              data-ai-consent-agree
            >
              {busy ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t('同意並繼續')}
                </span>
              ) : (
                t('同意並繼續')
              )}
            </button>
          </div>
          <a
            href={privacyPath}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => handleExternalAnchorClick(e, `${SITE_ORIGIN}${privacyPath}`)}
            className="inline-flex min-h-11 items-center text-sm text-foreground underline underline-offset-4 hover:no-underline"
          >
            {t('資料與隱私說明')}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
