'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { useAiReviewStatus } from '@/hooks/use-ai-review-status'
import {
  AiReviewError,
  PERIOD_KEYS,
  consentVersionsMatch,
  deleteAiReport,
  findAiReportByUsage,
  generateAiReport,
  listAiReports,
  recordAiConsent,
  type AiQuota,
  type AiReport,
  type AiStatus,
  type PeriodKey,
} from '@/lib/ai-review/api'
import { periodLabel, periodRange, shortDate } from '@/lib/ai-review/format'
import { aiErrorMessage } from '@/lib/ai-review/messages'
import type { OperatorInfo } from '@/lib/ai-review/operator'
import { captureClientError } from '@/lib/monitoring/sentry'
import { AiConsentDialog } from '@/components/ai/ai-consent-dialog'
import { AI_ICON_BUTTON_CLASS } from '@/components/ai/sheet-styles'
import { ReportView } from './report-view'
import { WithdrawConsentDialog } from './withdraw-consent-dialog'
import { useWithdrawConsent } from './use-withdraw'

/**
 * The AI review block on the Review page.
 *
 * Launch gate: this renders NOTHING unless `useAiReviewStatus` returns a status
 * (operator info filled in AND the server answered `enabled: true`). It never
 * shows an error for a failed status call.
 */
export function AiReviewSection() {
  const { status, operator, refresh } = useAiReviewStatus()
  if (!status || !operator || !status.quota) return null
  return <AiReviewBlock status={status} quota={status.quota} operator={operator} refresh={refresh} />
}

/** Quota / pacing messages: calm text colour instead of the error colour. */
const SOFT_CODES = new Set(['MONTHLY_LIMIT', 'RATE_LIMIT', 'ATTEMPT_LIMIT', 'IN_PROGRESS'])

interface BlockError {
  code: string
  quota: AiQuota | null
}

