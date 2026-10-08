'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { translateFor, type Lang } from '@/lib/i18n'
import { useDisplayColor } from '@/hooks/use-display-color'
import { useLifeGrid } from '@/hooks/use-life-grid'
import { useMonthStartDay } from '@/components/user-settings-context'
import { InkArrowLeft, InkChevronLeft, InkChevronRight, InkClose } from '@/components/icons/huddle-icons'
import { MOOD_COLORS } from '@/lib/palette'
import { isImeComposing } from '@/lib/ime'
import {
  DAILY_LINE_MAX, MOODS, buildYearGrid, countWrittenInYear, daysInMonth, dateKey,
  isWritableDate, parseDateKey, localToday, type Mood,
} from '@/lib/life-grid/compute'
import type { DailyLine } from '@/lib/life-grid/data'
import { drawLifeGridImage, shareLifeGridImage } from '@/lib/life-grid/share-image'
import styles from './life-grid.module.css'

/** Source strings for the mood names (dictionary keys). */
export const MOOD_LABELS: Record<Mood, string> = {
  great: '很棒',
  good: '不錯',
  neutral: '平常',
  bad: '有點低',
  terrible: '很難熬',
}

const YEARS_BACK = 10

/**
 * Smooth-scroll only the life grid's own scroll area. Element.scrollIntoView
 * would also scroll every ancestor — inside the pop-up that shoved the whole
 * panel (header included) up and out of view.
 */
function scrollWithin(el: HTMLElement, block: 'center' | 'nearest') {
  const sc = el.closest<HTMLElement>('[data-life-grid-scroll]')
  if (!sc) return
  const r = el.getBoundingClientRect()
  const box = sc.getBoundingClientRect()
  const top = r.top - box.top + sc.scrollTop
  let target = sc.scrollTop
  if (block === 'center') target = top - (sc.clientHeight - r.height) / 2
  else if (r.top < box.top) target = top - 16
  else if (r.bottom > box.bottom) target = top + r.height - sc.clientHeight + 16
  sc.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
}

const locale = (lang: Lang) => (lang === 'en' ? 'en-US' : 'zh-TW')
const utcDate = (date: string) => {
  const p = parseDateKey(date)
  return p ? new Date(Date.UTC(p.year, p.month - 1, p.day, 12)) : new Date()
}

