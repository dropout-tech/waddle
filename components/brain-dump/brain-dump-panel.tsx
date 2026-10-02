'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Mic, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { parseWithBestAvailable } from '@/lib/brain-dump/ai'
import { addDays, dateKey, splitFragments } from '@/lib/brain-dump/parse'
import { markConflicts, planDay, toHHmm, toMinutes } from '@/lib/brain-dump/plan'
import type { DayPlan, PlannedItem } from '@/lib/brain-dump/types'
import type { Task, TimeBlock, Workspace } from '@/lib/types'
import { BrainDumpPreview } from './brain-dump-preview'
import { PenguinArt, type PenguinPose } from './penguin-art'
import { collectBusy } from './brain-dump-utils'
import { useSpeechDictation } from './use-speech-dictation'
import styles from './brain-dump.module.css'

export const BRAIN_DUMP_EXAMPLE = '明天要回康庭的信、下午去銀行、週五前把報價改完 一小時、還有記得運動'
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]

type Phase = 'input' | 'thinking' | 'preview'

interface PanelProps {
  workspaces: Workspace[]
  assignedTasks: Task[]
  timeBlocks: TimeBlock[]
  isMobile: boolean
  text: string
  onTextChange: (text: string) => void
  onClose: () => void
  /** Category the tasks land in unless the user picks another one. */
  defaultCategoryId?: string
  /** Writes the chosen items; resolves to how many were created. */
  onCommit: (items: PlannedItem[], today: string, categoryId: string) => Promise<number>
}

