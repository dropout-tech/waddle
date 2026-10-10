'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Mic, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { fetchBrainDumpQuota, parseWithBestAvailable, type BrainDumpFallback, type BrainDumpQuota } from '@/lib/brain-dump/ai'
import { addDays, dateKey, splitFragments } from '@/lib/brain-dump/parse'
import { scheduleDrafts, withManualTime, type ScheduleOutcome, type ScheduleSlot } from '@/lib/brain-dump/schedule'
import type { BrainDumpDraft, BusyInterval } from '@/lib/brain-dump/types'
import { BrainDumpPreview, STOW_MS } from './brain-dump-preview'
import { PenguinArt, type PenguinPose } from './penguin-art'
import { useSpeechDictation } from './use-speech-dictation'
import styles from './brain-dump.module.css'

export const BRAIN_DUMP_EXAMPLE = '明天要回康庭的信、下午去銀行、週五前把報價改完 一小時、還有記得運動'

type Phase = 'input' | 'thinking' | 'preview'

/** One to-do to write, with the calendar slot the preview showed for it. */
export interface CommitItem {
  draft: BrainDumpDraft
  /** Set when it goes onto the calendar (scheduled date + start/end). */
  slot?: ScheduleSlot
}

export interface CommitResult {
  created: number
  /** How many of the created ones were put on the calendar. */
  scheduled: number
  /** draft ids that could not be written (refused or threw). */
  failedIds: string[]
}