function useToday() {
  const [today, setToday] = useState(() => localToday())
  useEffect(() => {
    const id = window.setInterval(() => setToday(localToday()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return today
}

/** Inline narrative number: body font, terracotta accent (numbers live inside the sentence). */
function Num({ children, tight = false }: { children: ReactNode; tight?: boolean }) {
  return <span className={cn('text-[1.08em] font-semibold tabular-nums text-primary', !tight && 'mx-1')}>{children}</span>
}

/** Translate a template, resolve its {count|one|other} plural, and render {count} as <Num>. */
function Sentence({ lang, template, count, vars = {} }: { lang: Lang; template: string; count: number; vars?: Record<string, string | number> }) {
  const text = translateFor(lang, template, vars).replace(/\{count\|([^|{}]*)\|([^|{}]*)\}/g, (_, one: string, other: string) =>
    count === 1 ? one : other,
  )
  const [before, after = ''] = text.split('{count}')
  // Chinese: the number sits between characters (Num's margin is the gap).
  // English: keep the real spaces and drop the margin.
  const en = lang === 'en'
  // The number and the word right after it never break apart ("62 天", "62 days").
  const rest = en ? after : after.trimStart()
  const glue = /^\s*\S+/.exec(rest)?.[0] ?? ''
  return (
    <>
      {en ? before : before.trimEnd()}
      <span className="whitespace-nowrap">
        <Num tight={en}>{count}</Num>
        {glue}
      </span>
      {rest.slice(glue.length)}
    </>
  )
}

export interface LifeGridViewProps {
  onExit?: () => void
  /** `close` inside the pop-up, `back` on the /year page. */
  exitVariant?: 'close' | 'back'
  /** Opened from the penguin's evening question → focus today's input. */
  focusToday?: boolean
}

export function LifeGridView({ onExit, exitVariant = 'close', focusToday = false }: LifeGridViewProps) {
  const { t, lang } = useI18n()
  const display = useDisplayColor()
  const today = useToday()
  const currentYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(currentYear)
  const { lines, status, reload, save } = useLifeGrid(year)
  const [selected, setSelected] = useState(today)
  const [zoomMonth, setZoomMonth] = useState(() => Number(today.slice(5, 7)))
  const [justLit, setJustLit] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const dayCardRef = useRef<HTMLDivElement>(null)

  const grid = useMemo(() => buildYearGrid(year, today), [year, today])
  const written = useMemo(() => countWrittenInYear(lines.keys(), year), [lines, year])

  // The opening moment: written days light up one by one, in date order
  // (≤1.5s in total). Layout effect so the first painted frame is already
  // "dark" — no flash of the finished grid before the animation.
  const [revealing, setRevealing] = useState(false)
  useLayoutEffect(() => {
    if (status !== 'ready') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- must flip before paint (no flash of the finished grid)
    setRevealing(true)
    const id = window.setTimeout(() => setRevealing(false), 1700)
    return () => window.clearTimeout(id)
  }, [status, year])
  const reveal = useMemo(() => {
    const dates = [...lines.keys()].sort()
    const step = dates.length ? Math.min(28, 1050 / dates.length) : 0
    return new Map(dates.map((d, i) => [d, Math.round(i * step)]))
    // Only the order at load time matters; later saves use the single "lit" pop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealing])
  const revealFor = (date: string) => (revealing && reveal.has(date) ? reveal.get(date)! : null)

  const monthShort = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale(lang), { month: 'short', timeZone: 'UTC' })
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2026, i, 1, 12))))
  }, [lang])
  const dayLabel = useCallback(
    (date: string) =>
      new Intl.DateTimeFormat(locale(lang), { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(utcDate(date)),
    [lang],
  )

  const changeYear = (next: number) => {
    setYear(next)
    const sameDay = `${next}${selected.slice(4)}`
    const target = next === currentYear ? today : parseDateKey(sameDay) ? sameDay : dateKey(next, 1, 1)
    setSelected(target)
    setZoomMonth(Number(target.slice(5, 7)))
  }

  const select = (date: string, opts: { scroll?: boolean } = {}) => {
    setSelected(date)
    setZoomMonth(Number(date.slice(5, 7)))
    if (opts.scroll && dayCardRef.current) scrollWithin(dayCardRef.current, 'nearest')
  }

  const onSave = async (date: string, content: string, mood: Mood | null) => {
    const ok = await save(date, content, mood)
    if (ok) {
      setJustLit(content.trim() || mood ? date : null)
      window.setTimeout(() => setJustLit(null), 700)
    }
    return ok
  }

  const onShare = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const moods = new Map<string, Mood | null>()
      for (const [date, line] of lines) moods.set(date, line.mood)
      const blob = await drawLifeGridImage(year, moods, today)
      const outcome = await shareLifeGridImage(blob, `huddle-${year}.png`)
      if (outcome === 'downloaded') toast.success(t('圖片已下載，可以拿去發限時動態。'))
    } catch {
      toast(t('圖片沒有產生成功，請再試一次。'))
    } finally {
      setSharing(false)
    }
  }

  const summary = (() => {
    if (year > currentYear) return <>{t('{year} 年還沒開始，先留白。', { year })}</>
    if (year === currentYear) {
      return written > 0
        ? <Sentence lang={lang} template="今年你留下了 {count} 天的記憶。" count={written} />
        : <>{t('今年的格子還空著，今天就可以點亮第一格。')}</>
    }
    return written > 0
      ? <Sentence lang={lang} template="{year} 年，你留下了 {count} 天的記憶。" count={written} vars={{ year }} />
      : <>{t('{year} 年沒有留下紀錄，也沒關係。', { year })}</>
  })()

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground" data-life-grid>
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2 md:px-5">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            aria-label={exitVariant === 'back' ? t('返回') : t('關閉')}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {exitVariant === 'back' ? <InkArrowLeft className="h-5 w-5" /> : <InkClose className="h-5 w-5" />}
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{t('人生年曆')}</h2>
        <div className="flex items-center" role="group" aria-label={t('切換年份')}>
          <button
            type="button"
            onClick={() => changeYear(year - 1)}
            disabled={year <= currentYear - YEARS_BACK}
            aria-label={t('上一年')}
            className="flex h-11 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <InkChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[3.5rem] text-center font-mono text-sm font-medium tabular-nums" aria-live="polite" data-life-grid-year>
            {year}
          </span>
          <button
            type="button"
            onClick={() => changeYear(year + 1)}
            disabled={year >= currentYear}
            aria-label={t('下一年')}
            className="flex h-11 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <InkChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onShare}
          disabled={sharing || status !== 'ready'}
          data-life-grid-share
          aria-label={t('分享我的一年')}
          className="ml-1 min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted/60 disabled:opacity-50"
        >
          {/* Phone header is tight: short label there, full sentence from sm up. */}
          <span className="sm:hidden">{sharing ? '…' : t('分享')}</span>
          <span className="hidden sm:inline">{sharing ? t('準備圖片中…') : t('分享我的一年')}</span>
        </button>
      </header>

      {/* Soft fade at the bottom edge so content never looks cut off by the pop-up. */}
      <div data-life-grid-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,#000_calc(100%-40px),transparent)]">
        <div className="mx-auto w-full max-w-[1080px] px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pt-7">
          <p className="text-[15px] leading-relaxed md:text-base" data-life-grid-summary>
            {summary}
          </p>

          {status === 'error' && (
            <div className="mt-4 flex items-center gap-3 border-t border-border/70 pt-4 text-sm">
              <span className="text-muted-foreground">{t('年曆沒有載入完整，你的紀錄沒有遺失。')}</span>
              <button type="button" onClick={() => void reload()} className="min-h-11 rounded-lg px-3 font-medium text-primary hover:bg-muted/60">
                {t('重試')}
              </button>
            </div>
          )}

          {/* Phone: question card → year → the rest. Desktop: the year spans the
              full width on top (big squares), card and recent lines below. */}
          <div className={cn('mt-5', styles.layout)}>
            <div ref={dayCardRef} className={cn('scroll-mt-4', styles.areaCard)}>
              <DayCard
                key={selected}
                date={selected}
                today={today}
                line={lines.get(selected)}
                loading={status === 'loading'}
                label={dayLabel(selected)}
                autoFocus={focusToday && selected === today}
                onSave={onSave}
              />
            </div>

            <div className={cn('min-w-0', styles.areaYear)}>
              <YearGrid
                grid={grid}
                lines={lines}
                selected={selected}
                justLit={justLit}
                monthShort={monthShort}
                dayLabel={dayLabel}
                display={display}
                revealFor={revealFor}
                onSelectDay={(d) => select(d)}
              />
              <PhoneYearGrid
                grid={grid}
                lines={lines}
                justLit={justLit}
                monthShort={monthShort}
                display={display}
                revealFor={revealFor}
                zoomMonth={zoomMonth}
                onSelectMonth={(m) => setZoomMonth(m)}
              />
              <Legend display={display} />
              <LetterLine lines={lines} today={today} />
              <MonthZoom
                year={year}
                month={zoomMonth}
                today={today}
                selected={selected}
                lines={lines}
                display={display}
                onSelect={(d) => select(d, { scroll: true })}
              />
            </div>

            <div className={cn('min-w-0', styles.areaMore)}>
              <RecentLines lines={lines} dayLabel={dayLabel} display={display} onSelect={(d) => select(d, { scroll: true })} />
              {/* A quiet sign-off, in the illustrations' voice. */}
              <div className="mt-8 flex items-end gap-3" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer */}
                <img
                  src="/art/penguin/sleep.webp"
                  alt=""
                  width={88}
                  height={88}
                  className="h-[72px] w-auto dark:rounded-2xl dark:bg-[#efe8d6] dark:p-1.5 dark:brightness-95"
                />
                <p className="pb-3 text-sm text-muted-foreground">{t('一天一格，慢慢來就好。')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Year grid (12 rows × up to 31) ─────────────────────────────────────

const WOBBLE = [styles.w0, styles.w1, styles.w2, styles.w3]
/** Deterministic uneven corners per day (same day → same shape every render). */
const wobble = (month: number, day: number) => WOBBLE[(month * 7 + day * 3) % 4]
/** Mood fill + a per-day offset into the paper grain so no two squares look stamped. */
const inkStyle = (color: string | undefined, month: number, day: number, delay: number | null = null): CSSProperties => ({
  backgroundColor: color,
  backgroundPosition: `${(day * 37) % 240}px ${(month * 53) % 240}px`,
  ...(delay !== null ? { animationDelay: `${delay}ms` } : null),
})

function YearGrid({
  grid, lines, selected, justLit, monthShort, dayLabel, display, revealFor, onSelectDay,
}: {
  grid: ReturnType<typeof buildYearGrid>
  lines: Map<string, DailyLine>
  selected: string
  justLit: string | null
  monthShort: string[]
  dayLabel: (date: string) => string
  display: (hex: string) => string | undefined
  revealFor: (date: string) => number | null
  onSelectDay: (date: string) => void
}) {
  const { t } = useI18n()
  const cols = 'grid-cols-[2.75rem_repeat(31,minmax(0,1fr))]'
  return (
    <div className="select-none max-md:hidden" data-life-grid-grid>
      <div className={cn('mb-1.5 grid gap-[5px]', cols)} aria-hidden="true">
        <span />
        {Array.from({ length: 31 }, (_, i) => (
          <span key={i} className="text-center text-[11px] tabular-nums text-muted-foreground/80">
            {[1, 5, 10, 15, 20, 25, 31].includes(i + 1) ? i + 1 : ''}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-[5px]">
        {grid.map(({ month, days }) => (
          <div key={month} className={cn('grid items-center gap-[5px]', cols)}>
            <span className="pr-1 text-xs leading-none text-muted-foreground">{monthShort[month - 1]}</span>
            {days.map(({ date, day, state }) => {
              const line = lines.get(date)
              const color = line?.mood ? display(MOOD_COLORS[line.mood].hex) : undefined
              const delay = line ? revealFor(date) : null
              const cls = cn(
                styles.cell,
                wobble(month, day),
                line ? cn(styles.ink, !color && 'bg-muted-foreground/60') : state === 'future' ? styles.future : styles.past,
                state === 'today' && styles.today,
                state === 'today' && !line && styles.empty,
                selected === date && state !== 'today' && styles.selected,
                delay !== null && styles.reveal,
                justLit === date && styles.lit,
              )
              const status = line ? t(MOOD_LABELS[line.mood ?? 'neutral']) : state === 'future' ? t('還沒到') : t('還沒寫')
              return (
                <button
                  key={day}
                  type="button"
                  data-date={date}
                  data-written={line ? '' : undefined}
                  disabled={state === 'future'}
                  onClick={() => onSelectDay(date)}
                  className={cn(cls, 'disabled:cursor-default')}
                  style={line ? inkStyle(color, month, day, delay) : undefined}
                  aria-label={`${dayLabel(date)} · ${line ? (line.mood ? status : t('已寫')) : status}`}
                  aria-pressed={selected === date}
                  title={line?.content ? `${dayLabel(date)}：${line.content}` : dayLabel(date)}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Phone: months as columns (like the share image) ────────────────────
// 31 cells across would be ~9px — too small to aim at. Turned on its side,
// each month is a ~28px-wide, full-height column: one tap opens its zoom.

function PhoneYearGrid({
  grid, lines, justLit, monthShort, display, revealFor, zoomMonth, onSelectMonth,
}: {
  grid: ReturnType<typeof buildYearGrid>
  lines: Map<string, DailyLine>
  justLit: string | null
  monthShort: string[]
  display: (hex: string) => string | undefined
  revealFor: (date: string) => number | null
  zoomMonth: number
  onSelectMonth: (month: number) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex select-none gap-[2px] md:hidden" data-life-grid-phone>
      {grid.map(({ month, days }) => (
        <button
          key={month}
          type="button"
          onClick={() => onSelectMonth(month)}
          aria-label={t('看{month}', { month: monthShort[month - 1] })}
          aria-pressed={zoomMonth === month}
          data-life-grid-month={month}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-stretch gap-[3px] rounded-lg px-[3px] pb-1.5 pt-1 transition-colors',
            zoomMonth === month ? 'bg-muted/70' : 'active:bg-muted/40',
          )}
        >
          <span className="mb-0.5 truncate text-center text-[10px] leading-4 text-muted-foreground">{monthShort[month - 1]}</span>
          {days.map(({ date, day, state }) => {
            const line = lines.get(date)
            const color = line?.mood ? display(MOOD_COLORS[line.mood].hex) : undefined
            const delay = line ? revealFor(date) : null
            return (
              <span
                key={day}
                data-m-date={date}
                className={cn(
                  'block h-[9px] w-full rounded-[3px]',
                  line ? cn(styles.ink, !color && 'bg-muted-foreground/60') : state === 'future' ? styles.future : styles.past,
                  state === 'today' && styles.today,
                  state === 'today' && !line && styles.empty,
                  delay !== null && styles.reveal,
                  justLit === date && styles.lit,
                )}
                style={line ? inkStyle(color, month, day, delay) : undefined}
              />
            )
          })}
        </button>
      ))}
    </div>
  )
}

// ─── Letter line: the latest thing you chose to remember ────────────────

function LetterLine({ lines, today }: { lines: Map<string, DailyLine>; today: string }) {
  const { t, lang } = useI18n()
  // Today's own line if it exists, otherwise the most recent earlier one.
  const latest = useMemo(() => {
    let best: DailyLine | null = null
    for (const l of lines.values()) if (l.content && l.date <= today && (!best || l.date > best.date)) best = l
    return best
  }, [lines, today])
  if (!latest) return null
  const isToday = latest.date === today
  const date = new Intl.DateTimeFormat(locale(lang), { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(utcDate(latest.date))
  const [open, close] = lang === 'en' ? ['“', '”'] : ['「', '」']
  return (
    <p className="mt-6 max-w-[62ch] text-[15px] leading-[1.85] text-muted-foreground [text-wrap:pretty]" data-life-grid-letter>
      {isToday ? t('今天你記下了：') : t('最近一次是 {date}，你記下了：', { date })}
      <span className="text-foreground" data-user-text>{open}{latest.content}{close}</span>
    </p>
  )
}

function Legend({ display }: { display: (hex: string) => string | undefined }) {
  const { t } = useI18n()
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label={t('顏色說明')}>
      {MOODS.map((m) => (
        <li key={m} className="flex items-center gap-1.5">
          <span className={cn('inline-block h-3 w-3', styles.w1, styles.ink)} style={{ backgroundColor: display(MOOD_COLORS[m].hex) }} />
          {t(MOOD_LABELS[m])}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className={cn('inline-block h-3 w-3', styles.w2, styles.past)} />
        {t('還沒寫')}
      </li>
    </ul>
  )
}

// ─── Recent lines: a short letter-style list (thin rules, no cards) ─────

function RecentLines({
  lines, dayLabel, display, onSelect, className,
}: {
  lines: Map<string, DailyLine>
  dayLabel: (date: string) => string
  display: (hex: string) => string | undefined
  onSelect: (date: string) => void
  className?: string
}) {
  const { t } = useI18n()
  const recent = useMemo(
    () => [...lines.values()].filter((l) => l.content).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5),
    [lines],
  )
  if (recent.length === 0) return null
  return (
    <section className={cn('mt-6', className)} aria-label={t('最近留下的句子')} data-life-grid-recent>
      <h3 className="text-sm font-semibold">{t('最近留下的句子')}</h3>
      <ul className="mt-2">
        {recent.map((l) => (
          <li key={l.date} className="border-t border-border/70 first:border-t-0">
            <button
              type="button"
              onClick={() => onSelect(l.date)}
              className="flex w-full min-h-11 items-start gap-2.5 py-2.5 text-left hover:bg-muted/40"
            >
              <span
                className={cn('mt-[7px] inline-block h-2.5 w-2.5 shrink-0', styles.w0, styles.ink)}
                style={{ backgroundColor: l.mood ? display(MOOD_COLORS[l.mood].hex) : undefined }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">{dayLabel(l.date)}</span>
                <span className="block truncate text-sm" data-user-text>{l.content}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Phone: month zoom (7-column calendar with real touch targets) ──────

function MonthZoom({
  year, month, today, selected, lines, display, onSelect,
}: {
  year: number
  month: number
  today: string
  selected: string
  lines: Map<string, DailyLine>
  display: (hex: string) => string | undefined
  onSelect: (date: string) => void
}) {
  const { t, lang } = useI18n()
  const weekStart = useMonthStartDay()
  const title = new Intl.DateTimeFormat(locale(lang), { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1, 12)))
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale(lang), { weekday: 'narrow', timeZone: 'UTC' })
    // 2026-03-01 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 2, 1 + ((weekStart + i) % 7), 12))))
  }, [lang, weekStart])
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const lead = (firstDow - weekStart + 7) % 7
  const n = daysInMonth(year, month)

  return (
    <section className="mt-6 border-t border-border/70 pt-4 md:hidden" aria-label={title} data-life-grid-zoom>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {weekdays.map((w, i) => (
          <span key={i} className="text-[11px] text-muted-foreground" aria-hidden="true">{w}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
        {Array.from({ length: n }, (_, i) => {
          const date = dateKey(year, month, i + 1)
          const line = lines.get(date)
          const future = date > today
          const color = line?.mood ? display(MOOD_COLORS[line.mood].hex) : undefined
          return (
            <button
              key={date}
              type="button"
              disabled={future}
              onClick={() => onSelect(date)}
              data-zoom-date={date}
              aria-pressed={selected === date}
              aria-label={`${date}${line ? ` · ${t('已寫')}` : ''}`}
              className={cn(
                'flex h-11 items-center justify-center font-mono text-sm tabular-nums transition-colors',
                wobble(month, i + 1),
                line ? cn(styles.ink, 'text-[#292b24]') : future ? 'text-muted-foreground/40' : 'bg-foreground/[0.06]',
                line && !color && 'bg-muted-foreground/40',
                date === today && 'ring-2 ring-primary',
                selected === date && date !== today && 'ring-2 ring-foreground',
              )}
              style={line ? inkStyle(color, month, i + 1) : undefined}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ─── Day card: read / write one day ─────────────────────────────────────

function DayCard({
  date, today, line, loading, label, autoFocus, onSave,
}: {
  date: string
  today: string
  line: DailyLine | undefined
  loading: boolean
  label: string
  autoFocus: boolean
  onSave: (date: string, content: string, mood: Mood | null) => Promise<boolean>
}) {
  const { t } = useI18n()
  const display = useDisplayColor()
  const isToday = date === today
  const writable = isWritableDate(date, today)
  const [editing, setEditing] = useState(!line)
  const [text, setText] = useState(line?.content ?? '')
  const [mood, setMood] = useState<Mood | null>(line?.mood ?? null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<'saved' | 'failed' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // The line can arrive after the card mounted (first load) — adopt it once.
  const adopted = useRef(!!line)
  useEffect(() => {
    if (line && !adopted.current) {
      adopted.current = true
      setText(line.content)
      setMood(line.mood)
      setEditing(false)
    }
  }, [line])

  // Penguin question → let the year light up first (the reveal is ~1.5s),
  // then glide to today's card and focus its input. Waiting matters: an
  // instant focus would jump-scroll past the opening moment.
  const autoFocused = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const showsInput = writable && editing && !(loading && !line)
  useEffect(() => {
    if (!autoFocus || !showsInput || autoFocused.current) return
    const id = window.setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      autoFocused.current = true
      if (cardRef.current) scrollWithin(cardRef.current, 'center')
      input.focus({ preventScroll: true })
    }, 1650)
    return () => window.clearTimeout(id)
  }, [autoFocus, showsInput])

  const submit = async () => {
    if (saving || !text.trim()) return
    // The hook updates optimistically; don't let the "late-loaded line" adoption above flip the card early.
    adopted.current = true
    setSaving(true)
    setNote(null)
    const ok = await onSave(date, text, mood)
    setSaving(false)
    setNote(ok ? 'saved' : 'failed')
    if (ok) setEditing(false)
  }

  const clear = async () => {
    if (saving) return
    setSaving(true)
    const ok = await onSave(date, '', null)
    setSaving(false)
    if (ok) {
      setText('')
      setMood(null)
      setEditing(true)
      setNote(null)
    } else setNote('failed')
  }

  const heading = !writable
    ? null
    : line && !editing
      ? null
      : isToday && !line
        ? t('今天最想記住的是什麼？')
        : !line
          ? t('這天還空著，想補一句嗎？')
          : null

  return (
    <div ref={cardRef} className="scroll-my-6 rounded-2xl border border-border/80 bg-card px-4 py-4 md:px-5" data-life-grid-day={date} aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {label}
          {isToday && <span className="ml-1.5 text-primary">· {t('今天')}</span>}
        </p>
      </div>

      {!writable ? (
        <p className="mt-3 text-[15px] text-muted-foreground">{t('這一天還沒到。')}</p>
      ) : loading && !line ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('載入中…')}</p>
      ) : line && !editing ? (
        <div className="mt-3">
          <p className="break-words text-[17px] leading-relaxed [text-wrap:pretty]" data-life-grid-line data-user-text>{line.content}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {line.mood && (
                <span className={cn('inline-block h-3 w-3', styles.moodDot)} style={{ background: display(MOOD_COLORS[line.mood].hex) }} />
              )}
              {line.mood ? t(MOOD_LABELS[line.mood]) : null}
              {note === 'saved' && <span className="text-xs">· {t('已存下')}</span>}
            </span>
            <button
              type="button"
              onClick={() => { setEditing(true); setNote(null) }}
              className="min-h-11 rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted/60"
            >
              {t('改一下')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          {heading && (
            <div className="mb-3 flex items-center gap-3">
              {isToday && !line && (
                // The penguin at its lamp with a blank card — the evening question, drawn.
                // eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer
                <img
                  src="/art/life-grid/evening-question.webp"
                  alt=""
                  aria-hidden="true"
                  width={112}
                  height={112}
                  className="art-illus size-24 shrink-0 md:size-28"
                />
              )}
              <p className="text-[17px] font-semibold leading-snug [text-wrap:balance]">{heading}</p>
            </div>
          )}
          <label className="sr-only" htmlFor={`life-line-${date}`}>{t('這天的一句話')}</label>
          <input
            ref={inputRef}
            id={`life-line-${date}`}
            type="text"
            value={text}
            maxLength={DAILY_LINE_MAX}
            enterKeyHint="done"
            autoComplete="off"
            placeholder={isToday ? t('一句話就好') : t('那天發生了什麼？')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isImeComposing(e)) {
                e.preventDefault()
                void submit()
              }
            }}
            className="h-12 w-full rounded-xl border border-border bg-background px-3.5 text-base outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
            data-life-grid-input
          />
          <div className="mt-1 flex justify-end">
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{Array.from(text).length}/{DAILY_LINE_MAX}</span>
          </div>

          <fieldset className="mt-1">
            <legend className="mb-2 text-sm text-muted-foreground">{isToday ? t('今天的心情') : t('那天的心情')}</legend>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={isToday ? t('今天的心情') : t('那天的心情')}>
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mood === m}
                  onClick={() => setMood(mood === m ? null : m)}
                  data-mood={m}
                  className={cn(
                    'flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-1 text-[11px] text-muted-foreground transition-colors',
                    mood === m ? 'bg-muted text-foreground' : 'hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn('block h-6 w-6 transition-transform', styles.moodDot, mood === m && 'scale-110 ring-2 ring-foreground/70 ring-offset-2 ring-offset-card')}
                    style={{ background: display(MOOD_COLORS[m].hex) }}
                  />
                  {t(MOOD_LABELS[m])}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !text.trim()}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              data-life-grid-save
            >
              {saving ? t('儲存中…') : t('存下來')}
            </button>
            {line && (
              <button
                type="button"
                onClick={() => { setEditing(false); setText(line.content); setMood(line.mood); setNote(null) }}
                className="min-h-11 rounded-xl px-3 text-sm text-muted-foreground hover:bg-muted/60"
              >
                {t('取消')}
              </button>
            )}
            {line && (
              <button type="button" onClick={() => void clear()} className="ml-auto min-h-11 rounded-xl px-3 text-sm text-muted-foreground hover:bg-muted/60">
                {t('清除這天')}
              </button>
            )}
          </div>
          {note === 'failed' && <p className="mt-2 text-sm text-muted-foreground">{t('沒有存成功，請再試一次。')}</p>}
        </div>
      )}
    </div>
  )
}