function AiReviewBlock({
  status,
  quota,
  operator,
  refresh,
}: {
  status: AiStatus
  quota: AiQuota
  operator: OperatorInfo
  refresh: () => Promise<AiStatus | null>
}) {
  const { t, lang } = useI18n()
  const [period, setPeriod] = useState<PeriodKey>('last_week')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<BlockError | null>(null)
  const [noData, setNoData] = useState(false)
  const [report, setReport] = useState<AiReport | null>(null)

  const [consentOpen, setConsentOpen] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [reports, setReports] = useState<AiReport[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFailed, setHistoryFailed] = useState(false)

  const [pendingDelete, setPendingDelete] = useState<AiReport | null>(null)
  const [deleting, setDeleting] = useState(false)

  const running = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const withdraw = useWithdrawConsent(() => {
    void refresh()
  })

  const granted = status.consent.granted
  const versionOk = consentVersionsMatch(status)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryFailed(false)
    try {
      const rows = await listAiReports()
      if (alive.current) setReports(rows)
    } catch {
      if (alive.current) setHistoryFailed(true)
    } finally {
      if (alive.current) setHistoryLoading(false)
    }
  }, [])

  const showReport = useCallback((next: AiReport) => {
    setReport(next)
    setReports(prev => (prev ? [next, ...prev.filter(r => r.id !== next.id)] : prev))
  }, [])

  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    setError(null)
    setNoData(false)
    setGenerating(true)
    const requestId = crypto.randomUUID()
    try {
      const result = await generateAiReport({ requestId, period })
      if (alive.current) showReport(result.report)
    } catch (e) {
      if (!alive.current) return
      const code = e instanceof AiReviewError ? e.code : 'NETWORK'
      const errQuota = e instanceof AiReviewError ? e.quota : null
      if (code === 'CONSENT_REQUIRED') {
        // Consent was withdrawn elsewhere or the scope version moved on.
        await refresh()
        setConsentError(null)
        setConsentOpen(true)
      } else if (code === 'NO_DATA') {
        setNoData(true)
      } else if (code === 'TIMEOUT' || code === 'NETWORK' || code === 'BAD_RESPONSE') {
        // Never re-send the same requestId. The server may have finished anyway:
        // look the report up by its request id before calling it a failure.
        const found = await findAiReportByUsage(requestId)
        if (!alive.current) return
        if (found) showReport(found)
        else setError({ code, quota: errQuota })
      } else {
        if (code === 'SERVICE_PAUSED') captureClientError(new Error('AI_REVIEW_GLOBAL_DAILY_LIMIT'))
        setError({ code, quota: errQuota })
      }
    } finally {
      running.current = false
      if (alive.current) {
        setGenerating(false)
        void refresh()
      }
    }
  }, [period, refresh, showReport])

  const onGenerateClick = () => {
    if (generating) return
    if (!granted) {
      setConsentError(null)
      setConsentOpen(true)
      return
    }
    void run()
  }

  const onAgree = async ({ meetingHighlights }: { meetingHighlights: boolean }) => {
    setConsentBusy(true)
    setConsentError(null)
    try {
      await recordAiConsent({ feature: 'ai_review', decision: 'grant', meetingHighlights })
    } catch (e) {
      const code = e instanceof AiReviewError ? e.code : 'NETWORK'
      if (alive.current) {
        setConsentError(aiErrorMessage(code, null, t, lang))
        setConsentBusy(false)
      }
      return
    }
    if (!alive.current) return
    setConsentBusy(false)
    setConsentOpen(false)
    await refresh()
    // The user asked for a report; consent was the only thing in the way.
    void run()
  }

  const toggleHistory = () => {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next && reports === null) void loadHistory()
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setDeleting(true)
    try {
      await deleteAiReport(target.id)
      setReports(prev => (prev ? prev.filter(r => r.id !== target.id) : prev))
      setReport(prev => (prev && prev.id === target.id ? null : prev))
      setPendingDelete(null)
      toast.success(t('已刪除這份報告'))
    } catch {
      toast.error(t('刪除失敗，請稍後再試'))
    } finally {
      setDeleting(false)
    }
  }

  // Shown message (an action error wins over the status-derived one).
  const blockedCode = !error && !generating ? quota.blocked : null
  const message = error
    ? aiErrorMessage(error.code, error.quota ?? quota, t, lang)
    : blockedCode
      ? aiErrorMessage(blockedCode, quota, t, lang)
      : null
  // Split the sentence at {n} so the number can be styled while word order stays translatable.
  const remainingParts = t('本月還能產生 {n} 次').split('{n}')
  const cannotGenerate = generating || !versionOk || quota.blocked !== null

  return (
    <section
      aria-label={t('AI 回顧')}
      className="border-b border-border/70 pb-7"
      data-ai-review
    >
      <h3 className="text-base font-semibold">{t('AI 回顧')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('讓 AI 讀你這段期間的紀錄，寫一份只給你自己看的回顧。')}
      </p>

      <div
        role="radiogroup"
        aria-label={t('回顧期間')}
        className="mt-4 flex flex-wrap gap-2"
      >
        {PERIOD_KEYS.map(key => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={period === key}
            disabled={generating}
            onClick={() => {
              setPeriod(key)
              setNoData(false)
              setError(null)
            }}
            data-ai-period={key}
            className={cn(
              'min-h-11 rounded-lg border-2 px-3.5 text-sm font-medium transition-colors touch-manipulation disabled:opacity-60 sm:min-h-0 sm:px-3 sm:py-1.5',
              // Outlined (not filled) so it reads as a different control from the
              // page's own 週/月/季/年 switch right above.
              period === key
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {periodLabel(key, lang)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t('本週是最近 7 天，本月是最近一個月，和上方的回顧一致。')}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onGenerateClick}
          disabled={cannotGenerate}
          data-ai-generate
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 touch-manipulation sm:w-auto"
        >
          {generating && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {generating ? t('正在產生…') : t('產生報告')}
        </button>
        <p className="text-sm text-muted-foreground" data-ai-remaining>
          {remainingParts[0]}
          <span className="font-mono tabular-nums text-foreground/80">{quota.reports_remaining}</span>
          {remainingParts[1]}
        </p>
      </div>

      <div aria-live="polite">
        {generating && (
          <p className="mt-3 text-sm text-muted-foreground" data-ai-generating>
            {t('正在讀取你的紀錄並寫報告，最多約 90 秒。請先留在這個畫面；完成後也會出現在歷史報告裡。')}
          </p>
        )}
        {!versionOk && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t('同意畫面的版本已更新，請重新整理頁面後再試。')}
          </p>
        )}
        {message && !generating && (
          <p
            role="alert"
            // Limits are information, not alarms: only real failures use the warning colour.
            className={cn('mt-3 text-sm', SOFT_CODES.has(error?.code ?? blockedCode ?? '') ? 'text-foreground/80' : 'text-destructive')}
            data-ai-error={error?.code ?? blockedCode}
          >
            {message}
          </p>
        )}
      </div>

      {noData && !generating && (
        <div className="mt-5 flex flex-col items-center py-6 text-center" data-ai-empty>
          {/* eslint-disable-next-line @next/next/no-img-element -- static export, small decorative art */}
          <img
            src="/art/penguin/sleep.webp"
            alt=""
            aria-hidden="true"
            width={120}
            height={120}
            loading="lazy"
            className="art-illus size-28"
          />
          <p className="mt-3 text-base font-medium">{t('這段期間還沒有紀錄')}</p>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
            {t('所選的這段期間沒有任務、便條紙、白板或時間區塊的紀錄，Huddle 先不幫你寫回顧，也沒有扣掉你的份數。休息也是節奏的一部分。')}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-2">
        <button
          type="button"
          onClick={toggleHistory}
          aria-expanded={historyOpen}
          data-ai-history-toggle
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground touch-manipulation"
        >
          {t('歷史報告')}
          <ChevronDown
            className={cn('size-4 transition-transform', historyOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
        {granted && (
          <button
            type="button"
            onClick={() => withdraw.setOpen(true)}
            data-ai-withdraw-open
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground touch-manipulation"
          >
            {t('撤回同意')}
          </button>
        )}
      </div>

      {historyOpen && (
        <div className="mt-1" data-ai-history>
          {historyLoading && reports === null ? (
            <p className="py-3 text-sm text-muted-foreground">{t('載入中…')}</p>
          ) : historyFailed ? (
            <p role="alert" className="py-3 text-sm text-destructive">
              {t('讀不到歷史報告，請稍後再試。')}
            </p>
          ) : reports && reports.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">{t('還沒有任何報告。')}</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {(reports ?? []).map(r => (
                <li key={r.id} className="flex items-center gap-1" data-ai-history-item>
                  <button
                    type="button"
                    onClick={() => setReport(r)}
                    className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center py-2 text-left touch-manipulation"
                  >
                    <span className="text-sm font-medium">
                      {periodLabel(r.period_key, lang)} · {periodRange(r.period_start, r.period_end, lang)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('產生於 {date}', { date: shortDate(r.created_at, lang) })}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(r)}
                    className={AI_ICON_BUTTON_CLASS}
                    aria-label={t('刪除這份報告')}
                    data-ai-history-delete
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {consentOpen && (
        <AiConsentDialog
          feature="ai_review"
          open
          operator={operator}
          busy={consentBusy}
          error={consentError}
          versionMismatch={!versionOk}
          onDecline={() => setConsentOpen(false)}
          onAgree={onAgree}
        />
      )}

      <ReportView
        report={report}
        remaining={quota.reports_remaining}
        onClose={() => setReport(null)}
        onDelete={r => setPendingDelete(r)}
      />

      <AlertDialog open={pendingDelete !== null} onOpenChange={o => !o && !deleting && setPendingDelete(null)}>
        <AlertDialogContent data-ai-delete-confirm>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('刪除這份報告？')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('刪除後無法復原。刪除不會退回本月的份數。')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="min-h-11">
              {t('取消')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="min-h-11"
              onClick={e => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {t('刪除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {withdraw.open && (
        <WithdrawConsentDialog
          open
          busy={withdraw.busy}
          error={withdraw.error}
          onClose={withdraw.close}
          onConfirm={withdraw.confirm}
        />
      )}
    </section>
  )
}