interface PanelProps {
  isMobile: boolean
  text: string
  onTextChange: (text: string) => void
  onClose: () => void
  /** Name of the inbox category the tasks go into (未分類). */
  inboxName: string
  /** What is already on a day (YYYY-MM-DD): tasks, time blocks, assigned
   *  tasks. Read on the device only, to find free gaps — never sent anywhere. */
  busyForDate: (date: string) => BusyInterval[]
  /** Writes the chosen drafts one by one; reports which didn't make it. */
  onCommit: (items: CommitItem[]) => Promise<CommitResult>
  /** Everything is in (after the into-the-inbox animation). */
  onDone: (created: number, scheduled: number) => void
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function BrainDumpPanel({ isMobile, text, onTextChange, onClose, inboxName, busyForDate, onCommit, onDone }: PanelProps) {
  const { t, lang } = useI18n()
  const [phase, setPhase] = useState<Phase>('input')
  const [notice, setNotice] = useState<'empty' | 'unparsed' | null>(null)
  const [now, setNow] = useState<Date>(() => new Date())
  const [drafts, setDrafts] = useState<BrainDumpDraft[]>([])
  const [fallback, setFallback] = useState<BrainDumpFallback | null>(null)
  const [limit, setLimit] = useState(20)
  const [quota, setQuota] = useState<BrainDumpQuota | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [stowing, setStowing] = useState(false)
  /** Notes whose write failed — the preview keeps only these, ready to retry. */
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const [writtenCount, setWrittenCount] = useState(0)
  const [writtenScheduled, setWrittenScheduled] = useState(0)
  // The calendar as the plan sees it. It follows live changes, except while
  // writing: each task created there would otherwise block its own slot and
  // make the notes still on screen jump around.
  const [busy, setBusy] = useState(() => busyForDate)
  if (busy !== busyForDate && !saving && !stowing) setBusy(() => busyForDate)
  const [scraps, setScraps] = useState<string[]>([])
  const textRef = useRef<HTMLTextAreaElement>(null)
  const runRef = useRef(0)

  const appendSpoken = useCallback((spoken: string) => {
    const s = spoken.trim()
    if (!s) return
    const cur = textRef.current?.value ?? ''
    onTextChange(cur && !/[\s、，,]$/.test(cur) ? `${cur}、${s}` : `${cur}${s}`)
  }, [onTextChange])
  const speech = useSpeechDictation(lang, appendSpoken)

  // Desktop: start typing right away (phones would pop the keyboard over the sheet).
  useEffect(() => {
    if (!isMobile) textRef.current?.focus()
  }, [isMobile])

  // Today's AI quota (silently absent when the function isn't reachable).
  useEffect(() => {
    let alive = true
    void fetchBrainDumpQuota().then((q) => {
      if (alive) setQuota(q)
    })
    return () => {
      alive = false
    }
  }, [])
  // Closing mid-request: a late answer must not touch an unmounted panel.
  useEffect(() => {
    const runs = runRef
    return () => {
      runs.current++
    }
  }, [])

  const submit = async () => {
    if (speech.listening) speech.stop()
    if (!text.trim()) {
      setNotice('empty')
      textRef.current?.focus()
      return
    }
    setNotice(null)
    const run = ++runRef.current
    const at = new Date()
    const quick = reducedMotion()
    setScraps(splitFragments(text).slice(0, 8))
    if (!quick) setPhase('thinking')
    const started = Date.now()
    const result = await parseWithBestAvailable({ text, now: at, lang })
    const wait = (quick ? 0 : 1100) - (Date.now() - started)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    if (run !== runRef.current) return
    if (result.quota) setQuota(result.quota)
    if (!result.drafts.length) {
      setPhase('input')
      setNotice('unparsed')
      return
    }
    setNow(at)
    setDrafts(result.drafts)
    setFallback(result.fallback ?? null)
    if (result.limit) setLimit(result.limit)
    setExcluded(new Set())
    setFailed(new Set())
    setSelectedId(null)
    setPhase('preview')
  }

  const restart = () => {
    runRef.current++
    setFailed(new Set())
    setWrittenCount(0)
    setWrittenScheduled(0)
    setPhase('input')
    setSelectedId(null)
    setNotice(null)
    window.setTimeout(() => textRef.current?.focus(), 0)
  }

  const toggle = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** The time field: a typed time replaces what the text said, empty = not on the calendar. */
  const setDraftTime = (id: string, time: string) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? withManualTime(d, time) : d)))
  }

  const updateDraft = (id: string, patch: Partial<Pick<BrainDumpDraft, 'title' | 'dueDate' | 'note'>>) => {
    setDrafts((prev) => prev.map((d) => {
      if (d.id !== id) return d
      const next = { ...d, ...patch }
      if (!next.dueDate) delete next.dueDate
      if (!next.note) delete next.note
      return next
    }))
  }

  const chosen = useMemo(() => drafts.filter((d) => !excluded.has(d.id) && d.title.trim()), [drafts, excluded])
  // Where each ticked note lands on the calendar (R1–R5, schedule.ts). Unticked
  // notes are left out so the others don't route around something not coming.
  const plan = useMemo(() => scheduleDrafts(chosen, { now, busy }), [chosen, now, busy])

  const commit = async () => {
    if (!chosen.length || saving || stowing) return
    setSaving(true)
    let result: CommitResult
    try {
      result = await onCommit(chosen.map((draft) => ({ draft, slot: plan.get(draft.id)?.slot })))
    } catch (err) {
      console.error('[brain-dump] commit failed', err)
      result = { created: 0, scheduled: 0, failedIds: chosen.map((d) => d.id) }
    } finally {
      setSaving(false)
    }
    if (result.failedIds.length) {
      const keep = new Set(result.failedIds)
      setDrafts((prev) => prev.filter((d) => keep.has(d.id)))
      setExcluded(new Set())
      setFailed(keep)
      setWrittenCount((n) => n + result.created)
      setWrittenScheduled((n) => n + result.scheduled)
      setSelectedId(null)
      return
    }
    const total = writtenCount + result.created
    const scheduledTotal = writtenScheduled + result.scheduled
    setSelectedId(null)
    setStowing(true)
    window.setTimeout(() => onDone(total, scheduledTotal), reducedMotion() ? 150 : STOW_MS + Math.min(8, chosen.length) * 70)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
    }
  }

  // ── preview status line ──
  let headline = t('企鵝拆好了 {n} 件事，看看對不對？', { n: drafts.length })
  let headlinePose: PenguinPose = 'happy'
  let previewNotice: string | undefined
  if (failed.size) {
    headline = writtenCount
      ? t('已放進 {m} 件；還有 {n} 件沒放成功，網路順了再試一次就好。', { m: writtenCount, n: drafts.length })
      : t('這 {n} 件還沒放進去，網路順了再試一次就好。', { n: drafts.length })
    headlinePose = 'stand'
  } else if (fallback === 'limit') {
    previewNotice = t('今天的 AI 整理用完了（每天 {n} 次），先用簡單拆法。明天會再補滿；想不限次數可以升級 Pro。', { n: limit })
    headlinePose = 'stand'
  } else if (fallback === 'unavailable') {
    previewNotice = t('企鵝連不上 AI，先用簡單拆法。')
    headlinePose = 'stand'
  }

  const selected = drafts.find((d) => d.id === selectedId) ?? null
  const quotaLine = !quota || quota.enabled === false
    ? null
    : quota.limit === null
      ? t('Pro 會員的 AI 整理不限次數。')
      : quota.remaining !== null && quota.remaining > 0
        ? t('今天還能用 AI 整理 {n} 次。', { n: quota.remaining })
        : t('今天的 AI 整理用完了，會先用簡單拆法；明天會再補滿。')

  return (
    <div data-brain-dump-panel className={cn(styles.root, 'flex min-h-0 flex-1 flex-col')}>
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pb-2 pt-4">
        {phase === 'input' && (
          <div className="h-11 w-11 flex-shrink-0">
            <PenguinArt pose="stand" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{t('丟給企鵝')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('亂丟一段待辦，企鵝用 AI 拆好放進「未分類」；說了時間的會排進行事曆。')}</p>
        </div>
        {!isMobile && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('關閉')}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Body — pt-1 keeps the textarea's focus ring from being clipped by the scroll edge */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-1" data-bd-phase={phase}>
        {phase === 'input' && (
          <div className="space-y-3">
            <label htmlFor="brain-dump-text" className="sr-only">{t('想做的事')}</label>
            <textarea
              id="brain-dump-text"
              ref={textRef}
              value={text}
              maxLength={4000}
              onChange={(e) => {
                onTextChange(e.target.value)
                if (notice) setNotice(null)
              }}
              onKeyDown={onKeyDown}
              rows={isMobile ? 5 : 6}
              placeholder={t('例如：明天要回康庭的信、下午去銀行、週五前把報價改完 一小時、還有記得運動')}
              className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] leading-relaxed text-foreground shadow-inner placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {speech.listening && speech.interim && (
              <p className="text-sm text-muted-foreground" aria-live="polite">{speech.interim}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {speech.supported ? (
                <button
                  type="button"
                  onClick={speech.listening ? speech.stop : speech.start}
                  aria-pressed={speech.listening}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9',
                    speech.listening ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-secondary',
                  )}
                >
                  {speech.listening ? (
                    <>
                      <Square className={cn('h-3.5 w-3.5 fill-current', styles.listening)} aria-hidden="true" />
                      {t('正在聽…再按一下停止')}
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" aria-hidden="true" />
                      {t('用說的')}
                    </>
                  )}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{t('也可以用鍵盤的麥克風說')}</span>
              )}
              {!text.trim() && (
                <button
                  type="button"
                  onClick={() => onTextChange(t(BRAIN_DUMP_EXAMPLE))}
                  className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
                >
                  {t('填入範例')}
                </button>
              )}
            </div>
            {speech.error && (
              <p className="text-xs text-muted-foreground">
                {speech.error === 'denied' ? t('麥克風沒有開啟權限，可以改用鍵盤的麥克風說。') : t('沒聽清楚，再試一次？')}
              </p>
            )}

            {notice && (
              <div role="status" className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
                <div className="h-10 w-10 flex-shrink-0"><PenguinArt pose="stand" /></div>
                <p className="text-sm text-foreground">
                  {notice === 'empty'
                    ? t('先寫下幾件事，企鵝才有東西可以排。')
                    : t('企鵝讀不太懂這段，換個說法試試？例如「下午去銀行」。')}
                </p>
              </div>
            )}

            <div className="space-y-0.5 text-[11px] leading-relaxed text-muted-foreground" data-bd-disclosure>
              <p>{t('按下「交給企鵝」後，這段文字會交給 AI 服務（OpenAI）拆成待辦；原文不會被保存。')}</p>
              {quotaLine && <p data-bd-quota>{quotaLine}</p>}
            </div>
          </div>
        )}

        {phase === 'thinking' && (
          <div role="status" className="flex flex-col items-center justify-center py-6">
            <div className="relative h-52 w-full max-w-sm">
              {scraps.map((s, i) => {
                const angle = (i / Math.max(1, scraps.length)) * Math.PI * 2 - Math.PI / 2
                const r = isMobile ? 110 : 150
                return (
                  <span key={i} className="absolute left-1/2 top-1/2 h-0 w-0" aria-hidden="true">
                    <span
                      className={cn(styles.scrap, 'absolute block')}
                      style={{ '--sx': `${Math.cos(angle) * r}px`, '--sy': `${Math.sin(angle) * r * 0.55}px`, '--r': `${((i * 37) % 24) - 12}deg`, '--delay': `${i * 70}ms` } as CSSProperties}
                    >
                      <span className={cn(styles.note, [styles.tint1, styles.tint2, styles.tint3][i % 3], 'relative block -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs')}>
                        {s.length > 14 ? `${s.slice(0, 14)}…` : s}
                      </span>
                    </span>
                  </span>
                )
              })}
              <div className={cn(styles.penguinThink, 'absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2')}>
                <PenguinArt pose="carry" />
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t('企鵝在整理…')}</p>
          </div>
        )}

        {phase === 'preview' && (
          <div>
            <BrainDumpPreview
              drafts={drafts}
              excluded={excluded}
              selectedId={selectedId}
              headline={headline}
              notice={previewNotice}
              finalPose={headlinePose}
              inboxName={inboxName}
              failedIds={failed}
              plan={plan}
              now={now}
              stowing={stowing}
              onToggle={toggle}
              onSelect={setSelectedId}
            />
            {selected && !stowing && (
              <NoteEditor
                key={selected.id}
                draft={selected}
                outcome={plan.get(selected.id)}
                now={now}
                onChange={(patch) => updateDraft(selected.id, patch)}
                onTime={(time) => setDraftTime(selected.id, time)}
                onDone={() => setSelectedId(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {phase === 'preview' ? (
          <>
            <button
              type="button"
              onClick={restart}
              disabled={stowing}
              className="min-h-11 flex-shrink-0 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9 md:px-4"
            >
              {t('重來')}
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={!chosen.length || saving || stowing}
              className="min-h-11 flex-shrink-0 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-9 md:px-5"
            >
              {saving
                ? t('放進去中…')
                : failed.size
                  ? t('再試一次（{n}）', { n: chosen.length })
                  : t('放進未分類（{n}）', { n: chosen.length })}
            </button>
          </>
        ) : (
          <>
            {!isMobile && phase === 'input' && (
              <span className="mr-auto text-[11px] text-muted-foreground">{t('⌘ Enter 也可以送出')}</span>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={phase === 'thinking'}
              className="min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-9"
            >
              {phase === 'thinking' ? t('企鵝在整理…') : t('交給企鵝')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function NoteEditor({ draft, outcome, now, onChange, onTime, onDone }: {
  draft: BrainDumpDraft
  /** Where this note landed (undefined while it is unticked). */
  outcome?: ScheduleOutcome
  now: Date
  onChange: (patch: Partial<Pick<BrainDumpDraft, 'title' | 'dueDate' | 'note'>>) => void
  onTime: (time: string) => void
  onDone: () => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [])
  const field = 'h-11 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9'
  return (
    <div ref={ref} className="mt-4 rounded-xl border border-border bg-secondary/40 p-3" data-bd-editor>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="col-span-2 flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('任務名稱')}
          <input data-bd-edit-title className={field} value={draft.title} maxLength={200} onChange={(e) => onChange({ title: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('期限（可留空）')}
          <input
            data-bd-edit-due
            className={field}
            type="date"
            min={dateKey(now)}
            max={dateKey(addDays(now, 730))}
            value={draft.dueDate ?? ''}
            onChange={(e) => onChange({ dueDate: e.target.value || undefined })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('時間（可留空）')}
          {/* The time the text said, else where a day part landed; typing replaces it, clearing = not on the calendar. */}
          <input
            data-bd-edit-time
            className={field}
            type="time"
            value={draft.fixedTime ?? outcome?.slot?.start ?? ''}
            onChange={(e) => onTime(e.target.value)}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('備註（可留空）')}
          <input className={field} value={draft.note ?? ''} maxLength={200} onChange={(e) => onChange({ note: e.target.value })} />
        </label>
        <p className="col-span-2 -mt-1 text-[11px] leading-snug text-muted-foreground">
          {t('時間會排在期限那天；沒有期限就是今天。留空就不排進行事曆。')}
        </p>
        <div className="col-span-2 flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
          >
            {t('完成')}
          </button>
        </div>
      </div>
    </div>
  )
}