// The category pick is remembered per device (only for this feature).
const CATEGORY_KEY = 'huddle-brain-dump-category-v1'
function readStoredCategory(): string | null {
  try {
    return window.localStorage.getItem(CATEGORY_KEY)
  } catch {
    return null
  }
}
function writeStoredCategory(id: string) {
  try {
    window.localStorage.setItem(CATEGORY_KEY, id)
  } catch {
    /* private mode — keep in memory only */
  }
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function BrainDumpPanel({ workspaces, assignedTasks, timeBlocks, isMobile, text, onTextChange, onClose, defaultCategoryId, onCommit }: PanelProps) {
  const { t, lang } = useI18n()
  const [phase, setPhase] = useState<Phase>('input')
  const [notice, setNotice] = useState<'empty' | 'unparsed' | null>(null)
  const [workStart, setWorkStart] = useState(9)
  const [workEnd, setWorkEnd] = useState(22)
  const [windowOpen, setWindowOpen] = useState(false)
  const [now, setNow] = useState<Date>(() => new Date())
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [items, setItems] = useState<PlannedItem[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [scraps, setScraps] = useState<string[]>([])
  const categories = useMemo(
    () => workspaces.filter((w) => !w.isArchived).flatMap((w) =>
      w.categories.filter((c) => !c.isArchived).map((c) => ({
        id: c.id,
        label: c.name === w.name ? c.name : `${w.name} / ${c.name}`,
      }))),
    [workspaces],
  )
  const [categoryId, setCategoryIdState] = useState(() => {
    const stored = readStoredCategory()
    if (stored && categories.some((c) => c.id === stored)) return stored
    return defaultCategoryId ?? categories[0]?.id ?? ''
  })
  const setCategoryId = (id: string) => {
    setCategoryIdState(id)
    writeStoredCategory(id)
  }
  const textRef = useRef<HTMLTextAreaElement>(null)
  const runRef = useRef(0)

  const appendSpoken = useCallback((spoken: string) => {
    const s = spoken.trim()
    if (!s) return
    const cur = textRef.current?.value ?? ''
    onTextChange(cur && !/[\s、，,]$/.test(cur) ? `${cur}、${s}` : `${cur}${s}`)
  }, [onTextChange])
  const speech = useSpeechDictation(lang, appendSpoken)

  const busy = useMemo(
    () => (plan ? collectBusy(workspaces, assignedTasks, timeBlocks, now) : []),
    [plan, workspaces, assignedTasks, timeBlocks, now],
  )

  // Desktop: start typing right away (phones would pop the keyboard over the sheet).
  useEffect(() => {
    if (!isMobile) textRef.current?.focus()
  }, [isMobile])

  useEffect(() => () => { runRef.current++ }, [])

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
    const { drafts } = await parseWithBestAvailable({ text, now: at, lang })
    const minThink = quick ? 0 : Math.min(1500, 900 + Math.min(8, drafts.length) * 70)
    const wait = minThink - (Date.now() - started)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    if (run !== runRef.current) return
    if (!drafts.length) {
      setPhase('input')
      setNotice('unparsed')
      return
    }
    const occupied = collectBusy(workspaces, assignedTasks, timeBlocks, at)
    const next = planDay(drafts, occupied, { now: at, workStart: workStart * 60, workEnd: workEnd * 60 })
    setNow(at)
    setPlan(next)
    setItems(next.items)
    setExcluded(new Set())
    setSelectedId(null)
    setPhase('preview')
  }

  const restart = () => {
    runRef.current++
    setPhase('input')
    setPlan(null)
    setSelectedId(null)
    setNotice(null)
    window.setTimeout(() => textRef.current?.focus(), 0)
  }

  const included = useCallback((id: string) => !excluded.has(id), [excluded])

  const toggle = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const updateItem = (id: string, patch: { title?: string; minutes?: number; time?: string; date?: string }) => {
    if (!plan) return
    setItems((prev) => {
      const edited = prev.map((item) => {
        if (item.draft.id !== id) return item
        const draft = { ...item.draft }
        if (patch.title !== undefined) draft.title = patch.title
        if (patch.minutes !== undefined) {
          draft.estimatedMinutes = patch.minutes
          draft.minutesGuessed = false
        }
        const date = patch.date || item.date
        const time = patch.time !== undefined ? patch.time : item.start ?? ''
        if (time && /^\d{2}:\d{2}$/.test(time)) {
          const s = toMinutes(time)
          return { draft, date, status: 'scheduled' as const, start: time, end: toHHmm(Math.min(24 * 60 - 1, s + draft.estimatedMinutes)) }
        }
        return { draft, date, status: 'pending' as const }
      })
      return markConflicts(edited, busy, plan.today, included)
    })
  }

  const chosen = items.filter((x) => !excluded.has(x.draft.id) && x.draft.title.trim())

  const commit = async () => {
    if (!plan || !chosen.length || saving) return
    setSaving(true)
    const created = await onCommit(chosen, plan.today, categoryId)
    setSaving(false)
    if (created > 0) onTextChange('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
    }
  }

  // ── status line for the preview ──
  const scheduledToday = items.filter((x) => x.status === 'scheduled' && x.date === plan?.today).length
  const pendingCount = items.length - scheduledToday
  let headline = ''
  let headlinePose: PenguinPose = 'happy'
  if (plan?.late) {
    headline = t('夜深了，今天就到這裡吧。企鵝先把它們放進明天的待排區。')
    headlinePose = 'sleep'
  } else if (plan?.full) {
    headline = t('今天已經滿滿的了，企鵝先把它們放進待排區，有空再拖進行事曆。')
    headlinePose = 'stand'
  } else if (pendingCount === 0) {
    headline = t('排好了，{n} 件都放進今天的空檔。', { n: scheduledToday })
  } else if (scheduledToday === 0) {
    headline = t('這些都是之後的事，企鵝先放進待排區。')
    headlinePose = 'stand'
  } else {
    headline = t('{n} 件放進今天的空檔，{m} 件先放待排。', { n: scheduledToday, m: pendingCount })
  }

  const selected = items.find((x) => x.draft.id === selectedId) ?? null
  const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

  return (
    <div data-brain-dump-panel className={cn(styles.root, 'flex min-h-0 flex-1 flex-col')}>
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pb-3 pt-4">
        {/* The preview has its own big penguin — one is enough. */}
        {phase === 'input' && (
          <div className="h-11 w-11 flex-shrink-0">
            <PenguinArt pose="stand" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{t('丟給企鵝')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('亂丟一串待辦，企鵝幫你排進今天的空檔。')}</p>
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

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4" data-bd-phase={phase}>
        {phase === 'input' && (
          <div className="space-y-3">
            <label htmlFor="brain-dump-text" className="sr-only">{t('想做的事')}</label>
            <textarea
              id="brain-dump-text"
              ref={textRef}
              value={text}
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

            <div className="text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => setWindowOpen((v) => !v)}
                aria-expanded={windowOpen}
                className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8"
              >
                {t('排在 {start}–{end} 之間', { start: hourLabel(workStart), end: hourLabel(workEnd) })}
              </button>
              {windowOpen && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5">
                    {t('從幾點')}
                    <select
                      value={workStart}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setWorkStart(v)
                        if (workEnd <= v) setWorkEnd(Math.min(24, v + 1))
                      }}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                    >
                      {Array.from({ length: 18 }, (_, i) => i + 5).map((h) => (
                        <option key={h} value={h}>{hourLabel(h)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">
                    {t('到幾點')}
                    <select
                      value={workEnd}
                      onChange={(e) => setWorkEnd(Number(e.target.value))}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                    >
                      {Array.from({ length: 24 - workStart }, (_, i) => workStart + i + 1).map((h) => (
                        <option key={h} value={h}>{hourLabel(h)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
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

        {phase === 'preview' && plan && (
          <div>
            <BrainDumpPreview
              headline={headline}
              finalPose={headlinePose}
              plan={plan}
              items={items}
              busy={busy}
              now={now}
              excluded={excluded}
              selectedId={selectedId}
              isMobile={isMobile}
              onToggle={toggle}
              onSelect={setSelectedId}
            />

            {selected && (
              <NoteEditor
                key={selected.draft.id}
                item={selected}
                now={now}
                onChange={(patch) => updateItem(selected.draft.id, patch)}
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
            {categories.length > 0 && (
              <label className="mr-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="hidden flex-shrink-0 sm:inline">{t('放進分類')}</span>
                <select
                  data-bd-category
                  aria-label={t('放進分類')}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="h-11 w-full min-w-0 max-w-[180px] truncate rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={restart}
              className="min-h-11 flex-shrink-0 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9 md:px-4"
            >
              {t('重來')}
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={!chosen.length || saving}
              className="min-h-11 flex-shrink-0 whitespace-nowrap rounded-lg bg-primary px-4 md:px-5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-9"
            >
              {saving ? t('放進去中…') : t('放進行事曆（{n}）', { n: chosen.length })}
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

function NoteEditor({ item, now, onChange, onDone }: {
  item: PlannedItem
  now: Date
  onChange: (patch: { title?: string; minutes?: number; time?: string; date?: string }) => void
  onDone: () => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [])
  const minutes = item.draft.estimatedMinutes
  const options = DURATIONS.includes(minutes) ? DURATIONS : [...DURATIONS, minutes].sort((a, b) => a - b)
  const field = 'h-11 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9'
  return (
    <div ref={ref} className="mt-4 rounded-xl border border-border bg-secondary/40 p-3" data-bd-editor>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <label className="col-span-2 flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('任務名稱')}
          <input className={field} value={item.draft.title} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('時長')}
          <select className={field} value={minutes} onChange={(e) => onChange({ minutes: Number(e.target.value) })}>
            {options.map((m) => (
              <option key={m} value={m}>{m < 60 ? t('{n} 分鐘', { n: m }) : m % 60 ? t('{h} 小時 {m} 分', { h: Math.floor(m / 60), m: m % 60 }) : t('{h} 小時', { h: m / 60 })}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          {t('時間（留空＝待排）')}
          <input className={field} type="time" step={900} value={item.start ?? ''} onChange={(e) => onChange({ time: e.target.value })} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-[11px] text-muted-foreground sm:col-span-2">
          {t('日期')}
          <input className={field} type="date" min={dateKey(now)} max={dateKey(addDays(now, 365))} value={item.date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} />
        </label>
        <div className="col-span-2 flex items-end justify-between gap-2">
          {item.conflict ? <span className="text-xs text-primary">{t('跟已有的行程重疊')}</span> : <span />}
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
