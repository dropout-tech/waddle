'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/react'
import type { AiReport } from '@/lib/ai-review/api'
import { hoursText, periodLabel, periodRange } from '@/lib/ai-review/format'
import { AI_ICON_BUTTON_CLASS, AI_SHEET_CLASS } from '@/components/ai/sheet-styles'

interface ReportViewProps {
  report: AiReport | null
  /** Remaining reports this month (already clamped), shown in the footnote. */
  remaining: number | null
  onClose: () => void
  onDelete: (report: AiReport) => void
}

/** Inline narrative number: mono, accent colour (terracotta light / mustard dark). */
function Num({ children }: { children: ReactNode }) {
  return <span className="mx-1 font-mono text-[17px] font-medium tabular-nums text-primary">{children}</span>
}

/**
 * AI text is untrusted: it is rendered ONLY as React text nodes. No links, no
 * images, no markdown, no dangerouslySetInnerHTML, no renderNotesWithLinks
 * (docs/features/ai-review-design.md §4.5, spec F4). A URL in the text stays
 * dead text. `whitespace-pre-line` keeps the model's line breaks.
 */
function PlainText({ children }: { children: string }) {
  return <p className="whitespace-pre-line text-[15px] leading-[1.85] [text-wrap:pretty] break-words">{children}</p>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-border/70 pt-5" aria-label={title}>
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

/**
 * One report, five fixed sections in this order: rhythm, what got done, where
 * the time went, what is still open, a quiet observation. The headline numbers
 * come from the server's `stats`, never from the AI text.
 */
export function ReportView({ report, remaining, onClose, onDelete }: ReportViewProps) {
  const { t, lang } = useI18n()
  const stats = report?.stats ?? {}
  const completed = stats.completed_count
  const focusMinutes = stats.focus_minutes
  const meetingCount = stats.meeting_count
  const timerMinutes = stats.time_block_minutes
  // English needs a real space before the number; Chinese none (dictionary text after the number carries its own).
  const sp = lang === 'en' ? ' ' : ''

  return (
    <Dialog open={report !== null} onOpenChange={next => !next && onClose()}>
      <DialogContent showCloseButton={false} className={AI_SHEET_CLASS} data-ai-report-view>
        {report && (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-2 pb-1 pt-[max(env(safe-area-inset-top),0.5rem)] sm:pt-2">
              <button
                type="button"
                onClick={onClose}
                className={AI_ICON_BUTTON_CLASS}
                aria-label={t('關閉')}
                data-ai-report-close
              >
                <ChevronLeft className="size-6" aria-hidden="true" />
              </button>
              <DialogTitle className="text-[15px] font-medium">{t('AI 回顧')}</DialogTitle>
              <button
                type="button"
                onClick={() => onDelete(report)}
                className={AI_ICON_BUTTON_CLASS}
                aria-label={t('刪除這份報告')}
                data-ai-report-delete
              >
                <Trash2 className="size-5" aria-hidden="true" />
              </button>
            </div>
            <DialogDescription className="sr-only">
              {t('由 AI 依你的紀錄整理的回顧報告，只有你看得到。')}
            </DialogDescription>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4">
              <span className="inline-block rounded-full bg-primary/15 px-3 py-0.5 text-xs">
                {periodLabel(report.period_key, lang)} · {periodRange(report.period_start, report.period_end, lang)}
              </span>

              {/* ① rhythm — headline numbers written into the sentence */}
              <section className="mt-3" aria-label={t('這段時間的節奏')}>
                <h3 className="mb-2 text-base font-semibold">{t('這段時間的節奏')}</h3>
                {typeof completed === 'number' && (
                  <p className="mb-2 text-[15px] leading-[1.85] [text-wrap:pretty]" data-ai-report-stats>
                    {t('這段期間你完成了')}
                    {sp}
                    <Num>{completed}</Num>
                    {t('件事。')}
                    {typeof focusMinutes === 'number' && focusMinutes > 0 && (
                      <>
                        {t('留給自己的專注時間約')}
                        {sp}
                        <Num>{hoursText(focusMinutes)}</Num>
                        {t('小時。')}
                      </>
                    )}
                    {typeof meetingCount === 'number' && meetingCount > 0 && (
                      <>
                        {t('開了')}
                        {sp}
                        <Num>{meetingCount}</Num>
                        {t('場會。')}
                      </>
                    )}
                  </p>
                )}
                <PlainText>{report.rhythm}</PlainText>
              </section>

              <Section title={t('做了哪些事')}>
                <PlainText>{report.done}</PlainText>
              </Section>

              <Section title={t('時間花在哪')}>
                <PlainText>{report.time_spent}</PlainText>
                {typeof timerMinutes === 'number' && timerMinutes > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('專注計時器另外記下')}
                    {sp}
                    <Num>{timerMinutes}</Num>
                    {t('分鐘。')}
                  </p>
                )}
              </Section>

              <Section title={t('還掛著的事')}>
                <PlainText>{report.pending}</PlainText>
              </Section>

              {/* ⑤ observation — the only small paper card, with a highlighter line */}
              <section
                className="mt-6 rounded-xl border border-border bg-card px-4 py-3.5"
                aria-label={t('一兩句觀察')}
              >
                <h3 className="mb-1.5 text-xs font-normal text-muted-foreground">✎ {t('一兩句觀察')}</h3>
                <p className="whitespace-pre-line text-base leading-[1.85] [text-wrap:pretty] break-words">
                  <span className="bg-[linear-gradient(transparent_62%,color-mix(in_srgb,var(--chart-5)_55%,transparent)_62%)]">
                    {report.observation}
                  </span>
                </p>
              </section>

              <p className="mt-5 text-xs leading-[1.7] text-muted-foreground">
                {t('文字由 AI 依你的紀錄整理，只有你看得到；數字以 Huddle 計算為準。')}
                {remaining !== null && ` ${t('本月還能產生 {n} 次。', { n: remaining })}`}
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
